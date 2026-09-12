from django.conf import settings
from django.db import DatabaseError
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from . import choices, consistency
from . import prompt as prompt_builder
from . import providers, validators
from .models import AppUser, FeatureRequest, Setting, TripRequest, generate_trip_id
from .serializers import (
    FeatureRequestSerializer,
    TripRequestSerializer,
    TripRequestSummarySerializer,
)

# Setting テーブルで管理する項目のキー
SETTING_SITE_NOTICE = "site_notice"
SETTING_FEATURE_REQUEST_OPEN = "feature_request_open"

FEATURE_REQUEST_CATEGORIES = [
    ("function", "機能の追加・改善"),
    ("design", "デザイン・使い勝手"),
    ("bug", "不具合の報告"),
    ("other", "その他"),
]


def _choice_payload(options):
    return [{"value": key, "label": label} for key, label in options]


class OptionsView(APIView):
    """フォームの選択肢と各種上限値を返す。フロント側での定義重複を防ぐ。"""

    def get(self, request):
        provider = providers.get_provider()
        return Response({
            "notice": Setting.get_value(SETTING_SITE_NOTICE, ""),
            "feature_request_open": Setting.get_value(SETTING_FEATURE_REQUEST_OPEN, "1") != "0",
            "schedule_paces": _choice_payload(choices.SCHEDULE_PACES),
            "design_tastes": _choice_payload(choices.DESIGN_TASTES),
            "color_images": _choice_payload(choices.COLOR_IMAGES),
            "aspect_ratios": _choice_payload(choices.ASPECT_RATIOS),
            "feature_request_categories": _choice_payload(FEATURE_REQUEST_CATEGORIES),
            "other_value": choices.OTHER,
            "max_trip_days": validators.MAX_TRIP_DAYS,
            "max_list_items": validators.MAX_LIST_ITEMS,
            "place_suggest_enabled": provider.enabled,
        })


class TripValidateView(APIView):
    """確認ページ用。保存せずにビジネスエラーの確認とプロンプトの試作を行う。"""

    def post(self, request):
        cleaned, errors = validators.normalize_and_validate(request.data or {})
        if errors:
            return Response({"errors": errors}, status=status.HTTP_400_BAD_REQUEST)
        concerns = consistency.check_destination_consistency(cleaned)
        return Response({
            "errors": [],
            "prompt_text": prompt_builder.build_prompt(cleaned),
            "consistency_warnings": concerns,
        })


class TripListCreateView(APIView):
    def get(self, request):
        """端末キーに紐づく作成済みの旅を返す。"""
        device_key = (request.query_params.get("device_key") or "").strip()
        if not device_key:
            return Response({"results": []})
        trips = TripRequest.objects.filter(device_key=device_key)[:50]
        return Response({"results": TripRequestSummarySerializer(trips, many=True).data})

    def post(self, request):
        cleaned, errors = validators.normalize_and_validate(request.data or {})
        if errors:
            return Response({"errors": errors}, status=status.HTTP_400_BAD_REQUEST)

        cleaned["prompt_text"] = prompt_builder.build_prompt(cleaned)
        trip = TripRequest.objects.create(trip_id=generate_trip_id(), **cleaned)
        return Response(TripRequestSerializer(trip).data, status=status.HTTP_201_CREATED)


class TripDetailView(APIView):
    def get(self, request, trip_id):
        trip = TripRequest.objects.filter(trip_id=trip_id.strip().upper()).first()
        if trip is None:
            return Response(
                {"detail": "指定された旅IDのデータが見つかりませんでした。"},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(TripRequestSerializer(trip).data)


class FeatureRequestListCreateView(APIView):
    def get(self, request):
        rows = FeatureRequest.objects.filter(is_published=True)[:100]
        return Response({"results": FeatureRequestSerializer(rows, many=True).data})

    def post(self, request):
        if Setting.get_value(SETTING_FEATURE_REQUEST_OPEN, "1") == "0":
            return Response(
                {"errors": [{"field": "body", "message": "現在、要望の受付を停止しています。"}]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        payload = request.data or {}
        serializer = FeatureRequestSerializer(data=payload)
        if not serializer.is_valid():
            errors = [
                {"field": field, "message": messages[0]}
                for field, messages in serializer.errors.items()
            ]
            return Response({"errors": errors}, status=status.HTTP_400_BAD_REQUEST)
        serializer.save(device_key=str(payload.get("device_key") or "")[:64])
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class PlaceSuggestView(APIView):
    """住所サジェスト。プロバイダ未設定時は候補なしを返す（自由入力のまま使える）。"""

    def get(self, request):
        query = (request.query_params.get("q") or "").strip()
        provider = providers.get_provider()
        if len(query) < 2 or not provider.enabled:
            return Response({"enabled": provider.enabled, "results": []})
        return Response({"enabled": True, "results": provider.suggest(query)})


# テーブル状況確認ページ用。SELECT のみを許可する対象テーブル。
_INSPECTABLE_MODELS = {
    "request": TripRequest,
    "feature_request": FeatureRequest,
    "app_user": AppUser,
    "setting": Setting,
}
_MASKED_FIELDS = {"password_hash", "device_key"}
_ROW_LIMIT = 100


def _mask(field_name, value):
    """端末キーやハッシュはそのままの値を見せない。"""
    if field_name in _MASKED_FIELDS and value:
        return str(value)[:4] + "****"
    return value


class TableStatusView(APIView):
    """作成済みテーブルの一覧と件数を返す（参照のみ）。

    注意: 認証を設けていないため、公開環境では必ずアクセス制限を追加すること。
    """

    def get(self, request):
        tables = []
        for table_name, model in _INSPECTABLE_MODELS.items():
            try:
                count = model.objects.count()
            except DatabaseError:
                count = None
            tables.append({
                "table": table_name,
                "verbose_name": str(model._meta.verbose_name),
                "count": count,
                "columns": [
                    {
                        "name": field.name,
                        "verbose_name": str(field.verbose_name),
                        "type": field.get_internal_type(),
                    }
                    for field in model._meta.fields
                ],
            })
        return Response({"engine": settings.DATABASES["default"]["ENGINE"], "tables": tables})


class TableRowsView(APIView):
    """指定テーブルの行を参照する（SELECT のみ）。"""

    def get(self, request, table):
        model = _INSPECTABLE_MODELS.get(table)
        if model is None:
            return Response(
                {"detail": "参照できないテーブルです。"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        field_names = [field.name for field in model._meta.fields]
        rows = []
        for row in model.objects.all().values(*field_names)[:_ROW_LIMIT]:
            rows.append({key: _mask(key, value) for key, value in row.items()})
        return Response({"table": table, "columns": field_names, "rows": rows, "limit": _ROW_LIMIT})
