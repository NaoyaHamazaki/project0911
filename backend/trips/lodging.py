"""宿泊先（泊ごと）のデータ形式を扱う。

新形式: {"mode": "name" | "area" | "omakase" | "", "value": "..."}
旧形式: 文字列（例: "〇〇ホテル" / "未定" / "おまかせ"）

旧形式で保存された過去の旅も再編集・出力できるよう、読み込み時は必ず
normalize_lodging() を通して新形式にそろえる。
"""

from . import choices

# 旧UIの「考えない」「おまかせ」ボタンが入れていた固定文字列。
_LEGACY_OMAKASE_VALUES = {"未定", "おまかせ"}
_VALID_MODES = {key for key, _ in choices.LODGING_MODES}


def normalize_lodging(item) -> dict:
    """1泊ぶんの宿泊データを新形式にそろえる。"""
    if isinstance(item, dict):
        mode = str(item.get("mode") or "").strip()
        value = str(item.get("value") or "").strip()[:255]
        if mode not in _VALID_MODES:
            # モード不明だが値がある場合は宿名として扱う。
            mode = choices.LODGING_NAME if value else ""
        if mode == choices.LODGING_OMAKASE:
            value = ""
        return {"mode": mode, "value": value}

    text = "" if item is None else str(item).strip()[:255]
    if not text:
        return {"mode": "", "value": ""}
    if text in _LEGACY_OMAKASE_VALUES:
        return {"mode": choices.LODGING_OMAKASE, "value": ""}
    return {"mode": choices.LODGING_NAME, "value": text}


def normalize_lodgings(value, nights: int) -> list:
    """泊数ぶんの宿泊データにそろえる（不足は空で埋め、超過は切り捨てる）。"""
    items = value if isinstance(value, (list, tuple)) else []
    rows = [normalize_lodging(item) for item in items][: max(nights, 0)]
    while len(rows) < nights:
        rows.append({"mode": "", "value": ""})
    return rows


def describe_lodging(item) -> str:
    """プロンプト・整合性チェック用の一文。未入力なら空文字。"""
    row = normalize_lodging(item)
    if row["mode"] == choices.LODGING_OMAKASE:
        return "おまかせ（条件に合う宿を提案してほしい）"
    if row["mode"] == choices.LODGING_AREA:
        return f"{row['value']} エリアで検討中（具体的な宿の提案がほしい）" if row["value"] else "エリア未定"
    if row["mode"] == choices.LODGING_NAME:
        return row["value"] or "宿名未入力"
    return ""
