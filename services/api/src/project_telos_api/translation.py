"""Cloud Translation for cross-cultural checks.

ThumbnailTruth (arXiv:2509.04714) found clickbait tactics differ by country and
language. When enabled, non-English titles, descriptions, and transcripts are
translated to English with Cloud Translation v3 before the Gemini scans. The model
receives both the original and the translation, so local idiom is not lost.
Translation is best-effort: a failure falls back to the original text.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any, Final

from pydantic import BaseModel

from project_telos_api.config import Settings
from project_telos_api.logging_setup import get_logger

MAX_CODEPOINTS: Final[int] = 30_000


class TranslationOutcome(BaseModel):
    """What the creator sees about translation; never the translated text itself."""

    detectedLanguage: str
    translated: bool
    provider: str = "Cloud Translation v3"


def translation_enabled(settings: Settings) -> bool:
    return bool(settings.translation_enabled and settings.google_cloud_project)


@lru_cache(maxsize=1)
def _client() -> Any:  # pragma: no cover - needs GCP
    from google.cloud import translate_v3  # noqa: PLC0415

    return translate_v3.TranslationServiceClient()


def call_translate(project: str, contents: list[str]) -> list[tuple[str, str]]:  # pragma: no cover
    """Returns (translated_text, detected_language_code) per input, auto-detecting source."""
    response = _client().translate_text(request={
        "parent": f"projects/{project}/locations/global",
        "contents": contents,
        "target_language_code": "en",
        "mime_type": "text/plain",
    })
    return [(row.translated_text, row.detected_language_code) for row in response.translations]


def translate_fields(
    fields: dict[str, str], settings: Settings
) -> tuple[dict[str, str], TranslationOutcome | None]:
    """Translates non-empty fields to English. Returns ({} , None) when disabled or failed."""
    if not translation_enabled(settings):
        return {}, None
    names = [name for name, value in fields.items() if value.strip()]
    contents = [fields[name] for name in names]
    if not contents or sum(len(text) for text in contents) > MAX_CODEPOINTS:
        return {}, None
    assert settings.google_cloud_project is not None
    try:
        results = call_translate(settings.google_cloud_project, contents)
    except Exception:
        get_logger().warning("translation.failed")
        return {}, None

    languages = [language.lower() for _, language in results if language]
    # Report the language that needed translation; ties keep input order, so it is deterministic.
    foreign = [language for language in languages if not language.startswith("en")]
    pool = foreign or languages
    detected = max(pool, key=pool.count) if pool else "und"
    english = {
        name: text
        for name, (text, language) in zip(names, results)
        if language and not language.lower().startswith("en")
    }
    get_logger().info("translation.completed", extra={"detected": detected, "translated": bool(english)})
    return english, TranslationOutcome(detectedLanguage=detected, translated=bool(english))
