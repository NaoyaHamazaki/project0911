import random
import secrets
import string

from django.db import models
from django.utils import timezone

from . import choices

# trip_id に使う文字。見間違えやすい I / O / 0 / 1 は除外する。
_TRIP_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
# 総当たりの組み合わせ数は 32^7 ≒ 343億通り。衝突時は下の再試行ループで発番し直す。
_TRIP_ID_RANDOM_LENGTH = 7
_TRIP_ID_PREFIX = "T"


def generate_join_key() -> str:
    """意見募集リンク用の推測されにくいキー。旅IDとは別物にして、参加者に編集権限を渡さない。"""
    for _ in range(10):
        candidate = secrets.token_urlsafe(12)
        if not TripRequest.objects.filter(join_key=candidate).exists():
            return candidate
    raise RuntimeError("意見募集キーの発番に失敗しました。時間をおいて再実行してください。")


def generate_trip_id() -> str:
    """T + ランダム7文字（計8文字）の短い旅IDを発番する。例: T4K9XQP2

    口頭やスクショでの共有を想定し、日付を含めず短くしている。
    見分けやすさより一意性を優先したい場合は _TRIP_ID_RANDOM_LENGTH を伸ばすこと。
    """
    for _ in range(20):
        suffix = "".join(random.choices(_TRIP_ID_ALPHABET, k=_TRIP_ID_RANDOM_LENGTH))
        candidate = f"{_TRIP_ID_PREFIX}{suffix}"
        if not TripRequest.objects.filter(trip_id=candidate).exists():
            return candidate
    raise RuntimeError("trip_id の発番に失敗しました。時間をおいて再実行してください。")


class TripRequest(models.Model):
    """ユーザーが入力した旅のしおり情報（仕様書の Request テーブル）。"""

    trip_id = models.CharField("旅ID", max_length=32, unique=True, db_index=True)
    device_key = models.CharField("端末キー", max_length=64, blank=True, db_index=True)
    user = models.ForeignKey(
        "trips.AppUser",
        verbose_name="ユーザー",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="trips",
    )

    title = models.CharField("タイトル", max_length=100)
    theme = models.CharField("テーマ", max_length=200, blank=True)
    # おおまかな行先（例: 京都・関西方面）。宿泊場所やスポットとの整合性チェックに使う。
    destination = models.CharField("行先", max_length=200, blank=True)
    date_from = models.DateField("期間自")
    date_to = models.DateField("期間至")

    # 往路・復路の交通手段と予約状況。画面上は必須表示だが、旧データの再編集を妨げないよう
    # サーバー側では空を許容する。
    outbound_transport = models.CharField("往路の交通手段", max_length=20, blank=True)
    outbound_transport_other = models.CharField("往路の交通手段(その他)", max_length=200, blank=True)
    outbound_reservation = models.CharField("往路の予約状況", max_length=20, blank=True)
    return_transport = models.CharField("復路の交通手段", max_length=20, blank=True)
    return_transport_other = models.CharField("復路の交通手段(その他)", max_length=200, blank=True)
    return_reservation = models.CharField("復路の予約状況", max_length=20, blank=True)

    meeting_place = models.CharField("集合場所", max_length=255, blank=True)
    dismissal_place = models.CharField("解散場所", max_length=255, blank=True)

    # 複数値の項目は JSON で保持する。
    # lodgings は泊ごとの {"mode": "name"|"area"|"omakase", "value": "..."}。旧データは文字列（lodging.py参照）。
    lodgings = models.JSONField("宿泊場所", default=list, blank=True)
    must_spots = models.JSONField("いきたいスポット(MUST)", default=list, blank=True)
    want_spots = models.JSONField("いきたいスポット(WANT)", default=list, blank=True)

    # 複数選択可。選択肢は choices.SCHEDULE_PACES のキーのリスト。
    schedule_paces = models.JSONField("スケジュール感", default=list, blank=True)
    schedule_pace_other = models.CharField("スケジュール感(その他)", max_length=200, blank=True)
    # 泊数ぶんの見出し(X泊目)ごとに自由記述させる、ざっくりした予定。宿泊場所と同じ数で増減する。
    rough_plans = models.JSONField("ざっくり決まっている予定", default=list, blank=True)
    constraints = models.JSONField("予約済みの予定", default=list, blank=True)
    ng_items = models.JSONField("NG項目", default=list, blank=True)
    notes = models.JSONField("配慮・共有メモ", default=list, blank=True)
    free_notes = models.TextField("自由入力欄", blank=True)
    # 参加者へ意見聴取フォーム(/trip/<id>/feedback)を公開するか
    collect_feedback = models.BooleanField("旅行意見聴取", default=False)

    design_taste = models.CharField("デザインテイスト", max_length=20, blank=True)
    design_taste_other = models.CharField("デザインテイスト(その他)", max_length=200, blank=True)
    color_image = models.CharField("カラーイメージ", max_length=20, blank=True)
    color_image_other = models.CharField("カラーイメージ(その他)", max_length=200, blank=True)
    aspect_ratio = models.CharField("出力サイズ", max_length=20, blank=True)
    aspect_ratio_other = models.CharField("出力サイズ(その他)", max_length=200, blank=True)

    # 出力設定。画像出力をONにした旅だけ画像生成用プロンプトを作る。
    image_enabled = models.BooleanField("画像出力", default=False)
    image_mood = models.CharField("画像の雰囲気", max_length=200, blank=True)
    # 参加者向け意見募集リンク(/join/<key>)のキー。旅IDとは別にして、参加者に編集権限を渡さない。
    join_key = models.CharField("意見募集キー", max_length=32, blank=True, db_index=True)

    prompt_text = models.TextField("生成プロンプト(行程表)", blank=True)
    image_prompt_text = models.TextField("生成プロンプト(画像生成用)", blank=True)

    created_at = models.DateTimeField("作成日時", auto_now_add=True)
    updated_at = models.DateTimeField("更新日時", auto_now=True)

    class Meta:
        db_table = "request"
        verbose_name = "旅のしおり入力"
        verbose_name_plural = "旅のしおり入力"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.trip_id} / {self.title}"

    @property
    def nights(self) -> int:
        """泊数。日帰りなら 0。"""
        if not self.date_from or not self.date_to:
            return 0
        return max((self.date_to - self.date_from).days, 0)

    @property
    def days(self) -> int:
        return self.nights + 1

    def schedule_paces_label(self) -> str:
        """選択された複数のスケジュール感を「・」区切りの表示用文字列にする。"""
        labels = []
        for value in self.schedule_paces:
            if value == choices.OTHER:
                labels.append(self.schedule_pace_other or "その他")
            else:
                labels.append(choices.label_of(choices.SCHEDULE_PACES, value))
        return "・".join(labels)

    def design_taste_label(self) -> str:
        if self.design_taste == choices.OTHER:
            return self.design_taste_other
        return choices.label_of(choices.DESIGN_TASTES, self.design_taste)

    def color_image_label(self) -> str:
        if self.color_image == choices.OTHER:
            return self.color_image_other
        return choices.label_of(choices.COLOR_IMAGES, self.color_image)

    def aspect_ratio_label(self) -> str:
        if self.aspect_ratio == choices.OTHER:
            return self.aspect_ratio_other
        return choices.label_of(choices.ASPECT_RATIOS, self.aspect_ratio)


class TripFeedback(models.Model):
    """旅行意見聴取フォームから参加者が送った意見。主催者は一覧で読むだけ（自動反映はしない）。"""

    trip = models.ForeignKey(TripRequest, verbose_name="旅", on_delete=models.CASCADE, related_name="feedbacks")
    nickname = models.CharField("ニックネーム", max_length=50, blank=True)
    body = models.TextField("意見", max_length=1000)
    created_at = models.DateTimeField("投稿日時", auto_now_add=True)

    class Meta:
        db_table = "trip_feedback"
        verbose_name = "旅行意見"
        verbose_name_plural = "旅行意見"
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.trip.trip_id}: {self.body[:20]}"


class TripContribution(models.Model):
    """意見募集リンクから参加者が追記した「いきたいところ」「予定」。

    参加者は追記のみ（編集・削除不可）。親ユーザーが作成画面で見て、必要な項目を取り込む。
    """

    trip = models.ForeignKey(TripRequest, verbose_name="旅", on_delete=models.CASCADE, related_name="contributions")
    name = models.CharField("名前", max_length=50)
    must_spots = models.JSONField("いきたいスポット(MUST)", default=list, blank=True)
    want_spots = models.JSONField("いきたいスポット(WANT)", default=list, blank=True)
    constraints = models.JSONField("予約済みの予定", default=list, blank=True)
    rough_plans = models.JSONField("ざっくり決まっている予定", default=list, blank=True)
    created_at = models.DateTimeField("投稿日時", auto_now_add=True)

    class Meta:
        db_table = "trip_contribution"
        verbose_name = "参加者の意見"
        verbose_name_plural = "参加者の意見"
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.trip.trip_id}: {self.name}"


class FeatureRequest(models.Model):
    """アプリへの要望。"""

    nickname = models.CharField("ニックネーム", max_length=50, blank=True)
    category = models.CharField("カテゴリ", max_length=30, blank=True)
    body = models.TextField("要望内容", max_length=1000)
    device_key = models.CharField("端末キー", max_length=64, blank=True, db_index=True)
    is_published = models.BooleanField("一覧に表示する", default=True)
    created_at = models.DateTimeField("投稿日時", auto_now_add=True)

    class Meta:
        db_table = "feature_request"
        verbose_name = "要望"
        verbose_name_plural = "要望"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.nickname or '名無し'}: {self.body[:20]}"


class AppUser(models.Model):
    """会員登録ユーザー。最小限機能ではログインを行わないため器のみ用意する。"""

    nickname = models.CharField("ニックネーム", max_length=50)
    email = models.EmailField("メールアドレス", unique=True)
    password_hash = models.CharField("パスワードハッシュ", max_length=255, blank=True)
    device_key = models.CharField("端末キー", max_length=64, blank=True, db_index=True)
    is_active = models.BooleanField("有効", default=True)
    created_at = models.DateTimeField("作成日時", auto_now_add=True)

    class Meta:
        db_table = "app_user"
        verbose_name = "ユーザー"
        verbose_name_plural = "ユーザー"

    def __str__(self):
        return self.nickname


class Setting(models.Model):
    """管理者向けのアプリ設定。key/value で保持する。"""

    key = models.CharField("キー", max_length=100, unique=True)
    value = models.TextField("値", blank=True)
    description = models.CharField("説明", max_length=255, blank=True)
    is_active = models.BooleanField("有効", default=True)
    updated_at = models.DateTimeField("更新日時", auto_now=True)

    class Meta:
        db_table = "setting"
        verbose_name = "設定"
        verbose_name_plural = "設定"
        ordering = ["key"]

    def __str__(self):
        return self.key

    @classmethod
    def get_value(cls, key: str, default: str = "") -> str:
        row = cls.objects.filter(key=key, is_active=True).first()
        return row.value if row else default
