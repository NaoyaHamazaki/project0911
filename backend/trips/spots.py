"""テーマ・行先・宿泊先をもとに、いきたいスポットの候補をGeminiで提案する。

consistency.py と同じ方針：
- APIキー未設定なら機能自体を無効にする（enabled=False を返す）
- 呼び出しに失敗しても例外を投げず、空リストを返す（補助機能なので入力は止めない）

Google Places が使える環境では、実在が確認できた場所だけに絞り込む
（AIが架空の場所を出すことがあるため）。
"""

import json
import urllib.error
import urllib.request

from django.conf import settings

from .consistency import GEMINI_ENDPOINT
from .lodging import describe_lodging

SUGGEST_COUNT = 5
# 実在チェックで落ちる分を見込んで、少し多めに出してもらう。
REQUEST_COUNT = 8
REQUEST_TIMEOUT_SECONDS = 20


def is_enabled() -> bool:
    return bool(getattr(settings, "GEMINI_API_KEY", ""))


def _build_prompt(theme: str, destination: str, lodgings: list, exclude: list) -> str:
    lines = [
        "あなたは日本国内の旅行に詳しいプランナーです。",
        "友達同士の旅行で「いきたいスポット」の候補を提案してください。",
        "",
        "# 旅の情報",
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
        f"- 実在する観光スポット・飲食店・体験施設などを{REQUEST_COUNT}件",
        "- ホテル・旅館などの宿泊施設は含めない",
        "- 宿泊先から無理なく行ける範囲を優先する",
        "- name は地図で検索できる正式名称にする",
        "- summary はどんな場所かを40文字程度で",
        "- recommended_for はどんな人におすすめかを30文字程度で",
    ]
    return "\n".join(lines)


def _ask_gemini(prompt: str) -> list:
    api_key = getattr(settings, "GEMINI_API_KEY", "")
    body = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": {
                "type": "object",
                "properties": {
                    "spots": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "summary": {"type": "string"},
                                "recommended_for": {"type": "string"},
                            },
                            "required": ["name", "summary", "recommended_for"],
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
        results.append({
            "name": name,
            "summary": str(spot.get("summary") or "").strip()[:200],
            "recommended_for": str(spot.get("recommended_for") or "").strip()[:200],
        })
    return results


def _exists_on_map(name: str, destination: str):
    """Google Places で場所が見つかるか。判定できないときは None を返す。"""
    api_key = getattr(settings, "GOOGLE_MAPS_API_KEY", "")
    if settings.PLACE_PROVIDER != "google" or not api_key:
        return None
    query = f"{name} {destination}".strip()
    request = urllib.request.Request(
        "https://places.googleapis.com/v1/places:searchText",
        data=json.dumps({"textQuery": query, "languageCode": "ja", "regionCode": "JP", "pageSize": 1}).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": "places.displayName",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            body = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, ValueError, TimeoutError):
        return None
    return bool(body.get("places"))


def suggest_spots(theme: str, destination: str, lodgings: list, exclude: list) -> list:
    if not is_enabled():
        return []
    candidates = _ask_gemini(_build_prompt(theme, destination, lodgings, exclude))
    excluded = {item.strip() for item in exclude}
    results = []
    for spot in candidates:
        if spot["name"] in excluded:
            continue
        # 地図で見つからないと判定できたものだけ外す（判定不能なら残す）。
        if _exists_on_map(spot["name"], destination) is False:
            continue
        results.append(spot)
        if len(results) >= SUGGEST_COUNT:
            break
    return results
