"""Per-visitor rate limit on routes that can spend model calls."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from project_telos_api.config import get_settings
from project_telos_api.main import create_app


def limited_client(monkeypatch: pytest.MonkeyPatch, limit: int) -> TestClient:
    monkeypatch.setenv("PROJECT_TELOS_RATE_LIMIT_PER_MINUTE", str(limit))
    get_settings.cache_clear()
    return TestClient(create_app())


def test_posts_over_the_limit_get_429_with_retry_after(monkeypatch: pytest.MonkeyPatch) -> None:
    client = limited_client(monkeypatch, 2)
    for _ in range(2):
        assert client.post("/api/project-telos/thumbnail-truth/analyse", json={}).status_code == 422
    blocked = client.post("/api/project-telos/thumbnail-truth/analyse", json={})
    assert blocked.status_code == 429
    assert blocked.json() == {"detail": "Too many requests. Wait a minute and try again."}
    assert 1 <= int(blocked.headers["Retry-After"]) <= 61


def test_reads_and_other_paths_are_not_limited(monkeypatch: pytest.MonkeyPatch) -> None:
    client = limited_client(monkeypatch, 1)
    for _ in range(3):
        assert client.get("/api/profiles/presets").status_code == 200
        assert client.get("/health").status_code == 200
    assert client.post("/api/access/verify", json={"code": "anything"}).status_code == 204


def test_window_rolls_over(monkeypatch: pytest.MonkeyPatch) -> None:
    from project_telos_api import ratelimit

    clock = [1000.0]
    monkeypatch.setattr(ratelimit.time, "monotonic", lambda: clock[0])
    client = limited_client(monkeypatch, 1)
    assert client.post("/api/profiles", json={}).status_code != 429
    assert client.post("/api/profiles", json={}).status_code == 429
    clock[0] += 61
    assert client.post("/api/profiles", json={}).status_code != 429
