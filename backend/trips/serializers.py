from rest_framework import serializers

from .lodging import normalize_lodging
from .models import FeatureRequest, TripContribution, TripFeedback, TripRequest


class TripRequestSerializer(serializers.ModelSerializer):
    """保存済みの旅情報を返すための読み取り用シリアライザ。"""

    nights = serializers.IntegerField(read_only=True)
    days = serializers.IntegerField(read_only=True)
    schedule_paces_label = serializers.CharField(read_only=True)
    design_taste_label = serializers.CharField(read_only=True)
    color_image_label = serializers.CharField(read_only=True)
    aspect_ratio_label = serializers.CharField(read_only=True)
    lodgings = serializers.SerializerMethodField()

    class Meta:
        model = TripRequest
        fields = [
            "trip_id", "title", "theme", "destination", "date_from", "date_to",
            "outbound_transport", "outbound_transport_other", "outbound_reservation",
            "return_transport", "return_transport_other", "return_reservation",
            "meeting_place", "dismissal_place", "lodgings",
            "must_spots", "want_spots", "spot_notes",
            "schedule_paces", "schedule_pace_other", "schedule_paces_label",
            "rough_plans", "constraints", "ng_items", "notes", "free_notes", "collect_feedback",
            "image_enabled", "image_mood", "join_key",
            "design_taste", "design_taste_other", "design_taste_label",
            "color_image", "color_image_other", "color_image_label",
            "aspect_ratio", "aspect_ratio_other", "aspect_ratio_label",
            "prompt_text", "image_prompt_text", "nights", "days", "created_at", "updated_at",
        ]

    def get_lodgings(self, obj):
        # 旧形式(文字列)で保存された過去データも、常に新形式で返す。
        return [normalize_lodging(item) for item in (obj.lodgings or [])]


class TripRequestSummarySerializer(serializers.ModelSerializer):
    """「自分の作った旅」一覧用の軽量シリアライザ。"""

    nights = serializers.IntegerField(read_only=True)

    class Meta:
        model = TripRequest
        fields = ["trip_id", "title", "date_from", "date_to", "nights", "created_at"]


class FeatureRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = FeatureRequest
        fields = ["id", "nickname", "category", "body", "created_at"]
        extra_kwargs = {
            "body": {
                "required": True,
                "allow_blank": False,
                "error_messages": {
                    "blank": "要望の内容を入力してください。",
                    "required": "要望の内容を入力してください。",
                    "max_length": "要望の内容は1000文字までです。",
                },
            },
            "nickname": {"required": False, "allow_blank": True},
            "category": {"required": False, "allow_blank": True},
        }


class TripFeedbackSerializer(serializers.ModelSerializer):
    class Meta:
        model = TripFeedback
        fields = ["id", "nickname", "body", "created_at"]
        extra_kwargs = {
            "body": {
                "required": True,
                "allow_blank": False,
                "error_messages": {
                    "blank": "意見を入力してください。",
                    "required": "意見を入力してください。",
                    "max_length": "意見は1000文字までです。",
                },
            },
            "nickname": {"required": False, "allow_blank": True},
        }


class TripContributionSerializer(serializers.ModelSerializer):
    class Meta:
        model = TripContribution
        fields = ["id", "name", "must_spots", "want_spots", "spot_notes", "constraints", "rough_plans", "notes", "created_at"]
