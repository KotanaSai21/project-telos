"""The classifier is the replaceable tier.

These tests cover the SafeSearch mapping without any cloud call, and assert that
a third labeller satisfies the same protocol as the other two.
"""

from __future__ import annotations

import pytest

from project_telos_precompute.analyze import GeminiLabeller, Labeller, PaletteLabeller
from project_telos_precompute.vision import (
    LIKELIHOOD_TO_INTENSITY,
    SafeSearchLabeller,
    confidence_for,
    map_annotation,
)


def annotation(**overrides: str) -> dict[str, str]:
    base = {
        "adult": "VERY_UNLIKELY",
        "racy": "VERY_UNLIKELY",
        "violence": "VERY_UNLIKELY",
        "medical": "VERY_UNLIKELY",
        "spoof": "VERY_UNLIKELY",
    }
    return {**base, **overrides}


class TestLikelihoodMapping:
    @pytest.mark.parametrize(
        ("likelihood", "expected"),
        [
            ("VERY_UNLIKELY", "none"),
            ("UNLIKELY", "none"),
            ("POSSIBLE", "suggestive"),
            ("LIKELY", "strong"),
            ("VERY_LIKELY", "explicit"),
        ],
    )
    def test_buckets_map_onto_the_intensity_scale(self, likelihood, expected) -> None:  # type: ignore[no-untyped-def]
        assert LIKELIHOOD_TO_INTENSITY[likelihood] == expected

    def test_unknown_likelihood_is_treated_as_none(self) -> None:
        assert LIKELIHOOD_TO_INTENSITY["UNKNOWN"] == "none"

    def test_every_bucket_is_a_valid_intensity(self) -> None:
        from project_telos_api.scales import INTENSITY_ORDER

        assert set(LIKELIHOOD_TO_INTENSITY.values()) <= set(INTENSITY_ORDER)


class TestCategoryMapping:
    def test_adult_becomes_sexual(self) -> None:
        labels = map_annotation(annotation(adult="VERY_LIKELY"))
        assert {"category": "sexual", "intensity": "explicit"} in labels

    def test_violence_is_carried_through(self) -> None:
        labels = map_annotation(annotation(violence="LIKELY"))
        assert {"category": "violence", "intensity": "strong"} in labels

    def test_medical_becomes_a_context_label(self) -> None:
        """Without this, a SafeSearch-backed pipeline loses the anatomy rescue."""
        labels = map_annotation(annotation(medical="LIKELY"))
        assert any(label["category"] == "medical_education" for label in labels)

    def test_racy_never_outranks_adult(self) -> None:
        """Racy means suggestive by definition, whatever bucket it lands in."""
        labels = map_annotation(annotation(racy="VERY_LIKELY"))
        sexual = next(label for label in labels if label["category"] == "sexual")
        assert sexual["intensity"] == "suggestive"

    def test_keeps_the_strongest_reading_per_category(self) -> None:
        labels = map_annotation(annotation(adult="VERY_LIKELY", racy="VERY_LIKELY"))
        sexual = [label for label in labels if label["category"] == "sexual"]
        assert len(sexual) == 1
        assert sexual[0]["intensity"] == "explicit"

    def test_clean_frame_reports_nothing_flagged(self) -> None:
        labels = map_annotation(annotation())
        assert labels == [{"category": "unflagged", "intensity": "none"}]

    def test_low_likelihood_is_not_reported(self) -> None:
        """Reporting every UNLIKELY reading would make the profile meaningless."""
        assert map_annotation(annotation(adult="UNLIKELY")) == [
            {"category": "unflagged", "intensity": "none"}
        ]

    def test_labels_are_ordered(self) -> None:
        labels = map_annotation(annotation(violence="LIKELY", adult="LIKELY"))
        assert [label["category"] for label in labels] == sorted(
            label["category"] for label in labels
        )


class TestConfidence:
    def test_a_confident_clean_frame_scores_high(self) -> None:
        assert confidence_for(annotation()) == 0.9

    def test_an_uncertain_frame_scores_lower(self) -> None:
        assert confidence_for(annotation(adult="POSSIBLE")) == 0.5

    def test_confidence_stays_within_the_contract(self) -> None:
        for likelihood in LIKELIHOOD_TO_INTENSITY:
            value = confidence_for(annotation(adult=likelihood))
            assert 0.0 <= value <= 1.0


class TestInterchangeability:
    """The argument made executable: three classifiers, one interface."""

    def test_all_labellers_satisfy_the_protocol(self) -> None:
        assert isinstance(PaletteLabeller(), Labeller)
        assert isinstance(SafeSearchLabeller(client=object()), Labeller)
        assert isinstance(GeminiLabeller(object(), "model", {}), Labeller)

    def test_each_labeller_names_itself(self) -> None:
        names = {
            PaletteLabeller().name,
            SafeSearchLabeller(client=object()).name,
            GeminiLabeller(object(), "model", {}).name,
        }
        assert names == {"palette", "safesearch", "gemini"}

    def test_a_stub_client_needs_no_network(self) -> None:
        """Swapping the classifier must not require credentials to construct."""
        assert SafeSearchLabeller(client=object()).name == "safesearch"
