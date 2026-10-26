from django.db import migrations

# 画像生成用プロンプトに使う項目だけ取り出す（build_image_prompt が参照するもの）。
_FIELDS = [
    "title", "theme", "destination", "date_from", "date_to", "must_spots", "want_spots",
    "design_taste", "design_taste_other", "color_image", "color_image_other",
    "aspect_ratio", "aspect_ratio_other",
]


def backfill(apps, schema_editor):
    """既存の旅にも画像生成用プロンプトを作っておく（結果ページで空欄にならないように）。"""
    from trips.prompt import build_image_prompt

    TripRequest = apps.get_model("trips", "TripRequest")
    for trip in TripRequest.objects.filter(image_prompt_text=""):
        cleaned = {field: getattr(trip, field) for field in _FIELDS}
        trip.image_prompt_text = build_image_prompt(cleaned)
        trip.save(update_fields=["image_prompt_text"])


class Migration(migrations.Migration):
    dependencies = [("trips", "0009_four_step_form")]

    operations = [migrations.RunPython(backfill, migrations.RunPython.noop)]
