"""行先と、集合・宿泊・スポットの各住所が大きくかけ離れていないかをGeminiで確認する。

住所サジェスト(providers.py)と同じ方針：
- APIキー未設定なら何もせず空リストを返す（機能自体が無効なだけで、入力は止めない）
- 呼び出しに失敗しても例外を投げず、空リストを返す（補助機能なので失敗しても進める）

戻り値はチェック対象外にした方がよい「気になる点」の一文リスト。
フロントではこれを1件ずつチェックボックスにして、ユーザーに確認してもらう。
"""

import json
import urllib.error
import urllib.request

from django.conf import settings

from .lodging import describe_lodging

GEMINI_MODEL = "gemini-3.6-flash"
GEMINI_ENDPOINT = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
MAX_CONCERNS = 10
REQUEST_TIMEOUT_SECONDS = 10


def _collect_places(cleaned: dict) -> list:
    """整合性チェックの対象にする場所の一覧を作る。"""
    places = []
    if cleaned.get("meeting_place"):
        places.append(f"集合場所: {cleaned['meeting_place']}")
    if cleaned.get("dismissal_place"):
        places.append(f"解散場所: {cleaned['dismissal_place']}")
    for index, lodging in enumerate(cleaned.get("lodgings") or [], start=1):
        text = describe_lodging(lodging)
        # 「おまかせ」は場所の情報を持たないのでチェック対象外。
        if text and not text.startswith("おまかせ"):
            places.append(f"{index}泊目の宿泊場所: {text}")
    for spot in cleaned.get("must_spots") or []:
        if spot:
            places.append(f"いきたいスポット(MUST): {spot}")
    for spot in cleaned.get("want_spots") or []:
        if spot:
            places.append(f"いきたいスポット(WANT): {spot}")
    return places


def _build_prompt(destination: str, places: list) -> str:
    place_lines = "\n".join(f"- {place}" for place in places)
    return (
        "あなたは旅行プランのチェック担当です。以下は日本国内の旅行プランに入力された情報です。\n"
        f"申告された行先（おおまかな方面）: {destination}\n\n"
        "以下の場所のリストのうち、申告された行先と地理的に大きくかけ離れていて、"
        "同じ旅程の中で回るには現実的でないと思われるものがあれば、"
        "利用者に再確認してほしい内容として日本語の短い一文で指摘してください。\n"
        "地名の表記ゆれや、行先が広域（例:関西）で個々の場所がその一部（例:大阪）である"
        "ような、実際には問題ない組み合わせまで過剰に指摘しないでください。\n"
        "明らかにおかしいものが無ければ、必ず空配列を返してください。\n\n"
        f"{place_lines}"
    )


def check_destination_consistency(cleaned: dict) -> list:
    """行先と各場所の整合性をチェックし、確認してほしい点の一覧を返す。"""
    api_key = getattr(settings, "GEMINI_API_KEY", "")
    destination = (cleaned.get("destination") or "").strip()
    if not api_key or not destination:
        return []

    places = _collect_places(cleaned)
    if not places:
        return []

    body = json.dumps({
        "contents": [{"parts": [{"text": _build_prompt(destination, places)}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": {
                "type": "object",
                "properties": {
                    "concerns": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["concerns"],
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
        result = json.loads(text)
        concerns = result.get("concerns") or []
        return [str(concern).strip() for concern in concerns if str(concern).strip()][:MAX_CONCERNS]
    except (urllib.error.URLError, TimeoutError, KeyError, IndexError, ValueError):
        # 整合性チェックはあくまで補助機能。失敗してもユーザーの入力は止めない。
        return []
