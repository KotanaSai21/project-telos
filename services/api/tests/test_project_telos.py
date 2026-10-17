"""Verify promise mismatch, idempotent receipts, and explicit summary failures."""

from pathlib import Path
from types import SimpleNamespace
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from project_telos_api.config import get_settings
from project_telos_api.main import create_app
from project_telos_api.providers import reset_providers
from project_telos_api.store import JsonCollection
from project_telos_api.project_telos import FIXTURES, Fixture, Segment, analyse_bait, segment_map


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("PROJECT_TELOS_LOCAL_DATA_DIR", str(tmp_path))
    get_settings.cache_clear()
    reset_providers()
    with TestClient(create_app()) as instance:
        yield instance
    get_settings.cache_clear()
    reset_providers()


def create_profile(client: TestClient) -> str:
    response = client.post("/profiles", json={
        "utterance": "I'm studying aviation, keep it clean, no graphic content or deceptive clickbait.",
        "context": "learning",
        "topics": ["aviation", "cooking", "diy"],
    })
    assert response.status_code == 201
    profile = response.json()
    assert profile["interests"] == ["aviation", "cooking", "diy"]
    assert {"category": "graphic_injury", "intensityThreshold": "none"} in profile["avoid"]
    return profile["id"]


def push(client: TestClient, profile: str, asset: str, item: int, session: str = "demo"):
    return client.post("/project-telos/push", json={
        "profileId": profile, "assetId": asset, "itemId": f"push-{item}", "sessionId": session,
    })


def outcome(client: TestClient, status: str, session: str = "demo", item: int = 3):
    return client.post("/project-telos/outcome", json={
        "sessionId": session, "itemId": f"push-{item}", "outcome": status,
    })


def test_bait_index_uses_topics_not_intensity():
    assert analyse_bait(FIXTURES[0])["index"] == 0
    trap = analyse_bait(FIXTURES[2])
    assert trap["index"] == 100
    assert trap["switchSec"] == 14
    assert trap["mismatchShare"] == 0.25
    same_topic = Fixture(
        id="honest", title="Incident documentary", hook="An incident documentary",
        promiseTopics=["incident"], durationSec=20, sourceText="Approved source",
        segments=[
            Segment(startSec=0, endSec=10, topics=["incident"], category="violence"),
            Segment(startSec=10, endSec=20, topics=["incident"],
                    category="violence", intensity="strong"),
        ],
    )
    assert analyse_bait(same_topic)["index"] == 0
    harmless_switch = same_topic.model_copy(update={
        "promiseTopics": ["cooking"],
        "segments": [Segment(startSec=0, endSec=20, topics=["incident"], category="incident")],
    })
    assert analyse_bait(harmless_switch)["index"] == 100
    assert segment_map(FIXTURES[2])["signals"]["baitPattern"] is True


def test_four_pushes_one_neutralized_trap_and_persistent_receipt(client: TestClient):
    profile = create_profile(client)
    assert len(client.get("/project-telos/fixtures").json()) == 3
    assert push(client, profile, "aviation", 1).json()["status"] == "allowed"
    assert push(client, profile, "cooking", 2).json()["status"] == "allowed"
    trap = push(client, profile, "diy-switch", 3).json()
    assert trap["status"] == "protected"
    assert trap["holdAtSec"] == 13
    assert trap["bait"]["index"] == 100
    assert push(client, profile, "aviation", 4).status_code == 200
    pending = client.get("/project-telos/receipt/demo").json()
    assert pending["itemsPushed"] == 4
    assert pending["consentRate"] == 75
    assert pending["baitTrapsNeutralized"] == 0
    assert outcome(client, "held").json()["status"] == "held"
    reframed = outcome(client, "reframed").json()
    assert reframed["status"] == "reframed"
    assert "desk" in reframed["summary"]
    assert reframed["summaryBy"] == "Reviewed fixture summary (offline)"
    assert reframed["illustration"].startswith("data:image/svg+xml;base64,")
    assert outcome(client, "held").json()["status"] == "reframed"
    assert outcome(client, "reframed").json() == reframed
    assert push(client, profile, "diy-switch", 3).json() == reframed
    totals = client.get("/project-telos/receipt/demo").json()
    assert totals["itemsPushed"] == 4
    assert totals["baitTrapsNeutralized"] == 1
    assert totals["consentRate"] == 100
    assert totals["pending"] == 0
    assert totals["reframed"] == 1
    # A fresh app instance reads persisted records rather than process state.
    with TestClient(create_app()) as restarted:
        assert restarted.get("/project-telos/receipt/demo").json() == totals
    assert client.get("/project-telos/receipt/other").json()["consentRate"] is None
    assert push(client, profile, "cooking", 3).status_code == 409
    assert client.delete(f"/profiles/{profile}").status_code == 204
    assert client.get("/project-telos/receipt/demo").json()["itemsPushed"] == 0


def test_outcomes_and_inputs_are_validated(client: TestClient):
    profile = create_profile(client)
    assert push(client, profile, "missing", 1).status_code == 404
    assert push(client, "missing", "aviation", 1).status_code == 404
    assert push(client, profile, "aviation", 5).status_code == 422
    assert outcome(client, "reframed").status_code == 404
    push(client, profile, "aviation", 1)
    assert outcome(client, "held", item=1).status_code == 409
    push(client, profile, "diy-switch", 3)
    assert outcome(client, "reframed").status_code == 409
    assert client.get("/project-telos/receipt/demo").json()["baitTrapsNeutralized"] == 0


def test_bait_protection_does_not_depend_on_a_safety_boundary(client: TestClient):
    profile = client.post("/profiles", json={
        "utterance": "I like DIY", "context": "learning", "topics": ["diy"],
    }).json()["id"]
    record = push(client, profile, "diy-switch", 3).json()
    assert record["decision"]["action"] == "allow"
    assert record["status"] == "protected"
    assert record["holdAtSec"] == 13


def test_topic_filter_is_independent_of_safety_and_saved_holds(client: TestClient):
    profile = client.post("/profiles", json={
        "utterance": "I like aviation.", "topics": ["aviation"], "goal": "informed",
    }).json()["id"]
    record = push(client, profile, "cooking", 1).json()
    assert record["decision"]["action"] == "allow"
    assert record["topicMatch"]["status"] == "off-topic"
    assert record["status"] == "protected" and record["holdAtSec"] == 0
    assert client.get("/project-telos/receipt/demo").json()["pending"] == 1
    assert outcome(client, "held", item=1).json()["status"] == "held"
    assert client.get("/project-telos/receipt/demo").json()["baitTrapsNeutralized"] == 0
    assert push(client, profile, "aviation", 2).json()["topicMatch"]["status"] == "matched"
    assert client.get(f"/profiles/{profile}/preferences").json()["goal"] == "informed"
    with TestClient(create_app()) as restarted:
        assert restarted.get(f"/profiles/{profile}/preferences").json()["goal"] == "informed"
    assert client.delete(f"/profiles/{profile}").status_code == 204
    assert client.get(f"/profiles/{profile}/preferences").status_code == 404


def test_goals_and_topics_do_not_change_profile_contract(client: TestClient):
    from project_telos_api.contracts import assert_valid

    response = client.post("/profiles", json={
        "utterance": "No graphic content.", "goal": "inspiration",
        "topics": [" aviation ", "aviation", "DIY"],
    })
    assert response.status_code == 201
    profile = response.json()
    assert_valid("ConsentProfile", profile)
    assert "goal" not in profile
    assert profile["interests"] == ["aviation", "DIY"]
    assert client.get(f"/profiles/{profile['id']}/preferences").json()["goal"] == "inspiration"
    for invalid in ({"goal": "bad"}, {"topics": [" "]}, {"topics": ["x" * 81]}):
        assert client.post("/profiles", json={"utterance": "aviation", **invalid}).status_code == 422


@pytest.mark.parametrize("model_output", ['{"summary": "Organize your desk. The clip changes topic."}',
                                          '{"summary": ""}', "not JSON", None])
@pytest.mark.parametrize("provider", ["gemini", "vertex"])
def test_live_summary_is_explicit_and_failure_keeps_hold(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, model_output: str | None, provider: str,
):
    profile = create_profile(client)
    push(client, profile, "diy-switch", 3)
    outcome(client, "held")
    settings = get_settings().model_copy(update={
        "provider": provider, "gemini_api_key": None, "offline_fallback": False,
        "google_cloud_project": "vertex-test",
    })
    client.app.dependency_overrides[get_settings] = lambda: settings
    def generate(**kwargs):
        assert "response_json_schema" in kwargs["config"]
        assert "response_schema" not in kwargs["config"]
        return SimpleNamespace(text=model_output)

    def client_factory(**kwargs):
        assert kwargs == (
            {"api_key": None, "project": "vertex-test", "location": "us-central1"}
            if provider == "vertex" else {"api_key": None}
        )
        return SimpleNamespace(models=SimpleNamespace(generate_content=generate))

    monkeypatch.setattr("project_telos_api.project_telos.build_client", client_factory)
    result = outcome(client, "reframed")
    if model_output and model_output.startswith('{"summary": "Organize'):
        assert result.status_code == 200
        assert result.json()["summaryBy"] == "Live Gemini summary"
    else:
        assert result.status_code == 503
        assert "frame remains held" in result.json()["detail"]
        assert push(client, profile, "diy-switch", 3).json()["status"] == "held"
        assert client.get("/project-telos/receipt/demo").json()["reframed"] == 0


def test_atomic_item_creation_preserves_an_existing_outcome(tmp_path: Path):
    collection = JsonCollection(tmp_path / "items.json")
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(
            lambda _: collection.put_if_absent("one", {"status": "protected"}), range(12),
        ))
    assert len(collection.list()) == 1
    assert all(result == {"status": "protected"} for result in results)
    collection.put("one", {"status": "reframed"})
    assert collection.put_if_absent("one", {"status": "protected"}) == {"status": "reframed"}


def test_sdk_failure_is_not_reported_as_a_successful_offline_summary(
    client: TestClient, monkeypatch: pytest.MonkeyPatch,
):
    profile = create_profile(client)
    push(client, profile, "diy-switch", 3)
    outcome(client, "held")
    settings = get_settings().model_copy(update={"provider": "gemini", "offline_fallback": False})
    client.app.dependency_overrides[get_settings] = lambda: settings

    def failed_client(**kwargs):
        raise OSError("Simulated provider outage")

    monkeypatch.setattr("project_telos_api.project_telos.build_client", failed_client)
    assert outcome(client, "reframed").status_code == 503
    assert push(client, profile, "diy-switch", 3).json()["status"] == "held"
