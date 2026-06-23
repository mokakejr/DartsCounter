from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolved relative to this file rather than CWD, so it finds the repo-root
# .env regardless of where `uv run` is invoked from. In Docker this points
# nowhere meaningful and is a harmless no-op — real env vars come from the
# container's process environment (injected by compose's env_file), which
# pydantic-settings already prioritizes over the dotenv file.
_ENV_FILE = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_ENV_FILE, extra="ignore")

    environment: str = "local"

    postgres_user: str = "dartscounter"
    postgres_password: str = "dartscounter"
    postgres_db: str = "dartscounter"
    postgres_host: str = "postgres"
    postgres_port: int = 5432

    redis_host: str = "redis"
    redis_port: int = 6379

    # Comma-separated; defaults cover the local Vite dev servers for the two PWAs.
    cors_origins: str = "http://localhost:5173,http://localhost:5174,http://localhost:5175"

    # Linked from notification messages ("voir toutes les stats").
    dashboard_url: str = "http://localhost:5174"

    # Fallback webhook URLs used when no DB-configured WebhookTarget exists yet
    # for that target — same env var names as the old GitHub Actions secrets,
    # so a freshly-migrated deployment keeps notifying without extra setup.
    google_chat_webhook: str | None = None
    discord_webhook_url: str | None = None

    # JWT signing — MUST be overridden via env in .env.main/.env.dev. The default
    # is intentionally obviously-insecure so a deployment that forgot to set it
    # is easy to spot rather than silently shipping a guessable secret.
    auth_secret_key: str = "INSECURE-DEV-SECRET-CHANGE-ME"
    auth_token_expire_minutes: int = 60 * 24 * 30  # 30 days — casual app, avoid re-login friction

    # Where uploaded avatar/flight images are written, and the public base URL
    # used to turn a stored relative path into an absolute one in API responses
    # (mirrors dashboard_url's existing pattern).
    upload_dir: str = "uploads"
    public_api_url: str = "http://localhost:8000"
    max_upload_bytes: int = 5 * 1024 * 1024

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def redis_url(self) -> str:
        return f"redis://{self.redis_host}:{self.redis_port}/0"


@lru_cache
def get_settings() -> Settings:
    return Settings()
