# Cloudflare 前段（方式A）

画面（React）は Cloudflare Workers の静的配信から返し、`/api/`・`/admin/`・`/static/` だけを
Worker が Django（Railway）へ転送する構成。

```
利用者 ─▶ Cloudflare（tabi-shiori.<アカウント>.workers.dev）
            ├─ /, /create, /trip/xxx, /join/xxx … frontend/dist を静的配信（Worker は起動しない）
            └─ /api/*, /admin/*, /static/* ……… src/index.js が BACKEND_ORIGIN（Railway）へ転送
```

- 静的ファイルへのアクセスでは Worker が起動しないため、無料枠（1日10万リクエスト）に数えられるのは API と管理画面へのアクセスだけ。
- 画面とAPIが同じドメインになるので、CORS の設定は不要。

## ファイル

| ファイル | 役割 |
|---|---|
| `wrangler.jsonc` | Worker 名、静的配信の場所（`../frontend/dist`）、転送先 `BACKEND_ORIGIN` |
| `src/index.js` | `/api/`・`/admin/`・`/static/` を Django へ転送する処理 |
| `.dev.vars` | ローカル確認用の上書き（Git管理外）。例: `BACKEND_ORIGIN=http://127.0.0.1:8011` |

## ローカルで確認する

```sh
# 1) Django を起動（別ターミナル）
cd backend && ../.venv/Scripts/python.exe manage.py runserver 8011

# 2) 画面をビルドして Worker を起動
cd cloudflare
npm install
npm --prefix ../frontend run build
npx wrangler dev --port 8787   # http://localhost:8787 で確認
```

## 本番（Cloudflare）へデプロイする

初回だけ:

```sh
cd cloudflare
npm install
npx wrangler login        # ブラウザで Cloudflare アカウントにログイン
```

デプロイ（画面のビルド → Worker の反映まで一括）:

```sh
npm run deploy
```

表示された `https://tabi-shiori.<アカウント>.workers.dev` が公開URLになる。

### Railway 側で必要な設定

Django 管理画面（`/admin/`）に Cloudflare のURL経由でログインするため、Railway の Variables に追加する:

```
DJANGO_CSRF_TRUSTED_ORIGINS=https://tabi-shiori.<アカウント>.workers.dev
```

（API は CSRF 対象外なので、これが無くてもアプリ自体は動く。独自ドメインを付けたら、そのURLも カンマ区切りで追加する）

## 注意

- Railway の URL（`*.up.railway.app`）にも引き続き直接アクセスできる。利用者には Cloudflare のURLだけを案内する。
- 画面を変更したら `npm run deploy` で Cloudflare にも反映が必要（Railway への push だけでは Cloudflare 側の画面は更新されない）。
  GitHub 連携で自動化する場合は、Cloudflare の Workers Builds でルートディレクトリを `cloudflare`、
  ビルドコマンドを `npm run build:frontend`、デプロイコマンドを `npx wrangler deploy` に設定する。
- 意見募集リンクやQRは、開いているドメインのURLで発行される（Cloudflare から発行すれば Cloudflare のURLになる）。
