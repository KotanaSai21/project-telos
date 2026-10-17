"""Persistence must validate on write and report honest receipt figures."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from project_telos_api.contracts import ContractValidationError
from project_telos_api.store import Store


@pytest.fixture
def store(tmp_path: Path) -> Store:
    return Store(tmp_path)


def _event(action: str, *, revealed: bool = False, session: str = "s1") -> dict:
    return {
        "sessionId": session,
        "assetHash": "b7e1c4a90f3d2e88",
        "action": action,
        "revealedByUser": revealed,
        "timestamp": "2026-09-30T09:05:00Z",
    }


class TestProfileStorage:
    def test_round_trips_a_profile(self, store: Store, load_fixture) -> None:  # type: ignore[no-untyped-def]
        profile = load_fixture("consent-profile.valid.json")
        store.save_profile(profile)
        assert store.profiles.get(profile["id"]) == profile

    def test_rejects_an_invalid_profile(self, store: Store, load_fixture) -> None:  # type: ignore[no-untyped-def]
        profile = load_fixture("consent-profile.valid.json")
        profile["context"] = "stadium"
        with pytest.raises(ContractValidationError):
            store.save_profile(profile)

    def test_missing_profile_returns_none(self, store: Store) -> None:
        assert store.profiles.get("nope") is None


class TestDecisionStorage:
    def test_round_trips_a_decision(self, store: Store, load_fixture) -> None:  # type: ignore[no-untyped-def]
        decision = load_fixture("decision.valid.json")
        store.save_decision(decision)
        key = f"{decision['profileId']}:{decision['assetHash']}"
        assert store.decisions.get(key) == decision

    def test_rejects_an_invalid_decision(self, store: Store, load_fixture) -> None:  # type: ignore[no-untyped-def]
        decision = load_fixture("decision.valid.json")
        decision["action"] = "delete"
        with pytest.raises(ContractValidationError):
            store.save_decision(decision)


class TestDurability:
    def test_writes_are_atomic(self, store: Store, tmp_path: Path, load_fixture) -> None:  # type: ignore[no-untyped-def]
        """No temp files survive a successful write."""
        store.save_profile(load_fixture("consent-profile.valid.json"))
        assert list(tmp_path.glob("*.tmp")) == []

    def test_file_is_valid_json_on_disk(self, store: Store, tmp_path: Path, load_fixture) -> None:  # type: ignore[no-untyped-def]
        store.save_profile(load_fixture("consent-profile.valid.json"))
        json.loads((tmp_path / "profiles.json").read_text(encoding="utf-8"))


class TestReceiptLog:
    def test_appends_and_filters_by_session(self, store: Store) -> None:
        store.record_event(_event("allow", session="s1"))
        store.record_event(_event("hold", session="s2"))
        assert len(store.receipt.for_session("s1")) == 1
        assert len(store.receipt.all()) == 2

    def test_rejects_an_invalid_event(self, store: Store) -> None:
        event = _event("allow")
        del event["timestamp"]
        with pytest.raises(ContractValidationError):
            store.record_event(event)
