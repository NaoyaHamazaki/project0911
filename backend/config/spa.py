"""ビルド済みフロントエンド（frontend/dist/index.html）を返すだけのビュー。

本番の1サービス構成（Django一つでAPIと画面の両方を配信する）で、
/api/ と /admin/ 以外の全パス（/create, /trip/<id> など React Router 側のルート）を
ここで受けて index.html を返す。あとはブラウザ側の React Router がURLを見て
表示するページを切り替える（いわゆる SPA の catch-all ルーティング）。

ローカル開発では Vite の dev サーバー（5173番）を直接使うのでこのビューは使われない。
"""

from django.conf import settings
from django.http import HttpResponse, HttpResponseNotFound

_NOT_BUILT_MESSAGE = (
    "フロントエンドのビルドが見つかりません。\n"
    "frontend/ ディレクトリで `npm run build` を実行してから、\n"
    "もう一度アクセスしてください。"
)


def spa_index(request, *args, **kwargs):
    index_path = settings.FRONTEND_DIST_DIR / "index.html"
    if not index_path.exists():
        return HttpResponseNotFound(_NOT_BUILT_MESSAGE, content_type="text/plain; charset=utf-8")
    # Djangoのテンプレートエンジンは通さない（ビルド済みHTMLをそのまま返すだけでよい）。
    html = index_path.read_text(encoding="utf-8")
    return HttpResponse(html, content_type="text/html; charset=utf-8")
