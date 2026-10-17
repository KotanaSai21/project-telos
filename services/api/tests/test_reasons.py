"""A stated reason must change reasoning, not just be recorded."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pytest

from project_telos_api.policy import decide, reasoned_categories
from project_telos_api.providers.local import LocalProfileExtractor, load_presets

FIXED_TIME = datetime(2026, 9, 30, 9, 5, 0, tzinfo=timezone.utc)


def _corpus_dir() -> Path:
    for parent in Path(__file__).resolve().parents:
        candidate = parent / "corpus"
        if candidate.is_dir():
            return candidate
    raise FileNotFoundError("Could not locate the corpus directory")


@pytest.fixture
def segments():  # type: ignore[no-untyped-def]
    def _load(asset_id: str) -> dict[str, Any]:
        return json.loads(
            (_corpus_dir() / "segments" / f"{asset_id}.json").read_text(encoding="utf-8")
        )

    return _load


class TestReasonCapture:
    def test_captures_the_clause_that_explained_the_boundary(self) -> None:
        profile = LocalProfileExtractor().extract(
            "No gambling, I'm in recovery. Also no explicit content.",
            profile_id="p",
            context="personal",
        )
        gambling = next(b for b in profile["avoid"] if b["category"] == "gambling")
        assert "recovery" in gambling["reason"].lower()

    def test_a_reason_does_not_leak_onto_other_boundaries(self) -> None:
        profile = LocalProfileExtractor().extract(
            "No gambling, I'm in recovery. Also no explicit content.",
            profile_id="p",
            context="personal",
        )
        sexual = next(b for b in profile["avoid"] if b["category"] == "sexual")
        assert "reason" not in sexual

    def test_a_reason_tightens_the_threshold(self) -> None:
        plain = LocalProfileExtractor().extract("No alcohol", profile_id="p", context="personal")
        explained = LocalProfileExtractor().extract(
            "No alcohol because I'm in recovery", profile_id="p", context="personal"
        )
        assert explained["avoid"][0]["intensityThreshold"] == "none"
        assert plain["avoid"][0]["category"] == explained["avoid"][0]["category"]

    def test_no_reason_means_no_reason_field(self) -> None:
        profile = LocalProfileExtractor().extract("No gambling", profile_id="p", context="work")
        assert all("reason" not in b for b in profile["avoid"])

    def test_never_records_a_diagnosis_field(self) -> None:
        """A stated preference is recorded; a clinical condition is never inferred."""
        profile = LocalProfileExtractor().extract(
            "No gambling, I'm in recovery", profile_id="p", context="personal"
        )
        assert "condition" not in json.dumps(profile).lower()
        assert "diagnosis" not in json.dumps(profile).lower()


class TestReasonChangesReasoning:
    """The documented claim: an explained boundary catches more than a listed one."""

    @pytest.fixture
    def listed_only(self) -> dict[str, Any]:
        return {
            "id": "p-listed",
            "name": "Personal",
            "context": "personal",
            "avoid": [{"category": "gambling", "intensityThreshold": "none"}],
            "allowContextually": ["advertising"],
            "interests": [],
            "language": "en",
            "narrate": False,
            "version": 1,
            "updatedAt": "2026-09-30T09:00:00Z",
        }

    @pytest.fixture
    def explained(self, listed_only: dict[str, Any]) -> dict[str, Any]:
        return {
            **listed_only,
            "id": "p-explained",
            "avoid": [
                {
                    "category": "gambling",
                    "intensityThreshold": "none",
                    "reason": "I am in recovery from a gambling addiction",
                }
            ],
        }

    def test_reasoned_categories_are_identified(self, explained, listed_only) -> None:  # type: ignore[no-untyped-def]
        assert reasoned_categories(explained) == {"gambling"}
        assert reasoned_categories(listed_only) == set()

    def test_engineered_pacing_escalates_only_when_explained(
        self, explained, listed_only, segments
    ) -> None:  # type: ignore[no-untyped-def]
        """Countdown urgency is what a category label alone would miss."""
        segment_map = segments("gambling-promo")
        segment_map["durationSec"] = 100  # Force low coverage so the base action is soften.
        segment_map["segments"][0]["endSec"] = 5
        # The signal under test is set here rather than taken from the corpus, so the
        # test covers the policy rule and not the analyser's pacing heuristic.
        segment_map["signals"]["engineeredPacing"] = True

        assert decide(listed_only, segment_map, decided_at=FIXED_TIME)["action"] == "soften"
        assert decide(explained, segment_map, decided_at=FIXED_TIME)["action"] == "hold"

    def test_reason_appears_in_the_explanation(self, explained, segments) -> None:  # type: ignore[no-untyped-def]
        segment_map = segments("gambling-promo")
        segment_map["durationSec"] = 100
        segment_map["segments"][0]["endSec"] = 5
        segment_map["signals"]["engineeredPacing"] = True
        reason = decide(explained, segment_map, decided_at=FIXED_TIME)["reason"]
        assert "told us why" in reason

    def test_a_reason_outranks_a_contextual_allowance(self, segments) -> None:  # type: ignore[no-untyped-def]
        """A generic allowance must not override a boundary the viewer explained."""
        base = {
            "id": "p",
            "name": "Personal",
            "context": "personal",
            "avoid": [{"category": "graphic_injury", "intensityThreshold": "none"}],
            "allowContextually": ["news_reporting"],
            "interests": [],
            "language": "en",
            "narrate": False,
            "version": 1,
            "updatedAt": "2026-09-30T09:00:00Z",
        }
        explained = {
            **base,
            "avoid": [
                {
                    "category": "graphic_injury",
                    "intensityThreshold": "none",
                    "reason": "I was in a serious crash and it is distressing",
                }
            ],
        }
        segment_map = segments("news-graphic")

        assert decide(base, segment_map, decided_at=FIXED_TIME)["action"] == "reframe"
        assert decide(explained, segment_map, decided_at=FIXED_TIME)["action"] != "reframe"


class TestPresets:
    def test_all_presets_are_valid(self) -> None:
        from project_telos_api.contracts import assert_valid

        for preset in load_presets():
            assert_valid("ConsentProfile", preset)

    def test_presets_cover_the_demo_contexts(self) -> None:
        contexts = {preset["context"] for preset in load_presets()}
        assert {"work", "family", "learning"} <= contexts

    def test_the_same_asset_differs_across_presets(self, segments) -> None:  # type: ignore[no-untyped-def]
        """Verification check V5, using the profiles the demo actually switches between."""
        presets = {preset["context"]: preset for preset in load_presets()}
        segment_map = segments("anatomy-lesson")

        work = decide(presets["work"], segment_map, decided_at=FIXED_TIME)["action"]
        family = decide(presets["family"], segment_map, decided_at=FIXED_TIME)["action"]
        learning = decide(presets["learning"], segment_map, decided_at=FIXED_TIME)["action"]

        assert work == "allow"
        assert learning == "allow"
        assert family != "allow"

    def test_recovery_preset_carries_a_reason(self) -> None:
        recovery = next(p for p in load_presets() if p["id"] == "preset-recovery")
        assert reasoned_categories(recovery) == {"gambling"}
