"""Ordered scales shared with the TypeScript contracts package.

Kept in lockstep with ``packages/contracts/src/scales.ts``. The ordering is
asserted against the schema enums in tests, so drift is caught rather than
silently changing policy behaviour.
"""

from __future__ import annotations

from typing import Final, Sequence

# Ordered least to most intense. A boundary admits content at or below its threshold.
INTENSITY_ORDER: Final[tuple[str, ...]] = ("none", "mild", "suggestive", "strong", "explicit")

# Ordered least to most restrictive.
ACTION_ORDER: Final[tuple[str, ...]] = (
    "allow",
    "soften",
    "summarize",
    "reframe",
    "replace",
    "hold",
    "quarantine",
)


def intensity_rank(value: str) -> int:
    try:
        return INTENSITY_ORDER.index(value)
    except ValueError as exc:
        raise ValueError(f"Unknown intensity: {value!r}") from exc


def action_rank(value: str) -> int:
    try:
        return ACTION_ORDER.index(value)
    except ValueError as exc:
        raise ValueError(f"Unknown action: {value!r}") from exc


def exceeds_threshold(observed: str, threshold: str) -> bool:
    """True when observed intensity is above what the profile admits."""
    return intensity_rank(observed) > intensity_rank(threshold)


def least_restrictive(candidates: Sequence[str]) -> str:
    """The least restrictive candidate. Nothing to restrict means allow."""
    if not candidates:
        return "allow"
    return min(candidates, key=action_rank)


def most_restrictive(candidates: Sequence[str]) -> str:
    """The most restrictive candidate, used when several boundaries match at once."""
    if not candidates:
        return "allow"
    return max(candidates, key=action_rank)
