"""入力内容から生成AI向けのプロンプト文を組み立てる。

冒頭の指示文・出力してほしいもの・守ってほしいことの3ブロックは
Setting テーブル（プロンプト設定）で管理者が文面を調整できる。
未設定時は本ファイルの既定文がそのまま使われる。
"""

from datetime import date, datetime

from . import choices
from .lodging import describe_lodging

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
    "4. 旅の雰囲気に合った、しおりのビジュアル案（レイアウト・配色・使いたい装飾）"
)

# {period_label} は「2泊3日」「日帰り」などに自動置換される。
DEFAULT_PROMPT_RULES = (
    "- MUSTのスポットは必ずすべて旅程に入れる\n"
    "- 移動時間は実際の距離や交通手段をふまえて現実的に見積もる\n"
    "- 「予約済みの予定」の日時は固定して動かさない\n"
    "- 考慮事項に挙げたNG項目は提案に含めない\n"
    "- 初日の開始・最終日の終了は、予約済みの予定（新幹線・飛行機など）があればそれに合わせる\n"
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


def _design_label(options, value, other_value) -> str:
    """デザイン指示は任意項目。未選択は「おまかせ」として渡す。"""
    if not value:
        return "おまかせ（旅の内容に合うものを選んでほしい）"
    return _label(options, value, other_value)


def _transport_line(cleaned: dict, prefix: str, label: str) -> str:
    """往路/復路の交通手段と予約状況を1行にする。"""
    transport = cleaned.get(f"{prefix}_transport")
    reservation = cleaned.get(f"{prefix}_reservation")
    transport_label = (
        _label(choices.TRANSPORTS, transport, cleaned.get(f"{prefix}_transport_other")) if transport else "未定"
    )
    reservation_label = choices.label_of(choices.RESERVATION_STATUSES, reservation) if reservation else "未定"
    return f"- {label}: {transport_label}（予約状況: {reservation_label}）"


def _period(cleaned: dict) -> tuple:
    """(泊数, 期間ラベル) を返す。"""
    date_from = _parse_date(cleaned.get("date_from"))
    date_to = _parse_date(cleaned.get("date_to"))
    nights = (date_to - date_from).days if date_from and date_to and date_to >= date_from else 0
    return nights, ("日帰り" if nights == 0 else f"{nights}泊{nights + 1}日")


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


def build_prompt(cleaned: dict, contributions=None) -> str:
    """正規化済みの入力からプロンプト本文を生成する。

    contributions は意見募集リンクから届いた参加者の追記（dictのリスト）。
    """
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
    ]
    # 交通手段・集合・解散場所は入力欄を廃止した。過去データに値があるときだけ載せる。
    for prefix, label in (("outbound", "往路の交通手段"), ("return", "復路の交通手段")):
        if cleaned.get(f"{prefix}_transport"):
            lines.append(_transport_line(cleaned, prefix, label))
    if cleaned.get("meeting_place"):
        lines.append(f"- 集合場所: {cleaned['meeting_place']}")
    if cleaned.get("dismissal_place"):
        lines.append(f"- 解散場所: {cleaned['dismissal_place']}")

    lodgings = cleaned.get("lodgings") or []
    if nights == 0:
        lines.append("- 宿泊: なし（日帰り）")
    elif lodgings:
        lines.append("- 宿泊:")
        for index, lodging in enumerate(lodgings, start=1):
            lines.append(f"  - {index}泊目: {describe_lodging(lodging) or '未定'}")
    else:
        lines.append("- 宿泊: 未定")

    lines += ["", "# いきたいスポット"]
    must_spots = cleaned.get("must_spots") or []
    want_spots = cleaned.get("want_spots") or []
    lines.append("## MUST（必ず旅程に組み込む）")
    lines += _bullets(must_spots) if must_spots else ["- （指定なし）"]
    lines.append("## WANT（時間に余裕があれば組み込む）")
    lines += _bullets(want_spots) if want_spots else ["- （指定なし）"]
    spot_notes = (cleaned.get("spot_notes") or "").strip()
    if spot_notes:
        lines.append("## いきたいところについてのメモ")
        lines += [f"- {line}" for line in spot_notes.splitlines() if line.strip()]

    lines += [
        "",
        "# 条件",
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

    free_notes = (cleaned.get("free_notes") or "").strip()
    lines.append("- 考慮事項・備考（スケジュール感・NG項目・配慮事項など）:")
    lines += [f"  {line}" for line in free_notes.splitlines()] if free_notes else ["  （指定なし）"]

    lines += [
        "",
        "# しおりの出力サイズ",
        f"- 出力サイズ（アスペクト比）: {_design_label(choices.ASPECT_RATIOS, cleaned.get('aspect_ratio'), cleaned.get('aspect_ratio_other'))}",
        "",
        "# 出力してほしいもの",
        *output_items.split("\n"),
        "",
        "# 守ってほしいこと",
        *rules.split("\n"),
    ]
    lines += _contribution_lines(contributions or [])

    return "\n".join(lines)


def _contribution_lines(contributions: list) -> list:
    """一緒に行く人から届いた意見と、矛盾があったときの扱いを指示する部分。

    幹事が取り込まなかった意見も参考として載せ、幹事の条件と食い違う点は
    出力の最後に「矛盾点メモ」として必ず残すよう指示する。プロンプト自体に書いておくので、
    このプロンプトをどの生成AIに渡してもメモが残る。
    """
    rows = [item for item in contributions if _has_contribution(item)]
    if not rows:
        return []
    lines = ["", "# 一緒に行く人からの意見（参考）", "幹事が上記の条件にまとめる前の、参加者ごとの意見です。"]
    for item in rows:
        lines.append(f"## {item.get('name') or '名無し'}さん")
        for spot in item.get("must_spots") or []:
            lines.append(f"- いきたい（MUST）: {spot}")
        for spot in item.get("want_spots") or []:
            lines.append(f"- いきたい（WANT）: {spot}")
        if (item.get("spot_notes") or "").strip():
            lines.append(f"- いきたいところのメモ: {_one_line(item['spot_notes'])}")
        for row in item.get("constraints") or []:
            when = " ".join(part for part in [_format_date(row.get("date")) if row.get("date") else "", row.get("time") or ""] if part)
            lines.append(f"- 予約済みの予定: {(when + ' ') if when else ''}{row.get('content', '')}".rstrip())
        for index, plan in enumerate(item.get("rough_plans") or [], start=1):
            if (plan or "").strip():
                lines.append(f"- {index}日目にしたいこと: {_one_line(plan)}")
        if (item.get("notes") or "").strip():
            lines.append(f"- 考慮事項・備考: {_one_line(item['notes'])}")
    lines += [
        "",
        "# 意見どうしの矛盾について（必ず守ること）",
        "- 上記「旅の基本情報」〜「条件」（幹事の入力）と参加者の意見が食い違う場合は、幹事の入力を優先する",
        "- 参加者どうし、または参加者と幹事の入力の間に矛盾・競合（行きたい場所とNG項目、予定の時間の重なり、"
        "移動が間に合わない組み合わせなど）があれば、出力の最後に「矛盾点メモ」という見出しを作り、"
        "誰のどの意見と何が食い違ったか、旅程ではどう扱ったか（採用・調整・見送り）を箇条書きで必ず残す",
        "- 矛盾が無い場合も「矛盾点メモ：なし」と明記する",
    ]
    return lines


def _has_contribution(item: dict) -> bool:
    return bool(
        item.get("must_spots") or item.get("want_spots") or item.get("constraints")
        or any((plan or "").strip() for plan in item.get("rough_plans") or [])
        or (item.get("spot_notes") or "").strip() or (item.get("notes") or "").strip()
    )


def _one_line(text: str) -> str:
    return " ".join(part.strip() for part in str(text).splitlines() if part.strip())


def build_image_prompt(cleaned: dict) -> str:
    """画像生成AI向けのプロンプト（しおりの表紙・1枚もののビジュアル用）を生成する。

    行程の細かい時刻表は画像生成AIが苦手なため、ここでは旅の雰囲気・見出し・
    デザイン指示を中心に組み立てる（詳しい行程は行程表プロンプトの方で作る）。
    """
    nights, period_label = _period(cleaned)
    title = cleaned.get("title") or "旅のしおり"
    spots = (cleaned.get("must_spots") or []) + (cleaned.get("want_spots") or [])

    lines = [
        "友達同士の旅行で使う「旅のしおり」の表紙画像を1枚作成してください。",
        "",
        "# 画像に入れる文字（正確に表記すること）",
        f"- タイトル: {title}",
        f"- 日程: {_format_date(cleaned.get('date_from'))} 〜 {_format_date(cleaned.get('date_to'))}（{period_label}）",
    ]
    if cleaned.get("destination"):
        lines.append(f"- 行先: {cleaned['destination']}")

    lines += ["", "# 旅の雰囲気・モチーフ"]
    if cleaned.get("theme"):
        lines.append(f"- テーマ: {cleaned['theme']}")
    if spots:
        lines.append(f"- 描き込みたい名所・モチーフ: {'、'.join(spots[:6])}")
    if not cleaned.get("theme") and not spots:
        lines.append("- 行先の名所や季節感が伝わるモチーフを自由に選んでください")

    lines += [
        "",
        "# デザイン指示",
        f"- 雰囲気: {(cleaned.get('image_mood') or '').strip() or '旅のテーマや行先に合わせて自由に選んでください'}",
        f"- 出力サイズ（アスペクト比）: {_design_label(choices.ASPECT_RATIOS, cleaned.get('aspect_ratio'), cleaned.get('aspect_ratio_other'))}",
        "",
        "# 守ってほしいこと",
        "- 上記「画像に入れる文字」以外の文字は入れない（誤字・架空の文字を避けるため）",
        "- 文字は読みやすい大きさ・配置にする",
        "- 実在の人物の顔は描かない",
    ]
    return "\n".join(lines)
