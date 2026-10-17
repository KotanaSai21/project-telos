"""Deleting a profile must take everything derived from it."""

from __future__ import annotations

from pathlib import Path

import pytest

from project_telos_api.store import Store


@pytest.fixture
def store(tmp_path: Path) -> Store:
    return Store(tmp_path)


@pytest.fixture
def populated(store: Store, load_fixture) -> Store:  # type: ignore[no-untyped-def]
    profile = load_fixture("consent-profile.valid.json")
    store.save_profile(profile)
    store.save_decision(load_fixture("decision.valid.json"))
    store.record_event(
        {
            "sessionId": "s1",
            "assetHash": "b7e1c4a90f3d2e88",
            "action": "soften",
            "revealedByUser": False,
            "timestamp": "2026-09-30T09:05:00Z",
        }
    )
    return store


class TestForgetProfile:
    def test_removes_the_profile(self, populated: Store) -> None:
        assert populated.forget_profile("profile-work-demo") is True
        assert populated.profiles.get("profile-work-demo") is None

    def test_removes_decisions(self, populated: Store) -> None:
        populated.forget_profile("profile-work-demo")
        assert populated.decisions.list() == []

    def test_removes_receipt_events(self, populated: Store) -> None:
        populated.forget_profile("profile-work-demo")
        assert populated.receipt.all() == []

    def test_reports_false_for_an_unknown_profile(self, store: Store) -> None:
        assert store.forget_profile("profile-missing") is False

    def test_leaves_other_profiles_intact(self, populated: Store, load_fixture) -> None:  # type: ignore[no-untyped-def]
        other = {**load_fixture("consent-profile.valid.json"), "id": "profile-other"}
        populated.save_profile(other)

        populated.forget_profile("profile-work-demo")

        assert populated.profiles.get("profile-other") is not None


class TestAtomicDelete:
    def test_delete_reports_whether_it_removed_anything(self, store: Store, load_fixture) -> None:  # type: ignore[no-untyped-def]
        store.save_profile(load_fixture("consent-profile.valid.json"))
        assert store.profiles.delete("profile-work-demo") is True
        assert store.profiles.delete("profile-work-demo") is False

    def test_delete_leaves_no_temp_files(self, store: Store, tmp_path: Path, load_fixture) -> None:  # type: ignore[no-untyped-def]
        store.save_profile(load_fixture("consent-profile.valid.json"))
        store.profiles.delete("profile-work-demo")
        assert list(tmp_path.glob("*.tmp")) == []

    def test_remove_where_counts_removals(self, store: Store) -> None:
        for session in ("a", "a", "b"):
            store.record_event(
                {
                    "sessionId": session,
                    "assetHash": "b7e1c4a90f3d2e88",
                    "action": "allow",
                    "revealedByUser": False,
                    "timestamp": "2026-09-30T09:05:00Z",
                }
            )

        removed = store.receipt.remove_where(lambda event: event["sessionId"] == "a")
        assert removed == 2
        assert len(store.receipt.all()) == 1
