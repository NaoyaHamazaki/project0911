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

EXPOSE 8000

# migrate と collectstatic は起動のたびに実行する（べき等なので毎回実行して問題ない）。
CMD ["sh", "-c", "python manage.py migrate --noinput && python manage.py collectstatic --noinput && gunicorn config.wsgi --bind 0.0.0.0:${PORT:-8000} --workers 2"]
