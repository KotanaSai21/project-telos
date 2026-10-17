"""Local provider. No network, no credentials, fully deterministic.

Segment maps come from the committed corpus, and profile extraction uses an
explicit keyword map. This is what runs while recording the demo, so nothing
can fail in the room.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any, Final

from project_telos_api.providers.base import ProviderUnavailableError

# Phrases mapped to the boundary they declare. Ordered longest-first at match
# time so "graphic violence" wins over "violence".
BOUNDARY_PHRASES: Final[dict[str, tuple[str, str]]] = {
    "explicit content": ("sexual", "none"),
    "adult content": ("sexual", "none"),
    "nudity": ("sexual", "suggestive"),
    "sexual content": ("sexual", "none"),
    "graphic violence": ("violence", "mild"),
    "graphic injuries": ("graphic_injury", "mild"),
    "graphic injury": ("graphic_injury", "mild"),
    "graphic content": ("graphic_injury", "none"),
    "gore": ("graphic_injury", "none"),
    "violence": ("violence", "suggestive"),
    "gambling": ("gambling", "none"),
    "betting": ("gambling", "none"),
    "alcohol": ("alcohol", "none"),
    "self harm": ("self_harm", "none"),
    "self-harm": ("self_harm", "none"),
    "diet": ("body_image", "mild"),
    "body image": ("body_image", "mild"),
    "hate speech": ("hate", "none"),
}

CONTEXT_PHRASES: Final[dict[str, str]] = {
    "medical education": "medical_education",
    "medical": "medical_education",
    "anatomy": "medical_education",
    "health education": "medical_education",
    "news": "news_reporting",
    "journalism": "news_reporting",
    "reporting": "news_reporting",
    "art": "art_classical",
}

INTEREST_PHRASES: Final[dict[str, str]] = {
    "aviation": "aviation",
    "flying": "aviation",
    "planes": "aviation",
    "classical music": "Indian classical music",
    "indian classical": "Indian classical music",
    "music": "music",
    "cooking": "cooking",
    "football": "football",
    "cricket": "cricket",
}

PROFILE_CONTEXTS: Final[frozenset[str]] = frozenset(
    {"work", "family", "learning", "personal", "commute"}
)

# Phrases signalling that the viewer explained *why* a boundary matters. A stated
# reason widens the boundary's reach; it is never treated as a diagnosis.
REASON_MARKERS: Final[tuple[str, ...]] = (
    "in recovery",
    "recovering",
    "it triggers",
    "triggers me",
    "trigger",
    "makes me",
    "because",
    "struggle with",
    "i'm sensitive",
    "sensitive to",
)

MAX_REASON_LENGTH: Final[int] = 280
MAX_UTTERANCE_LENGTH: Final[int] = 1000


def _split_clauses(text: str) -> list[str]:
    """Splits on sentence and clause boundaries so a reason stays with its subject."""
    clauses: list[str] = []
    current: list[str] = []
    for char in text:
        if char in ".;":
            clauses.append("".join(current))
            current = []
        else:
            current.append(char)
    clauses.append("".join(current))
    return [clause.strip() for clause in clauses if clause.strip()]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def corpus_dir() -> Path:
    for parent in Path(__file__).resolve().parents:
        candidate = parent / "corpus"
        if candidate.is_dir():
            return candidate
    raise ProviderUnavailableError("Could not locate the corpus directory")


@lru_cache(maxsize=1)
def load_manifest() -> dict[str, Any]:
    return json.loads((corpus_dir() / "manifest.json").read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def load_presets() -> list[dict[str, Any]]:
    """Seeded profiles, so switching contexts on stage is deterministic."""
    payload = json.loads((corpus_dir() / "presets.json").read_text(encoding="utf-8"))
    return payload["presets"]


class LocalProfileExtractor:
    """Deterministic phrase matching. Good enough to demo, impossible to flake."""

    name = "local"

    def extract(self, utterance: str, *, profile_id: str, context: str) -> dict[str, Any]:
        if not utterance or not utterance.strip():
            raise ValueError("utterance must not be empty")
        if len(utterance) > MAX_UTTERANCE_LENGTH:
            raise ValueError(f"utterance exceeds {MAX_UTTERANCE_LENGTH} characters")
        if context not in PROFILE_CONTEXTS:
            raise ValueError(f"context must be one of {sorted(PROFILE_CONTEXTS)}")

        text = utterance.lower()

        # Longest phrases first so a specific match beats a generic substring.
        avoid: dict[str, str] = {}
        for phrase in sorted(BOUNDARY_PHRASES, key=len, reverse=True):
            if phrase in text:
                category, threshold = BOUNDARY_PHRASES[phrase]
                avoid.setdefault(category, threshold)

        reasons = self._extract_reasons(utterance)

        allow_contextually = {
            category for phrase, category in CONTEXT_PHRASES.items() if phrase in text
        }
        interests = {label for phrase, label in INTEREST_PHRASES.items() if phrase in text}

        # A general interest is redundant once a specific one matched.
        if "Indian classical music" in interests:
            interests.discard("music")

        boundaries: list[dict[str, Any]] = []
        for category, threshold in sorted(avoid.items()):
            boundary: dict[str, Any] = {
                "category": category,
                "intensityThreshold": threshold,
            }
            if category in reasons:
                # A stated reason means the viewer wants this taken seriously.
                boundary["intensityThreshold"] = "none"
                boundary["reason"] = reasons[category]
            boundaries.append(boundary)

        return {
            "id": profile_id,
            "name": context.capitalize(),
            "context": context,
            "avoid": boundaries,
            "allowContextually": sorted(allow_contextually),
            "interests": sorted(interests),
            "language": "en",
            "narrate": False,
            "version": 1,
            "updatedAt": _now(),
        }

    def _extract_reasons(self, utterance: str) -> dict[str, str]:
        """Maps a category to the clause in which the viewer explained it."""
        reasons: dict[str, str] = {}
        for clause in _split_clauses(utterance):
            lowered = clause.lower()
            if not any(marker in lowered for marker in REASON_MARKERS):
                continue
            for phrase in sorted(BOUNDARY_PHRASES, key=len, reverse=True):
                if phrase in lowered:
                    category = BOUNDARY_PHRASES[phrase][0]
                    reasons.setdefault(category, clause[:MAX_REASON_LENGTH])
        return reasons


class LocalContentAnalyzer:
    """Serves precomputed segment maps from the corpus."""

    name = "local"

    def analyze(self, asset_id: str) -> dict[str, Any]:
        path = corpus_dir() / "segments" / f"{asset_id}.json"
        # Guard against traversal: the resolved path must stay inside the corpus.
        resolved = path.resolve()
        if not resolved.is_relative_to((corpus_dir() / "segments").resolve()):
            raise ValueError(f"Invalid asset id: {asset_id!r}")
        if not resolved.is_file():
            raise KeyError(f"No precomputed segment map for asset {asset_id!r}")
        return json.loads(resolved.read_text(encoding="utf-8"))
