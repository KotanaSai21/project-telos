"""Site-wide access code gate."""

from __future__ import annotations

from typing import Iterator

import pytest
from fastapi.testclient import TestClient

from project_telos_api import access
from project_telos_api.config import get_settings
from project_telos_api.main import create_app

CODE = "Chinnadler Bong"


def gated_client(monkeypatch: pytest.MonkeyPatch, *, hint: str = "", hint_enabled: bool = False) -> TestClient:
    monkeypatch.setenv("PROJECT_TELOS_ACCESS_CODE", CODE)
    monkeypatch.setenv("PROJECT_TELOS_ACCESS_HINT", hint)
    monkeypatch.setenv("PROJECT_TELOS_ACCESS_HINT_ENABLED", "true" if hint_enabled else "false")
    get_settings.cache_clear()
    return TestClient(create_app())


@pytest.fixture(autouse=True)
def _reset() -> Iterator[None]:
    access._failures.clear()
    yield
    access._failures.clear()
    get_settings.cache_clear()


def test_site_is_open_without_a_code(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PROJECT_TELOS_ACCESS_HINT", "Two words")
    monkeypatch.setenv("PROJECT_TELOS_ACCESS_HINT_ENABLED", "true")
    monkeypatch.setenv("PROJECT_TELOS_RATE_LIMIT_PER_MINUTE", "45")
    get_settings.cache_clear()
    client = TestClient(create_app())
    assert client.get("/access/status").json() == {
        "required": False, "unlocked": True, "hint": None, "rate_limit_per_minute": 45,
    }
    assert client.get("/api/profiles/presets").status_code == 200


def test_api_is_locked_until_the_code_is_entered(monkeypatch: pytest.MonkeyPatch) -> None:
    client = gated_client(monkeypatch)
    assert client.get("/api/profiles/presets").status_code == 401
    assert client.get("/project-telos/thumbnail-truth/status").status_code == 401
    assert client.get("/health").status_code == 200
    assert client.get("/api/access/status").json()["unlocked"] is False

    assert client.post("/api/access/verify", json={"code": "wrong"}).status_code == 401
    unlocked = client.post("/api/access/verify", json={"code": "  chinnadler   BONG "})
    assert unlocked.status_code == 204
    cookie = unlocked.headers["set-cookie"]
    assert "HttpOnly" in cookie and "chinnadler" not in cookie.lower()
    assert client.get("/api/profiles/presets").status_code == 200
    assert client.get("/access/status").json()["unlocked"] is True


def test_code_matches_without_spaces(monkeypatch: pytest.MonkeyPatch) -> None:
    client = gated_client(monkeypatch)
    assert client.post("/access/verify", json={"code": "ChinnadlerBong"}).status_code == 204
    assert client.get("/api/profiles/presets").status_code == 200


def test_hint_is_shown_only_when_enabled(monkeypatch: pytest.MonkeyPatch) -> None:
    hidden = gated_client(monkeypatch, hint="Two words", hint_enabled=False)
    assert hidden.get("/access/status").json()["hint"] is None
    shown = gated_client(monkeypatch, hint="Two words", hint_enabled=True)
    assert shown.get("/access/status").json()["hint"] == "Two words"


def test_repeated_wrong_codes_are_throttled(monkeypatch: pytest.MonkeyPatch) -> None:
    client = gated_client(monkeypatch)
    for _ in range(access.MAX_FAILURES):
        assert client.post("/access/verify", json={"code": "nope"}).status_code == 401
    assert client.post("/access/verify", json={"code": CODE}).status_code == 429
