"""Provider selection.

One environment variable decides where understanding comes from. Callers depend
on the protocols in ``base``, never on a concrete provider.
"""

from __future__ import annotations

from functools import lru_cache

from project_telos_api.config import Settings, get_settings
from project_telos_api.contracts import load_schemas
from project_telos_api.providers.base import (
    ContentAnalyzer,
    ProfileExtractor,
    ProviderUnavailableError,
)
from project_telos_api.providers.local import LocalContentAnalyzer, LocalProfileExtractor

__all__ = [
    "ContentAnalyzer",
    "ProfileExtractor",
    "ProviderUnavailableError",
    "get_content_analyzer",
    "get_profile_extractor",
]


def _gemini_client(settings: Settings):  # type: ignore[no-untyped-def]
    from project_telos_api.providers.gemini import build_client  # noqa: PLC0415

    return build_client(**settings.ai_client_options)


@lru_cache(maxsize=1)
def get_profile_extractor() -> ProfileExtractor:
    settings = get_settings()
    if settings.provider == "local" or settings.offline_fallback:
        return LocalProfileExtractor()

    from project_telos_api.providers.gemini import GeminiProfileExtractor  # noqa: PLC0415

    return GeminiProfileExtractor(
        client=_gemini_client(settings),
        model=settings.gemini_model,
        profile_schema=load_schemas()["ConsentProfile"],
    )


@lru_cache(maxsize=1)
def get_content_analyzer() -> ContentAnalyzer:
    settings = get_settings()
    if settings.provider == "local" or settings.offline_fallback:
        return LocalContentAnalyzer()

    from project_telos_api.providers.gemini import GeminiContentAnalyzer  # noqa: PLC0415

    return GeminiContentAnalyzer(
        client=_gemini_client(settings),
        model=settings.gemini_model,
        segment_schema=load_schemas()["SegmentMap"],
        fallback=LocalContentAnalyzer(),
    )


@lru_cache(maxsize=1)
def reset_providers() -> None:
    """Clears cached providers. Used by tests and after a configuration change."""
    get_profile_extractor.cache_clear()
    get_content_analyzer.cache_clear()
