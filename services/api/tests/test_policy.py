"""Golden tests for the policy engine.

A fixed profile plus a fixed segment map must always produce the same action.
These cases double as verification checks V2, V4, and V5 from the task board.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pytest

from project_telos_api.contracts import assert_valid
from project_telos_api.policy import SOFTEN_MAX_COVERAGE, decide, find_flagged

FIXED_TIME = datetime(2026, 9, 30, 9, 5, 0, tzinfo=timezone.utc)


def _corpus_dir() -> Path:
    for parent in Path(__file__).resolve().parents:
        candidate = parent / "corpus"
        if candidate.is_dir():
            return candidate
    raise FileNotFoundError("Could not locate the corpus directory")


@pytest.fixture(scope="module")
def manifest() -> dict[str, Any]:
    return json.loads((_corpus_dir() / "manifest.json").read_text(encoding="utf-8"))


@pytest.fixture
def segments():  # type: ignore[no-untyped-def]
    def _load(asset_id: str) -> dict[str, Any]:
        return json.loads(
            (_corpus_dir() / "segments" / f"{asset_id}.json").read_text(encoding="utf-8")
        )

    return _load


@pytest.fixture
def work_profile(load_fixture) -> dict[str, Any]:  # type: ignore[no-untyped-def]
    return load_fixture("consent-profile.valid.json")


@pytest.fixture
def family_profile(work_profile: dict[str, Any]) -> dict[str, Any]:
    """Stricter, and without the contextual allowances the Work profile carries."""
    return {
        **work_profile,
        "id": "profile-family-demo",
        "name": "Family",
        "context": "family",
        "avoid": [
            {"category": "sexual", "intensityThreshold": "none"},
            {"category": "graphic_injury", "intensityThreshold": "none"},
            {"category": "gambling", "intensityThreshold": "none"},
        ],
        "allowContextually": [],
    }


GOLDEN_CASES = [
    ("cooking-clean", "allow"),
    ("cooking-switch", "hold"),
    ("news-graphic", "reframe"),
    ("anatomy-lesson", "allow"),
    ("gambling-promo", "hold"),
    ("synthetic-intimate", "quarantine"),
]


class TestGoldenCases:
    @pytest.mark.parametrize(("asset_id", "expected"), GOLDEN_CASES)
    def test_expected_action(self, asset_id, expected, work_profile, segments) -> None:  # type: ignore[no-untyped-def]
        decision = decide(work_profile, segments(asset_id), decided_at=FIXED_TIME)
        assert decision["action"] == expected

    @pytest.mark.parametrize(("asset_id", "_expected"), GOLDEN_CASES)
    def test_decision_matches_the_contract(self, asset_id, _expected, work_profile, segments) -> None:  # type: ignore[no-untyped-def]
        assert_valid("Decision", decide(work_profile, segments(asset_id), decided_at=FIXED_TIME))

    @pytest.mark.parametrize(("asset_id", "_expected"), GOLDEN_CASES)
    def test_is_deterministic(self, asset_id, _expected, work_profile, segments) -> None:  # type: ignore[no-untyped-def]
        segment_map = segments(asset_id)
        first = decide(work_profile, segment_map, decided_at=FIXED_TIME)
        second = decide(work_profile, segment_map, decided_at=FIXED_TIME)
        assert first == second

    def test_manifest_ground_truth_matches_the_engine(self, manifest, work_profile, segments) -> None:  # type: ignore[no-untyped-def]
        """The corpus records its own expected outcome; the engine must agree."""
        checked = 0
        for asset in manifest["assets"]:
            expected = asset["groundTruth"]["expectedUnderWorkProfile"]
            path = _corpus_dir() / "segments" / f"{asset['id']}.json"
            if not path.exists():
                continue
            decision = decide(work_profile, segments(asset["id"]), decided_at=FIXED_TIME)
            assert decision["action"] == expected, asset["id"]
            checked += 1
        assert checked >= 6


class TestMidClipPrecision:
    """Verification check V2: the switch must be located, not merely detected."""

    def test_flags_only_the_switched_range(self, work_profile, segments) -> None:  # type: ignore[no-untyped-def]
        decision = decide(work_profile, segments("cooking-switch"), decided_at=FIXED_TIME)
        assert decision["affectedRanges"] == [{"startSec": 14, "endSec": 21}]

    def test_onset_matches_manifest_ground_truth(self, manifest, work_profile, segments) -> None:  # type: ignore[no-untyped-def]
        asset = next(a for a in manifest["assets"] if a["id"] == "cooking-switch")
        expected_switch = asset["groundTruth"]["switchSec"]

        decision = decide(work_profile, segments("cooking-switch"), decided_at=FIXED_TIME)
        onset = decision["affectedRanges"][0]["startSec"]
        assert abs(onset - expected_switch) <= 1

    def test_the_clean_opening_is_not_flagged(self, work_profile, segments) -> None:  # type: ignore[no-untyped-def]
        flagged = find_flagged(work_profile, segments("cooking-switch"))
        assert all(segment.start_sec >= 14 for segment in flagged)


class TestFalsePositives:
    """Verification check V4: over-blocking is a defect, not caution."""

    def test_anatomy_education_is_admitted(self, work_profile, segments) -> None:  # type: ignore[no-untyped-def]
        decision = decide(work_profile, segments("anatomy-lesson"), decided_at=FIXED_TIME)
        assert decision["action"] == "allow"
        assert decision["affectedRanges"] == []

    def test_journalism_keeps_its_information(self, work_profile, segments) -> None:  # type: ignore[no-untyped-def]
        decision = decide(work_profile, segments("news-graphic"), decided_at=FIXED_TIME)
        assert decision["action"] == "reframe"
        assert "summary" in decision["reason"].lower()

    def test_ordinary_content_passes_untouched(self, work_profile, segments) -> None:  # type: ignore[no-untyped-def]
        decision = decide(work_profile, segments("cooking-clean"), decided_at=FIXED_TIME)
        assert decision["action"] == "allow"


class TestContextSensitivity:
    """Verification check V5: the same asset, different profiles, different outcomes."""

    def test_anatomy_differs_between_profiles(self, work_profile, family_profile, segments) -> None:  # type: ignore[no-untyped-def]
        segment_map = segments("anatomy-lesson")
        work = decide(work_profile, segment_map, decided_at=FIXED_TIME)
        family = decide(family_profile, segment_map, decided_at=FIXED_TIME)
        assert work["action"] == "allow"
        assert family["action"] != "allow"

    def test_journalism_differs_between_profiles(self, work_profile, family_profile, segments) -> None:  # type: ignore[no-untyped-def]
        segment_map = segments("news-graphic")
        assert decide(work_profile, segment_map, decided_at=FIXED_TIME)["action"] == "reframe"
        assert decide(family_profile, segment_map, decided_at=FIXED_TIME)["action"] != "reframe"

    def test_explicit_content_is_restricted_under_every_profile(
        self, work_profile, family_profile, segments
    ) -> None:  # type: ignore[no-untyped-def]
        segment_map = segments("cooking-switch")
        for profile in (work_profile, family_profile):
            assert decide(profile, segment_map, decided_at=FIXED_TIME)["action"] != "allow"


class TestBaitEscalation:
    def test_bait_forces_a_deliberate_tap(self, work_profile, segments) -> None:  # type: ignore[no-untyped-def]
        """A short flagged range would normally soften; bait makes it hold."""
        segment_map = segments("cooking-switch")
        assert segment_map["signals"]["baitPattern"] is True
        assert decide(work_profile, segment_map, decided_at=FIXED_TIME)["action"] == "hold"

    def test_without_bait_the_same_asset_softens(self, work_profile, segments) -> None:  # type: ignore[no-untyped-def]
        segment_map = segments("cooking-switch")
        segment_map["signals"]["baitPattern"] = False
        assert decide(work_profile, segment_map, decided_at=FIXED_TIME)["action"] == "soften"

    def test_bait_reason_explains_the_misrepresentation(self, work_profile, segments) -> None:  # type: ignore[no-untyped-def]
        decision = decide(work_profile, segments("cooking-switch"), decided_at=FIXED_TIME)
        assert "starts as something else" in decision["reason"]


class TestCoverageThreshold:
    def test_small_coverage_softens(self, work_profile, segments) -> None:  # type: ignore[no-untyped-def]
        segment_map = segments("cooking-switch")
        segment_map["signals"]["baitPattern"] = False
        coverage = 7 / segment_map["durationSec"]
        assert coverage < SOFTEN_MAX_COVERAGE
        assert decide(work_profile, segment_map, decided_at=FIXED_TIME)["action"] == "soften"

    def test_whole_asset_coverage_holds(self, work_profile, segments) -> None:  # type: ignore[no-untyped-def]
        assert decide(work_profile, segments("gambling-promo"), decided_at=FIXED_TIME)["action"] == "hold"


class TestReasonWording:
    """The reason is shown to a viewer, so its wording is part of the contract."""

    @pytest.mark.parametrize(("asset_id", "_expected"), GOLDEN_CASES)
    def test_never_claims_legal_authority(self, asset_id, _expected, work_profile, segments) -> None:  # type: ignore[no-untyped-def]
        reason = decide(work_profile, segments(asset_id), decided_at=FIXED_TIME)["reason"].lower()
        for forbidden in ("illegal", "unlawful", "crime", "criminal", "prohibited by law"):
            assert forbidden not in reason

    @pytest.mark.parametrize(("asset_id", "_expected"), GOLDEN_CASES)
    def test_reason_is_present_and_readable(self, asset_id, _expected, work_profile, segments) -> None:  # type: ignore[no-untyped-def]
        reason = decide(work_profile, segments(asset_id), decided_at=FIXED_TIME)["reason"]
        assert 10 < len(reason) <= 500
        assert reason[0].isupper()
        assert reason.endswith(".")

    def test_timestamps_are_human_readable(self, work_profile, segments) -> None:  # type: ignore[no-untyped-def]
        reason = decide(work_profile, segments("cooking-switch"), decided_at=FIXED_TIME)["reason"]
        assert "0:14" in reason and "0:21" in reason


class TestQuarantine:
    def test_synthetic_intimate_imagery_is_quarantined(self, work_profile, segments) -> None:  # type: ignore[no-untyped-def]
        assert decide(work_profile, segments("synthetic-intimate"), decided_at=FIXED_TIME)[
            "action"
        ] == "quarantine"

    def test_offers_a_reporting_path(self, work_profile, segments) -> None:  # type: ignore[no-untyped-def]
        reason = decide(work_profile, segments("synthetic-intimate"), decided_at=FIXED_TIME)["reason"]
        assert "reporting" in reason.lower()

    def test_synthetic_flag_alone_does_not_quarantine(self, work_profile, segments) -> None:  # type: ignore[no-untyped-def]
        """Synthetic media is not inherently harmful; the category matters."""
        segment_map = segments("cooking-clean")
        segment_map["signals"]["syntheticSuspected"] = True
        assert decide(work_profile, segment_map, decided_at=FIXED_TIME)["action"] == "allow"


class TestPurity:
    def test_does_not_mutate_its_inputs(self, work_profile, segments) -> None:  # type: ignore[no-untyped-def]
        segment_map = segments("cooking-switch")
        profile_before = json.dumps(work_profile, sort_keys=True)
        segments_before = json.dumps(segment_map, sort_keys=True)

        decide(work_profile, segment_map, decided_at=FIXED_TIME)

        assert json.dumps(work_profile, sort_keys=True) == profile_before
        assert json.dumps(segment_map, sort_keys=True) == segments_before

    def test_profile_without_boundaries_allows_everything(self, work_profile, segments) -> None:  # type: ignore[no-untyped-def]
        open_profile = {**work_profile, "avoid": []}
        assert decide(open_profile, segments("cooking-switch"), decided_at=FIXED_TIME)["action"] == "allow"
