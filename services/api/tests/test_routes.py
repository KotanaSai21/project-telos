"""Profile lifecycle routes and the public prototype API surface."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from project_telos_api.main import create_app
from project_telos_api.providers import reset_providers

DEMO_UTTERANCE = (
    "I'm on my work laptop. No explicit content, graphic violence, graphic injuries, "
    "or gambling. Medical education and news reporting are fine. "
    "I'm learning aviation and I like Indian classical music."
)


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("PROJECT_TELOS_LOCAL_DATA_DIR", str(tmp_path))
    from project_telos_api.config import get_settings

    get_settings.cache_clear()
    reset_providers()
    yield TestClient(create_app())
    get_settings.cache_clear()
    reset_providers()


@pytest.fixture
def profile_id(client: TestClient) -> str:
    response = client.post("/profiles", json={"utterance": DEMO_UTTERANCE, "context": "work"})
    assert response.status_code == 201
    return response.json()["id"]


def test_declare_profile_from_one_sentence(client: TestClient) -> None:
    response = client.post("/profiles", json={"utterance": DEMO_UTTERANCE, "context": "work"})
    assert response.status_code == 201
    profile = response.json()
    assert profile["context"] == "work"
    assert any(boundary["category"] == "sexual" for boundary in profile["avoid"])
    assert "aviation" in profile["interests"]


@pytest.mark.parametrize(
    "payload",
    [
        {"utterance": "", "context": "work"},
        {"utterance": "x" * 1001, "context": "work"},
        {"utterance": "no gambling", "context": "stadium"},
    ],
)
def test_declaration_validates_input(client: TestClient, payload: dict[str, str]) -> None:
    assert client.post("/profiles", json=payload).status_code == 422


def test_reads_back_a_stored_profile(client: TestClient, profile_id: str) -> None:
    assert client.get(f"/profiles/{profile_id}").json()["id"] == profile_id


def test_unknown_profile_is_404(client: TestClient) -> None:
    assert client.get("/profiles/profile-missing").status_code == 404


def test_profile_can_be_forgotten(client: TestClient, profile_id: str) -> None:
    assert client.delete(f"/profiles/{profile_id}").status_code == 204
    assert client.get(f"/profiles/{profile_id}").status_code == 404


def test_lists_and_seeds_local_presets(client: TestClient) -> None:
    contexts = {preset["context"] for preset in client.get("/profiles/presets").json()}
    assert {"work", "family", "learning"} <= contexts
    assert client.post("/profiles/presets").status_code == 201


def test_openapi_contains_only_prototype_and_profile_routes(client: TestClient) -> None:
    paths = client.get("/openapi.json").json()["paths"]
    assert {"/profiles", "/profiles/{profile_id}", "/project-telos/fixtures", "/project-telos/push"} <= set(paths)
    removed_paths = (
        "/feed",
        "/decide",
        "/receipt/{session_id}",
        "/ingest",
        "/explain",
        "/explain/counterfactual",
        "/corrections",
        "/corrections/{profile_id}",
        "/insights",
        "/lesson",
    )
    assert all(path not in paths for path in removed_paths)
