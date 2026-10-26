from django.db import migrations

# 交通手段・NG項目の入力欄廃止に合わせた「守ってほしいこと」の既定文の差し替え。
RULE_REPLACEMENTS = [
    ("NG項目に挙げたものは提案に含めない", "考慮事項に挙げたNG項目は提案に含めない"),
    (
        "初日の開始・最終日の終了は、往路・復路の交通手段（集合・解散場所の指定があればそれ）に合わせる",
        "初日の開始・最終日の終了は、予約済みの予定（新幹線・飛行機など）があればそれに合わせる",
    ),
]


def forwards(apps, schema_editor):
    # 既存の旅はこれまで画像生成用プロンプトも出力していたので、画像出力ONとして引き継ぐ。
    TripRequest = apps.get_model("trips", "TripRequest")
    TripRequest.objects.exclude(image_prompt_text="").update(image_enabled=True)

    # 既定文のままの場合だけ差し替える（管理者が編集済みなら触らない）。
    Setting = apps.get_model("trips", "Setting")
    row = Setting.objects.filter(key="prompt_rules").first()
    if row:
        value = row.value
        for old, new in RULE_REPLACEMENTS:
            value = value.replace(old, new)
        if value != row.value:
            row.value = value
            row.save(update_fields=["value"])


def backwards(apps, schema_editor):
    Setting = apps.get_model("trips", "Setting")
    row = Setting.objects.filter(key="prompt_rules").first()
    if row:
        value = row.value
        for old, new in RULE_REPLACEMENTS:
            value = value.replace(new, old)
        if value != row.value:
            row.value = value
            row.save(update_fields=["value"])


class Migration(migrations.Migration):
    dependencies = [("trips", "0013_participants_output_settings")]

    operations = [migrations.RunPython(forwards, backwards)]
