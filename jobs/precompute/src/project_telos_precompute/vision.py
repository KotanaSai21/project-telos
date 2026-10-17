"""Cloud Vision SafeSearch as a drop-in labeller.

Exists to prove a point about the architecture: detection is a commodity, and
the classifier is the replaceable part. This satisfies the same ``Labeller``
protocol as the Gemini and palette labellers, so swapping it changes nothing in
the policy engine, the gate, the explanations, or the receipt.

SafeSearch returns coarse likelihood buckets. Mapping those onto the intensity
scale is lossy, and the mapping is deliberately explicit rather than hidden
inside a call site.
"""

from __future__ import annotations

from typing import Any, Final

from project_telos_precompute.sampling import Keyframe

# SafeSearch likelihood -> our intensity scale. Coarser than the contract allows,
# which is exactly the limitation of buying detection off the shelf.
LIKELIHOOD_TO_INTENSITY: Final[dict[str, str]] = {
    "UNKNOWN": "none",
    "VERY_UNLIKELY": "none",
    "UNLIKELY": "none",
    "POSSIBLE": "suggestive",
    "LIKELY": "strong",
    "VERY_LIKELY": "explicit",
}

# SafeSearch category -> our category. `racy` collapses into sexual at a lower
# intensity, because SafeSearch has no concept of a context label.
SAFESEARCH_TO_CATEGORY: Final[dict[str, str]] = {
    "adult": "sexual",
    "racy": "sexual",
    "violence": "violence",
    "medical": "medical_education",
    "spoof": "misinformation",
}

# Below this, a category is not worth reporting at all.
REPORTABLE: Final[frozenset[str]] = frozenset({"suggestive", "strong", "explicit"})


def map_annotation(annotation: dict[str, str]) -> list[dict[str, str]]:
    """Turns one SafeSearch result into contract labels.

    Pure, so the mapping is testable without any cloud call.
    """
    labels: list[dict[str, str]] = []

    for field, category in SAFESEARCH_TO_CATEGORY.items():
        likelihood = str(annotation.get(field, "UNKNOWN")).upper()
        intensity = LIKELIHOOD_TO_INTENSITY.get(likelihood, "none")

        if field == "racy" and intensity == "explicit":
            # Racy is suggestive by definition; it must not outrank `adult`.
            intensity = "suggestive"

        if intensity in REPORTABLE:
            labels.append({"category": category, "intensity": intensity})

    if not labels:
        labels.append({"category": "unflagged", "intensity": "none"})

    # One entry per category, keeping the most intense reading.
    from project_telos_api.scales import intensity_rank  # noqa: PLC0415

    strongest: dict[str, dict[str, str]] = {}
    for label in labels:
        current = strongest.get(label["category"])
        if current is None or intensity_rank(label["intensity"]) > intensity_rank(
            current["intensity"]
        ):
            strongest[label["category"]] = label

    return sorted(strongest.values(), key=lambda label: label["category"])


def confidence_for(annotation: dict[str, str]) -> float:
    """SafeSearch gives buckets, not scores, so confidence is bucket-derived."""
    ranks = {"VERY_UNLIKELY": 0.9, "UNLIKELY": 0.7, "POSSIBLE": 0.5, "LIKELY": 0.8}
    values = [
        ranks.get(str(annotation.get(field, "UNKNOWN")).upper(), 0.95)
        for field in SAFESEARCH_TO_CATEGORY
    ]
    return round(min(values), 2)


class SafeSearchLabeller:
    """Classifies each keyframe with Cloud Vision SafeSearch."""

    name = "safesearch"

    def __init__(self, client: Any | None = None) -> None:
        self._client = client or self._build_client()

    @staticmethod
    def _build_client() -> Any:
        try:
            from google.cloud import vision  # noqa: PLC0415
        except ImportError as exc:  # pragma: no cover - exercised only without the SDK
            raise RuntimeError(
                "google-cloud-vision is not installed. Run: pip install google-cloud-vision"
            ) from exc
        return vision.ImageAnnotatorClient()

    def label(self, keyframes: list[Keyframe]) -> list[dict[str, Any]]:
        return [self._label_one(frame) for frame in keyframes]

    def _label_one(self, frame: Keyframe) -> dict[str, Any]:
        from google.cloud import vision  # noqa: PLC0415

        response = self._client.safe_search_detection(
            image=vision.Image(content=frame.to_png())
        )
        annotation = response.safe_search_annotation

        raw = {
            field: vision.Likelihood(getattr(annotation, field)).name
            for field in SAFESEARCH_TO_CATEGORY
        }
        return {"labels": map_annotation(raw), "confidence": confidence_for(raw)}
