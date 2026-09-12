"""フォームの選択肢定義。フロントエンドへは /api/options/ で配信する。"""

OTHER = "other"

SCHEDULE_PACES = [
    ("efficient", "効率重視（たくさん回りたい）"),
    ("relaxed", "休憩多め（ゆったり回りたい）"),
    ("free_time", "自由時間多め（各自行動の時間がほしい）"),
    ("morning", "朝型（早起きして活動したい）"),
    ("night", "夜型（夜の時間を楽しみたい）"),
    (OTHER, "その他"),
]

DESIGN_TASTES = [
    ("pop", "ポップ・手描き風"),
    ("simple", "シンプル・モダン"),
    ("retro", "レトロ・マガジン風"),
    ("japanese", "和風・しっとり"),
    ("natural", "ナチュラル・北欧風"),
    (OTHER, "その他"),
]

COLOR_IMAGES = [
    ("pastel", "パステル"),
    ("earth", "ナチュラル・アースカラー"),
    ("vivid", "ビビッド"),
    ("monotone", "モノトーン"),
    ("blue", "ブルー・爽やか"),
    (OTHER, "その他"),
]

ASPECT_RATIOS = [
    ("9:16", "スマホ壁紙用（9:16）"),
    ("1:1", "SNS共有・正方形（1:1）"),
    ("a4_portrait", "印刷・A4縦"),
    ("16:9", "横長・PC/プレゼン（16:9）"),
    (OTHER, "その他"),
]


def label_of(choices, value):
    """選択値から表示ラベルを返す。未知の値はそのまま返す。"""
    for key, label in choices:
        if key == value:
            return label
    return value or ""
