from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):

    # ── Database (your existing fields) ──────────────────────────
    db_user: str
    db_password: str
    db_host: str
    db_port: str = "5432"
    db_name: str
    crypto_secret_key: str

    # ── Storage ──────────────────────────────────────────────────
    BASE_URL: str = "https://currycloud.mooo.com"
    STORAGE_BACKEND: str = "local"
    LOCAL_UPLOAD_DIR: str = "static"

    # Cloudflare R2 (leave blank locally)
    R2_ENDPOINT_URL: str = ""
    R2_ACCESS_KEY_ID: str = ""
    R2_SECRET_ACCESS_KEY: str = ""
    R2_BUCKET_NAME: str = ""
    R2_PUBLIC_URL: str = ""

    class Config:
        env_file = ".env"
        extra = "ignore"            # ← ignore any extra .env fields safely


settings = Settings()