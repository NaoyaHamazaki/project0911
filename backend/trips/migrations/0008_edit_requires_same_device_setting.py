from django.db import migrations

KEY = "edit_requires_same_device"


def create_default(apps, schema_editor):
    Setting = apps.get_model("trips", "Setting")
    Setting.objects.get_or_create(
        key=KEY,
        defaults={
            "value": "0",
            "description": "編集(PUT)時に作成端末との一致を必須にするか。0なら旅IDだけで誰でも編集できる。",
        },
    )


def remove_default(apps, schema_editor):
    Setting = apps.get_model("trips", "Setting")
    Setting.objects.filter(key=KEY).delete()


class Migration(migrations.Migration):
    dependencies = [("trips", "0007_triprequest_destination")]

    operations = [migrations.RunPython(create_default, remove_default)]
