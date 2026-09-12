from rest_framework import serializers

from .models import FeatureRequest, TripRequest


class TripRequestSerializer(serializers.ModelSerializer):
    """保存済みの旅情報を返すための読み取り用シリアライザ。"""

    nights = serializers.IntegerField(read_only=True)
    days = serializers.IntegerField(read_only=True)
    schedule_paces_label = serializers.CharField(read_only=True)
    design_taste_label = serializers.CharField(read_only=True)
    color_image_label = serializers.CharField(read_only=True)
    aspect_ratio_label = serializers.CharField(read_only=True)

    class Meta:
        model = TripRequest
        fields = [
            "trip_id", "title", "theme", "destination", "date_from", "date_to",
            "meeting_place", "dismissal_place", "lodgings",
            "must_spots", "want_spots",
            "schedule_paces", "schedule_pace_other", "schedule_paces_label",
            "rough_plans", "constraints", "ng_items", "notes", "free_notes",
            "design_taste", "design_taste_other", "design_taste_label",
            "color_image", "color_image_other", "color_image_label",
            "aspect_ratio", "aspect_ratio_other", "aspect_ratio_label",
            "prompt_text", "nights", "days", "created_at", "updated_at",
        ]


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
