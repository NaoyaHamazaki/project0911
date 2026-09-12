from django.db import migrations, models


def convert_to_list(apps, schema_editor):
    """既存データがあれば、単一値の schedule_pace を1件のリストに詰め替える。"""
    TripRequest = apps.get_model("trips", "TripRequest")
    for trip in TripRequest.objects.exclude(schedule_pace="").only("id", "schedule_pace"):
        trip.schedule_paces = [trip.schedule_pace]
        trip.save(update_fields=["schedule_paces"])


def convert_to_single(apps, schema_editor):
    TripRequest = apps.get_model("trips", "TripRequest")
    for trip in TripRequest.objects.exclude(schedule_paces=[]).only("id", "schedule_paces"):
        trip.schedule_pace = trip.schedule_paces[0] if trip.schedule_paces else ""
        trip.save(update_fields=["schedule_pace"])


class Migration(migrations.Migration):
    dependencies = [("trips", "0002_default_settings")]

    operations = [
        migrations.AddField(
            model_name="triprequest",
            name="schedule_paces",
            field=models.JSONField(default=list, blank=True, verbose_name="スケジュール感"),
        ),
        migrations.RunPython(convert_to_list, convert_to_single),
        migrations.RemoveField(model_name="triprequest", name="schedule_pace"),
    ]
