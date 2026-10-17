"""Firestore persistence with the same interface as the local JSON stores.

Selected with ``PROJECT_TELOS_STORAGE=firestore``. On Cloud Run the client uses the
service account through Application Default Credentials; no key file is needed.
The SDK is imported lazily so local development does not require it.
"""

from __future__ import annotations

import time
from functools import lru_cache
from typing import Any, Callable

from project_telos_api.config import Settings
from project_telos_api.store import Store

ORDER_FIELD = "_order"

try:  # pragma: no cover - exercised only when the SDK is missing
    from google.api_core.exceptions import AlreadyExists
except ImportError:  # pragma: no cover
    class AlreadyExists(Exception):  # type: ignore[no-redef]
        """Fallback so the module imports without google-api-core."""


def document_id(key: str) -> str:
    """Firestore ids cannot contain '/', so encode it instead of creating subpaths."""
    return key.replace("%", "%25").replace("/", "%2F")


class FirestoreCollection:
    """A document store keyed by string id, backed by one Firestore collection."""

    def __init__(self, client: Any, name: str) -> None:
        self._ref = client.collection(name)

    def put(self, key: str, document: dict[str, Any]) -> dict[str, Any]:
        self._ref.document(document_id(key)).set(document)
        return document

    def get(self, key: str) -> dict[str, Any] | None:
        snapshot = self._ref.document(document_id(key)).get()
        return snapshot.to_dict() if snapshot.exists else None

    def put_if_absent(self, key: str, document: dict[str, Any]) -> dict[str, Any]:
        """``create`` fails atomically when the document exists, so retries cannot overwrite."""
        try:
            self._ref.document(document_id(key)).create(document)
        except AlreadyExists:
            existing = self.get(key)
            return existing if existing is not None else document
        return document

    def delete(self, key: str) -> bool:
        reference = self._ref.document(document_id(key))
        if not reference.get().exists:
            return False
        reference.delete()
        return True

    def list(self) -> list[dict[str, Any]]:
        return [snapshot.to_dict() for snapshot in self._ref.stream()]

    def clear(self) -> None:
        for snapshot in self._ref.stream():
            snapshot.reference.delete()


class FirestoreLog:
    """An append-only event log. Insertion order is kept in a private field."""

    def __init__(self, client: Any, name: str) -> None:
        self._ref = client.collection(name)

    @staticmethod
    def _ordered(snapshots: Any) -> list[dict[str, Any]]:
        rows = [snapshot.to_dict() for snapshot in snapshots]
        rows.sort(key=lambda row: row.get(ORDER_FIELD, 0))
        return [{key: value for key, value in row.items() if key != ORDER_FIELD} for row in rows]

    def append(self, event: dict[str, Any]) -> dict[str, Any]:
        self._ref.add({**event, ORDER_FIELD: time.time_ns()})
        return event

    def all(self) -> list[dict[str, Any]]:
        return self._ordered(self._ref.stream())

    def for_session(self, session_id: str) -> list[dict[str, Any]]:
        # Equality filter only, sorted in memory, so no composite index is required.
        try:
            from google.cloud.firestore_v1.base_query import FieldFilter  # noqa: PLC0415
        except ImportError:  # pragma: no cover - SDK absent
            query = self._ref.where("sessionId", "==", session_id)
        else:
            query = self._ref.where(filter=FieldFilter("sessionId", "==", session_id))
        return self._ordered(query.stream())

    def remove_where(self, predicate: Callable[[dict[str, Any]], bool]) -> int:
        removed = 0
        for snapshot in self._ref.stream():
            row = {key: value for key, value in snapshot.to_dict().items() if key != ORDER_FIELD}
            if predicate(row):
                snapshot.reference.delete()
                removed += 1
        return removed

    def clear(self) -> None:
        for snapshot in self._ref.stream():
            snapshot.reference.delete()


@lru_cache(maxsize=4)
def firestore_client(project: str, database: str) -> Any:  # pragma: no cover - needs GCP
    """One client per process; it is thread-safe and reuses connections."""
    from google.cloud import firestore  # noqa: PLC0415

    return firestore.Client(project=project, database=database)


def firestore_store(client: Any) -> Store:
    return Store(
        collection_factory=lambda name: FirestoreCollection(client, name),
        log_factory=lambda name: FirestoreLog(client, name),
    )


def store_for(settings: Settings) -> Store:
    """Picks the configured backend. Config validation guarantees a project for Firestore."""
    if settings.storage == "firestore":
        assert settings.google_cloud_project is not None
        return firestore_store(firestore_client(settings.google_cloud_project, settings.firestore_database))
    return Store(settings.local_data_dir)
