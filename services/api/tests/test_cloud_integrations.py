"""Google Cloud integrations: Firestore, BigQuery, Cloud Translation, and Cloud Run serving.

Every SDK call is replaced with an in-memory fake, so these tests need no cloud account.
"""

from __future__ import annotations

import copy
import itertools
from pathlib import Path
from typing import Any, Iterator

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from project_telos_api import analytics, translation
from project_telos_api.config import Settings, get_settings
from project_telos_api.firestore_store import (
    AlreadyExists, FirestoreCollection, FirestoreLog, document_id, firestore_store, store_for,
)
from project_telos_api.main import create_app
from project_telos_api.providers import reset_providers
from project_telos_api.store import Store


# --- In-memory Firestore fake -------------------------------------------------------------

class FakeSnapshot:
    def __init__(self, reference: "FakeDocument", data: dict[str, Any] | None) -> None:
        self.reference = reference
        self._data = data
        self.exists = data is not None

    def to_dict(self) -> dict[str, Any] | None:
        return copy.deepcopy(self._data)


class FakeDocument:
    def __init__(self, collection: "FakeCollection", doc_id: str) -> None:
        self._collection = collection
        self.id = doc_id

    def set(self, data: dict[str, Any]) -> None:
        self._collection.docs[self.id] = copy.deepcopy(data)

    def create(self, data: dict[str, Any]) -> None:
        if self.id in self._collection.docs:
            raise AlreadyExists("exists")
        self.set(data)

    def get(self) -> FakeSnapshot:
        return FakeSnapshot(self, self._collection.docs.get(self.id))

    def delete(self) -> None:
        self._collection.docs.pop(self.id, None)


class FakeQuery:
    def __init__(self, collection: "FakeCollection", field: str, value: Any) -> None:
        self._collection, self._field, self._value = collection, field, value

    def stream(self) -> Iterator[FakeSnapshot]:
        return (snapshot for snapshot in self._collection.stream()
                if (snapshot.to_dict() or {}).get(self._field) == self._value)


class FakeCollection:
    _ids = itertools.count()

    def __init__(self) -> None:
        self.docs: dict[str, dict[str, Any]] = {}
        self.filters: list[Any] = []

    def document(self, doc_id: str) -> FakeDocument:
        assert "/" not in doc_id, "Firestore ids must not contain '/'"
        return FakeDocument(self, doc_id)

    def add(self, data: dict[str, Any]) -> None:
        # Reverse-sorted ids prove the log orders by its private field, not by document id.
        self.document(f"auto-{10_000 - next(self._ids):05d}").set(data)

    def stream(self) -> Iterator[FakeSnapshot]:
        return iter([FakeSnapshot(FakeDocument(self, key), value) for key, value in list(self.docs.items())])

    def where(self, *args: Any, filter: Any = None) -> FakeQuery:  # noqa: A002 - SDK keyword
        self.filters.append(filter)
        assert filter is not None, "use the FieldFilter keyword form"
        assert filter.op_string == "=="
        return FakeQuery(self, filter.field_path, filter.value)


class FakeFirestore:
    def __init__(self) -> None:
        self.collections: dict[str, FakeCollection] = {}

    def collection(self, name: str) -> FakeCollection:
        return self.collections.setdefault(name, FakeCollection())


# --- Firestore ------------------------------------------------------------------------------

def test_document_ids_never_create_subcollections() -> None:
    assert document_id("session/item%1") == "session%2Fitem%251"
    assert document_id("plain") == "plain"


def test_firestore_collection_matches_the_local_store_contract() -> None:
    collection = FirestoreCollection(FakeFirestore(), "profiles")
    document = {"id": "a/b", "nested": {"x": 1}}
    assert collection.put("a/b", document) == document
    assert collection.get("a/b") == document
    assert collection.get("missing") is None
    assert collection.put_if_absent("a/b", {"id": "other"}) == document
    assert collection.put_if_absent("c", {"id": "c"}) == {"id": "c"}
    assert sorted(row["id"] for row in collection.list()) == ["a/b", "c"]
    assert collection.delete("a/b") is True
    assert collection.delete("a/b") is False
    collection.clear()
    assert collection.list() == []


def test_firestore_log_keeps_insertion_order_and_hides_its_order_field() -> None:
    client = FakeFirestore()
    log = FirestoreLog(client, "receipt")
    for index in range(4):
        log.append({"sessionId": "s1" if index % 2 == 0 else "s2", "n": index})
    assert [row["n"] for row in log.all()] == [0, 1, 2, 3]
    assert all("_order" not in row for row in log.all())
    assert [row["n"] for row in log.for_session("s1")] == [0, 2]
    assert client.collection("receipt").filters[-1].field_path == "sessionId"
    assert log.remove_where(lambda row: row["sessionId"] == "s2") == 2
    assert [row["n"] for row in log.all()] == [0, 2]
    log.clear()
    assert log.all() == []


def test_store_for_selects_the_configured_backend(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    fake = FakeFirestore()
    monkeypatch.setattr("project_telos_api.firestore_store.firestore_client", lambda project, database: fake)
    local = Settings(_env_file=None, PROJECT_TELOS_LOCAL_DATA_DIR=str(tmp_path))
    assert isinstance(store_for(local), Store)
    cloud = Settings(_env_file=None, PROJECT_TELOS_STORAGE="firestore", GOOGLE_CLOUD_PROJECT="demo")
    store = store_for(cloud)
    store.profiles.put("p", {"id": "p"})
    assert fake.collections["profiles"].docs["p"] == {"id": "p"}


def test_full_viewer_journey_runs_on_firestore(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = FakeFirestore()
    monkeypatch.setenv("PROJECT_TELOS_STORAGE", "firestore")
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "demo-project")
    monkeypatch.setattr("project_telos_api.firestore_store.firestore_client", lambda project, database: fake)
    get_settings.cache_clear()
    reset_providers()
    with TestClient(create_app()) as client:
        created = client.post("/profiles", json={"utterance": "I like aviation. No graphic content.",
                                                 "context": "learning", "goal": "inspiration",
                                                 "topics": ["aviation"]})
        assert created.status_code == 201
        profile_id = created.json()["id"]
        pushed = client.post("/project-telos/push", json={
            "profileId": profile_id, "assetId": "aviation", "sessionId": "s-1", "itemId": "push-1"})
        assert pushed.status_code == 200, pushed.text
        receipt = client.get("/project-telos/receipt/s-1")
        assert receipt.status_code == 200
        assert receipt.json()["itemsPushed"] == 1
        assert client.get("/health").json()["integrations"]["storage"] == "firestore"
        assert client.get(f"/profiles/{profile_id}/preferences").json()["goal"] == "inspiration"
        assert client.delete(f"/profiles/{profile_id}").status_code == 204
    assert profile_id not in fake.collections["profiles"].docs
    assert profile_id not in fake.collections["viewer_preferences"].docs
    get_settings.cache_clear()
    reset_providers()


# --- Configuration ----------------------------------------------------------------------------

@pytest.mark.parametrize("env, message", [
    ({"PROJECT_TELOS_STORAGE": "firestore"}, "STORAGE=firestore requires GOOGLE_CLOUD_PROJECT"),
    ({"PROJECT_TELOS_TRANSLATION_ENABLED": "true"}, "TRANSLATION_ENABLED=true requires GOOGLE_CLOUD_PROJECT"),
    ({"PROJECT_TELOS_BIGQUERY_ENABLED": "true", "GOOGLE_CLOUD_PROJECT": "p"},
     "requires PROJECT_TELOS_BIGQUERY_DATASET"),
])
def test_cloud_features_fail_fast_when_misconfigured(env: dict[str, str], message: str) -> None:
    with pytest.raises(ValidationError, match=message):
        Settings(_env_file=None, **env)


# --- BigQuery ---------------------------------------------------------------------------------

def bigquery_settings() -> Settings:
    return Settings(_env_file=None, PROJECT_TELOS_BIGQUERY_ENABLED="true",
                    GOOGLE_CLOUD_PROJECT="demo", PROJECT_TELOS_BIGQUERY_DATASET="analytics")


def test_verdict_rows_carry_outcome_metadata_only() -> None:
    row = analytics.verdict_row("thumbnail_truth", band="high", risk_score=90,
                                title="secret creator title", transcript="private words")
    assert {"title", "transcript"}.isdisjoint(row)
    assert row["kind"] == "thumbnail_truth" and row["band"] == "high" and row["risk_score"] == 90
    assert set(row) <= {name for name, _ in analytics.SCHEMA}
    assert len(row["event_id"]) == 32


def test_record_verdict_is_a_no_op_when_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(analytics, "insert_rows", lambda *args: pytest.fail("must not call BigQuery"))
    assert analytics.record_verdict(Settings(_env_file=None), analytics.verdict_row("youtube_audit")) is False


def test_record_verdict_streams_and_never_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[str, str, list[dict[str, Any]]]] = []
    monkeypatch.setattr(analytics, "insert_rows", lambda project, dataset, rows: calls.append((project, dataset, rows)) or [])
    row = analytics.verdict_row("youtube_audit", band="safe")
    assert analytics.record_verdict(bigquery_settings(), row) is True
    assert calls == [("demo", "analytics", [row])]

    monkeypatch.setattr(analytics, "insert_rows", lambda *args: [{"errors": ["bad row"]}])
    assert analytics.record_verdict(bigquery_settings(), row) is False

    def boom(*args: Any) -> list[Any]:
        raise RuntimeError("quota")
    monkeypatch.setattr(analytics, "insert_rows", boom)
    assert analytics.record_verdict(bigquery_settings(), row) is False


# --- Cloud Translation ------------------------------------------------------------------------

def translation_settings() -> Settings:
    return Settings(_env_file=None, PROJECT_TELOS_TRANSLATION_ENABLED="true", GOOGLE_CLOUD_PROJECT="demo")


def test_translation_is_skipped_when_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(translation, "call_translate", lambda *args: pytest.fail("must not call"))
    assert translation.translate_fields({"title": "नमस्ते"}, Settings(_env_file=None)) == ({}, None)


def test_only_non_english_fields_are_translated(monkeypatch: pytest.MonkeyPatch) -> None:
    sent: list[list[str]] = []

    def fake(project: str, contents: list[str]) -> list[tuple[str, str]]:
        sent.append(contents)
        return [("I washed my car", "hi"), ("Calm how-to", "en")]

    monkeypatch.setattr(translation, "call_translate", fake)
    english, outcome = translation.translate_fields(
        {"title": "मैंने अपनी कार धोई", "description": "Calm how-to", "transcript": "  "}, translation_settings())
    assert sent == [["मैंने अपनी कार धोई", "Calm how-to"]]
    assert english == {"title": "I washed my car"}
    assert outcome is not None and outcome.detectedLanguage == "hi" and outcome.translated


def test_translation_failure_falls_back_to_originals(monkeypatch: pytest.MonkeyPatch) -> None:
    def boom(*args: Any) -> list[tuple[str, str]]:
        raise RuntimeError("permission denied")
    monkeypatch.setattr(translation, "call_translate", boom)
    assert translation.translate_fields({"title": "hola"}, translation_settings()) == ({}, None)


# --- Cloud Run: one service for web + API -----------------------------------------------------

def make_client(monkeypatch: pytest.MonkeyPatch, tmp_path: Path, **env: str) -> TestClient:
    monkeypatch.setenv("PROJECT_TELOS_LOCAL_DATA_DIR", str(tmp_path / "data"))
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    get_settings.cache_clear()
    reset_providers()
    return TestClient(create_app())


def test_api_prefix_is_accepted_for_the_single_service_deployment(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path,
) -> None:
    with make_client(monkeypatch, tmp_path) as client:
        assert client.get("/api/health").json() == client.get("/health").json()
        assert client.get("/api/project-telos/thumbnail-truth/status").status_code == 200
        assert client.get("/apis/health").status_code == 404
        integrations = client.get("/health").json()["integrations"]
        assert integrations == {"storage": "local", "gemini": False, "imagen": False, "youtubeDataApi": False,
                                "bigquery": False, "translation": False, "cloudRun": False}


def test_built_web_app_is_served_without_shadowing_the_api(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path,
) -> None:
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<html>Project Telos</html>", encoding="utf-8")
    (dist / "assets" / "app.js").write_text("console.log(1)", encoding="utf-8")
    with make_client(monkeypatch, tmp_path, PROJECT_TELOS_WEB_DIST=str(dist)) as client:
        assert "Project Telos" in client.get("/").text
        assert client.get("/assets/app.js").text == "console.log(1)"
        assert client.get("/api/health").json()["status"] == "ok"
        assert client.get("/health").headers["content-type"].startswith("application/json")


def test_missing_web_build_fails_at_boot(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("PROJECT_TELOS_WEB_DIST", str(tmp_path / "nothing"))
    get_settings.cache_clear()
    with pytest.raises(RuntimeError, match="no index.html"):
        create_app()
