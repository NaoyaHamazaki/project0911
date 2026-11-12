"""「他の人が作った旅」に載せる公開版を作る。

第三者には、入力をそのまま見せず、次の加工をした公開版（スナップショット）だけを見せる。
- 人名は「○○」に置き換え、電話番号・メールアドレス・番地までの住所・予約番号などは伏せる（Gemini＋正規表現）
- 公開に向かない内容（性的・暴力的・差別的・違法な内容、特定の人への誹謗中傷など）があれば公開しない
- 日付は「○年○月」と泊数だけにする（予約済みの予定の日付は「N日目」にする）
- 参加者の意見（意見募集リンクからの追記）・意見募集リンク・旅IDは含めない

Gemini が使えない・失敗したときは公開しない（安全側に倒す）。
"""

import hashlib
import json
import re
from datetime import date, datetime

from django.core.cache import cache

from . import prompt as prompt_builder
from .lodging import describe_lodging
from .suggest import _ask_gemini

STATUS_PUBLISHED = "published"
STATUS_BLOCKED = "blocked"
STATUS_FAILED = "failed"

MESSAGE_FAILED = "公開版の作成（個人情報の確認）ができなかったため、非公開で保存しました。あとから結果ページで公開し直せます。"
MESSAGE_BLOCKED_DEFAULT = "公開に向かない内容が含まれているため、公開できません。"

# 同じ入力の確認結果を使い回す時間（確認ページ → 保存 で同じ内容を2回確認しないため）
_CACHE_SECONDS = 60 * 60
_CACHE_VERSION = "v1"

# Gemini の見落とし対策として、機械的に分かるものは正規表現でも伏せる。
_PATTERNS = [
    (re.compile(r"[\w.+-]+@[\w-]+(\.[\w-]+)+"), "（メールアドレス）"),
    (re.compile(r"(?<!\d)0\d{1,4}[-‐－ー ]?\d{1,4}[-‐－ー ]?\d{3,4}(?!\d)"), "（電話番号）"),
    (re.compile(r"\+\d{1,3}[-‐ ]?\d{1,4}[-‐ ]?\d{2,4}[-‐ ]?\d{3,4}"), "（電話番号）"),
    (re.compile(r"〒?\s?\d{3}[-‐－ー]\d{4}"), "（郵便番号）"),
]


def _scrub(text: str) -> str:
    for pattern, replacement in _PATTERNS:
        text = pattern.sub(replacement, text)
    return text


def _parse_date(value):
    if isinstance(value, date):
        return value
    try:
        return datetime.strptime(str(value), "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None


def _source(cleaned: dict) -> dict:
    """公開版の候補にする項目だけを取り出す（集合・解散場所や旧項目の交通手段などは公開しない）。"""
    start = _parse_date(cleaned.get("date_from"))
    constraints = []
    for row in cleaned.get("constraints") or []:
        day = _parse_date(row.get("date"))
        constraints.append({
            "day": (day - start).days + 1 if day and start and day >= start else None,
            "time": str(row.get("time") or "")[:20],
            "content": str(row.get("content") or ""),
        })
    return {
        "title": cleaned.get("title") or "",
        "theme": cleaned.get("theme") or "",
        "departure": cleaned.get("departure") or "",
        "destination": cleaned.get("destination") or "",
        "lodgings": [describe_lodging(item) for item in cleaned.get("lodgings") or []],
        "must_spots": list(cleaned.get("must_spots") or []),
        "want_spots": list(cleaned.get("want_spots") or []),
        "spot_notes": cleaned.get("spot_notes") or "",
        "rough_plans": list(cleaned.get("rough_plans") or []),
        "constraints": constraints,
        "free_notes": cleaned.get("free_notes") or "",
        "image_mood": cleaned.get("image_mood") or "",
    }


_TEXT_FIELDS = ["title", "theme", "departure", "destination", "spot_notes", "free_notes", "image_mood"]
_LIST_FIELDS = ["lodgings", "must_spots", "want_spots", "rough_plans", "constraint_contents"]

_SCHEMA = {
    "type": "object",
    "properties": {
        "blocked": {"type": "boolean"},
        "block_reason": {"type": "string"},
        **{field: {"type": "string"} for field in _TEXT_FIELDS},
        **{field: {"type": "array", "items": {"type": "string"}} for field in _LIST_FIELDS},
    },
    "required": ["blocked", "block_reason", *_TEXT_FIELDS, *_LIST_FIELDS],
}


def _mask_prompt(payload: dict) -> str:
    return (
        "あなたは旅行プラン共有サイトの公開前チェック担当です。\n"
        "以下のJSONは、利用者が作った旅行プランの入力内容です。不特定多数に公開するため、次のルールで加工して、"
        "同じキー・同じ配列の要素数のJSONで返してください。\n\n"
        "# 伏せるもの\n"
        "- 人名（フルネーム・名字・下の名前・あだ名・「〇〇さん」「〇〇ちゃん」など）は「○○」に置き換える。"
        "ただし有名な観光地・施設・店名・作品名・歴史上の人物など、場所や物の名前の一部になっているものはそのまま残す\n"
        "- 電話番号、メールアドレス、SNSのアカウント名、予約番号・確認番号・会員番号は「（非公開）」に置き換える\n"
        "- 自宅や個人宅（実家・友人宅など）の具体的な住所は「（非公開）」にする。"
        "ホテル・駅・観光地・店舗など公共の場所の名前や住所は残してよい\n"
        "- 勤務先・学校名など、個人を特定できる所属は「○○」に置き換える\n"
        "- 公開に向かない軽い表現（悪口・下品な言葉など）は「○○」に置き換える\n\n"
        "# 公開しない（blocked を true にする）もの\n"
        "- 性的な内容、暴力・自傷の助長、差別・ヘイト、違法行為（薬物・盗撮・不法侵入など）の計画、"
        "特定の人物への誹謗中傷・晒し上げ\n"
        "- blocked を true にしたときは、block_reason に理由を短い名詞句で書く（例:「違法行為の計画」「特定の人への中傷」）。"
        "問題の文言そのものは書き写さない。問題が無ければ blocked は false、block_reason は空文字にする\n\n"
        "# 守ること\n"
        "- 上記以外の文言は一字一句変えない（要約・言い換え・翻訳・補足をしない）\n"
        "- 配列の要素数と順番は入力と同じにする（空文字の要素も残す）\n\n"
        f"{json.dumps(payload, ensure_ascii=False)}"
    )


def _ask_mask(source: dict):
    """Gemini で人名などを伏せ、公開してよいかを判定する。失敗したら None。"""
    payload = {field: source[field] for field in _TEXT_FIELDS}
    for field in ["lodgings", "must_spots", "want_spots", "rough_plans"]:
        payload[field] = source[field]
    payload["constraint_contents"] = [row["content"] for row in source["constraints"]]

    key = "publish:%s:%s" % (
        _CACHE_VERSION,
        hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest(),
    )
    cached = cache.get(key)
    if cached is not None:
        return cached

    result = _ask_gemini(_mask_prompt(payload), _SCHEMA)
    if not result:
        return None
    # 形が崩れた応答（要素数の不一致など）は使わない。
    for field in _LIST_FIELDS:
        value = result.get(field)
        if not isinstance(value, list) or len(value) != len(payload[field]):
            return None
    for field in _TEXT_FIELDS:
        if not isinstance(result.get(field), str):
            return None
    cache.set(key, result, _CACHE_SECONDS)
    return result


def _month_label(cleaned: dict) -> str:
    start = _parse_date(cleaned.get("date_from"))
    return f"{start.year}年{start.month}月" if start else ""


def build_public(cleaned: dict) -> dict:
    """公開版を作る。

    戻り値: {"status": published|blocked|failed, "message": 利用者向けの説明, "snapshot": 公開版 or None}
    """
    source = _source(cleaned)
    result = _ask_mask(source)
    if result is None:
        return {"status": STATUS_FAILED, "message": MESSAGE_FAILED, "snapshot": None}
    if result.get("blocked"):
        reason = str(result.get("block_reason") or "").strip()[:100]
        # 「〜ため、公開できません。」のような文で返ってきたときは、理由の部分だけにする。
        reason = re.sub(r"(が含まれている|が含まれる)?(ため)?[、,]?\s*公開できません。?$", "", reason).strip("。 ")
        message = f"{MESSAGE_BLOCKED_DEFAULT[:-1]}（{reason}）。" if reason else MESSAGE_BLOCKED_DEFAULT
        return {"status": STATUS_BLOCKED, "message": message + "この旅は非公開になります。", "snapshot": None}

    def text(field):
        return _scrub(str(result[field]).strip())

    def items(field):
        return [_scrub(str(item).strip()) for item in result[field]]

    constraints = [
        {"day": row["day"], "time": row["time"], "content": content}
        for row, content in zip(source["constraints"], items("constraint_contents"))
    ]
    masked = {field: text(field) for field in _TEXT_FIELDS}
    masked.update({field: items(field) for field in ["lodgings", "must_spots", "want_spots", "rough_plans"]})

    # 公開版のプロンプトは、伏せた内容から作り直す（参加者の意見は含めない）。
    prompt_input = {
        **cleaned,
        **{field: masked[field] for field in _TEXT_FIELDS},
        "must_spots": masked["must_spots"],
        "want_spots": masked["want_spots"],
        "rough_plans": masked["rough_plans"],
        # 宿は「宿名」として渡す（describe_lodging 済みの文字列）。
        "lodgings": [{"mode": "name", "value": value} if value else {"mode": "", "value": ""} for value in masked["lodgings"]],
        "constraints": [
            {"day": row["day"], "time": row["time"], "content": row["content"]} for row in constraints
        ],
        "meeting_place": "",
        "dismissal_place": "",
        "outbound_transport": "",
        "return_transport": "",
    }
    nights, period_label = prompt_builder._period(cleaned)
    snapshot = {
        **masked,
        "constraints": constraints,
        "month_label": _month_label(cleaned),
        "nights": nights,
        "days": nights + 1,
        "period_label": period_label,
        "prompt_text": prompt_builder.build_prompt(prompt_input, public=True),
        "image_prompt_text": (
            prompt_builder.build_image_prompt(prompt_input, public=True) if cleaned.get("image_enabled") else ""
        ),
    }
    return {"status": STATUS_PUBLISHED, "message": "", "snapshot": snapshot}
