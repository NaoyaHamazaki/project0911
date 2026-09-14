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
# 編集(PUT)時に、作成した端末と同じであることを必須にするかどうか。
# "0"（既定）なら旅IDさえ分かれば誰でも編集できる。管理者設定の「全般設定」タブで切り替える。
SETTING_EDIT_REQUIRES_SAME_DEVICE = "edit_requires_same_device"

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
            "admin_menu_enabled": settings.ADMIN_MENU_ENABLED,
        })


class PromptSettingsView(APIView):
    """管理者用のプロンプト編集画面（/admin-settings）用API。

    本番では使わない想定の一時的な機能のため、settings.ADMIN_MENU_ENABLED が
    有効なときだけ動作する（無効時はURLを知っていても404になる）。
    """

    FIELDS = {
        "prompt_intro": ("見出し前の指示文", prompt_builder.DEFAULT_PROMPT_INTRO),
        "prompt_output_items": ("出力してほしいもの", prompt_builder.DEFAULT_PROMPT_OUTPUT_ITEMS),
        "prompt_rules": ("守ってほしいこと（{period_label}は自動置換される）", prompt_builder.DEFAULT_PROMPT_RULES),
    }

    def _guard(self):
        return settings.ADMIN_MENU_ENABLED

    def get(self, request):
        if not self._guard():
            return Response({"detail": "この機能は現在無効です。"}, status=status.HTTP_404_NOT_FOUND)
        items = [
            {
                "key": key,
                "label": label,
                "value": Setting.get_value(key, default),
                "default": default,
            }
            for key, (label, default) in self.FIELDS.items()
        ]
        return Response({"items": items})

    def post(self, request):
        if not self._guard():
            return Response({"detail": "この機能は現在無効です。"}, status=status.HTTP_404_NOT_FOUND)
        data = request.data or {}
        updated = []
        for key, (label, _default) in self.FIELDS.items():
            if key not in data:
                continue
            value = str(data.get(key) or "")
            Setting.objects.update_or_create(key=key, defaults={"value": value, "description": label})
            updated.append(key)
        return Response({"updated": updated})


class GeneralSettingsView(APIView):
    """管理者設定の「全般設定」タブ用API。ADMIN_MENU_ENABLED が無効なら404。"""

    def _guard(self):
        return settings.ADMIN_MENU_ENABLED

    def _payload(self):
        return {
            "edit_requires_same_device": Setting.get_value(SETTING_EDIT_REQUIRES_SAME_DEVICE, "0") == "1",
        }

    def get(self, request):
        if not self._guard():
            return Response({"detail": "この機能は現在無効です。"}, status=status.HTTP_404_NOT_FOUND)
        return Response(self._payload())

    def post(self, request):
        if not self._guard():
            return Response({"detail": "この機能は現在無効です。"}, status=status.HTTP_404_NOT_FOUND)
        data = request.data or {}
        if "edit_requires_same_device" in data:
            value = "1" if data.get("edit_requires_same_device") else "0"
            Setting.objects.update_or_create(
                key=SETTING_EDIT_REQUIRES_SAME_DEVICE,
                defaults={"value": value, "description": "編集(PUT)時に作成端末との一致を必須にするか"},
            )
        return Response(self._payload())


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

    def put(self, request, trip_id):
        """「再編集」からの更新。同じ trip_id のまま内容を上書きする。"""
        trip = TripRequest.objects.filter(trip_id=trip_id.strip().upper()).first()
        if trip is None:
            return Response(
                {"detail": "指定された旅IDのデータが見つかりませんでした。"},
                status=status.HTTP_404_NOT_FOUND,
            )

        payload = request.data or {}
        device_key = str(payload.get("device_key") or "")
        # 既定では旅IDさえ知っていれば誰でも編集できる。管理者設定で「作成端末との一致を必須にする」を
        # ONにした場合だけ、作成時と異なる端末からの編集を拒否する。
        require_same_device = Setting.get_value(SETTING_EDIT_REQUIRES_SAME_DEVICE, "0") == "1"
        if require_same_device and trip.device_key and device_key != trip.device_key:
            return Response(
                {"detail": "この旅を編集する権限がありません（作成した端末と異なります）。"},
                status=status.HTTP_403_FORBIDDEN,
            )

        cleaned, errors = validators.normalize_and_validate(payload)
        if errors:
            return Response({"errors": errors}, status=status.HTTP_400_BAD_REQUEST)

        cleaned.pop("device_key", None)  # 所有者(端末)は編集で変えない
        cleaned["prompt_text"] = prompt_builder.build_prompt(cleaned)
        for key, value in cleaned.items():
            setattr(trip, key, value)
        trip.save()
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
