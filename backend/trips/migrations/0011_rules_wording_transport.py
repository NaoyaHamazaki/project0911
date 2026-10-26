from django.db import migrations

OLD_TEXT = "初日の開始は集合場所、最終日の終了は解散場所に合わせる"
NEW_TEXT = "初日の開始・最終日の終了は、往路・復路の交通手段（集合・解散場所の指定があればそれ）に合わせる"


def update_wording(apps, schema_editor):
    """既定文のままの場合だけ差し替える（管理者が編集済みなら触らない）。"""
    Setting = apps.get_model("trips", "Setting")
    row = Setting.objects.filter(key="prompt_rules").first()
    if row and OLD_TEXT in row.value:
        row.value = row.value.replace(OLD_TEXT, NEW_TEXT)
        row.save(update_fields=["value"])


def revert_wording(apps, schema_editor):
    Setting = apps.get_model("trips", "Setting")
    row = Setting.objects.filter(key="prompt_rules").first()
    if row and NEW_TEXT in row.value:
        row.value = row.value.replace(NEW_TEXT, OLD_TEXT)
        row.save(update_fields=["value"])


class Migration(migrations.Migration):
    dependencies = [("trips", "0010_backfill_image_prompt")]

    operations = [migrations.RunPython(update_wording, revert_wording)]
