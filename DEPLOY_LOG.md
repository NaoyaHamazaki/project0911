# Railwayデプロイ作業記録

たびしおりプロンプトアプリを Railway にデプロイした際の作業内容・つまずいた点・
現在の設定状況をまとめたもの。次回同種の作業（本番環境の追加構築など）をする際の
参考用。

## 前提・構成

- リポジトリ: <https://github.com/NaoyaHamazaki/project0911>
- **現在デプロイしているのはステージング環境**（本番ではない）
- 本番は「1サービス構成」: Django(gunicorn) が `/api/` でAPIを、それ以外の全パスで
  ビルド済みフロントエンド（`frontend/dist`）を配信する（`backend/config/urls.py` / `spa.py`）
- ビルドは `Dockerfile`（リポジトリ直下）を使用

## 経緯（時系列）

### 1. 初回デプロイでビルド失敗（Railpackがモノレポを認識できない）

Railwayの新ビルダー「Railpack」が、`backend/`（Python）と`frontend/`（Node）が
並ぶモノレポ構成を自動判定できず、以下のエラーでビルドが止まった。

```
Railpack could not determine how to build the app.
```

**対応:** 当初 `nixpacks.toml` で明示指定を試みたが、Railway側のビルダーが
Nixpacksから切り替わっていたため効果がなかった。最終的に **Dockerfile方式**に
切り替え、ビルド手順を完全に自前で制御する形にした。

- 1段目（`node:20-slim`）: `frontend/` を `npm ci && npm run build`
- 2段目（`python:3.11-slim`）: `backend/requirements.txt` を pip install し、
  1段目の `frontend/dist` を `/app/frontend/dist` にコピー
- 起動コマンド: `migrate --noinput && collectstatic --noinput && gunicorn config.wsgi`

`nixpacks.toml` は削除済み（Dockerfileがある場合、Railwayはそちらを優先するため
不要になった）。

### 2. `DJANGO_SECRET_KEY` 未設定でクラッシュ

コンテナ起動はしたが、以下のエラーで即クラッシュしていた。

```
RuntimeError: DEBUG=False で起動しようとしていますが DJANGO_SECRET_KEY が未設定です。
```

これは意図した安全装置（`backend/config/settings.py` に実装済み）で、
本番相当（`DEBUG=False`）で起動する際に、開発用の既定シークレットキーのままだと
起動できないようにしている。Railway上では `RAILWAY_ENVIRONMENT_NAME` が
自動的にセットされるため、明示しなくても `DEBUG=False` 扱いになる。

**対応:** Railwayの対象サービス → Variables タブに `DJANGO_SECRET_KEY` を
ランダムな文字列で追加。これで起動に成功し、マイグレーションも正常に流れた
（`migrate` のログで全マイグレーション適用済みを確認）。

### 3. Postgresを追加したのにテーブルが見えない

Railwayプロジェクトに Postgres プラグインを追加したが、Postgres側の
Data/Queryタブでテーブルが確認できなかった。

**原因:** Railwayは同じプロジェクトにPostgresを置いても、Webサービス側の
環境変数へ自動で `DATABASE_URL` を注入するわけではない（明示的な参照設定が必要）。
そのままだとアプリはコンテナ内の使い捨てSQLiteに書き込んでいた
（コンテナ再起動で消える一時データ）。

**対応:** Webサービスの Variables タブで `DATABASE_URL` を追加し、値の欄で
`${{Postgres.DATABASE_URL}}`（Railwayのサービス間参照構文）を設定。
保存後に自動再デプロイがかかり、以降は `backend/config/settings.py` の
`dj_database_url` 経由でPostgreSQLに接続されるようになった。

### 4. Gemini APIキー取得時のGoogle Cloud側エラー

行先の整合性チェック機能用に新しいGemini APIキーを発行しようとしたところ、
Google Cloud Console側で以下のエラーが発生した。

```
この請求先アカウントに割り当てられているプロジェクトの数が上限に達しました。
```

**対応:** 新規プロジェクトを作らず、既存のGCPプロジェクト内で新しいAPIキーだけを
発行する方法に変更して解決（プロジェクト数の上限を回避）。

### 5. Gemini呼び出しが404で失敗（モデル廃止）

APIキー自体は有効だったが、実際に呼び出すと以下のエラーで404が返っていた。

```
This model models/gemini-2.5-flash is no longer available to new users.
Please update your code to use models/gemini-3.6-flash for the latest features.
```

**対応:** `backend/trips/consistency.py` の `GEMINI_MODEL` を
`gemini-2.5-flash` → `gemini-3.6-flash` に変更。実際のAPIキーで
「行先と大きく食い違うスポット」を検出できることを確認済み。

## 現在ステージングに設定している環境変数（値は各自Railway管理画面で確認）

| 変数 | 用途 |
| --- | --- |
| `DJANGO_SECRET_KEY` | Django起動に必須（本番/ステージング共通で必須） |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` を参照。PostgreSQL接続用 |
| `GOOGLE_MAPS_API_KEY` / `PLACE_PROVIDER=google` | 住所サジェスト機能 |
| `GEMINI_API_KEY` | 行先の整合性チェック機能（任意機能） |
| `ADMIN_MENU_ENABLED=1` | 管理者設定画面（`/admin-settings`）を表示する。**ステージングのみ**でONにしている |

`DJANGO_ALLOWED_HOSTS` / `DJANGO_CSRF_TRUSTED_ORIGINS` はRailwayが払い出す
ドメイン（`RAILWAY_PUBLIC_DOMAIN`）を自動検知して許可するようにしているため、
このステージング環境では未設定のままで動いている（独自ドメインを使う場合のみ
設定が必要）。

## 今後、本番環境を別途用意する際の注意点

- **`ADMIN_MENU_ENABLED` は本番では設定しない**こと（管理者設定画面・APIを
  無効化するため）。ステージング用の設定をそのままコピーしないよう注意。
- `DJANGO_SECRET_KEY` はステージングと本番で必ず別の値にする。
- 本番用にPostgresを新規に用意し、`DATABASE_URL` を本番サービス側に個別に設定する
  （ステージングのDBと共有しない）。
- 特定商取引法表記・資金決済法まわりなど、課金機能（`PayPay決済実装プロンプト.txt`
  参照）を導入する場合は別途法務確認が必要（未着手）。

## 参考: デプロイ関連ファイル

- `Dockerfile` / `.dockerignore` — ビルド定義
- `backend/config/settings.py` — Railway向けの自動判定（`IS_RAILWAY`、
  `SECRET_KEY`未設定時のエラー、`DATABASE_URL`優先のDB接続など）
- `backend/config/spa.py` — SPA配信用のcatch-allビュー
- `README.md` の「デプロイ（Railway）」セクション — セットアップ手順本体
