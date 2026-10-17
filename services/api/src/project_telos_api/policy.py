"""Deterministic policy engine.

Turns a segment map plus a declared profile into a decision. Pure: no I/O, no
model calls, no clock beyond the timestamp passed in, so every outcome is
reproducible and testable.

Rules are applied in a fixed order and the first match wins:

1. Suspected non-consensual synthetic imagery is quarantined.
2. Segments whose labels stay at or below the profile threshold are admitted.
3. A context label the profile admits (medical education, news reporting) can
   rescue a segment a blunt filter would destroy -- unless the viewer gave a
   personal reason for that boundary, which outranks a generic allowance.
4. Otherwise the least restrictive effective action is chosen from how much of
   the asset is affected.
5. A bait pattern, or engineered pacing against a boundary the viewer explained,
   forces a deliberate tap.

A decision governs what one viewer sees under their own profile. It is never a
legal determination about the content or its creator.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Final, Iterable, Sequence

from project_telos_api.scales import exceeds_threshold, most_restrictive

# Above this share of the asset, skipping segments stops being sensible and the
# item is held as a whole instead.
SOFTEN_MAX_COVERAGE: Final[float] = 0.5

# Context labels that fully admit an otherwise-flagged category. Anatomy in a
# medical context is education, not explicit content.
CONTEXT_ADMITS: Final[dict[str, frozenset[str]]] = {
    "medical_education": frozenset({"sexual", "graphic_injury", "violence"}),
    "art_classical": frozenset({"sexual"}),
    "news_reporting": frozenset(),
}

QUARANTINE_CATEGORIES: Final[frozenset[str]] = frozenset({"sexual"})


@dataclass(frozen=True)
class FlaggedSegment:
    """A segment that exceeds what the profile admits."""

    start_sec: float
    end_sec: float
    category: str
    intensity: str
    confidence: float

    @property
    def duration(self) -> float:
        return max(0.0, self.end_sec - self.start_sec)


def _thresholds(profile: dict[str, Any]) -> dict[str, str]:
    return {
        boundary["category"]: boundary["intensityThreshold"]
        for boundary in profile.get("avoid", [])
    }


def reasoned_categories(profile: dict[str, Any]) -> set[str]:
    """Categories the viewer explained rather than merely listed.

    A stated reason is a stronger signal than a category label, so it outranks
    generic contextual allowances and escalates on engineered pacing.
    """
    return {
        boundary["category"]
        for boundary in profile.get("avoid", [])
        if boundary.get("reason")
    }


def _segment_categories(segment: dict[str, Any]) -> set[str]:
    return {label["category"] for label in segment["labels"]}


def _rescuing_context(
    segment: dict[str, Any], admitted: Sequence[str], category: str
) -> str | None:
    """The admitted context label that covers this category, if any."""
    for context_label in _segment_categories(segment) & set(admitted):
        if category in CONTEXT_ADMITS.get(context_label, frozenset()):
            return context_label
    return None


def _has_admitted_context(segment: dict[str, Any], admitted: Sequence[str]) -> bool:
    """True when the segment carries a recognised context label the profile admits.

    Only labels in CONTEXT_ADMITS count. An admitted category that is not a
    context label, such as advertising, must not rescue anything.
    """
    return bool(_segment_categories(segment) & set(admitted) & set(CONTEXT_ADMITS))


def find_flagged(profile: dict[str, Any], segment_map: dict[str, Any]) -> list[FlaggedSegment]:
    """Segments exceeding the profile, after context rescues are applied."""
    thresholds = _thresholds(profile)
    admitted = profile.get("allowContextually", [])
    explained = reasoned_categories(profile)
    flagged: list[FlaggedSegment] = []

    for segment in segment_map["segments"]:
        for label in segment["labels"]:
            category = label["category"]
            threshold = thresholds.get(category)
            if threshold is None:
                continue
            if not exceeds_threshold(label["intensity"], threshold):
                continue
            # Rule 3: a personal reason outranks a generic contextual allowance.
            if category not in explained and _rescuing_context(segment, admitted, category):
                continue
            flagged.append(
                FlaggedSegment(
                    start_sec=segment["startSec"],
                    end_sec=segment["endSec"],
                    category=category,
                    intensity=label["intensity"],
                    confidence=segment["confidence"],
                )
            )
    return flagged


def _coverage(flagged: Iterable[FlaggedSegment], duration_sec: float) -> float:
    if duration_sec <= 0:
        return 1.0
    return min(1.0, sum(segment.duration for segment in flagged) / duration_sec)


def _format_time(seconds: float) -> str:
    minutes, secs = divmod(int(seconds), 60)
    return f"{minutes}:{secs:02d}"


def _format_ranges(flagged: Sequence[FlaggedSegment]) -> str:
    return ", ".join(
        f"{_format_time(segment.start_sec)} to {_format_time(segment.end_sec)}"
        for segment in flagged
    )


def _readable(category: str) -> str:
    return category.replace("_", " ")


def _should_quarantine(profile: dict[str, Any], segment_map: dict[str, Any]) -> bool:
    if not segment_map["signals"].get("syntheticSuspected"):
        return False
    thresholds = _thresholds(profile)
    for segment in segment_map["segments"]:
        for label in segment["labels"]:
            if label["category"] in QUARANTINE_CATEGORIES and exceeds_threshold(
                label["intensity"], thresholds.get(label["category"], "none")
            ):
                return True
    return False


def decide(
    profile: dict[str, Any],
    segment_map: dict[str, Any],
    *,
    decided_at: datetime | None = None,
) -> dict[str, Any]:
    """Returns a Decision for one asset under one profile.

    The payload matches the Decision contract and is safe to validate directly.
    """
    timestamp = (decided_at or datetime.now(timezone.utc)).isoformat().replace("+00:00", "Z")

    def build(
        action: str,
        reason: str,
        confidence: float,
        ranges: Sequence[FlaggedSegment] = (),
        alternatives: Sequence[str] = (),
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "assetHash": segment_map["assetHash"],
            "profileId": profile["id"],
            "action": action,
            "affectedRanges": [
                {"startSec": segment.start_sec, "endSec": segment.end_sec} for segment in ranges
            ],
            "reason": reason,
            "confidence": round(confidence, 4),
            "createdAt": timestamp,
        }
        if alternatives:
            payload["alternatives"] = list(alternatives)
        return payload

    if _should_quarantine(profile, segment_map):
        return build(
            "quarantine",
            "This looks like synthetic intimate imagery of a real person. It is held "
            "and reporting options are available.",
            confidence=max(s["confidence"] for s in segment_map["segments"]),
        )

    flagged = find_flagged(profile, segment_map)

    if not flagged:
        return build(
            "allow",
            "Nothing here crosses the boundaries you set.",
            confidence=min(s["confidence"] for s in segment_map["segments"]),
        )

    confidence = max(segment.confidence for segment in flagged)
    categories = sorted({segment.category for segment in flagged})
    coverage = _coverage(flagged, segment_map["durationSec"])
    bait = bool(segment_map["signals"].get("baitPattern"))
    engineered = bool(segment_map["signals"].get("engineeredPacing"))
    admitted = profile.get("allowContextually", [])
    explained = reasoned_categories(profile)

    # Rule 3: an admitted context keeps the information even when the imagery cannot stay.
    contextual = [
        segment
        for segment in flagged
        if segment.category not in explained
        and _has_admitted_context(_as_segment(segment, segment_map), admitted)
    ]
    if contextual:
        reason = (
            f"This contains {_readable(categories[0])} imagery between "
            f"{_format_ranges(flagged)}. Your {profile['name']} profile allows this kind of "
            "reporting but asks to avoid the imagery, so the story is kept as a summary instead."
        )
        return build("reframe", reason, confidence, flagged, alternatives=["summarize", "hold"])

    if coverage <= SOFTEN_MAX_COVERAGE:
        candidate = "soften"
        reason = (
            f"{_readable(categories[0]).capitalize()} content between {_format_ranges(flagged)}. "
            "That section is skipped and the rest plays."
        )
        alternatives = ["hold", "replace"]
    else:
        candidate = "hold"
        reason = (
            f"Most of this is {_readable(categories[0])}, which your "
            f"{profile['name']} profile asks to avoid."
        )
        alternatives = ["replace", "quarantine"]

    # Rule 5: an asset that misrepresents itself must not play through unattended.
    explained_flag = [segment for segment in flagged if segment.category in explained]
    if bait:
        action = most_restrictive([candidate, "hold"])
        if action != candidate:
            reason = (
                f"This starts as something else, then shows {_readable(categories[0])} "
                f"content at {_format_ranges(flagged)}. Tap if you still want to see it."
            )
    elif engineered and explained_flag:
        # Urgency mechanics aimed at a boundary the viewer explained.
        action = most_restrictive([candidate, "hold"])
        if action != candidate:
            reason = (
                f"This uses urgency tactics around {_readable(explained_flag[0].category)}, "
                "which you asked to avoid and told us why. Tap if you still want to see it."
            )
    else:
        action = candidate

    return build(action, reason, confidence, flagged, alternatives=alternatives)


def _as_segment(flagged: FlaggedSegment, segment_map: dict[str, Any]) -> dict[str, Any]:
    """Recovers the source segment for a flag, so context labels can be inspected."""
    for segment in segment_map["segments"]:
        if segment["startSec"] == flagged.start_sec and segment["endSec"] == flagged.end_sec:
            return segment
    return {"labels": []}
