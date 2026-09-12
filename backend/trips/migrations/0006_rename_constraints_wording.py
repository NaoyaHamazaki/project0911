from django.db import migrations

OLD_TEXT = "「絶対に守りたい制約」の日時は固定して動かさない"
NEW_TEXT = "「予約済みの予定」の日時は固定して動かさない"


def update_wording(apps, schema_editor):
    """既定文のままの場合だけ文言を差し替える（管理者が編集済みなら触らない）。"""
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
    dependencies = [
        ("trips", "0005_triprequest_free_notes_triprequest_rough_plans_and_more"),
    ]

    operations = [migrations.RunPython(update_wording, revert_wording)]
