"""Ordered scales drive policy selection, so their behaviour is pinned by tests."""

from __future__ import annotations

import pytest

from project_telos_api.scales import (
    ACTION_ORDER,
    INTENSITY_ORDER,
    action_rank,
    exceeds_threshold,
    intensity_rank,
    least_restrictive,
    most_restrictive,
)


class TestIntensityScale:
    def test_ranks_ascend(self) -> None:
        ranks = [intensity_rank(value) for value in INTENSITY_ORDER]
        assert ranks == sorted(ranks)

    def test_admits_content_at_the_threshold(self) -> None:
        assert exceeds_threshold("suggestive", "suggestive") is False

    def test_admits_content_below_the_threshold(self) -> None:
        assert exceeds_threshold("mild", "strong") is False

    def test_flags_content_above_the_threshold(self) -> None:
        assert exceeds_threshold("explicit", "suggestive") is True

    def test_none_threshold_admits_only_none(self) -> None:
        assert exceeds_threshold("none", "none") is False
        assert exceeds_threshold("mild", "none") is True

    def test_unknown_intensity_raises(self) -> None:
        with pytest.raises(ValueError, match="Unknown intensity"):
            intensity_rank("apocalyptic")


class TestActionScale:
    def test_allow_is_least_and_quarantine_is_most_restrictive(self) -> None:
        assert action_rank("allow") == 0
        assert action_rank("quarantine") == len(ACTION_ORDER) - 1

    def test_picks_least_restrictive(self) -> None:
        assert least_restrictive(["hold", "soften", "quarantine"]) == "soften"

    def test_picks_most_restrictive(self) -> None:
        assert most_restrictive(["soften", "hold", "summarize"]) == "hold"

    def test_defaults_to_allow_when_nothing_to_restrict(self) -> None:
        assert least_restrictive([]) == "allow"
        assert most_restrictive([]) == "allow"

    def test_does_not_mutate_input(self) -> None:
        candidates = ["hold", "soften"]
        least_restrictive(candidates)
        assert candidates == ["hold", "soften"]

    def test_unknown_action_raises(self) -> None:
        with pytest.raises(ValueError, match="Unknown action"):
            action_rank("delete")
