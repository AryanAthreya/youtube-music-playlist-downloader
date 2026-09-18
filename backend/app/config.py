"""
Configuration module — loads all settings from environment variables via Pydantic Settings.

All app configuration is sourced exclusively from environment variables.
No hard-coded paths, ports, or limits anywhere in the application.
"""

from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables.

    All fields have sensible defaults but should be overridden via .env
    or docker-compose environment blocks in production.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # ── Server ────────────────────────────────────────────────────────────
    backend_port: int = 8000
    log_level: str = "INFO"

    # ── Download limits ───────────────────────────────────────────────────
    max_concurrent_downloads: int = 2
    download_retention_hours: int = 0  # 0 = disabled (keep downloaded files permanently)
    min_disk_headroom_mb: int = 1024

    # ── Storage ───────────────────────────────────────────────────────────
    downloads_base_path: Path = Path("/app/downloads")

    # ── CORS ──────────────────────────────────────────────────────────────
    cors_origins: str = "http://localhost:3000"

    # ── yt-dlp network timeouts (seconds) ─────────────────────────────────
    ytdlp_socket_timeout: int = 30
    ytdlp_retries: int = 3

    @field_validator("downloads_base_path", mode="before")
    @classmethod
    def expand_path(cls, v: str) -> Path:
        """Expand ~ and env vars in the path."""
        return Path(str(v)).expanduser().resolve()

    @property
    def jobs_dir(self) -> Path:
        """Directory for job metadata files."""
        return self.downloads_base_path / "jobs"

    @property
    def completed_dir(self) -> Path:
        """Directory for completed download files."""
        return self.downloads_base_path / "completed"

    @property
    def temp_dir(self) -> Path:
        """Directory for in-progress download working directories."""
        return self.downloads_base_path / "temp"

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse comma-separated CORS origins into a list."""
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def min_disk_headroom_bytes(self) -> int:
        """Minimum disk headroom converted to bytes."""
        return self.min_disk_headroom_mb * 1024 * 1024


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the cached Settings singleton.

    Returns:
        Settings: Application configuration instance.
    """
    return Settings()
