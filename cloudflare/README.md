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

### 自動デプロイ（GitHub Actions）

main に push すると、`frontend/` か `cloudflare/` に変更があるときだけ
`.github/workflows/deploy-cloudflare.yml` が上の `npm run deploy` を自動で実行する。
GitHub の Actions タブの「Deploy Cloudflare」→「Run workflow」で手動実行もできる。

事前に GitHub の Settings → Secrets and variables → Actions に登録しておく:

| Secret | 内容 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare の My Profile → API Tokens で、テンプレート「Edit Cloudflare Workers」から作ったトークン |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare のダッシュボード（Workers & Pages の右側など）に出ているアカウントID |

### Railway 側で必要な設定

Django 管理画面（`/admin/`）に Cloudflare のURL経由でログインするため、Railway の Variables に追加する:

```
DJANGO_CSRF_TRUSTED_ORIGINS=https://tabi-shiori.<アカウント>.workers.dev
```

（API は CSRF 対象外なので、これが無くてもアプリ自体は動く。独自ドメインを付けたら、そのURLも カンマ区切りで追加する）

## 注意

- Railway の URL（`*.up.railway.app`）にも引き続き直接アクセスできる。利用者には Cloudflare のURLだけを案内する。
- 画面は Cloudflare から配信しているので、画面の変更は Cloudflare へのデプロイで本番に出る（上の自動デプロイで push 時に反映される）。
- Railway のドメインを変えたら、`wrangler.jsonc` の `BACKEND_ORIGIN` も直してデプロイする（古いままだと API が 404 になる）。
- 意見募集リンクやQRは、開いているドメインのURLで発行される（Cloudflare から発行すれば Cloudflare のURLになる）。
