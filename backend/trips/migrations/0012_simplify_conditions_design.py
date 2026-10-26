from django.db import migrations

OLD_TEXT = "4. 上記のデザイン指示に沿った、しおりのビジュアル案（レイアウト・配色・使いたい装飾）"
NEW_TEXT = "4. 旅の雰囲気に合った、しおりのビジュアル案（レイアウト・配色・使いたい装飾）"


def update_wording(apps, schema_editor):
    """デザインテイスト・カラーの入力欄廃止に合わせ、既定文のままの場合だけ差し替える。"""
    Setting = apps.get_model("trips", "Setting")
    row = Setting.objects.filter(key="prompt_output_items").first()
    if row and OLD_TEXT in row.value:
        row.value = row.value.replace(OLD_TEXT, NEW_TEXT)
        row.save(update_fields=["value"])


def revert_wording(apps, schema_editor):
    Setting = apps.get_model("trips", "Setting")
    row = Setting.objects.filter(key="prompt_output_items").first()
    if row and NEW_TEXT in row.value:
        row.value = row.value.replace(NEW_TEXT, OLD_TEXT)
        row.save(update_fields=["value"])


class Migration(migrations.Migration):
    dependencies = [("trips", "0011_rules_wording_transport")]

    operations = [migrations.RunPython(update_wording, revert_wording)]
