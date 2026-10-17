"""The API must expose health, a stable OpenAPI document, and request correlation."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from project_telos_api.main import REQUEST_ID_HEADER, create_app


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app())


class TestHealth:
    @pytest.mark.parametrize("offline", [False, True])
    def test_vertex_status_reports_configured_provider_without_developer_key(self, monkeypatch, offline):
        from project_telos_api.config import get_settings

        monkeypatch.setenv("PROJECT_TELOS_PROVIDER", "vertex")
        monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "vertex-test")
        monkeypatch.setenv("GEMINI_API_KEY", "")
        monkeypatch.setenv("PROJECT_TELOS_OFFLINE_FALLBACK", str(offline).lower())
        get_settings.cache_clear()
        with TestClient(create_app()) as instance:
            body = instance.get("/health").json()
            assert body["provider"] == "vertex"
            assert body["uses_model_calls"] is not offline
            assert body["integrations"]["imagen"] is not offline
            creator = instance.get("/project-telos/thumbnail-truth/status").json()
            viewer = instance.get("/project-telos/youtube/status").json()
            assert creator["liveConfigured"] is not offline
            assert viewer["analysisConfigured"] is not offline

    def test_reports_ok(self, client: TestClient) -> None:
        response = client.get("/health")
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "ok"
        assert body["environment"] == "test"

    def test_reports_enforced_contracts(self, client: TestClient) -> None:
        contracts = client.get("/health").json()["contracts"]
        assert contracts == ["ConsentProfile", "Decision", "ReceiptEvent", "SegmentMap"]

    def test_reports_offline_fallback_state(self, client: TestClient) -> None:
        assert client.get("/health").json()["offline_fallback"] is False

    def test_reports_the_active_provider(self, client: TestClient) -> None:
        body = client.get("/health").json()
        assert body["provider"] == "local"
        assert body["uses_model_calls"] is False

    def test_never_echoes_an_api_key(self, client: TestClient) -> None:
        """Health is public; it must not leak credentials in any form."""
        body = client.get("/health").text.lower()
        assert "api_key" not in body
        assert "secret" not in body


class TestRequestCorrelation:
    def test_echoes_supplied_request_id(self, client: TestClient) -> None:
        response = client.get("/health", headers={REQUEST_ID_HEADER: "req-supplied"})
        assert response.headers[REQUEST_ID_HEADER] == "req-supplied"

    def test_generates_request_id_when_absent(self, client: TestClient) -> None:
        response = client.get("/health")
        assert response.headers.get(REQUEST_ID_HEADER)


class TestOpenApi:
    def test_document_is_served(self, client: TestClient) -> None:
        response = client.get("/openapi.json")
        assert response.status_code == 200
        assert response.json()["info"]["title"] == "Project Telos API"
        assert "/project-telos/push" in response.json()["paths"]

    def test_health_is_documented_with_its_schema(self, client: TestClient) -> None:
        document = client.get("/openapi.json").json()
        assert "/health" in document["paths"]
        assert "HealthResponse" in document["components"]["schemas"]

    def test_description_does_not_claim_legal_authority(self, client: TestClient) -> None:
        """Wording guard: a Project Telos decision governs presentation, not legality."""
        description = client.get("/openapi.json").json()["info"]["description"].lower()
        assert "not a legal determination" in description


class TestCors:
    def test_allows_the_configured_origin(self, client: TestClient) -> None:
        response = client.get("/health", headers={"Origin": "http://localhost:5173"})
        assert response.headers["access-control-allow-origin"] == "http://localhost:5173"

    def test_does_not_allow_an_unknown_origin(self, client: TestClient) -> None:
        response = client.get("/health", headers={"Origin": "https://evil.example"})
        assert "access-control-allow-origin" not in response.headers
