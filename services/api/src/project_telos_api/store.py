"""Persistence.

JSON files under the configured data directory by default. Firestore provides the
same interface for Cloud Run: callers use these stores, never a database client.
"""

from __future__ import annotations

import json
import os
import tempfile
import threading
from pathlib import Path
from typing import Any, Callable

from project_telos_api.contracts import assert_valid

_lock = threading.Lock()


def _atomic_write(path: Path, payload: Any) -> None:
    """Writes via a temp file and replace, so a crash cannot leave partial JSON."""
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temp_name = tempfile.mkstemp(dir=str(path.parent), suffix=".tmp")
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as file:
            json.dump(payload, file, indent=2, sort_keys=True)
        os.replace(temp_name, path)
    except BaseException:
        Path(temp_name).unlink(missing_ok=True)
        raise


class JsonCollection:
    """A tiny document store keyed by string id."""

    def __init__(self, path: Path) -> None:
        self._path = path

    def _read(self) -> dict[str, Any]:
        if not self._path.is_file():
            return {}
        return json.loads(self._path.read_text(encoding="utf-8"))

    def put(self, key: str, document: dict[str, Any]) -> dict[str, Any]:
        with _lock:
            data = self._read()
            data[key] = document
            _atomic_write(self._path, data)
        return document

    def get(self, key: str) -> dict[str, Any] | None:
        return self._read().get(key)

    def put_if_absent(self, key: str, document: dict[str, Any]) -> dict[str, Any]:
        """Atomically insert once; concurrent retries must not replace an outcome."""
        with _lock:
            data = self._read()
            if key in data:
                return data[key]
            data[key] = document
            _atomic_write(self._path, data)
        return document

    def delete(self, key: str) -> bool:
        """Removes one document atomically. Returns False when it was not present."""
        with _lock:
            data = self._read()
            if key not in data:
                return False
            del data[key]
            _atomic_write(self._path, data)
        return True

    def list(self) -> list[dict[str, Any]]:
        return list(self._read().values())

    def clear(self) -> None:
        with _lock:
            _atomic_write(self._path, {})


class JsonLog:
    """An append-only event log."""

    def __init__(self, path: Path) -> None:
        self._path = path

    def _read(self) -> list[dict[str, Any]]:
        if not self._path.is_file():
            return []
        return json.loads(self._path.read_text(encoding="utf-8"))

    def append(self, event: dict[str, Any]) -> dict[str, Any]:
        with _lock:
            events = self._read()
            events.append(event)
            _atomic_write(self._path, events)
        return event

    def all(self) -> list[dict[str, Any]]:
        return self._read()

    def for_session(self, session_id: str) -> list[dict[str, Any]]:
        return [event for event in self._read() if event["sessionId"] == session_id]

    def remove_where(self, predicate: Callable[[dict[str, Any]], bool]) -> int:
        """Drops matching events atomically and reports how many went."""
        with _lock:
            events = self._read()
            kept = [event for event in events if not predicate(event)]
            removed = len(events) - len(kept)
            if removed:
                _atomic_write(self._path, kept)
        return removed

    def clear(self) -> None:
        with _lock:
            _atomic_write(self._path, [])


class Store:
    """Everything the API persists, validated against the contracts on write.

    Backed by local JSON files by default, or by Firestore collections with the same
    interface when ``PROJECT_TELOS_STORAGE=firestore`` (see ``firestore_store``).
    """

    def __init__(
        self,
        data_dir: Path | None = None,
        *,
        collection_factory: Callable[[str], Any] | None = None,
        log_factory: Callable[[str], Any] | None = None,
    ) -> None:
        if collection_factory is None or log_factory is None:
            if data_dir is None:
                raise ValueError("Store needs a data directory or explicit backend factories")
            collection_factory = lambda name: JsonCollection(data_dir / f"{name}.json")  # noqa: E731
            log_factory = lambda name: JsonLog(data_dir / f"{name}.json")  # noqa: E731
        self.profiles = collection_factory("profiles")
        self.viewer_preferences = collection_factory("viewer_preferences")
        self.decisions = collection_factory("decisions")
        # Keyed by content hash and holding no user data, so it is safe to reuse
        # across viewers. Understanding is shared; the decision is not.
        self.segment_maps = collection_factory("segment_maps")
        self.receipt = log_factory("receipt")
        self.project_telos_items = collection_factory("project_telos_items")
        self.youtube_searches = collection_factory("youtube_searches")
        self.youtube_analyses = collection_factory("youtube_analyses")

    def save_profile(self, profile: dict[str, Any]) -> dict[str, Any]:
        assert_valid("ConsentProfile", profile)
        return self.profiles.put(profile["id"], profile)

    def save_segment_map(self, segment_map: dict[str, Any]) -> dict[str, Any]:
        assert_valid("SegmentMap", segment_map)
        return self.segment_maps.put(segment_map["assetHash"], segment_map)

    def save_decision(self, decision: dict[str, Any]) -> dict[str, Any]:
        assert_valid("Decision", decision)
        key = f"{decision['profileId']}:{decision['assetHash']}"
        return self.decisions.put(key, decision)

    def record_event(self, event: dict[str, Any]) -> dict[str, Any]:
        assert_valid("ReceiptEvent", event)
        return self.receipt.append(event)

    def forget_profile(self, profile_id: str) -> bool:
        """Removes a profile and its stored decisions, demo items, and YouTube data."""
        if not self.profiles.delete(profile_id):
            return False
        self.viewer_preferences.delete(profile_id)

        for item in self.project_telos_items.list():
            if item["profileId"] == profile_id:
                self.project_telos_items.delete(f"{item['sessionId']}:{item['itemId']}")
        self.youtube_searches.delete(profile_id)
        for analysis in self.youtube_analyses.list():
            if analysis["profileId"] == profile_id:
                self.youtube_analyses.delete(f"{profile_id}:{analysis['video']['videoId']}")

        hashes = {
            decision["assetHash"]
            for decision in self.decisions.list()
            if decision["profileId"] == profile_id
        }
        for decision in self.decisions.list():
            if decision["profileId"] == profile_id:
                self.decisions.delete(f"{profile_id}:{decision['assetHash']}")

        self.receipt.remove_where(lambda event: event["assetHash"] in hashes)
        return True

    def clear(self) -> None:
        self.profiles.clear()
        self.viewer_preferences.clear()
        self.decisions.clear()
        self.receipt.clear()
        self.project_telos_items.clear()
        self.youtube_searches.clear()
        self.youtube_analyses.clear()
