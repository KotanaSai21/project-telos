"""Shared pytest fixtures.

A complete, valid environment is installed before any application module is
imported, so configuration tests start from a known-good baseline.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterator

import pytest

REQUIRED_ENV = {
    "PROJECT_TELOS_PROVIDER": "local",
    "PROJECT_TELOS_ENV": "test",
    "PROJECT_TELOS_LOG_LEVEL": "INFO",
    "PROJECT_TELOS_ALLOWED_ORIGINS": "http://localhost:5173",
    # Explicit so a developer's .env cannot switch tests onto Google Cloud services.
    "PROJECT_TELOS_STORAGE": "local",
    "PROJECT_TELOS_BIGQUERY_ENABLED": "false",
    "PROJECT_TELOS_TRANSLATION_ENABLED": "false",
    "PROJECT_TELOS_WEB_DIST": "",
    "GEMINI_API_KEY": "",
    "YOUTUBE_API_KEY": "",
}

CLEARED_ENV = (
    "GEMINI_API_KEY",
    "YOUTUBE_API_KEY",
    "GOOGLE_CLOUD_PROJECT",
    "PROJECT_TELOS_MEDIA_BUCKET",
    "PROJECT_TELOS_OFFLINE_FALLBACK",
    "PROJECT_TELOS_RATE_LIMIT_PER_MINUTE",
)


@pytest.fixture(autouse=True)
def _env(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    for key in CLEARED_ENV:
        monkeypatch.delenv(key, raising=False)
    for key, value in REQUIRED_ENV.items():
        monkeypatch.setenv(key, value)
    # Settings are cached; clear so each test sees its own environment.
    from project_telos_api.config import get_settings

    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def fixture_dir() -> Path:
    for parent in Path(__file__).resolve().parents:
        candidate = parent / "packages" / "contracts" / "fixtures"
        if candidate.is_dir():
            return candidate
    raise FileNotFoundError("Could not locate packages/contracts/fixtures")


@pytest.fixture
def load_fixture(fixture_dir: Path):  # type: ignore[no-untyped-def]
    def _load(name: str) -> Any:
        return json.loads((fixture_dir / name).read_text(encoding="utf-8"))

    return _load
