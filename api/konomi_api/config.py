from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    # Reads KONOMI_* from the environment, then from the repo .env (e.g. the Resend key for real emails locally).
    # The Neon URL in .env is DATABASE_URL — no KONOMI_ prefix — so local dev never touches production data.
    model_config = SettingsConfigDict(env_prefix="KONOMI_", env_file=ROOT / ".env", extra="ignore")

    database_url: str = "postgresql+psycopg://konomi:konomi@localhost:5433/konomi"
    secret: str = "dev-secret-change-me"
    public_url: str = "http://localhost:5173"
    smtp_host: str = "localhost"
    smtp_port: int = 1025
    mail_from: str = "Konomi <hello@konomi.app>"
    resend_api_key: str | None = None
    artifacts_dir: Path = ROOT / "data" / "build" / "artifacts"
    session_days: int = 30
    otp_ttl_minutes: int = 10
    otp_max_attempts: int = 5


@lru_cache
def get_settings() -> Settings:
    return Settings()
