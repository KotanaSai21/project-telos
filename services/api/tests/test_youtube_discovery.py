"""Bounded official discovery, explicit analysis, and conservative evidence gates."""

import json
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
from urllib.error import HTTPError

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from project_telos_api.config import Settings, get_settings
from project_telos_api.main import create_app
from project_telos_api.providers import reset_providers
from project_telos_api.providers.gemini import generation_schema
from project_telos_api.youtube_discovery import (
    Audit, NoRedirects, audit_video, duration_seconds, fetch_bytes, metadata, youtube_json,
)

VIDEO_ID = "abcdefghijk"
SNIPPET = {"title": "Aviation &amp; crosswinds", "channelTitle": "Learning",
           "description": "Short aviation explainer"}


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("PROJECT_TELOS_LOCAL_DATA_DIR", str(tmp_path))
    get_settings.cache_clear()
    reset_providers()
    with TestClient(create_app()) as instance:
        yield instance
    get_settings.cache_clear()
    reset_providers()


def configured(monkeypatch: pytest.MonkeyPatch) -> Settings:
    monkeypatch.setenv("YOUTUBE_API_KEY", "private-youtube-key")
    monkeypatch.setenv("GEMINI_API_KEY", "private-gemini-key")
    return Settings(_env_file=None)


def profile(client: TestClient, text: str = "I like aviation. No graphic content.") -> str:
    response = client.post("/profiles", json={"utterance": text, "context": "learning"})
    assert response.status_code == 201
    return response.json()["id"]


def official_response(resource, params, settings):
    if resource == "search":
        return {"items": [{"id": {"videoId": VIDEO_ID}, "snippet": SNIPPET}]}
    return {"items": [{
        "id": VIDEO_ID, "snippet": SNIPPET,
        "status": {"privacyStatus": "public", "embeddable": True},
        "contentDetails": {"duration": "PT30S"},
    }]}


def audit_payload(score: int = 0, category: str = "aviation", intensity: str = "none") -> dict:
    return {
        "topics": ["aviation"],
        "evidenceStatus": "sufficient", "baitScore": score,
        "explanation": "Compared the advertised lesson with observed video.",
        "summary": "Pilots compensate for crosswind to align with a runway.", "confidence": 0.8,
        "evidence": [{
            "startSec": 0, "endSec": 30, "promised": "Aviation lesson",
            "observed": "Aviation lesson" if score == 0 else "Unrelated incident",
            "mismatch": score > 0,
        }],
        "segments": [{
            "startSec": 0, "endSec": 30,
            "labels": [{"category": category, "intensity": intensity}], "confidence": 0.8,
        }],
    }


@pytest.mark.parametrize(("topics", "expected"), [
    (["cooking"], "hold"), ([], "unverified"), (["aviation"], "eligible"),
])
def test_live_topic_check_is_independent_of_clean_safety(client, monkeypatch, topics, expected):
    profile_id = profile(client)
    enable_analysis(client, monkeypatch)
    search(client, profile_id)
    audit = Audit(**{**audit_payload(), "topics": topics})
    monkeypatch.setattr("project_telos_api.youtube_discovery.audit_video", lambda *args: audit)
    result = analyse(client, profile_id).json()
    assert result["decision"]["action"] == "allow"
    assert result["recommendation"] == expected
    assert result["topicMatch"]["topics"] == topics


def enable_analysis(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    settings = configured(monkeypatch).model_copy(update={"provider": "gemini"})
    client.app.dependency_overrides[get_settings] = lambda: settings
    monkeypatch.setattr("project_telos_api.youtube_discovery.youtube_json", official_response)


def search(client, profile_id):
    return client.post("/project-telos/youtube/search", json={"profileId": profile_id})


def analyse(client, profile_id, consent=True):
    return client.post("/project-telos/youtube/analyse", json={
        "profileId": profile_id, "videoId": VIDEO_ID, "consentToGoogleAnalysis": consent,
    })


def test_status_never_exposes_credentials(client, monkeypatch):
    settings = configured(monkeypatch)
    client.app.dependency_overrides[get_settings] = lambda: settings
    response = client.get("/project-telos/youtube/status")
    assert response.json()["searchConfigured"] is True
    assert response.json()["analysisConfigured"] is False
    assert "private-" not in response.text
    assert "private-" not in repr(settings)


def test_missing_configuration_and_interests_are_explicit(client):
    profile_id = profile(client)
    assert search(client, profile_id).status_code == 503
    assert search(client, "missing").status_code == 404
    no_interests = profile(client, "No graphic content")
    assert search(client, no_interests).status_code == 422
    assert analyse(client, profile_id).status_code == 404
    assert analyse(client, profile_id, consent=False).status_code == 422


def test_search_uses_only_positive_interests_and_short_embeddable_candidates(client, monkeypatch):
    profile_id = profile(client, "I like aviation. No graphic content because it bothers me.")
    captured = {}

    def official(resource, params, settings):
        captured.update(params)
        return official_response(resource, params, settings)

    monkeypatch.setattr("project_telos_api.youtube_discovery.youtube_json", official)
    result = search(client, profile_id)
    assert result.status_code == 200
    assert captured["q"] == "aviation"
    assert captured["safeSearch"] == "strict"
    assert captured["videoEmbeddable"] == "true"
    assert captured["videoDuration"] == "short"
    assert captured["maxResults"] == "5"
    assert "bothers" not in str(captured)
    assert result.json()["videos"][0]["title"] == "Aviation & crosswinds"
    assert result.json()["videos"][0]["canonicalUrl"].endswith(VIDEO_ID)
    assert "not consent-approved" in result.json()["note"]
    # Offline or Vertex configuration must not return a fake successful audit.
    assert analyse(client, profile_id).status_code == 503
    assert client.get("/project-telos/receipt/demo").json()["itemsPushed"] == 0


@pytest.mark.parametrize("score,category,intensity,expected", [
    (0, "aviation", "none", "eligible"),
    (20, "aviation", "none", "eligible"),
    (60, "aviation", "none", "eligible"),
    (61, "aviation", "none", "hold"),
    (0, "graphic_injury", "strong", "hold"),
])
def test_bait_and_boundary_outcomes_are_separate(
    client, monkeypatch, score, category, intensity, expected,
):
    profile_id = profile(client)
    enable_analysis(client, monkeypatch)
    search(client, profile_id)
    monkeypatch.setattr("project_telos_api.youtube_discovery.audit_video", lambda *args: Audit(
        **audit_payload(score, category, intensity),
    ))
    result = analyse(client, profile_id)
    assert result.status_code == 200
    assert result.json()["recommendation"] == expected
    assert result.json()["audit"]["baitScore"] == score
    assert result.json()["analysedBy"].startswith("Live Gemini")
    from project_telos_api.store import Store
    saved = Store(get_settings().local_data_dir).youtube_analyses.get(f"{profile_id}:{VIDEO_ID}")
    assert saved == result.json()
    assert client.get("/project-telos/receipt/demo").json()["itemsPushed"] == 0
    assert client.delete(f"/profiles/{profile_id}").status_code == 204
    store = Store(get_settings().local_data_dir)
    assert store.youtube_searches.get(profile_id) is None
    assert store.youtube_analyses.get(f"{profile_id}:{VIDEO_ID}") is None


def test_insufficient_evidence_is_unverified_not_allowed(client, monkeypatch):
    profile_id = profile(client)
    enable_analysis(client, monkeypatch)
    search(client, profile_id)
    payload = {
        **audit_payload(), "evidenceStatus": "insufficient", "baitScore": None,
        "evidence": [], "segments": [],
    }
    monkeypatch.setattr("project_telos_api.youtube_discovery.audit_video", lambda *args: Audit(**payload))
    result = analyse(client, profile_id)
    assert result.status_code == 200
    assert result.json()["recommendation"] == "unverified"
    assert result.json()["decision"] is None
    assert result.json()["audit"]["baitScore"] is None


@pytest.mark.parametrize("change", [
    {"segments": []},
    {"baitScore": 120},
    {"evidenceStatus": "insufficient", "baitScore": 0},
    {"evidence": []},
    {"baitScore": 80},
])
def test_audit_schema_rejects_unsubstantiated_scores(change):
    with pytest.raises(ValidationError):
        Audit(**{**audit_payload(), **change})


@pytest.mark.parametrize("start,end", [(1, 30), (0, 29), (0, 31), (20, 10)])
def test_invalid_coverage_has_no_verdict(client, monkeypatch, start, end):
    profile_id = profile(client)
    enable_analysis(client, monkeypatch)
    search(client, profile_id)
    payload = audit_payload()
    payload["segments"][0].update(startSec=start, endSec=end)
    monkeypatch.setattr("project_telos_api.youtube_discovery.audit_video", lambda *args: Audit(**payload))
    assert analyse(client, profile_id).status_code == 502


@pytest.mark.parametrize("duration,privacy,embeddable,expected", [
    ("PT4M1S", "public", True, 422),
    ("PT0S", "public", True, 422),
    ("invalid", "public", True, 502),
    ("PT30S", "private", True, 422),
    ("PT30S", "public", False, 422),
])
def test_unavailable_long_or_nonpublic_videos_do_not_reach_gemini(
    client, monkeypatch, duration, privacy, embeddable, expected,
):
    profile_id = profile(client)
    enable_analysis(client, monkeypatch)
    search(client, profile_id)

    def details(resource, params, settings):
        response = official_response(resource, params, settings)
        row = response["items"][0]
        row["contentDetails"]["duration"] = duration
        row["status"].update(privacyStatus=privacy, embeddable=embeddable)
        return response

    monkeypatch.setattr("project_telos_api.youtube_discovery.youtube_json", details)
    monkeypatch.setattr("project_telos_api.youtube_discovery.audit_video",
                        lambda *args: pytest.fail("Must not call Gemini"))
    assert analyse(client, profile_id).status_code == expected


@pytest.mark.parametrize("provider", ["gemini", "vertex"])
def test_sdk_input_includes_real_thumbnail_and_url_but_not_boundary_reasons(monkeypatch, provider):
    settings = configured(monkeypatch).model_copy(update={
        "provider": provider, "google_cloud_project": "vertex-test",
    })
    captured = {}

    def generate(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(text=json.dumps(audit_payload()))

    @contextmanager
    def client(**kwargs):
        assert kwargs == (
            {"api_key": None, "project": "vertex-test", "location": "us-central1"}
            if provider == "vertex" else {"api_key": "private-gemini-key"}
        )
        yield SimpleNamespace(models=SimpleNamespace(generate_content=generate))

    monkeypatch.setattr("project_telos_api.youtube_discovery.build_client", client)
    monkeypatch.setattr("project_telos_api.youtube_discovery.fetch_bytes", lambda url: b"\xff\xd8\xffsample")
    result = audit_video(metadata(VIDEO_ID, SNIPPET, 30), settings)
    assert result.baitScore == 0
    assert captured["contents"][1]["inline_data"]["mime_type"] == "image/jpeg"
    assert captured["contents"][2]["file_data"]["file_uri"].endswith(VIDEO_ID)
    assert "bothers me" not in str(captured)
    assert captured["config"]["response_mime_type"] == "application/json"
    schema = captured["config"]["response_json_schema"]
    assert schema == generation_schema(Audit.model_json_schema())
    assert {"type": "null"} in schema["properties"]["baitScore"]["anyOf"]
    assert "exclusiveMinimum" not in json.dumps(schema)
    assert "response_schema" not in captured["config"]
    assert captured["config"]["http_options"]["timeout"] == 120_000


def fake_sdk(monkeypatch, replies):
    calls = []

    def generate(**kwargs):
        calls.append(kwargs)
        reply = replies[len(calls) - 1]
        if isinstance(reply, Exception):
            raise reply
        return SimpleNamespace(text=reply)

    @contextmanager
    def client(**kwargs):
        yield SimpleNamespace(models=SimpleNamespace(generate_content=generate))

    monkeypatch.setattr("project_telos_api.youtube_discovery.build_client", client)
    monkeypatch.setattr("project_telos_api.youtube_discovery.fetch_bytes", lambda url: b"\xff\xd8\xffsample")
    return calls


def test_invalid_model_output_is_retried_once(monkeypatch):
    settings = configured(monkeypatch).model_copy(update={"provider": "gemini"})
    calls = fake_sdk(monkeypatch, ["not JSON", json.dumps(audit_payload())])
    assert audit_video(metadata(VIDEO_ID, SNIPPET, 30), settings).baitScore == 0
    assert len(calls) == 2


def test_incomplete_timeline_is_retried_then_refused(monkeypatch):
    settings = configured(monkeypatch).model_copy(update={"provider": "gemini"})
    short = audit_payload()
    short["segments"][0]["endSec"] = 10
    calls = fake_sdk(monkeypatch, [json.dumps(short), json.dumps(short)])
    with pytest.raises(HTTPException, match="timeline coverage"):
        audit_video(metadata(VIDEO_ID, SNIPPET, 30), settings)
    assert len(calls) == 2


def test_client_errors_are_not_retried(monkeypatch):
    settings = configured(monkeypatch).model_copy(update={"provider": "gemini"})

    class Rejected(Exception):
        code = 400

    calls = fake_sdk(monkeypatch, [Rejected("bad request"), json.dumps(audit_payload())])
    with pytest.raises(HTTPException):
        audit_video(metadata(VIDEO_ID, SNIPPET, 30), settings)
    assert len(calls) == 1


def test_audit_sends_declared_interests_and_uses_judged_matches(client, monkeypatch):
    profile_id = profile(client)
    enable_analysis(client, monkeypatch)
    search(client, profile_id)
    calls = fake_sdk(monkeypatch, [json.dumps({
        **audit_payload(), "topics": ["flight training", "crosswind landings"], "interestMatches": ["aviation"],
    })])
    response = analyse(client, profile_id)
    assert response.status_code == 200, response.text
    result = response.json()
    assert '"declaredInterests"' in calls[0]["contents"][0]["text"]
    assert "No graphic content" not in json.dumps(calls[0]["contents"][0])
    assert result["topicMatch"]["status"] == "matched"
    assert result["topicMatch"]["judgedInterests"] == result["topicMatch"]["matchedInterests"]
    assert result["recommendation"] == "eligible"


def test_invalid_sdk_response_and_thumbnail_fail_explicitly(monkeypatch):
    settings = configured(monkeypatch).model_copy(update={"provider": "gemini"})
    video = metadata(VIDEO_ID, SNIPPET, 30)
    monkeypatch.setattr("project_telos_api.youtube_discovery.fetch_bytes", lambda url: b"not a JPEG")
    with pytest.raises(HTTPException, match="thumbnail"):
        audit_video(video, settings)

    @contextmanager
    def client(**kwargs):
        yield SimpleNamespace(models=SimpleNamespace(
            generate_content=lambda **kwargs: SimpleNamespace(text="not JSON"),
        ))

    monkeypatch.setattr("project_telos_api.youtube_discovery.fetch_bytes", lambda url: b"\xff\xd8\xffsample")
    monkeypatch.setattr("project_telos_api.youtube_discovery.build_client", client)
    with pytest.raises(HTTPException, match="No safety verdict"):
        audit_video(video, settings)


@pytest.mark.parametrize("value,expected", [("PT30S", 30), ("PT4M", 240), ("PT1H2M3S", 3723)])
def test_duration(value, expected):
    assert duration_seconds(value) == expected


def test_no_redirect_and_bounded_transport_errors(monkeypatch):
    assert NoRedirects().redirect_request(None, None, 302, "", {}, "http://localhost") is None

    class FailingOpener:
        def open(self, request, timeout):
            raise HTTPError(request.full_url, 403, "secret-bearing-message", {}, None)

    monkeypatch.setattr("project_telos_api.youtube_discovery.build_opener", lambda *args: FailingOpener())
    with pytest.raises(HTTPException) as error:
        fetch_bytes("https://www.googleapis.com/youtube/v3/search?key=private-value")
    assert "private-value" not in str(error.value)
    assert "secret-bearing-message" not in str(error.value)


def test_google_metadata_transport_is_fixed_and_size_bounded(monkeypatch):
    settings = configured(monkeypatch)
    seen = []

    def transport(url):
        seen.append(url)
        return b'{"items": []}'

    monkeypatch.setattr("project_telos_api.youtube_discovery.fetch_bytes", transport)
    assert youtube_json("search", {"q": "aviation & music"}, settings) == {"items": []}
    assert seen[0].startswith("https://www.googleapis.com/youtube/v3/search?")
    assert "q=aviation+%26+music" in seen[0]
    monkeypatch.setattr("project_telos_api.youtube_discovery.fetch_bytes", lambda url: b"[]")
    with pytest.raises(HTTPException, match="invalid metadata"):
        youtube_json("search", {}, settings)


# --- Pasted links ---------------------------------------------------------------------------

def fake_public_fetch(urls: list[str]):
    def fetch(url: str) -> bytes:
        urls.append(url)
        if url.startswith("https://www.youtube.com/oembed?"):
            return json.dumps({"title": "Me at the zoo &amp; elephants", "author_name": "jawed"}).encode()
        raise AssertionError(f"unexpected fetch {url}")
    return fetch


def test_pasted_link_uses_keyless_oembed_and_dedupes(client, monkeypatch) -> None:
    urls: list[str] = []
    monkeypatch.setattr("project_telos_api.youtube_discovery.fetch_bytes", fake_public_fetch(urls))
    profile_id = profile(client)
    first = client.post("/project-telos/youtube/link",
                        json={"profileId": profile_id, "url": "https://youtu.be/jNQXAC9IVRw"})
    assert first.status_code == 200, first.text
    assert first.json()["video"]["title"] == "Me at the zoo & elephants"
    assert first.json()["video"]["canonicalUrl"] == "https://www.youtube.com/watch?v=jNQXAC9IVRw"
    assert "not a safety verdict" in first.json()["note"]
    assert urls and "oembed" in urls[0] and "key=" not in urls[0]
    client.post("/project-telos/youtube/link",
                json={"profileId": profile_id, "url": "https://www.youtube.com/watch?v=jNQXAC9IVRw"})
    from project_telos_api.store import Store
    saved = Store(get_settings().local_data_dir).youtube_searches.get(profile_id)
    assert [row["videoId"] for row in saved["videos"]] == ["jNQXAC9IVRw"]
    assert saved["pastedIds"] == ["jNQXAC9IVRw"]


@pytest.mark.parametrize("url", ["https://example.com/watch?v=jNQXAC9IVRw", "not a url"])
def test_pasted_link_rejects_non_youtube_urls(client, url: str) -> None:
    response = client.post("/project-telos/youtube/link", json={"profileId": profile(client), "url": url})
    assert response.status_code == 422


def test_pasted_link_requires_a_profile(client) -> None:
    response = client.post("/project-telos/youtube/link",
                           json={"profileId": "missing", "url": "https://youtu.be/jNQXAC9IVRw"})
    assert response.status_code == 404


def test_search_keeps_pasted_videos_after_official_results(client, monkeypatch) -> None:
    monkeypatch.setattr("project_telos_api.youtube_discovery.fetch_bytes", fake_public_fetch([]))
    profile_id = profile(client)
    client.post("/project-telos/youtube/link",
                json={"profileId": profile_id, "url": "https://youtu.be/jNQXAC9IVRw"})
    settings = configured(monkeypatch)
    client.app.dependency_overrides[get_settings] = lambda: settings
    monkeypatch.setattr("project_telos_api.youtube_discovery.youtube_json", official_response)
    response = client.post("/project-telos/youtube/search", json={"profileId": profile_id})
    assert [row["videoId"] for row in response.json()["videos"]] == [VIDEO_ID, "jNQXAC9IVRw"]
    client.app.dependency_overrides.clear()