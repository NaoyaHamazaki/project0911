# たびしおりプロンプト

友達との旅行の「旅のしおり」を作るための、生成AI向けプロンプトを組み立てるWebアプリです。
スマホでの操作を前提にしたレスポンシブ構成になっています。

## 構成

| レイヤー | 技術 | 場所 |
| --- | --- | --- |
| API | Python 3.11 / Django 5 / Django REST Framework | `backend/` |
| 画面 | React 18 / TypeScript / Vite | `frontend/` |
| DB | SQLite（既定）／PostgreSQL（環境変数で切替） | `backend/db.sqlite3` |

フロントは Vite の dev サーバーから `/api` を Django(8000) へプロキシしています。
そのため CORS 設定は不要です。

## 起動方法

初回のみ:

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r backend/requirements.txt
cd backend && ../.venv/Scripts/python manage.py migrate && cd ..
cd frontend && npm install && cd ..
```

2つのターミナルで:

```bash
# ターミナル1（API）
cd backend
../.venv/Scripts/python manage.py runserver 127.0.0.1:8000

# ターミナル2（画面）
cd frontend
npm run dev
```

ブラウザで <http://localhost:5173/> を開きます。

管理画面（Django admin）を使う場合は `../.venv/Scripts/python manage.py createsuperuser` のあと
<http://127.0.0.1:8000/admin/> へアクセスしてください。

## 画面

| パス | 内容 |
| --- | --- |
| `/` | トップ。作成ボタンと、旅IDから開くフォーム |
| `/create` | プロンプト作成フォーム |
| `/confirm` | 入力確認。ビジネスエラー／アプリケーションエラーを確認してから出力 |
| `/trip/:tripId` | 出力結果。コピー・共有ボタン・QRコード |
| `/my-trips` | この端末で作成した旅の一覧 |
| `/requests` | アプリへの要望フォームと一覧 |
| `/tables` | テーブル状況の確認（参照のみ） |

## テーブル

| テーブル | モデル | 用途 |
| --- | --- | --- |
| `request` | `TripRequest` | ユーザーが入力した旅の情報。複数値の項目はJSONで保存 |
| `feature_request` | `FeatureRequest` | アプリへの要望（`/requests` ページから投稿・一覧取得） |
| `app_user` | `AppUser` | 会員登録ユーザー。最小限機能ではログイン未実装のため器のみ |
| `setting` | `Setting` | 管理者設定。key/value形式。用途は下表 |

#### Setting の主なキー

| key | 用途 |
| --- | --- |
| `site_notice` | 全ページ上部に出すお知らせ帯。空欄なら非表示 |
| `feature_request_open` | 要望フォームの受付可否（`1`=受付中 / `0`=停止） |
| `prompt_intro` | 出力プロンプトの冒頭指示文 |
| `prompt_output_items` | 「# 出力してほしいもの」の一覧文（そのまま挿入される） |
| `prompt_rules` | 「# 守ってほしいこと」の一覧文。`{period_label}` は「2泊3日」等に自動置換される |

いずれも Django admin（`/admin/trips/setting/`）から編集できます。`prompt_*` を編集すると、
以降に作成される旅のプロンプト文面が変わります（過去に作成済みのプロンプトは変わりません）。

### trip_id

`T` + ランダム英数字7文字（計8文字、例: `T4K9XQP2`）で発番します。
見間違えやすい `I / O / 0 / 1` は除いています。口頭やスクショでの共有を想定した短さです。
端末の `localStorage` が消えても、この旅IDを入力すれば結果ページを開けます。

## 環境変数（APIキーなどの設定場所）

**`backend/.env` に書きます。** `backend/.env.example` をコピーして `backend/.env` を作成してください
（`.env` は git 管理外、`python-dotenv` により `manage.py` 実行時に自動読み込みされます）。

```bash
cp backend/.env.example backend/.env
```

| 変数 | 既定値 | 説明 |
| --- | --- | --- |
| `DJANGO_SECRET_KEY` | 開発用の固定値 | 本番では必ず変更する |
| `DJANGO_DEBUG` | `1` | 本番では `0` |
| `DJANGO_ALLOWED_HOSTS` | `localhost,127.0.0.1` | カンマ区切り |
| `POSTGRES_DB` ほか | 未設定 | 設定すると PostgreSQL に切り替わる |
| `PLACE_PROVIDER` | `null` | `google` にすると住所サジェストが有効になる |
| `GOOGLE_MAPS_API_KEY` | 空 | Places Autocomplete 用のキー。`backend/.env` に設定する |
| `GEMINI_API_KEY` | 空 | 行先の整合性チェック（任意機能）用。未設定ならチェックを行わない |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | 空 | 本番でカスタムドメインを使う場合、`https://example.com` のようにカンマ区切りで指定 |
| `DATABASE_URL` | 未設定 | 設定されていれば最優先でPostgreSQLに接続する（RailwayのPostgresが自動注入） |

## 住所サジェストについて

最小限機能では自由入力のみで動作します（`PLACE_PROVIDER=null`）。
`backend/trips/providers.py` にプロバイダ層を用意してあるので、APIキーを用意したら
`PLACE_PROVIDER=google` と `GOOGLE_MAPS_API_KEY` を設定するだけで予測変換が有効になります。
APIキーはサーバー側に置き、フロントは常に `/api/places/suggest/` 経由で呼ぶ形にしています。

## データベースの中身をGUIで確認する

現在のDBは **SQLite**（`backend/db.sqlite3` という1ファイル）です。
**SSMS（SQL Server Management Studio）はSQL Server専用ツールのため、このファイルを直接開くことはできません。**
代わりに [DB Browser for SQLite](https://sqlitebrowser.org/dl/)（無料）を使うと、SSMSに近い感覚でテーブル一覧や
データを確認できます。

1. 上記サイトから DB Browser for SQLite をインストールする
2. 「Open Database」で `backend/db.sqlite3` を開く
3. 「Browse Data」タブでテーブル（`request` / `feature_request` / `app_user` / `setting`）を選んで内容を確認
   （「Execute SQL」タブでSELECT文も実行可能）

開発サーバー（`manage.py runserver`）を起動したままでも読み取りは可能ですが、書き込み中の一瞬だけロックされる
ことがあります。気になる場合は一度サーバーを停止してから開いてください。

将来的にSQL Serverを本採用する場合は `mssql-django` ドライバへの切り替えが必要になります（要相談）。

## デプロイ（Railway）

本番は「1サービス構成」にしています。Django(gunicorn)が `/api/` でAPIを、それ以外の全パスで
ビルド済みフロントエンド（`frontend/dist`）を配信します（`backend/config/urls.py` / `spa.py`）。
これによりCORS設定やフロント・バックエンドの2サービス管理が不要になっています。

### Railway側でやること

1. GitHubリポジトリ（このリポジトリ）を連携してRailwayプロジェクトを作成する
   （リポジトリ直下の `nixpacks.toml` を自動で見つけてビルドします。ルートディレクトリの
   指定などは不要です）
2. Postgresプラグインを追加する（追加すると `DATABASE_URL` が自動で注入され、SQLiteから
   自動的にPostgreSQLへ切り替わります）
3. 環境変数を設定する
   - `DJANGO_SECRET_KEY`（必須。ランダムな文字列。未設定だと起動時にエラーで止まります）
   - `DJANGO_ALLOWED_HOSTS` （任意。Railwayが払い出すドメインは自動で許可されるので、
     独自ドメインを使うときだけ追加で指定する）
   - `DJANGO_CSRF_TRUSTED_ORIGINS` （独自ドメインでDjango adminにログインする場合のみ）
   - 使うなら `PLACE_PROVIDER` / `GOOGLE_MAPS_API_KEY` / `GEMINI_API_KEY`
   - `DJANGO_DEBUG` は基本触らなくてOK（Railway上では自動的に `0` 扱いになります）
4. 「Generate Domain」等でドメインを発行する
5. デプロイ完了後、管理ユーザーを作る場合は Railway のシェル機能などから
   `python manage.py createsuperuser` を実行する（`backend/` ディレクトリで実行すること）

### ビルド・起動の流れ（`nixpacks.toml` の中身）

1. `pip install -r backend/requirements.txt`、`cd frontend && npm ci`
2. `cd frontend && npm run build` → `frontend/dist` が生成される
3. 起動時: `python manage.py migrate` → `collectstatic` → `gunicorn config.wsgi`

ローカルでこの本番構成を試したい場合:

```bash
cd frontend && npm run build && cd ..
cd backend
DJANGO_DEBUG=0 DJANGO_SECRET_KEY=temp-local-test ../.venv/Scripts/python manage.py collectstatic --noinput
DJANGO_DEBUG=0 DJANGO_SECRET_KEY=temp-local-test ../.venv/Scripts/python manage.py runserver 127.0.0.1:8000
```

<http://127.0.0.1:8000/> を開くとフロントエンドが、`/api/...` はAPIが、`/admin/` は管理画面が
同じポートで動きます。

## 今後の追加候補

- ログイン機能（`AppUser` を Django の認証と接続する）
- 作成済みプロンプトの編集・複製
- しおり画像の生成（画像生成APIの利用。従量課金が発生します）
- `/tables` へのアクセス制限（現状は認証なし。公開環境では必須）
