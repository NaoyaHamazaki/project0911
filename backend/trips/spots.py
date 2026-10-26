"""テーマ・行先・宿泊先・日程をもとに、いきたいスポットの候補をGeminiで提案する。

consistency.py と同じ方針：
- APIキー未設定なら機能自体を無効にする（enabled=False を返す）
- 呼び出しに失敗しても例外を投げず、空リストを返す（補助機能なので入力は止めない）

候補は行先をエリアごとに分けて返す（例: 香港・マカオ → 香港 / マカオ）。
件数は旅の日数に応じて増減させる。

各候補には出典（Googleマップ・公式サイト）を付ける。Google Places が使える環境では
実在が確認できた場所だけに絞り込み、住所・地図URL・公式サイトを Places の値で補う
（AIが架空の場所を出すことがあるため）。
"""

import json
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

from django.conf import settings

from .consistency import GEMINI_ENDPOINT
from .lodging import describe_lodging

SPOTS_PER_DAY = 3
MIN_SPOTS = 5
MAX_SPOTS = 15
# 実在チェックで落ちる分を見込んで、少し多めに出してもらう。
EXTRA_REQUEST = 3
REQUEST_TIMEOUT_SECONDS = 30
CATEGORIES = ["観光", "グルメ", "体験", "ショッピング", "自然", "夜景・ナイト"]


def is_enabled() -> bool:
    return bool(getattr(settings, "GEMINI_API_KEY", ""))


def _days(date_from, date_to) -> int:
    try:
        start = datetime.strptime(str(date_from), "%Y-%m-%d").date()
        end = datetime.strptime(str(date_to), "%Y-%m-%d").date()
    except ValueError:
        return 1
    return max((end - start).days + 1, 1)


def spot_count(days: int) -> int:
    """表示する候補数。日数に応じて増やす（1日あたり約3件、5〜15件）。"""
    return max(MIN_SPOTS, min(days * SPOTS_PER_DAY, MAX_SPOTS))


def _build_prompt(theme: str, destination: str, lodgings: list, days: int, count: int, exclude: list) -> str:
    nights = days - 1
    period = "日帰り" if nights == 0 else f"{nights}泊{days}日"
    lines = [
        "あなたは国内外の旅行に詳しいプランナーです。",
        "友達同士の旅行で「いきたいスポット」の候補を提案してください。",
        "",
        "# 旅の情報",
        f"- 日程: {period}",
    ]
    if theme:
        lines.append(f"- テーマ: {theme}")
    if destination:
        lines.append(f"- 行先: {destination}")
    for index, lodging in enumerate(lodgings, start=1):
        text = describe_lodging(lodging)
        if text and not text.startswith("おまかせ"):
            lines.append(f"- {index}泊目の宿泊先: {text}")
    if exclude:
        lines.append(f"- すでに候補に入っている場所（これらは提案しない）: {'、'.join(exclude)}")
    lines += [
        "",
        "# 条件",
        f"- 合計{count + EXTRA_REQUEST}件。{period}の旅程を組めるだけの量と種類のバランスにする",
        "- area は都市・地域単位（例: 香港、マカオ、京都）にする。同じ都市の中の地区（尖沙咀・中環など）では分けない",
        "- 行先が複数の都市・地域にまたがる場合（例: 香港・マカオ、東京と横浜）は area で分け、"
        "それぞれに滞在する泊数の比率に応じて件数を配分する（日帰りで立ち寄る地域も最低2件）",
        "- 実在する観光スポット・飲食店・体験施設など。ホテル・旅館などの宿泊施設は含めない",
        "- 宿泊先から無理なく行ける範囲を優先する",
        f"- category は次のいずれか: {'、'.join(CATEGORIES)}",
        "- name は地図で検索できる正式名称（海外は日本語で一般的な表記）",
        "- summary はどんな場所かを40文字程度で",
        "- recommended_for はどんな人におすすめかを30文字程度で",
    ]
    return "\n".join(lines)


def _ask_gemini(prompt: str) -> list:
    """[{area, name, category, summary, recommended_for}] のリストを返す。"""
    api_key = getattr(settings, "GEMINI_API_KEY", "")
    body = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            # 候補出しは深い推論が不要。low にすると応答が約3倍速くなる（約23秒→約8秒）。
            "thinkingConfig": {"thinkingLevel": "low"},
            "responseSchema": {
                "type": "object",
                "properties": {
                    "spots": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "area": {"type": "string"},
                                "name": {"type": "string"},
                                "category": {"type": "string"},
                                "summary": {"type": "string"},
                                "recommended_for": {"type": "string"},
                            },
                            "required": ["area", "name", "category", "summary", "recommended_for"],
                        },
                    },
                },
                "required": ["spots"],
            },
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
        spots = json.loads(text).get("spots") or []
    except (urllib.error.URLError, TimeoutError, KeyError, IndexError, ValueError):
        return []
    results = []
    for spot in spots:
        if not isinstance(spot, dict):
            continue
        name = str(spot.get("name") or "").strip()[:100]
        if not name:
            continue
        category = str(spot.get("category") or "").strip()
        results.append({
            "area": str(spot.get("area") or "").strip()[:50],
            "name": name,
            "category": category if category in CATEGORIES else "観光",
            "summary": str(spot.get("summary") or "").strip()[:200],
            "recommended_for": str(spot.get("recommended_for") or "").strip()[:200],
        })
    return results


def _lookup_place(name: str, area: str):
    """Google Places で場所を探す。見つからなければ False、判定できないときは None を返す。"""
    api_key = getattr(settings, "GOOGLE_MAPS_API_KEY", "")
    if settings.PLACE_PROVIDER != "google" or not api_key:
        return None
    request = urllib.request.Request(
        "https://places.googleapis.com/v1/places:searchText",
        # 海外の行先にも対応するため regionCode は指定しない。
        data=json.dumps({"textQuery": f"{name} {area}".strip(), "languageCode": "ja", "pageSize": 1}).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.googleMapsUri,places.websiteUri",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            body = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, ValueError, TimeoutError):
        return None
    places = body.get("places") or []
    if not places:
        return False
    place = places[0]
    return {
        "address": place.get("formattedAddress") or "",
        "maps_url": place.get("googleMapsUri") or "",
        "website": place.get("websiteUri") or "",
    }


def _maps_search_url(name: str, area: str) -> str:
    query = urllib.parse.quote(f"{name} {area}".strip())
    return f"https://www.google.com/maps/search/?api=1&query={query}"


def suggest_spots(theme: str, destination: str, lodgings: list, date_from, date_to, exclude: list) -> list:
    """エリアごとにまとめた候補 [{area, spots: [...]}] を返す。"""
    if not is_enabled():
        return []
    days = _days(date_from, date_to)
    count = spot_count(days)
    candidates = _ask_gemini(_build_prompt(theme, destination, lodgings, days, count, exclude))
    excluded = {item.strip() for item in exclude}

    unique = []
    for spot in candidates:
        if spot["name"] in excluded:
            continue
        excluded.add(spot["name"])
        spot["area"] = spot["area"] or destination or "おすすめ"
        unique.append(spot)

    # 実在チェックは1件ずつ外部APIを呼ぶので、並列にして待ち時間を短くする。
    with ThreadPoolExecutor(max_workers=8) as pool:
        places = list(pool.map(lambda spot: _lookup_place(spot["name"], spot["area"]), unique))

    groups = {}
    for spot, place in zip(unique, places):
        # 地図で見つからないと判定できたものだけ外す（判定不能なら残す）。
        if place is False:
            continue
        place = place or {}
        groups.setdefault(spot["area"], []).append({
            **{key: spot[key] for key in ("name", "category", "summary", "recommended_for")},
            "address": place.get("address", ""),
            "maps_url": place.get("maps_url") or _maps_search_url(spot["name"], spot["area"]),
            "website": place.get("website", ""),
        })
    return _trim_by_area(groups, count)


def _trim_by_area(groups: dict, count: int) -> list:
    """多めにもらった候補を count 件に減らす。先頭から切ると後ろの地域が消えるので、地域ごとの比率で配分する。"""
    total = sum(len(spots) for spots in groups.values())
    if total > count:
        quotas = {area: max(2, round(count * len(spots) / total)) for area, spots in groups.items()}
        # 丸めで超えた分は、件数の多い地域から1件ずつ減らす。
        while sum(min(quotas[a], len(groups[a])) for a in groups) > count:
            area = max(quotas, key=lambda a: quotas[a])
            if quotas[area] <= 1:
                break
            quotas[area] -= 1
        groups = {area: spots[: quotas[area]] for area, spots in groups.items()}
    return [{"area": area, "spots": spots} for area, spots in groups.items()]
