"""Django settings for 旅のしおりプロンプト作成アプリ."""

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

# backend/.env があれば読み込む（GOOGLE_MAPS_API_KEY などのAPI情報はここに置く）。
# .env.example をコピーして .env を作成すること。既存の環境変数は上書きしない。
load_dotenv(BASE_DIR / ".env")

# Railway上で動いているかどうか（Railwayが自動で環境変数を注入する）。
# これを使って、本番では明示指定がなくても安全な既定値（DEBUG=False等）にする。
RAILWAY_PUBLIC_DOMAIN = os.environ.get("RAILWAY_PUBLIC_DOMAIN", "")
IS_RAILWAY = bool(os.environ.get("RAILWAY_ENVIRONMENT_NAME") or RAILWAY_PUBLIC_DOMAIN)

# ローカル開発用の既定値。本番では必ず環境変数で上書きすること。
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-only-insecure-key-change-me")
DEBUG = os.environ.get("DJANGO_DEBUG", "0" if IS_RAILWAY else "1") == "1"

if not DEBUG and SECRET_KEY == "dev-only-insecure-key-change-me":
    raise RuntimeError(
        "DEBUG=False で起動しようとしていますが DJANGO_SECRET_KEY が未設定です。"
        "本番環境（Railwayなど）では必ず環境変数 DJANGO_SECRET_KEY を設定してください。"
    )

ALLOWED_HOSTS = [
    host.strip()
    for host in os.environ.get("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")
    if host.strip()
]
CSRF_TRUSTED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("DJANGO_CSRF_TRUSTED_ORIGINS", "").split(",")
    if origin.strip()
]
if RAILWAY_PUBLIC_DOMAIN:
    # Railwayが払い出すドメインを自動的に許可・信頼済みにする（毎回手動設定しなくて済むように）。
    ALLOWED_HOSTS.append(RAILWAY_PUBLIC_DOMAIN)
    CSRF_TRUSTED_ORIGINS.append(f"https://{RAILWAY_PUBLIC_DOMAIN}")

if IS_RAILWAY:
    # Railwayはリバースプロキシ経由でHTTPSを終端するため、これがないと
    # DjangoがHTTP接続だと誤認し、CSRF判定やリダイレクトがおかしくなる。
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "trips",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# DB優先順位: DATABASE_URL（RailwayのPostgresプラグインが自動注入）
#           > POSTGRES_DB系（手動でPostgresを使う場合）
#           > SQLite（既定、ローカル開発用）
if os.environ.get("DATABASE_URL"):
    import dj_database_url

    DATABASES = {
        "default": dj_database_url.config(
            default=os.environ["DATABASE_URL"],
            conn_max_age=600,
            ssl_require=IS_RAILWAY,
        )
    }
elif os.environ.get("POSTGRES_DB"):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.environ["POSTGRES_DB"],
            "USER": os.environ.get("POSTGRES_USER", "postgres"),
            "PASSWORD": os.environ.get("POSTGRES_PASSWORD", ""),
            "HOST": os.environ.get("POSTGRES_HOST", "127.0.0.1"),
            "PORT": os.environ.get("POSTGRES_PORT", "5432"),
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "ja"
TIME_ZONE = "Asia/Tokyo"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ビルド済みフロントエンド（frontend/dist）の場所。
# ローカル開発では Vite の dev サーバーを別途使うため、このディレクトリが無くても問題ない
# （本番の1サービス構成では、ここにある index.html / assets をこのDjangoサービスが配信する）。
FRONTEND_DIST_DIR = BASE_DIR.parent / "frontend" / "dist"
if FRONTEND_DIST_DIR.exists():
    # index.html以外の静的ファイル（assets/以下など）をサイト直下（Vite側のパスと同じ）で配信する。
    WHITENOISE_ROOT = FRONTEND_DIST_DIR

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    "UNAUTHENTICATED_USER": None,
}

# 住所サジェストのプロバイダ。"null"（自由入力のみ）/ "google"（要 API キー）
PLACE_PROVIDER = os.environ.get("PLACE_PROVIDER", "null")
GOOGLE_MAPS_API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY", "")

# 行先と入力場所の整合性チェック（任意機能）に使う。未設定ならチェックを行わない。
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

# フロントエンドのオリジン（共有URLの組み立てに使用）
FRONTEND_ORIGIN = os.environ.get("FRONTEND_ORIGIN", "http://localhost:5173")
