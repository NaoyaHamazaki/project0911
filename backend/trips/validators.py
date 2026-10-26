"""入力値の正規化とビジネスエラーの判定。

確認ページ・登録時の両方から呼ばれる。戻り値の errors は
{"field": "...", "message": "..."} のリストで、フロントはこれをそのまま表示する。
"""

from datetime import date, datetime

from . import choices
from .lodging import normalize_lodgings

MAX_TRIP_DAYS = 31
MAX_LIST_ITEMS = 20
MAX_TEXT_LENGTH = 255


def _as_text(value) -> str:
    return "" if value is None else str(value).strip()


def _as_text_list(value) -> list:
    """文字列リストを正規化する（空要素の除去と前後空白の除去）。"""
    if value is None:
        return []
    if isinstance(value, str):
        value = value.split(",")
    if not isinstance(value, (list, tuple)):
        return []
    return [_as_text(v) for v in value if _as_text(v)]


def _parse_date(value):
    if isinstance(value, date):
        return value
    text = _as_text(value)
    if not text:
        return None
    try:
        return datetime.strptime(text, "%Y-%m-%d").date()
    except ValueError:
        return None


def _normalize_constraints(value) -> list:
    """制約（日付・時刻・内容）の正規化。内容が空の行は捨てる。"""
    if not isinstance(value, (list, tuple)):
        return []
    rows = []
    for item in value:
        if not isinstance(item, dict):
            continue
        row = {
            "date": _as_text(item.get("date")),
            "time": _as_text(item.get("time")),
            "content": _as_text(item.get("content")),
        }
        if row["content"] or row["date"] or row["time"]:
            rows.append(row)
    return rows


def _check_other(cleaned, errors, field, label):
    """「その他」選択時に自由入力が埋まっているかを確認する。"""
    if cleaned.get(field) == choices.OTHER and not cleaned.get(f"{field}_other"):
        errors.append({"field": f"{field}_other", "message": f"{label}で「その他」を選んだ場合は内容を入力してください。"})


def _check_choice(cleaned, errors, field, label, options, required=True):
    value = cleaned.get(field, "")
    valid = {key for key, _ in options}
    if not value:
        if required:
            errors.append({"field": field, "message": f"{label}を選択してください。"})
    elif value not in valid:
        errors.append({"field": field, "message": f"{label}の選択値が不正です。"})


def _check_multi_choice(cleaned, errors, field, label, options, required=True):
    """複数選択項目のチェック。1件以上・すべて選択肢に含まれることを確認する。"""
    values = cleaned.get(field) or []
    valid = {key for key, _ in options}
    if not values:
        if required:
            errors.append({"field": field, "message": f"{label}を1つ以上選択してください。"})
        return
    if any(value not in valid for value in values):
        errors.append({"field": field, "message": f"{label}の選択値が不正です。"})


def _check_other_multi(cleaned, errors, field, other_field, label):
    """複数選択項目に「その他」が含まれる場合の自由入力チェック。"""
    if choices.OTHER in (cleaned.get(field) or []) and not cleaned.get(other_field):
        errors.append({"field": other_field, "message": f"{label}で「その他」を選んだ場合は内容を入力してください。"})


def _normalize_date(value):
    """日付は date 型に変換する。変換できない場合は入力値をそのまま残す。"""
    parsed = _parse_date(value)
    return parsed if parsed is not None else _as_text(value)


def _nights_of(data: dict) -> int:
    date_from = _parse_date(data.get("date_from"))
    date_to = _parse_date(data.get("date_to"))
    if date_from and date_to and date_to >= date_from:
        return (date_to - date_from).days
    return 0


def _merge_free_notes(data: dict) -> str:
    """入力欄を廃止したスケジュール感・NG項目・配慮メモを、自由入力欄へまとめる。

    古い旅データやAPI経由の値が残っていても情報が消えないよう、
    自由入力欄の末尾に追記する（新しいフォームからは常に空で届く）。
    """
    parts = [_as_text(data.get("free_notes"))]
    paces = _as_text_list(data.get("schedule_paces"))
    if paces:
        labels = dict(choices.SCHEDULE_PACES)
        names = [
            _as_text(data.get("schedule_pace_other")) or labels[choices.OTHER] if value == choices.OTHER else labels.get(value, value)
            for value in paces
        ]
        parts.append("スケジュール感: " + "、".join(names))
    ng_items = _as_text_list(data.get("ng_items"))
    if ng_items:
        parts.append("NG項目: " + "、".join(ng_items))
    notes = _as_text_list(data.get("notes"))
    if notes:
        parts.append("配慮事項: " + "、".join(notes))
    return "\n".join(part for part in parts if part)[:2000]


def normalize(data: dict) -> dict:
    """リクエストの生データをモデルに保存できる形へ整える。"""
    return {
        "title": _as_text(data.get("title"))[:100],
        "theme": _as_text(data.get("theme"))[:200],
        "destination": _as_text(data.get("destination"))[:200],
        "date_from": _normalize_date(data.get("date_from")),
        "date_to": _normalize_date(data.get("date_to")),
        "outbound_transport": _as_text(data.get("outbound_transport")),
        "outbound_transport_other": _as_text(data.get("outbound_transport_other"))[:200],
        "outbound_reservation": _as_text(data.get("outbound_reservation")),
        "return_transport": _as_text(data.get("return_transport")),
        "return_transport_other": _as_text(data.get("return_transport_other"))[:200],
        "return_reservation": _as_text(data.get("return_reservation")),
        "meeting_place": _as_text(data.get("meeting_place"))[:MAX_TEXT_LENGTH],
        "dismissal_place": _as_text(data.get("dismissal_place"))[:MAX_TEXT_LENGTH],
        # 旧形式(文字列)も新形式({mode, value})にそろえ、泊数ぶんに整える。
        "lodgings": normalize_lodgings(data.get("lodgings"), _nights_of(data)),
        "must_spots": _as_text_list(data.get("must_spots")),
        "want_spots": _as_text_list(data.get("want_spots")),
        # スケジュール感・NG項目・配慮メモ・テイスト・カラーは入力欄を廃止した。
        "schedule_paces": [],
        "schedule_pace_other": "",
        "rough_plans": _as_text_list(data.get("rough_plans")),
        "constraints": _normalize_constraints(data.get("constraints")),
        "ng_items": [],
        "notes": [],
        "free_notes": _merge_free_notes(data),
        "collect_feedback": bool(data.get("collect_feedback")),
        "image_enabled": bool(data.get("image_enabled")),
        "image_mood": _as_text(data.get("image_mood"))[:200],
        "design_taste": "",
        "design_taste_other": "",
        "color_image": "",
        "color_image_other": "",
        "aspect_ratio": _as_text(data.get("aspect_ratio")),
        "aspect_ratio_other": _as_text(data.get("aspect_ratio_other"))[:200],
        "device_key": _as_text(data.get("device_key"))[:64],
    }


def validate(cleaned: dict) -> list:
    """ビジネスエラーを検出して返す。空リストなら問題なし。"""
    errors = []

    if not cleaned["title"]:
        errors.append({"field": "title", "message": "タイトルを入力してください。"})

    date_from = _parse_date(cleaned["date_from"])
    date_to = _parse_date(cleaned["date_to"])

    if not cleaned["date_from"]:
        errors.append({"field": "date_from", "message": "期間（自）を入力してください。"})
    elif date_from is None:
        errors.append({"field": "date_from", "message": "期間（自）の日付形式が不正です。"})

    if not cleaned["date_to"]:
        errors.append({"field": "date_to", "message": "期間（至）を入力してください。"})
    elif date_to is None:
        errors.append({"field": "date_to", "message": "期間（至）の日付形式が不正です。"})

    nights = 0
    if date_from and date_to:
        if date_to < date_from:
            errors.append({"field": "date_to", "message": "期間（至）は期間（自）以降の日付にしてください。"})
        else:
            nights = (date_to - date_from).days
            if nights + 1 > MAX_TRIP_DAYS:
                errors.append({"field": "date_to", "message": f"旅程は最長{MAX_TRIP_DAYS}日までです。"})

    # 交通手段・予約状況・宿泊の決め方は画面上は必須表示だが、旧データの再編集や
    # 「上書き」保存を妨げないよう、未入力はエラーにしない（値の妥当性のみ確認する）。
    # 宿泊場所の件数は normalize で泊数ぶんに自動調整済み。
    for prefix, label in [("outbound", "往路"), ("return", "復路")]:
        _check_choice(cleaned, errors, f"{prefix}_transport", f"{label}の交通手段", choices.TRANSPORTS, required=False)
        _check_choice(cleaned, errors, f"{prefix}_reservation", f"{label}の予約状況", choices.RESERVATION_STATUSES, required=False)
        _check_other(cleaned, errors, f"{prefix}_transport", f"{label}の交通手段")

    for field, label in [
        ("must_spots", "いきたいスポット（MUST）"),
        ("want_spots", "いきたいスポット（WANT）"),
        ("ng_items", "NG項目"),
        ("notes", "配慮・共有メモ"),
        ("rough_plans", "ざっくり決まっている予定"),
    ]:
        if len(cleaned[field]) > MAX_LIST_ITEMS:
            errors.append({"field": field, "message": f"{label}は{MAX_LIST_ITEMS}件までです。"})

    for row in cleaned["constraints"]:
        if not row["content"]:
            errors.append({"field": "constraints", "message": "予約済みの予定は「内容」を入力してください。"})
            break
    if len(cleaned["constraints"]) > MAX_LIST_ITEMS:
        errors.append({"field": "constraints", "message": f"予約済みの予定は{MAX_LIST_ITEMS}件までです。"})

    # 制約の日付が旅程の範囲内かを確認する。
    if date_from and date_to and date_to >= date_from:
        for row in cleaned["constraints"]:
            row_date = _parse_date(row["date"])
            if row_date and not (date_from <= row_date <= date_to):
                errors.append({
                    "field": "constraints",
                    "message": f"制約の日付（{row['date']}）が旅程の期間外です。",
                })
                break

    _check_multi_choice(cleaned, errors, "schedule_paces", "スケジュール感", choices.SCHEDULE_PACES, required=False)
    # デザイン指示は任意。未選択はプロンプト上「おまかせ」として扱う。
    _check_choice(cleaned, errors, "design_taste", "デザインテイスト", choices.DESIGN_TASTES, required=False)
    _check_choice(cleaned, errors, "color_image", "カラーイメージ", choices.COLOR_IMAGES, required=False)
    _check_choice(cleaned, errors, "aspect_ratio", "出力サイズ", choices.ASPECT_RATIOS, required=False)

    _check_other_multi(cleaned, errors, "schedule_paces", "schedule_pace_other", "スケジュール感")
    _check_other(cleaned, errors, "design_taste", "デザインテイスト")
    _check_other(cleaned, errors, "color_image", "カラーイメージ")
    _check_other(cleaned, errors, "aspect_ratio", "出力サイズ")

    return errors


def normalize_and_validate(data: dict):
    cleaned = normalize(data)
    return cleaned, validate(cleaned)


def normalize_and_validate_contribution(data: dict, days: int) -> tuple:
    """意見募集リンクからの追記を整え、(cleaned, errors) を返す。"""
    cleaned = {
        "name": _as_text(data.get("name"))[:50],
        "must_spots": _as_text_list(data.get("must_spots"))[:MAX_LIST_ITEMS],
        "want_spots": _as_text_list(data.get("want_spots"))[:MAX_LIST_ITEMS],
        "constraints": _normalize_constraints(data.get("constraints"))[:MAX_LIST_ITEMS],
        # 日ごとの入力。空欄の日も位置を保つため、そのまま日数ぶんに切りそろえる。
        "rough_plans": [_as_text(item)[:MAX_TEXT_LENGTH] for item in (data.get("rough_plans") or [])][:days],
    }
    errors = []
    if not cleaned["name"]:
        errors.append({"field": "name", "message": "名前を入力してください。"})
    has_content = (
        cleaned["must_spots"] or cleaned["want_spots"] or cleaned["constraints"] or any(cleaned["rough_plans"])
    )
    if not has_content:
        errors.append({"field": "must_spots", "message": "いきたいところか予定を1つ以上入力してください。"})
    for field in ("must_spots", "want_spots"):
        if any(len(item) > MAX_TEXT_LENGTH for item in cleaned[field]):
            errors.append({"field": field, "message": f"{MAX_TEXT_LENGTH}文字以内で入力してください。"})
    if not any(cleaned["rough_plans"]):
        cleaned["rough_plans"] = []
    return cleaned, errors
