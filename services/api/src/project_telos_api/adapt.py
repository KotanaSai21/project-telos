"""Adaptation: what actually replaces what is withheld.

A decision says *what* to do. This module produces the thing the viewer sees
instead -- a summary, a generated illustration, or a substitute item drawn from
their declared interests.

Without this the product is a blocker: it would remove content and leave a hole.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from typing import Any, Final, Protocol

# Words that carry no signal when matching interests to content.
STOPWORDS: Final[frozenset[str]] = frozenset(
    {"the", "a", "an", "of", "at", "in", "on", "and", "or", "for", "to", "my", "with"}
)

# Actions where information must survive without the imagery.
NEEDS_SUMMARY: Final[frozenset[str]] = frozenset({"summarize", "reframe"})

# Actions where the slot would otherwise be empty.
NEEDS_SUBSTITUTE: Final[frozenset[str]] = frozenset({"hold", "quarantine", "replace"})


def tokenise(text: str) -> set[str]:
    """Lowercased word tokens, minus stopwords."""
    words = re.findall(r"[a-z0-9]+", text.lower())
    return {word for word in words if word not in STOPWORDS and len(word) > 2}


@dataclass(frozen=True)
class CatalogItem:
    """A candidate substitution."""

    asset_id: str
    title: str
    categories: tuple[str, ...]

    @property
    def tokens(self) -> set[str]:
        return tokenise(self.title) | {
            token for category in self.categories for token in tokenise(category)
        }


def score_match(interests: list[str], item: CatalogItem) -> float:
    """How well an item matches declared interests, from 0 to 1.

    Exact category matches count double: a profile naming "aviation" should
    prefer an item labelled aviation over one that merely mentions the word.
    """
    if not interests:
        return 0.0

    interest_tokens = {token for interest in interests for token in tokenise(interest)}
    if not interest_tokens:
        return 0.0

    overlap = interest_tokens & item.tokens
    category_hits = sum(
        1 for category in item.categories if tokenise(category) & interest_tokens
    )

    raw = len(overlap) + category_hits
    return min(1.0, raw / max(len(interest_tokens), 1))


def find_substitute(
    profile: dict[str, Any],
    catalog: list[CatalogItem],
    *,
    exclude: set[str] | None = None,
    minimum_score: float = 0.2,
) -> tuple[CatalogItem, float] | None:
    """The best interest-matching item, or None when nothing fits.

    Returning None matters: a bad substitute is worse than an honest gap.
    """
    excluded = exclude or set()
    interests = profile.get("interests", [])

    ranked = sorted(
        (
            (item, score_match(interests, item))
            for item in catalog
            if item.asset_id not in excluded
        ),
        key=lambda pair: (-pair[1], pair[0].asset_id),
    )

    if not ranked or ranked[0][1] < minimum_score:
        return None
    return ranked[0]


class Adapter(Protocol):
    """Produces the replacement content. Swappable for a generative provider."""

    name: str

    def summarise(self, segment_map: dict[str, Any], decision: dict[str, Any]) -> str: ...

    def illustrate(self, summary: str, categories: list[str]) -> str: ...


def _readable(category: str) -> str:
    return category.replace("_", " ")


def _format_time(seconds: float) -> str:
    minutes, secs = divmod(int(seconds), 60)
    return f"{minutes}:{secs:02d}"


class LocalAdapter:
    """Deterministic adaptation. No key, no network, safe to demo offline."""

    name = "local"

    def summarise(self, segment_map: dict[str, Any], decision: dict[str, Any]) -> str:
        context = sorted(
            {
                label["category"]
                for segment in segment_map["segments"]
                for label in segment["labels"]
                if label["intensity"] == "none"
            }
        )
        flagged = sorted(
            {
                label["category"]
                for segment in segment_map["segments"]
                for label in segment["labels"]
                if label["intensity"] != "none"
            }
        )

        subject = _readable(context[0]) if context else "this item"
        ranges = ", ".join(
            f"{_format_time(r['startSec'])}–{_format_time(r['endSec'])}"
            for r in decision.get("affectedRanges", [])
        )

        parts = [f"A {subject} item lasting {_format_time(segment_map['durationSec'])}."]
        if flagged:
            parts.append(
                f"It contains {_readable(flagged[0])} imagery"
                + (f" at {ranges}" if ranges else "")
                + ", which has been withheld."
            )
        parts.append("The substance is preserved here; only the imagery is not shown.")
        return " ".join(parts)

    def illustrate(self, summary: str, categories: list[str]) -> str:
        """A deterministic abstract SVG, seeded by the summary.

        Stands in for Imagen so the reframe path is complete offline. The point
        is that the slot carries meaning rather than a grey box.
        """
        seed = int(hashlib.sha256(summary.encode("utf-8")).hexdigest()[:8], 16)
        hue = seed % 360
        label = _readable(categories[0]) if categories else "summary"

        svg = (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180">'
            f'<rect width="320" height="180" fill="hsl({hue} 30% 22%)"/>'
            f'<circle cx="{80 + seed % 160}" cy="90" r="{30 + seed % 40}" '
            f'fill="hsl({(hue + 40) % 360} 45% 45%)" opacity="0.55"/>'
            f'<rect x="0" y="140" width="320" height="40" fill="hsl({hue} 30% 14%)"/>'
            f'<text x="12" y="166" font-family="sans-serif" font-size="13" '
            f'fill="hsl({hue} 20% 80%)">{label} · summarised</text>'
            f"</svg>"
        )
        from base64 import b64encode  # noqa: PLC0415

        return "data:image/svg+xml;base64," + b64encode(svg.encode("utf-8")).decode("ascii")


class GeminiAdapter:
    """Real generated summary, falling back to the local adapter on failure."""

    name = "gemini"

    SUMMARY_PROMPT: Final[str] = """\
You summarise a video for someone who has chosen not to see its imagery.

Rules:
- The segment map inside <state> is fact. Use only it.
- Preserve the information. Do not describe the withheld imagery in detail.
- Two sentences at most. Plain language.
- Never describe the content as illegal or the creator as culpable.
"""

    def __init__(self, client: Any, model: str) -> None:
        self._client = client
        self._model = model
        self._fallback = LocalAdapter()

    def summarise(self, segment_map: dict[str, Any], decision: dict[str, Any]) -> str:
        import json  # noqa: PLC0415

        try:
            response = self._client.models.generate_content(
                model=self._model,
                contents=f"<state>\n{json.dumps(segment_map, sort_keys=True)}\n</state>",
                config={"system_instruction": self.SUMMARY_PROMPT, "temperature": 0.2},
            )
            return response.text.strip()
        except Exception:  # noqa: BLE001 - a missing summary must not break the feed
            return self._fallback.summarise(segment_map, decision)

    def illustrate(self, summary: str, categories: list[str]) -> str:
        return self._fallback.illustrate(summary, categories)


def build_adaptation(
    profile: dict[str, Any],
    segment_map: dict[str, Any],
    decision: dict[str, Any],
    *,
    catalog: list[CatalogItem],
    adapter: Adapter | None = None,
    exclude: set[str] | None = None,
) -> dict[str, Any]:
    """What the viewer receives in place of what was withheld."""
    active = adapter or LocalAdapter()
    action = decision["action"]

    adaptation: dict[str, Any] = {"action": action, "adaptedBy": active.name}

    if action in NEEDS_SUMMARY:
        categories = sorted(
            {
                label["category"]
                for segment in segment_map["segments"]
                for label in segment["labels"]
            }
        )
        summary = active.summarise(segment_map, decision)
        adaptation["summary"] = summary
        adaptation["illustration"] = active.illustrate(summary, categories)

    if action in NEEDS_SUBSTITUTE:
        match = find_substitute(profile, catalog, exclude=exclude)
        if match is not None:
            item, score = match
            adaptation["substitute"] = {
                "assetId": item.asset_id,
                "title": item.title,
                "matchScore": round(score, 3),
                "because": _because(profile, item),
            }

    # An empty slot is a product failure, so it is reported rather than hidden.
    adaptation["slotFilled"] = bool(
        adaptation.get("summary") or adaptation.get("substitute") or action == "allow"
    )
    return adaptation


def _because(profile: dict[str, Any], item: CatalogItem) -> str:
    interest_tokens = {
        token for interest in profile.get("interests", []) for token in tokenise(interest)
    }
    matched = sorted(interest_tokens & item.tokens)
    if matched:
        return f"You said you're interested in {matched[0]}."
    return "Closest match to your declared interests."
