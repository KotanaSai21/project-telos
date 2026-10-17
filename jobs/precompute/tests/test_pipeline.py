"""The media pipeline must find real cuts in real files.

These tests decode actual MP4s rather than reading fixtures, so a regression in
shot detection cannot hide behind hand-authored data.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from project_telos_precompute.analyze import PaletteLabeller, analyse, asset_hash
from project_telos_precompute.sampling import extract_keyframes, plan_sample_times
from project_telos_precompute.shots import DEFAULT_CUT_THRESHOLD, detect_cuts, probe, shots_from_cuts
from project_telos_precompute.synth import CORPUS_BY_ID, ClipSpec, Scene, generate_clip

TOLERANCE_SEC = 1.0


@pytest.fixture(scope="module")
def switch_clip(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """The flagship clip: cooking, explicit 14-21, cooking."""
    directory = tmp_path_factory.mktemp("media")
    return generate_clip(CORPUS_BY_ID["cooking-switch"], directory / "cooking-switch.mp4")


@pytest.fixture(scope="module")
def clean_clip(tmp_path_factory: pytest.TempPathFactory) -> Path:
    directory = tmp_path_factory.mktemp("media")
    return generate_clip(CORPUS_BY_ID["cooking-clean"], directory / "cooking-clean.mp4")


class TestGeneration:
    def test_writes_a_playable_file(self, switch_clip: Path) -> None:
        assert switch_clip.is_file()
        assert switch_clip.stat().st_size > 1000

    def test_duration_matches_the_spec(self, switch_clip: Path) -> None:
        assert probe(switch_clip).duration_sec == pytest.approx(47, abs=0.2)

    def test_is_reproducible(self, tmp_path: Path) -> None:
        """A seeded clip must hash identically, or caching by content breaks."""
        spec = CORPUS_BY_ID["cooking-switch"]
        first = generate_clip(spec, tmp_path / "a.mp4")
        second = generate_clip(spec, tmp_path / "b.mp4")
        assert asset_hash(first) == asset_hash(second)

    def test_ground_truth_lists_the_cuts(self) -> None:
        assert CORPUS_BY_ID["cooking-switch"].cut_seconds == [14, 21]


class TestShotDetection:
    """Verification check V2, measured against media we generated."""

    def test_finds_both_cuts(self, switch_clip: Path) -> None:
        cuts = detect_cuts(switch_clip)
        assert len(cuts) == 2

    def test_locates_the_onset_within_tolerance(self, switch_clip: Path) -> None:
        detected = [cut.time_sec for cut in detect_cuts(switch_clip)]
        for expected, actual in zip([14, 21], detected):
            assert abs(actual - expected) <= TOLERANCE_SEC

    def test_reports_no_cuts_in_a_single_shot_clip(self, clean_clip: Path) -> None:
        assert detect_cuts(clean_clip) == []

    def test_cut_scores_sit_far_above_the_threshold(self, switch_clip: Path) -> None:
        """A tuned-to-the-edge threshold would be fragile; this asserts headroom."""
        for cut in detect_cuts(switch_clip):
            assert cut.score > DEFAULT_CUT_THRESHOLD * 2

    def test_intra_shot_motion_does_not_trigger_a_cut(self, clean_clip: Path) -> None:
        """The clip contains a moving bar and per-frame noise throughout."""
        assert detect_cuts(clean_clip, threshold=DEFAULT_CUT_THRESHOLD) == []

    def test_shots_cover_the_whole_asset(self, switch_clip: Path) -> None:
        info = probe(switch_clip)
        shots = shots_from_cuts(detect_cuts(switch_clip), info.duration_sec)
        assert shots[0][0] == 0.0
        assert shots[-1][1] == pytest.approx(info.duration_sec, abs=0.01)
        for (_, end), (start, _) in zip(shots, shots[1:]):
            assert end == start


class TestSampling:
    def test_samples_the_opening(self) -> None:
        planned = plan_sample_times([], duration_sec=30)
        assert planned[0] == (0.0, "opening")

    def test_samples_just_after_each_cut(self) -> None:
        planned = dict(plan_sample_times([14.0], duration_sec=47))
        assert planned[14.3] == "shot_boundary"

    def test_periodic_floor_covers_a_long_shot(self) -> None:
        """Gradual transitions never produce a cut, so a floor is required."""
        reasons = [reason for _, reason in plan_sample_times([], duration_sec=30)]
        assert reasons.count("periodic_floor") >= 5

    def test_never_samples_past_the_end(self) -> None:
        for time_sec, _ in plan_sample_times([29.9], duration_sec=30):
            assert time_sec < 30

    def test_extracts_a_frame_per_planned_time(self, switch_clip: Path) -> None:
        planned = plan_sample_times([14.0, 21.0], duration_sec=47)
        keyframes = extract_keyframes(switch_clip, planned)
        assert len(keyframes) == len(planned)


class TestAnalysis:
    def test_produces_a_valid_segment_map(self, switch_clip: Path) -> None:
        from project_telos_api.contracts import assert_valid

        assert_valid("SegmentMap", analyse(switch_clip))

    def test_segments_match_the_scenes(self, switch_clip: Path) -> None:
        segments = analyse(switch_clip)["segments"]
        assert len(segments) == 3
        assert segments[1]["startSec"] == pytest.approx(14, abs=TOLERANCE_SEC)
        assert segments[1]["endSec"] == pytest.approx(21, abs=TOLERANCE_SEC)

    def test_labels_the_flagged_section(self, switch_clip: Path) -> None:
        segments = analyse(switch_clip)["segments"]
        categories = {label["category"] for label in segments[1]["labels"]}
        assert "sexual" in categories

    def test_detects_the_bait_pattern(self, switch_clip: Path) -> None:
        assert analyse(switch_clip)["signals"]["baitPattern"] is True

    def test_single_shot_clip_is_not_bait(self, clean_clip: Path) -> None:
        assert analyse(clean_clip)["signals"]["baitPattern"] is False

    def test_hash_is_content_addressed(self, switch_clip: Path) -> None:
        assert analyse(switch_clip)["assetHash"] == asset_hash(switch_clip)

    def test_is_deterministic(self, switch_clip: Path) -> None:
        first = analyse(switch_clip)
        second = analyse(switch_clip)
        assert first["segments"] == second["segments"]


class TestMultiLabel:
    """Context labels must survive analysis, or the rescue rules cannot fire."""

    def test_news_footage_keeps_its_reporting_label(self, tmp_path: Path) -> None:
        spec = CORPUS_BY_ID["news-graphic"]
        clip = generate_clip(spec, tmp_path / "news.mp4")
        segments = analyse(clip)["segments"]

        categories = {label["category"] for label in segments[1]["labels"]}
        assert categories == {"news_reporting", "graphic_injury"}

    def test_anatomy_carries_both_education_and_nudity(self, tmp_path: Path) -> None:
        clip = generate_clip(CORPUS_BY_ID["anatomy-lesson"], tmp_path / "anatomy.mp4")
        categories = {
            label["category"] for label in analyse(clip)["segments"][0]["labels"]
        }
        assert categories == {"medical_education", "sexual"}


class TestGradualTransition:
    def test_a_slow_fade_is_not_reported_as_a_cut(self, tmp_path: Path) -> None:
        """Honest limitation: histogram deltas only find hard cuts."""
        spec = ClipSpec(
            asset_id="fade",
            scenes=[Scene("cooking", 0, 4), Scene("cooking", 4, 8)],
            seed=99,
        )
        clip = generate_clip(spec, tmp_path / "fade.mp4")
        assert detect_cuts(clip) == []
