"""Configuration must come from the environment and fail fast when incomplete."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from project_telos_api.config import Settings, get_settings


class TestRequiredSettings:
    def test_local_provider_needs_no_cloud_configuration(self) -> None:
        """The demo must run with no project, no bucket, and no key."""
        settings = get_settings()
        assert settings.provider == "local"
        assert settings.google_cloud_project is None
        assert settings.media_bucket is None

    def test_gemini_provider_requires_an_api_key(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("PROJECT_TELOS_PROVIDER", "gemini")
        with pytest.raises(ValidationError, match="GEMINI_API_KEY"):
            Settings(_env_file=None)  # type: ignore[call-arg]

    def test_gemini_provider_accepts_an_api_key(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("PROJECT_TELOS_PROVIDER", "gemini")
        monkeypatch.setenv("GEMINI_API_KEY", "test-key-value")
        settings = Settings(_env_file=None)  # type: ignore[call-arg]
        assert settings.provider == "gemini"

    def test_vertex_provider_requires_project(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("PROJECT_TELOS_PROVIDER", "vertex")
        monkeypatch.delenv("GOOGLE_CLOUD_PROJECT", raising=False)
        with pytest.raises(ValidationError, match="GOOGLE_CLOUD_PROJECT"):
            Settings(_env_file=None)  # type: ignore[call-arg]

    def test_vertex_needs_no_bucket_and_ignores_existing_developer_key(self, monkeypatch):
        monkeypatch.setenv("PROJECT_TELOS_PROVIDER", "vertex")
        monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "vertex-test")
        monkeypatch.setenv("GEMINI_API_KEY", "unused-key")
        settings = Settings(_env_file=None)
        assert settings.media_bucket is None
        assert settings.ai_client_options == {
            "api_key": None, "project": "vertex-test", "location": "us-central1",
        }
        assert settings.uses_model_calls

    def test_rejects_unknown_provider(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("PROJECT_TELOS_PROVIDER", "openai")
        with pytest.raises(ValidationError):
            Settings(_env_file=None)  # type: ignore[call-arg]


class TestDefaults:
    def test_applies_safe_defaults(self) -> None:
        settings = get_settings()
        assert settings.google_cloud_location == "us-central1"
        assert settings.firestore_database == "(default)"
        assert settings.rate_limit_per_minute == 60

    def test_defaults_to_the_local_provider(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Safe by default: a fresh checkout runs without any cloud configuration."""
        monkeypatch.delenv("PROJECT_TELOS_PROVIDER", raising=False)
        assert Settings(_env_file=None).provider == "local"  # type: ignore[call-arg]

    def test_offline_fallback_defaults_off(self) -> None:
        assert get_settings().offline_fallback is False

    def test_offline_fallback_can_be_enabled(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("PROJECT_TELOS_OFFLINE_FALLBACK", "true")
        get_settings.cache_clear()
        assert get_settings().offline_fallback is True


class TestValidation:
    def test_normalises_log_level_case(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("PROJECT_TELOS_LOG_LEVEL", "debug")
        get_settings.cache_clear()
        assert get_settings().log_level == "DEBUG"

    def test_rejects_unknown_log_level(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("PROJECT_TELOS_LOG_LEVEL", "CHATTY")
        get_settings.cache_clear()
        with pytest.raises(ValidationError):
            Settings(_env_file=None)  # type: ignore[call-arg]

    def test_rejects_rate_limit_below_one(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("PROJECT_TELOS_RATE_LIMIT_PER_MINUTE", "0")
        with pytest.raises(ValidationError):
            Settings(_env_file=None)  # type: ignore[call-arg]

    def test_rejects_unknown_environment(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("PROJECT_TELOS_ENV", "chaos")
        with pytest.raises(ValidationError):
            Settings(_env_file=None)  # type: ignore[call-arg]


class TestDerivedValues:
    def test_splits_cors_origins(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv(
            "PROJECT_TELOS_ALLOWED_ORIGINS", "http://localhost:5173, https://project-telos.example "
        )
        get_settings.cache_clear()
        assert get_settings().cors_origins == [
            "http://localhost:5173",
            "https://project-telos.example",
        ]

    def test_is_production_only_in_production(self, monkeypatch: pytest.MonkeyPatch) -> None:
        assert get_settings().is_production is False
        monkeypatch.setenv("PROJECT_TELOS_ENV", "production")
        get_settings.cache_clear()
        assert get_settings().is_production is True


class TestSecrets:
    def test_settings_are_immutable(self) -> None:
        settings = get_settings()
        with pytest.raises(ValidationError):
            settings.provider = "vertex"  # type: ignore[misc]

    def test_api_key_is_not_exposed_by_repr(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """A key must never leak through logs, tracebacks, or error output."""
        monkeypatch.setenv("PROJECT_TELOS_PROVIDER", "gemini")
        monkeypatch.setenv("GEMINI_API_KEY", "super-secret-value")
        settings = Settings(_env_file=None)  # type: ignore[call-arg]

        assert "super-secret-value" not in repr(settings)
        assert "super-secret-value" not in str(settings)
        assert "super-secret-value" not in str(settings.model_dump())

    def test_youtube_key_is_secret_and_blank_means_unset(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("YOUTUBE_API_KEY", "youtube-private")
        settings = Settings(_env_file=None)
        assert "youtube-private" not in repr(settings)
        assert "youtube-private" not in str(settings.model_dump())
        assert settings.youtube_api_key.get_secret_value() == "youtube-private"
        monkeypatch.setenv("YOUTUBE_API_KEY", " ")
        assert Settings(_env_file=None).youtube_api_key is None

    def test_api_key_is_retrievable_when_needed(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("PROJECT_TELOS_PROVIDER", "gemini")
        monkeypatch.setenv("GEMINI_API_KEY", "super-secret-value")
        settings = Settings(_env_file=None)  # type: ignore[call-arg]
        assert settings.gemini_api_key is not None
        assert settings.gemini_api_key.get_secret_value() == "super-secret-value"

    def test_no_credentials_field_holds_a_plain_secret(self) -> None:
        """Cloud credentials come from the platform, never from a settings field."""
        assert not hasattr(get_settings(), "service_account_key")


class TestModelCallGuard:
    def test_local_provider_never_calls_a_model(self) -> None:
        assert get_settings().uses_model_calls is False

    def test_gemini_provider_calls_models(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("PROJECT_TELOS_PROVIDER", "gemini")
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")
        get_settings.cache_clear()
        assert get_settings().uses_model_calls is True

    def test_offline_fallback_overrides_the_provider(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Demo safety: fallback wins even when a provider is configured."""
        monkeypatch.setenv("PROJECT_TELOS_PROVIDER", "gemini")
        monkeypatch.setenv("GEMINI_API_KEY", "test-key")
        monkeypatch.setenv("PROJECT_TELOS_OFFLINE_FALLBACK", "true")
        get_settings.cache_clear()
        assert get_settings().uses_model_calls is False
