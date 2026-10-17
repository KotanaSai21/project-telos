"""Provider interfaces.

Understanding can come from committed fixtures, an AI Studio key, or Vertex AI.
All three satisfy the same protocols, so the rest of the application never knows
which one is active and the demo can run with no cloud account at all.
"""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class ProfileExtractor(Protocol):
    """Turns one spoken or typed sentence into a ConsentProfile."""

    name: str

    def extract(self, utterance: str, *, profile_id: str, context: str) -> dict[str, Any]:
        """Returns a payload matching the ConsentProfile contract."""
        ...


@runtime_checkable
class ContentAnalyzer(Protocol):
    """Turns an asset into a SegmentMap: a timeline of meaning, not one verdict."""

    name: str

    def analyze(self, asset_id: str) -> dict[str, Any]:
        """Returns a payload matching the SegmentMap contract."""
        ...


class ProviderUnavailableError(RuntimeError):
    """Raised when a provider is selected but cannot be used."""
