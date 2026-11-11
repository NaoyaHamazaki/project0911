"""STEP1の行先候補と、STEP2の宿泊先（ホテル）候補をGeminiで提案する。

spots.py（いきたいスポットの候補）と同じ方針：
- APIキー未設定なら機能自体を無効にする（spots.is_enabled() が False）
- 呼び出しに失敗しても例外を投げず、空リストを返す（補助機能なので入力は止めない）
- ホテルは Google Places で実在を確認し、見つからないものは外す（AIが架空の宿を出すことがあるため）
"""

import json
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

from django.conf import settings

from . import choices
from .consistency import GEMINI_ENDPOINT
from .spots import _lookup_place, _maps_search_url

REQUEST_TIMEOUT_SECONDS = 30
DESTINATION_COUNT = 3
HOTELS_PER_NIGHT = 5
# 泊数×5件を Places で確認するため、利用料を抑える目的で候補を出す泊数に上限を設ける。
MAX_HOTEL_NIGHTS = 7
# 実在チェックで落ちる分を見込んで、1泊あたり少し多めに出してもらう。
EXTRA_HOTELS_PER_NIGHT = 2

SCOPE_RULES = {
    choices.DESTINATION_SCOPE_DOMESTIC: "日本国内の行先だけを提案する",
    choices.DESTINATION_SCOPE_OVERSEAS: "海外の行先だけを提案する（日本国内は含めない）",
}


def _ask_gemini(prompt: str, schema: dict):
    """JSONで答えてもらい、dict を返す。失敗したら None。"""
    api_key = getattr(settings, "GEMINI_API_KEY", "")
    if not api_key:
        return None
    body = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            # 候補出しは深い推論が不要。low にすると応答が速くなる。
            "thinkingConfig": {"thinkingLevel": "low"},
            "responseSchema": schema,
        },
    }).encode("utf-8")
    request = urllib.request.Request(
        f"{GEMINI_ENDPOINT}?key={api_key}",
        data=body,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode("utf-8"))
        text = payload["candidates"][0]["content"]["parts"][0]["text"]
        result = json.loads(text)
    except (urllib.error.URLError, TimeoutError, KeyError, IndexError, ValueError):
        return None
    return result if isinstance(result, dict) else None


def _text(value, limit: int) -> str:
    return str(value or "").strip()[:limit]


def _period(date_from, date_to) -> tuple:
    """(開始日, 泊数) を返す。日付が不正なら (None, 0)。"""
    try:
        start = datetime.strptime(str(date_from), "%Y-%m-%d").date()
        end = datetime.strptime(str(date_to), "%Y-%m-%d").date()
    except ValueError:
        return None, 0
    if end < start:
        return None, 0
    return start, (end - start).days


# ---------- 行先の候補 ----------

def _destination_prompt(theme, departure, scope, start, nights, exclude) -> str:
    period = "日帰り" if nights == 0 else f"{nights}泊{nights + 1}日"
    lines = [
        "あなたは国内外の旅行に詳しいプランナーです。",
        "友達同士の旅行の「行先」の候補を提案してください。",
        "",
        "# 旅の情報",
        f"- 日程: {start.year}年{start.month}月{start.day}日から{period}",
    ]
    if departure:
        lines.append(f"- 出発地: {departure}")
    if theme:
        lines.append(f"- テーマ: {theme}")
    if exclude:
        lines.append(f"- すでに提案済みの行先（これらは提案しない）: {'、'.join(exclude)}")
    lines += [
        "",
        "# 条件",
        f"- {DESTINATION_COUNT}件。それぞれ違う方面・雰囲気になるようにする",
        "- 出発地からの移動時間を考え、日程の長さで無理なく楽しめる行先にする（日帰りなら近場）",
        "- その時期の季節・気候・イベントに合うものを優先する",
    ]
    if scope in SCOPE_RULES:
        lines.append(f"- {SCOPE_RULES[scope]}")
    lines += [
        "- name は「京都」「香港・マカオ」のような、都市・地域単位の行先名",
        "- reason はおすすめ理由を60文字程度で（季節・テーマとの相性に触れる）",
        "- highlights はその行先での楽しみ方を3つ、それぞれ15文字程度で",
    ]
    return "\n".join(lines)


def suggest_destinations(theme, departure, scope, date_from, date_to, exclude) -> list:
    """[{name, reason, highlights: [...]}] を返す。"""
    start, nights = _period(date_from, date_to)
    if start is None:
        return []
    schema = {
        "type": "object",
        "properties": {
            "destinations": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "reason": {"type": "string"},
                        "highlights": {"type": "array", "items": {"type": "string"}},
                    },
                    "required": ["name", "reason", "highlights"],
                },
            },
        },
        "required": ["destinations"],
    }
    result = _ask_gemini(_destination_prompt(theme, departure, scope, start, nights, exclude), schema) or {}
    excluded = {name.strip() for name in exclude}
    rows = []
    for item in result.get("destinations") or []:
        if not isinstance(item, dict):
            continue
        name = _text(item.get("name"), 100)
        if not name or name in excluded:
            continue
        excluded.add(name)
        rows.append({
            "name": name,
            "reason": _text(item.get("reason"), 200),
            "highlights": [_text(h, 50) for h in (item.get("highlights") or []) if _text(h, 50)][:3],
        })
    return rows[:DESTINATION_COUNT]


# ---------- 宿泊先（ホテル）の候補 ----------

def _hotel_prompt(theme, departure, destination, start, nights, exclude) -> str:
    lines = [
        "あなたは国内外のホテル・旅館に詳しい旅行プランナーです。",
        "友達同士の旅行で、泊ごとの宿泊先の候補を提案してください。",
        "",
        "# 旅の情報",
        f"- 行先: {destination}",
        f"- 日程: {start.year}年{start.month}月{start.day}日から{nights}泊{nights + 1}日",
    ]
    if departure:
        lines.append(f"- 出発地: {departure}")
    if theme:
        lines.append(f"- テーマ: {theme}")
    if exclude:
        lines.append(f"- すでに提案済みの宿（これらは提案しない）: {'、'.join(exclude)}")
    lines += [
        "",
        "# 条件",
        f"- 1泊目から{nights}泊目まで、泊ごとに{HOTELS_PER_NIGHT + EXTRA_HOTELS_PER_NIGHT}件ずつ提案する",
        "- 行先が複数の都市・地域にまたがる場合（例: 香港・マカオ）は、無理のない順番で泊ごとの滞在地を決め、"
        "その泊の滞在地にある宿を提案する",
        "- 同じ地域に連泊する泊どうしは、同じ宿が入ってもよい",
        "- 実在するホテル・旅館などの宿泊施設だけ。価格帯や雰囲気が偏らないようにする",
        "- name は地図で検索できる正式名称（海外は日本語で一般的な表記）",
        "- area はその泊の滞在地（都市・地域名）",
        "- reason は提案理由を50文字程度で（立地・テーマとの相性など）",
        "- 料金は書かない",
    ]
    return "\n".join(lines)


def suggest_hotels(theme, departure, destination, date_from, date_to, exclude) -> list:
    """泊ごとの候補 [{night, area, hotels: [{name, area, reason, address, maps_url, website}]}] を返す。"""
    start, nights = _period(date_from, date_to)
    if start is None or nights == 0:
        return []
    nights = min(nights, MAX_HOTEL_NIGHTS)
    schema = {
        "type": "object",
        "properties": {
            "nights": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "night": {"type": "integer"},
                        "area": {"type": "string"},
                        "hotels": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "name": {"type": "string"},
                                    "area": {"type": "string"},
                                    "reason": {"type": "string"},
                                },
                                "required": ["name", "area", "reason"],
                            },
                        },
                    },
                    "required": ["night", "area", "hotels"],
                },
            },
        },
        "required": ["nights"],
    }
    result = _ask_gemini(_hotel_prompt(theme, departure, destination, start, nights, exclude), schema) or {}
    excluded = {name.strip() for name in exclude}

    by_night = {}
    for item in result.get("nights") or []:
        if not isinstance(item, dict):
            continue
        try:
            night = int(item.get("night"))
        except (TypeError, ValueError):
            continue
        if not 1 <= night <= nights or night in by_night:
            continue
        area = _text(item.get("area"), 50) or destination
        hotels = []
        seen = set()
        for hotel in item.get("hotels") or []:
            if not isinstance(hotel, dict):
                continue
            name = _text(hotel.get("name"), 100)
            if not name or name in excluded or name in seen:
                continue
            seen.add(name)
            hotels.append({
                "name": name,
                "area": _text(hotel.get("area"), 50) or area,
                "reason": _text(hotel.get("reason"), 200),
            })
        by_night[night] = {"night": night, "area": area, "hotels": hotels}

    # 実在チェック。同じ宿が複数の泊に出ることがあるので、名前ごとに1回だけ調べる。
    unique = {}
    for group in by_night.values():
        for hotel in group["hotels"]:
            unique.setdefault(hotel["name"], hotel["area"])
    with ThreadPoolExecutor(max_workers=8) as pool:
        places = dict(zip(unique, pool.map(lambda pair: _lookup_place(*pair), unique.items())))

    groups = []
    for night in sorted(by_night):
        group = by_night[night]
        hotels = []
        for hotel in group["hotels"]:
            place = places.get(hotel["name"])
            if place is False:  # 地図で見つからないと判定できたものだけ外す（判定不能なら残す）
                continue
            place = place or {}
            hotels.append({
                **hotel,
                "address": place.get("address", ""),
                "maps_url": place.get("maps_url") or _maps_search_url(hotel["name"], hotel["area"]),
                "website": place.get("website", ""),
            })
        groups.append({**group, "hotels": hotels[:HOTELS_PER_NIGHT]})
    return groups
