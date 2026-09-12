"""住所サジェストのプロバイダ層。

最小限機能では NullProvider（自由入力のみ）で動作する。
Google Places などを使う場合は settings.PLACE_PROVIDER を切り替え、
このファイルに実装クラスを足すだけで済むようにしている。
API キーはサーバー側に置き、フロントは常に /api/places/suggest/ 経由で呼ぶ。
"""

from django.conf import settings


class BaseProvider:
    #: フロントがサジェストUIを出すかどうかの判定に使う
    enabled = False

    def suggest(self, query: str) -> list:
        raise NotImplementedError


class NullProvider(BaseProvider):
    """外部APIを呼ばず、常に候補なしを返す（自由入力のみ）。"""

    enabled = False

    def suggest(self, query: str) -> list:
        return []


class GoogleProvider(BaseProvider):
    """Google Places Autocomplete (New) を使う実装。

    GOOGLE_MAPS_API_KEY を設定したうえで PLACE_PROVIDER=google にすると有効になる。
    課金が発生するため、最小限機能では既定で無効。
    """

    enabled = True

    def suggest(self, query: str) -> list:
        import json
        import urllib.error
        import urllib.request

        api_key = settings.GOOGLE_MAPS_API_KEY
        if not api_key:
            return []
        payload = json.dumps({
            "input": query,
            "languageCode": "ja",
            "regionCode": "JP",
        }).encode("utf-8")
        request = urllib.request.Request(
            "https://places.googleapis.com/v1/places:autocomplete",
            data=payload,
            headers={
                "Content-Type": "application/json",
                "X-Goog-Api-Key": api_key,
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                body = json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, ValueError, TimeoutError):
            return []

        results = []
        for suggestion in body.get("suggestions", []):
            prediction = suggestion.get("placePrediction") or {}
            text = (prediction.get("text") or {}).get("text")
            if not text:
                continue
            structured = prediction.get("structuredFormat") or {}
            results.append({
                "label": (structured.get("mainText") or {}).get("text") or text,
                "detail": (structured.get("secondaryText") or {}).get("text") or "",
                "value": text,
            })
        return results


_PROVIDERS = {
    "null": NullProvider,
    "google": GoogleProvider,
}


def get_provider() -> BaseProvider:
    provider_class = _PROVIDERS.get(settings.PLACE_PROVIDER, NullProvider)
    return provider_class()
