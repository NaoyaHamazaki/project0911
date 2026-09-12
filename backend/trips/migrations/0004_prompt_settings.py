from django.db import migrations

from trips.prompt import (
    DEFAULT_PROMPT_INTRO,
    DEFAULT_PROMPT_OUTPUT_ITEMS,
    DEFAULT_PROMPT_RULES,
    SETTING_KEY_PROMPT_INTRO,
    SETTING_KEY_PROMPT_OUTPUT_ITEMS,
    SETTING_KEY_PROMPT_RULES,
)

DEFAULTS = [
    {
        "key": SETTING_KEY_PROMPT_INTRO,
        "value": DEFAULT_PROMPT_INTRO,
        "description": "プロンプト冒頭の指示文。",
    },
    {
        "key": SETTING_KEY_PROMPT_OUTPUT_ITEMS,
        "value": DEFAULT_PROMPT_OUTPUT_ITEMS,
        "description": "「# 出力してほしいもの」の一覧文。そのまま挿入される。",
    },
    {
        "key": SETTING_KEY_PROMPT_RULES,
        "value": DEFAULT_PROMPT_RULES,
        "description": "「# 守ってほしいこと」の一覧文。{period_label} は「2泊3日」等に自動置換される。",
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
    dependencies = [("trips", "0003_schedule_paces_multi")]

    operations = [migrations.RunPython(create_defaults, remove_defaults)]
