"""入力値の正規化とビジネスエラーの判定。

確認ページ・登録時の両方から呼ばれる。戻り値の errors は
{"field": "...", "message": "..."} のリストで、フロントはこれをそのまま表示する。
"""

from datetime import date, datetime

from . import choices

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


def normalize(data: dict) -> dict:
    """リクエストの生データをモデルに保存できる形へ整える。"""
    return {
        "title": _as_text(data.get("title"))[:100],
        "theme": _as_text(data.get("theme"))[:200],
        "destination": _as_text(data.get("destination"))[:200],
        "date_from": _normalize_date(data.get("date_from")),
        "date_to": _normalize_date(data.get("date_to")),
        "meeting_place": _as_text(data.get("meeting_place"))[:MAX_TEXT_LENGTH],
        "dismissal_place": _as_text(data.get("dismissal_place"))[:MAX_TEXT_LENGTH],
        "lodgings": _as_text_list(data.get("lodgings")),
        "must_spots": _as_text_list(data.get("must_spots")),
        "want_spots": _as_text_list(data.get("want_spots")),
        "schedule_paces": _as_text_list(data.get("schedule_paces")),
        "schedule_pace_other": _as_text(data.get("schedule_pace_other"))[:200],
        "rough_plans": _as_text_list(data.get("rough_plans")),
        "constraints": _normalize_constraints(data.get("constraints")),
        "ng_items": _as_text_list(data.get("ng_items")),
        "notes": _as_text_list(data.get("notes")),
        "free_notes": _as_text(data.get("free_notes"))[:2000],
        "design_taste": _as_text(data.get("design_taste")),
        "design_taste_other": _as_text(data.get("design_taste_other"))[:200],
        "color_image": _as_text(data.get("color_image")),
        "color_image_other": _as_text(data.get("color_image_other"))[:200],
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

    if not cleaned["meeting_place"]:
        errors.append({"field": "meeting_place", "message": "集合場所を入力してください。"})

    # 宿泊場所は泊数と件数が一致していること（日帰りなら入力不可）。
    lodgings = cleaned["lodgings"]
    if nights == 0 and lodgings:
        errors.append({"field": "lodgings", "message": "日帰りのため宿泊場所は入力できません。"})
    elif nights > 0 and len(lodgings) != nights:
        errors.append({
            "field": "lodgings",
            "message": f"{nights}泊のため宿泊場所を{nights}件入力してください（現在{len(lodgings)}件）。",
        })

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
    _check_choice(cleaned, errors, "design_taste", "デザインテイスト", choices.DESIGN_TASTES)
    _check_choice(cleaned, errors, "color_image", "カラーイメージ", choices.COLOR_IMAGES)
    _check_choice(cleaned, errors, "aspect_ratio", "出力サイズ", choices.ASPECT_RATIOS)

    _check_other_multi(cleaned, errors, "schedule_paces", "schedule_pace_other", "スケジュール感")
    _check_other(cleaned, errors, "design_taste", "デザインテイスト")
    _check_other(cleaned, errors, "color_image", "カラーイメージ")
    _check_other(cleaned, errors, "aspect_ratio", "出力サイズ")

    return errors


def normalize_and_validate(data: dict):
    cleaned = normalize(data)
    return cleaned, validate(cleaned)
