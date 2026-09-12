"""入力内容から生成AI向けのプロンプト文を組み立てる。

冒頭の指示文・出力してほしいもの・守ってほしいことの3ブロックは
Setting テーブル（プロンプト設定）で管理者が文面を調整できる。
未設定時は本ファイルの既定文がそのまま使われる。
"""

from datetime import date, datetime

from . import choices

WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"]

# Setting テーブルのキー。管理画面（/admin/trips/setting/）から編集できる。
SETTING_KEY_PROMPT_INTRO = "prompt_intro"
SETTING_KEY_PROMPT_OUTPUT_ITEMS = "prompt_output_items"
SETTING_KEY_PROMPT_RULES = "prompt_rules"

DEFAULT_PROMPT_INTRO = (
    "あなたは旅のしおり作りが得意なプランナーです。\n"
    "以下の条件をもとに、友達同士の旅行で使う「旅のしおり」を作成してください。"
)

DEFAULT_PROMPT_OUTPUT_ITEMS = (
    "1. 日ごとのタイムスケジュール（時刻・移動手段・移動時間・滞在時間を明記）\n"
    "2. 各スポットのひとことメモ（おすすめポイント、混雑しやすい時間帯など）\n"
    "3. 持ち物リストと、1人あたりの費用のおおよその目安\n"
    "4. 上記のデザイン指示に沿った、しおりのビジュアル案（レイアウト・配色・使いたい装飾）"
)

# {period_label} は「2泊3日」「日帰り」などに自動置換される。
DEFAULT_PROMPT_RULES = (
    "- MUSTのスポットは必ずすべて旅程に入れる\n"
    "- 移動時間は実際の距離や交通手段をふまえて現実的に見積もる\n"
    "- 「予約済みの予定」の日時は固定して動かさない\n"
    "- NG項目に挙げたものは提案に含めない\n"
    "- 初日の開始は集合場所、最終日の終了は解散場所に合わせる\n"
    "- 全体は{period_label}の分量に収める"
)


def _parse_date(value):
    if isinstance(value, date):
        return value
    if not value:
        return None
    try:
        return datetime.strptime(str(value), "%Y-%m-%d").date()
    except ValueError:
        return None


def _format_date(value) -> str:
    parsed = _parse_date(value)
    if parsed is None:
        return str(value or "")
    return f"{parsed.year}年{parsed.month}月{parsed.day}日({WEEKDAYS[parsed.weekday()]})"


def _label(options, value, other_value) -> str:
    if value == choices.OTHER:
        return other_value or "（未入力）"
    return choices.label_of(options, value)


def _multi_label(options, values, other_value) -> str:
    """複数選択項目を「・」区切りの表示文字列にする。"""
    if not values:
        return "（未選択）"
    labels = []
    for value in values:
        if value == choices.OTHER:
            labels.append(other_value or "その他")
        else:
            labels.append(choices.label_of(options, value))
    return "・".join(labels)


def _bullets(items, indent="- ") -> list:
    return [f"{indent}{item}" for item in items]


def _prompt_settings() -> tuple:
    """Setting テーブルから冒頭文・出力項目・ルールを取得する（未設定時は既定文）。"""
    # 循環importを避けるため関数内でimportする。
    from .models import Setting

    intro = Setting.get_value(SETTING_KEY_PROMPT_INTRO, DEFAULT_PROMPT_INTRO)
    output_items = Setting.get_value(SETTING_KEY_PROMPT_OUTPUT_ITEMS, DEFAULT_PROMPT_OUTPUT_ITEMS)
    rules = Setting.get_value(SETTING_KEY_PROMPT_RULES, DEFAULT_PROMPT_RULES)
    return intro, output_items, rules


def build_prompt(cleaned: dict) -> str:
    """正規化済みの入力からプロンプト本文を生成する。"""
    date_from = _parse_date(cleaned.get("date_from"))
    date_to = _parse_date(cleaned.get("date_to"))
    nights = (date_to - date_from).days if date_from and date_to and date_to >= date_from else 0
    days = nights + 1
    period_label = "日帰り" if nights == 0 else f"{nights}泊{days}日"

    intro, output_items, rules_template = _prompt_settings()
    rules = rules_template.replace("{period_label}", period_label)

    lines = intro.split("\n") + [
        "",
        "# 旅の基本情報",
        f"- タイトル: {cleaned.get('title') or '（未入力）'}",
    ]
    if cleaned.get("theme"):
        lines.append(f"- テーマ: {cleaned['theme']}")
    if cleaned.get("destination"):
        lines.append(f"- 行先: {cleaned['destination']}")
    lines += [
        f"- 日程: {_format_date(cleaned.get('date_from'))} 〜 {_format_date(cleaned.get('date_to'))}（{period_label}）",
        f"- 集合場所: {cleaned.get('meeting_place') or '（未定）'}",
        f"- 解散場所: {cleaned.get('dismissal_place') or '（未定）'}",
    ]

    lodgings = cleaned.get("lodgings") or []
    if nights == 0:
        lines.append("- 宿泊: なし（日帰り）")
    elif lodgings:
        lines.append("- 宿泊:")
        for index, lodging in enumerate(lodgings, start=1):
            lines.append(f"  - {index}泊目: {lodging}")
    else:
        lines.append("- 宿泊: 未定")

    lines += ["", "# いきたいスポット"]
    must_spots = cleaned.get("must_spots") or []
    want_spots = cleaned.get("want_spots") or []
    lines.append("## MUST（必ず旅程に組み込む）")
    lines += _bullets(must_spots) if must_spots else ["- （指定なし）"]
    lines.append("## WANT（時間に余裕があれば組み込む）")
    lines += _bullets(want_spots) if want_spots else ["- （指定なし）"]

    lines += [
        "",
        "# 条件",
        f"- スケジュール感: {_multi_label(choices.SCHEDULE_PACES, cleaned.get('schedule_paces'), cleaned.get('schedule_pace_other'))}",
    ]

    rough_plans = cleaned.get("rough_plans") or []
    lines.append("- ざっくり決まっている予定:")
    if rough_plans:
        for index, plan in enumerate(rough_plans, start=1):
            lines.append(f"  - {index}日目: {plan}" if plan else f"  - {index}日目: （指定なし）")
    else:
        lines.append("  - （指定なし）")

    constraints = cleaned.get("constraints") or []
    lines.append("- 予約済みの予定:")
    if constraints:
        for row in constraints:
            when = " ".join(part for part in [_format_date(row.get("date")) if row.get("date") else "", row.get("time") or ""] if part)
            prefix = f"{when} " if when else ""
            lines.append(f"  - {prefix}{row.get('content', '')}".rstrip())
    else:
        lines.append("  - （指定なし）")

    ng_items = cleaned.get("ng_items") or []
    lines.append("- NG項目（絶対に旅程へ入れないもの）:")
    lines += _bullets(ng_items, indent="  - ") if ng_items else ["  - （指定なし）"]

    notes = cleaned.get("notes") or []
    lines.append("- 配慮・共有メモ:")
    lines += _bullets(notes, indent="  - ") if notes else ["  - （指定なし）"]

    free_notes = (cleaned.get("free_notes") or "").strip()
    lines.append("- 自由記入:")
    lines.append(f"  {free_notes}" if free_notes else "  （指定なし）")

    lines += [
        "",
        "# しおりのデザイン指示",
        f"- デザインテイスト: {_label(choices.DESIGN_TASTES, cleaned.get('design_taste'), cleaned.get('design_taste_other'))}",
        f"- カラーイメージ: {_label(choices.COLOR_IMAGES, cleaned.get('color_image'), cleaned.get('color_image_other'))}",
        f"- 出力サイズ（アスペクト比）: {_label(choices.ASPECT_RATIOS, cleaned.get('aspect_ratio'), cleaned.get('aspect_ratio_other'))}",
        "",
        "# 出力してほしいもの",
        *output_items.split("\n"),
        "",
        "# 守ってほしいこと",
        *rules.split("\n"),
    ]

    return "\n".join(lines)
