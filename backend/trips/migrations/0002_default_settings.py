from django.db import migrations

DEFAULTS = [
    {
        "key": "site_notice",
        "value": "",
        "description": "全ページ上部に出すお知らせ。空欄なら非表示。",
    },
    {
        "key": "feature_request_open",
        "value": "1",
        "description": "要望フォームの受付。0 で受付停止。",
    },
]


def create_defaults(apps, schema_editor):
    Setting = apps.get_model("trips", "Setting")
    for row in DEFAULTS:
        Setting.objects.get_or_create(key=row["key"], defaults=row)


def remove_defaults(apps, schema_editor):
    Setting = apps.get_model("trips", "Setting")
    Setting.objects.filter(key__in=[row["key"] for row in DEFAULTS]).delete()


class Migration(migrations.Migration):
    dependencies = [("trips", "0001_initial")]

    operations = [migrations.RunPython(create_defaults, remove_defaults)]
