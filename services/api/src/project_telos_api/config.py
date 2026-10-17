"""Application configuration.

Every setting comes from the environment. Nothing is hardcoded, and the process
refuses to start when a required value is missing, so a misconfigured deployment
fails at boot rather than at the first request.

Three providers are supported so the demo never depends on cloud availability:
local fixtures, an AI Studio API key, or full Vertex AI.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

Environment = Literal["development", "test", "staging", "production"]
Provider = Literal["local", "gemini", "vertex"]
Storage = Literal["local", "firestore"]


def repo_root() -> Path:
    """Walks up to the workspace root so `.env` is found from any working directory."""
    for parent in Path(__file__).resolve().parents:
        if (parent / "package.json").is_file() and (parent / "packages").is_dir():
            return parent
    return Path.cwd()


class Settings(BaseSettings):
    """Runtime settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_prefix="",
        env_file=(repo_root() / ".env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        frozen=True,
    )

    provider: Provider = Field("local", alias="PROJECT_TELOS_PROVIDER")

    # Secret-wrapped so it cannot be printed, logged, or serialised by accident.
    gemini_api_key: SecretStr | None = Field(None, alias="GEMINI_API_KEY")
    youtube_api_key: SecretStr | None = Field(None, alias="YOUTUBE_API_KEY")

    google_cloud_project: str | None = Field(None, alias="GOOGLE_CLOUD_PROJECT")
    google_cloud_location: str = Field("us-central1", alias="GOOGLE_CLOUD_LOCATION", min_length=1)

    local_data_dir: Path = Field(Path(".local/data"), alias="PROJECT_TELOS_LOCAL_DATA_DIR")
    local_media_dir: Path = Field(Path(".local/media"), alias="PROJECT_TELOS_LOCAL_MEDIA_DIR")

    @field_validator("local_data_dir", "local_media_dir")
    @classmethod
    def _anchor_to_repo_root(cls, value: Path) -> Path:
        """Relative paths resolve against the repo root, not the launch directory."""
        return value if value.is_absolute() else repo_root() / value

    media_bucket: str | None = Field(None, alias="PROJECT_TELOS_MEDIA_BUCKET")
    firestore_database: str = Field("(default)", alias="PROJECT_TELOS_FIRESTORE_DATABASE", min_length=1)
    bigquery_dataset: str | None = Field(None, alias="PROJECT_TELOS_BIGQUERY_DATASET")

    # Google Cloud integrations. Each is opt-in so local development needs no cloud account.
    storage: Storage = Field("local", alias="PROJECT_TELOS_STORAGE")
    bigquery_enabled: bool = Field(False, alias="PROJECT_TELOS_BIGQUERY_ENABLED")
    translation_enabled: bool = Field(False, alias="PROJECT_TELOS_TRANSLATION_ENABLED")

    # When set, the API also serves the built web app, so one Cloud Run service hosts both.
    web_dist_dir: Path | None = Field(None, alias="PROJECT_TELOS_WEB_DIST")

    gemini_model: str = Field("gemini-2.5-flash", alias="PROJECT_TELOS_GEMINI_MODEL", min_length=1)
    gemini_reasoning_model: str = Field(
        "gemini-2.5-pro", alias="PROJECT_TELOS_GEMINI_REASONING_MODEL", min_length=1
    )
    imagen_model: str = Field("imagen-4.0-generate-001", alias="PROJECT_TELOS_IMAGEN_MODEL", min_length=1)
    embedding_model: str = Field("text-embedding-005", alias="PROJECT_TELOS_EMBEDDING_MODEL", min_length=1)

    environment: Environment = Field("development", alias="PROJECT_TELOS_ENV")
    log_level: str = Field("INFO", alias="PROJECT_TELOS_LOG_LEVEL")
    allowed_origins: str = Field("http://localhost:5173", alias="PROJECT_TELOS_ALLOWED_ORIGINS")
    rate_limit_per_minute: int = Field(60, alias="PROJECT_TELOS_RATE_LIMIT_PER_MINUTE", ge=1, le=10_000)

    # Demo safety: serve precomputed verdicts and never call a model at request time.
    offline_fallback: bool = Field(False, alias="PROJECT_TELOS_OFFLINE_FALLBACK")

    @field_validator(
        "gemini_api_key",
        "youtube_api_key",
        "google_cloud_project",
        "media_bucket",
        "bigquery_dataset",
        "web_dist_dir",
        mode="before",
    )
    @classmethod
    def _blank_is_unset(cls, value: object) -> object:
        """An empty variable in `.env` means "not configured", not an empty name."""
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("log_level")
    @classmethod
    def _valid_log_level(cls, value: str) -> str:
        allowed = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
        upper = value.upper()
        if upper not in allowed:
            raise ValueError(f"log_level must be one of {sorted(allowed)}, got {value!r}")
        return upper

    @model_validator(mode="after")
    def _provider_requirements(self) -> "Settings":
        """Each provider declares what it needs, so a wrong combination fails at boot."""
        if self.provider == "gemini" and not self.gemini_api_key:
            raise ValueError("PROJECT_TELOS_PROVIDER=gemini requires GEMINI_API_KEY")

        if self.provider == "vertex":
            missing = [
                name
                for name, value in (
                    ("GOOGLE_CLOUD_PROJECT", self.google_cloud_project),
                )
                if not value
            ]
            if missing:
                raise ValueError(f"PROJECT_TELOS_PROVIDER=vertex requires {', '.join(missing)}")

        cloud_needs = (
            ("PROJECT_TELOS_STORAGE=firestore", self.storage == "firestore"),
            ("PROJECT_TELOS_BIGQUERY_ENABLED=true", self.bigquery_enabled),
            ("PROJECT_TELOS_TRANSLATION_ENABLED=true", self.translation_enabled),
        )
        for feature, enabled in cloud_needs:
            if enabled and not self.google_cloud_project:
                raise ValueError(f"{feature} requires GOOGLE_CLOUD_PROJECT")
        if self.bigquery_enabled and not self.bigquery_dataset:
            raise ValueError("PROJECT_TELOS_BIGQUERY_ENABLED=true requires PROJECT_TELOS_BIGQUERY_DATASET")
        return self

    @property
    def ai_client_options(self) -> dict[str, str | None]:
        """Select credentials explicitly; Vertex never consumes a Developer API key."""
        if self.provider == "vertex":
            return {"api_key": None, "project": self.google_cloud_project,
                    "location": self.google_cloud_location}
        if self.provider == "gemini":
            return {"api_key": self.gemini_api_key.get_secret_value() if self.gemini_api_key else None}
        raise ValueError("The local provider does not use an AI client")

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def uses_model_calls(self) -> bool:
        """False when verdicts come from fixtures, so no request ever reaches a model."""
        return self.provider != "local" and not self.offline_fallback


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Cached settings instance. Raises ValidationError when configuration is incomplete."""
    return Settings()  # type: ignore[call-arg]
