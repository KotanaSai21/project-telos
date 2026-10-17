"""Adaptation helpers used by the controlled Project Telos experience."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from project_telos_api.adapt import (
    CatalogItem,
    LocalAdapter,
    build_adaptation,
    find_substitute,
    score_match,
    tokenise,
)
from project_telos_api.policy import decide
from project_telos_api.providers.local import load_presets


def _corpus_dir() -> Path:
    for parent in Path(__file__).resolve().parents:
        if (parent / "corpus").is_dir():
            return parent / "corpus"
    raise FileNotFoundError("corpus")


@pytest.fixture
def segments():  # type: ignore[no-untyped-def]
    def _load(asset_id: str) -> dict[str, Any]:
        return json.loads((_corpus_dir() / "segments" / f"{asset_id}.json").read_text("utf-8"))

    return _load


@pytest.fixture
def presets() -> dict[str, dict[str, Any]]:
    return {preset["context"]: preset for preset in load_presets()}


CATALOG = [
    CatalogItem("aviation-approach", "Crosswind landing at Madeira", ("aviation",)),
    CatalogItem("classical-music", "Raga Yaman, evening performance", ("music",)),
    CatalogItem("cooking-clean", "One-pan garlic noodles", ("cooking",)),
]


class TestInterestMatching:
    def test_tokenises_without_stopwords(self) -> None:
        assert tokenise("The art of aviation") == {"art", "aviation"}

    def test_scores_a_matching_interest(self) -> None:
        assert score_match(["aviation"], CATALOG[0]) > 0

    def test_scores_an_unrelated_item_at_zero(self) -> None:
        assert score_match(["aviation"], CATALOG[1]) == 0

    def test_empty_interests_score_zero(self) -> None:
        assert score_match([], CATALOG[0]) == 0

    def test_picks_the_best_match(self) -> None:
        match = find_substitute({"interests": ["aviation"]}, CATALOG)
        assert match is not None
        assert match[0].asset_id == "aviation-approach"

    def test_matches_a_multi_word_interest(self) -> None:
        match = find_substitute({"interests": ["Indian classical music"]}, CATALOG)
        assert match is not None
        assert match[0].asset_id == "classical-music"

    def test_returns_none_when_nothing_fits(self) -> None:
        """A bad substitute is worse than an honest gap."""
        assert find_substitute({"interests": ["deep sea welding"]}, CATALOG) is None

    def test_excludes_the_held_item(self) -> None:
        match = find_substitute(
            {"interests": ["aviation"]}, CATALOG, exclude={"aviation-approach"}
        )
        assert match is None

    def test_is_deterministic(self) -> None:
        profile = {"interests": ["aviation", "music"]}
        first = find_substitute(profile, CATALOG)
        second = find_substitute(profile, CATALOG)
        assert first is not None and second is not None
        assert first[0].asset_id == second[0].asset_id


class TestAdaptation:
    def test_held_item_gets_a_substitute(self, presets, segments) -> None:  # type: ignore[no-untyped-def]
        """The core claim: no slot is left empty."""
        profile = presets["work"]
        segment_map = segments("gambling-promo")
        decision = decide(profile, segment_map)

        adaptation = build_adaptation(profile, segment_map, decision, catalog=CATALOG)

        assert decision["action"] == "hold"
        assert adaptation["substitute"]["assetId"] == "aviation-approach"
        assert adaptation["slotFilled"] is True

    def test_substitute_explains_itself(self, presets, segments) -> None:  # type: ignore[no-untyped-def]
        profile = presets["work"]
        segment_map = segments("gambling-promo")
        adaptation = build_adaptation(
            profile, segment_map, decide(profile, segment_map), catalog=CATALOG
        )
        assert "interested in" in adaptation["substitute"]["because"]

    def test_reframed_item_gets_a_summary_and_illustration(self, presets, segments) -> None:  # type: ignore[no-untyped-def]
        profile = presets["work"]
        segment_map = segments("news-graphic")
        decision = decide(profile, segment_map)

        adaptation = build_adaptation(profile, segment_map, decision, catalog=CATALOG)

        assert decision["action"] == "reframe"
        assert len(adaptation["summary"]) > 20
        assert adaptation["illustration"].startswith("data:image/svg+xml;base64,")

    def test_summary_preserves_the_subject(self, presets, segments) -> None:  # type: ignore[no-untyped-def]
        profile = presets["work"]
        segment_map = segments("news-graphic")
        summary = LocalAdapter().summarise(segment_map, decide(profile, segment_map))
        assert "news reporting" in summary
        assert "withheld" in summary

    def test_allowed_item_needs_no_adaptation(self, presets, segments) -> None:  # type: ignore[no-untyped-def]
        profile = presets["work"]
        segment_map = segments("cooking-clean")
        adaptation = build_adaptation(
            profile, segment_map, decide(profile, segment_map), catalog=CATALOG
        )
        assert adaptation["slotFilled"] is True
        assert "substitute" not in adaptation

    def test_reports_an_unfilled_slot_honestly(self, segments) -> None:  # type: ignore[no-untyped-def]
        profile = {
            "id": "p",
            "name": "Personal",
            "interests": [],
            "avoid": [{"category": "gambling", "intensityThreshold": "none"}],
            "allowContextually": [],
        }
        segment_map = segments("gambling-promo")
        adaptation = build_adaptation(profile, segment_map, decide(profile, segment_map), catalog=[])
        assert adaptation["slotFilled"] is False

    def test_illustration_is_deterministic(self) -> None:
        adapter = LocalAdapter()
        assert adapter.illustrate("a summary", ["news"]) == adapter.illustrate(
            "a summary", ["news"]
        )
