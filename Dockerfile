# backend/(Django) と frontend/(React/Vite) が並んだモノレポ構成のため、
# Railwayの自動ビルダー（Nixpacks/Railpack）に頼らず、明示的にDockerfileでビルドする。
#
# 1段目でフロントエンドをビルドし、2段目のDjangoイメージに成果物（frontend/dist）だけ
# コピーする「マルチステージビルド」。本番は1サービス構成（DjangoがAPIと画面の両方を配信）。

# ---- 1. フロントエンドのビルド ----
FROM node:20-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- 2. Django本体 ----
FROM python:3.11-slim AS backend
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app/backend

# psycopg2-binary のビルドに必要なライブラリ（Postgres接続用）。
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
# settings.py の FRONTEND_DIST_DIR (BASE_DIR.parent / "frontend" / "dist") と
# 一致させるため、/app/frontend/dist に配置する（BASE_DIR = /app/backend）。
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

# 静的ファイルの収集はビルド時に1回だけ行う（起動を速くするため）。
# ビルド時は Railway の環境変数が無いのでローカル既定値（DEBUG=1・仮のSECRET_KEY）で動くが、collectstatic には影響しない。
RUN python manage.py collectstatic --noinput

EXPOSE 8000

# migrate は起動時に実行する（当てるものが無ければ1〜2秒で終わる）。
# railway.json の preDeployCommand は実行されないことがあった（別プロジェクトで確認）ため使わない。
# AI候補（Gemini/Places）など外部APIの応答待ちが長い処理があるため、スレッド方式(gthread)にして
# 待っている間も別のリクエストを処理できるようにする（2プロセス×8スレッド＝同時16件）。
CMD ["sh", "-c", "python manage.py migrate --noinput && gunicorn config.wsgi --bind 0.0.0.0:${PORT:-8000} --worker-class gthread --workers 2 --threads 8 --timeout 60"]
