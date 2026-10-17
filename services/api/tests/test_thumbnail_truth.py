"""ThumbnailTruth: upload validation, consent, scoring bands, and honest offline behaviour."""

from __future__ import annotations

import base64
import json
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient

from project_telos_api.config import get_settings
from project_telos_api.main import create_app
from project_telos_api.providers import reset_providers
from project_telos_api.providers.gemini import generation_schema
from project_telos_api.thumbnail_truth import (
    MAX_THUMBNAIL_BYTES, GhostEntityScan, SentimentScan, band_for, build_result, combine,
    ghost_tracker,
)

JPEG = b"\xff\xd8\xff" + b"\x00" * 32


def b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def ghost_payload(**overrides: Any) -> dict[str, Any]:
    payload = {
        "evidence_status": "sufficient",
        "thumbnail_entities": ["Presenter", "Ferrari"],
        "verified_in_video": ["Presenter"],
        "ghost_entities_found": ["Ferrari"],
        "visual_exaggeration_detected": True,
        "exaggeration_details": "Red circle around an empty driveway.",
        "alignment_score": 20,
        "reasoning_summary": "The Ferrari never appears in the transcript.",
    }
    return {**payload, **overrides}


def sentiment_payload(**overrides: Any) -> dict[str, Any]:
    payload = {
        "thumbnail_projected_sentiment": "Shock",
        "actual_video_sentiment": "Calm tutorial",
        "sentiment_contradiction_detected": True,
        "thematic_mismatch_detected": False,
        "deception_risk_score": 80,
        "reasoning_summary": "Shock framing over a calm tutorial.",
        "creator_remediation_tip": "Show the real car.",
    }
    return {**payload, **overrides}


def request_body(**overrides: Any) -> dict[str, Any]:
    body = {
        "title": "Washing my hatchback",
        "description": "A calm how-to.",
        "transcript": "We rinse, foam, and dry the hatchback.",
        "region": "India",
        "thumbnail": {"mimeType": "image/jpeg", "dataBase64": b64(JPEG)},
        "consentToGoogleAnalysis": True,
    }
    return {**body, **overrides}


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("PROJECT_TELOS_LOCAL_DATA_DIR", str(tmp_path))
    get_settings.cache_clear()
    reset_providers()
    with TestClient(create_app()) as instance:
        yield instance
    get_settings.cache_clear()
    reset_providers()


@pytest.fixture(params=["gemini", "vertex"])
def live(monkeypatch: pytest.MonkeyPatch, tmp_path: Path, request):
    monkeypatch.setenv("PROJECT_TELOS_PROVIDER", request.param)
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "vertex-test")
    monkeypatch.setenv("GEMINI_API_KEY", "private-gemini-key")
    monkeypatch.setenv("PROJECT_TELOS_LOCAL_DATA_DIR", str(tmp_path))
    get_settings.cache_clear()
    calls: list[dict[str, Any]] = []
    responses = [json.dumps(ghost_payload()), json.dumps(sentiment_payload())]

    def generate(**kwargs: Any) -> SimpleNamespace:
        calls.append(kwargs)
        return SimpleNamespace(text=responses[len(calls) - 1])

    @contextmanager
    def fake_client(**kwargs: Any):
        assert kwargs == (
            {"api_key": None, "project": "vertex-test", "location": "us-central1"}
            if request.param == "vertex" else {"api_key": "private-gemini-key"}
        )
        yield SimpleNamespace(models=SimpleNamespace(generate_content=generate))

    monkeypatch.setattr("project_telos_api.thumbnail_truth.build_client", fake_client)
    with TestClient(create_app()) as instance:
        yield instance, calls, responses
    get_settings.cache_clear()


@pytest.mark.parametrize(("score", "band"), [(0, "safe"), (30, "safe"), (31, "review"),
                                             (65, "review"), (66, "high"), (100, "high")])
def test_bands_match_the_dashboard_thresholds(score: int, band: str) -> None:
    assert band_for(score) == band


def test_combine_is_reproducible_from_the_breakdown() -> None:
    score, breakdown = combine(GhostEntityScan(**ghost_payload()), SentimentScan(**sentiment_payload()))
    assert breakdown.visualRisk == 80 and breakdown.sentimentRisk == 80
    assert breakdown.penalties == 20
    assert score == 100


def test_combine_without_patterns_adds_no_penalty() -> None:
    score, breakdown = combine(
        GhostEntityScan(**ghost_payload(ghost_entities_found=[], visual_exaggeration_detected=False,
                                        alignment_score=90)),
        SentimentScan(**sentiment_payload(sentiment_contradiction_detected=False,
                                          deception_risk_score=10)),
    )
    assert breakdown.penalties == 0
    assert score == 10


def test_ghost_tracker_marks_each_entity_once() -> None:
    tracker = ghost_tracker(GhostEntityScan(**ghost_payload(
        thumbnail_entities=["Presenter", "Ferrari", "Fire", "ferrari"], ghost_entities_found=["Ferrari"],
    )))
    assert [(item.entity, item.status) for item in tracker] == [
        ("Presenter", "verified"), ("Ferrari", "ghost"), ("Fire", "unconfirmed"),
    ]


def test_insufficient_evidence_is_unverified_not_guessed() -> None:
    result = build_result(
        GhostEntityScan(**ghost_payload(evidence_status="insufficient")),
        SentimentScan(**sentiment_payload()), source="gemini", model="m", video_provided=False,
    )
    assert result.band == "unverified"
    assert result.riskScore is None and result.breakdown is None
    assert "transcript" in result.remediationTip


def test_status_reports_offline_without_secrets(client: TestClient) -> None:
    body = client.get("/project-telos/thumbnail-truth/status").json()
    assert body["liveConfigured"] is False
    assert body["maxThumbnailBytes"] == MAX_THUMBNAIL_BYTES
    assert "private" not in json.dumps(body)


def test_samples_are_labelled_and_cover_every_band(client: TestClient) -> None:
    samples = client.get("/project-telos/thumbnail-truth/samples").json()
    assert {sample["result"]["band"] for sample in samples} == {"safe", "review", "high"}
    for sample in samples:
        assert sample["result"]["source"] == "reviewed-sample"
        assert sample["result"]["model"] is None
        assert "no model call" in sample["result"]["note"]


def test_offline_upload_is_refused_rather_than_fabricated(client: TestClient) -> None:
    response = client.post("/project-telos/thumbnail-truth/analyse", json=request_body())
    assert response.status_code == 503
    assert "Reviewed samples" in response.json()["detail"]


def test_consent_is_required_before_any_upload_is_processed(client: TestClient) -> None:
    response = client.post("/project-telos/thumbnail-truth/analyse",
                           json=request_body(consentToGoogleAnalysis=False))
    assert response.status_code == 422
    assert "consent" in response.json()["detail"].lower()


@pytest.mark.parametrize(("thumbnail", "status"), [
    ({"mimeType": "image/gif", "dataBase64": b64(JPEG)}, 415),
    ({"mimeType": "image/png", "dataBase64": b64(JPEG)}, 415),
    ({"mimeType": "image/jpeg", "dataBase64": "not base64!!"}, 422),
    ({"mimeType": "image/jpeg", "dataBase64": b64(JPEG + b"\x00" * MAX_THUMBNAIL_BYTES)}, 413),
])
def test_thumbnail_is_validated(client: TestClient, thumbnail: dict[str, str], status: int) -> None:
    response = client.post("/project-telos/thumbnail-truth/analyse", json=request_body(thumbnail=thumbnail))
    assert response.status_code == status


def test_unsupported_video_type_is_rejected(client: TestClient) -> None:
    response = client.post("/project-telos/thumbnail-truth/analyse", json=request_body(
        video={"mimeType": "application/pdf", "dataBase64": b64(b"%PDF")}))
    assert response.status_code == 415


def test_extra_fields_are_rejected(client: TestClient) -> None:
    response = client.post("/project-telos/thumbnail-truth/analyse", json=request_body(score=0))
    assert response.status_code == 422


def test_live_analysis_runs_both_scans_with_json_config(live) -> None:
    client, calls, _ = live
    response = client.post("/project-telos/thumbnail-truth/analyse", json=request_body(
        video={"mimeType": "video/mp4", "dataBase64": b64(b"\x00\x00\x00\x18ftypmp42")}))
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "gemini" and body["band"] == "high"
    assert body["videoProvided"] is True
    assert {"entity": "Ferrari", "status": "ghost"} in body["ghostTracker"]
    assert len(calls) == 2
    for call in calls:
        assert call["config"]["response_mime_type"] == "application/json"
        assert call["config"]["response_json_schema"] in (
            generation_schema(GhostEntityScan.model_json_schema()),
            generation_schema(SentimentScan.model_json_schema()),
        )
        assert "response_schema" not in call["config"]
        assert call["config"]["temperature"] == 0.1
        assert [part.get("inline_data", {}).get("mime_type") for part in call["contents"][1:]] == [
            "image/jpeg", "video/mp4"]
        assert call["contents"][0]["text"].startswith("<submission>")
    assert "private-gemini-key" not in json.dumps(body)


def test_creator_schema_uses_sdk_supported_inclusive_timestamp_bounds() -> None:
    schema = GhostEntityScan.model_json_schema()
    end_schema = schema["$defs"]["CreatorEvidence"]["properties"]["endSec"]
    number_schema = next(part for part in end_schema["anyOf"] if part["type"] == "number")
    assert number_schema["minimum"] == 0
    assert "exclusiveMinimum" not in json.dumps(schema)
    from pydantic import ValidationError
    from project_telos_api.thumbnail_truth import CreatorEvidence

    with pytest.raises(ValidationError):
        CreatorEvidence(promised="Tutorial", observed="Tutorial", startSec=0, endSec=0)


def test_creator_json_schema_can_be_loaded_by_google_sdk() -> None:
    pytest.importorskip("google.genai")
    from google.genai import types

    for scan in (GhostEntityScan, SentimentScan):
        schema = scan.model_json_schema()
        config = types.GenerateContentConfig(
            response_mime_type="application/json", response_json_schema=schema,
        )
        assert config.response_json_schema == schema
        assert config.response_schema is None


def test_invalid_model_output_produces_no_verdict(live) -> None:
    client, _, responses = live
    responses[0] = json.dumps({"alignment_score": 500})
    response = client.post("/project-telos/thumbnail-truth/analyse", json=request_body())
    assert response.status_code == 502
    assert "No safety verdict" in response.json()["detail"]


@pytest.mark.parametrize(("code", "expected"), [(402, 402), (503, 503), (429, 429)])
def test_upstream_outage_or_quota_is_not_reported_as_invalid_evidence(live, monkeypatch, code, expected):
    client, _, _ = live

    def fail(**kwargs):
        exc = RuntimeError("private-provider-details")
        exc.code = code
        raise exc

    monkeypatch.setattr("project_telos_api.thumbnail_truth.build_client", fail)
    response = client.post("/project-telos/thumbnail-truth/analyse", json=request_body())
    assert response.status_code == expected
    assert "invalid evidence" not in response.text
    assert "private-provider-details" not in response.text


# --- Published YouTube link check ---------------------------------------------------------

from project_telos_api.youtube_discovery import Video  # noqa: E402


def test_creator_evidence_keeps_unknown_timestamps_and_rejects_invalid_ranges():
    from pydantic import ValidationError
    from project_telos_api.thumbnail_truth import CreatorEvidence

    evidence = CreatorEvidence(promised="A supercar", observed="A hatchback")
    assert evidence.startSec is None and evidence.endSec is None
    assert CreatorEvidence(promised="Desk DIY", observed="Incident", startSec=14, endSec=21).endSec == 21
    for stamps in ({"startSec": 2}, {"endSec": 3}, {"startSec": 3, "endSec": 2}, {"startSec": -1, "endSec": 2}):
        with pytest.raises(ValidationError):
            CreatorEvidence(promised="DIY", observed="Incident", **stamps)


def test_samples_supply_honest_improvements_without_invented_timestamps(client):
    sample = client.get("/project-telos/thumbnail-truth/samples").json()[1]
    assert sample["result"]["improvedTitle"] == "How I wash my hatchback with one shampoo"
    evidence = sample["result"]["evidence"][0]
    assert evidence["observed"] == sample["transcript"]
    assert evidence["startSec"] is None


def test_live_creator_report_carries_topics_evidence_and_title_suggestion(live):
    client, _, responses = live
    responses[0] = json.dumps(ghost_payload(
        promised_topics=["supercar"], actual_topics=["car wash"],
        evidence=[{"promised": "Supercar", "observed": "Hatchback", "startSec": None, "endSec": None}],
    ))
    responses[1] = json.dumps(sentiment_payload(improved_title="A hatchback wash"))
    result = client.post("/project-telos/thumbnail-truth/analyse", json=request_body()).json()
    assert result["promisedTopics"] == ["supercar"]
    assert result["actualTopics"] == ["car wash"]
    assert result["evidence"][0]["startSec"] is None
    assert result["improvedTitle"] == "A hatchback wash"


def test_linked_creator_check_rejects_evidence_outside_known_duration(linked, live):
    client, _, _ = linked
    _, _, responses = live
    responses[0] = json.dumps(ghost_payload(
        evidence=[{"promised": "Zoo", "observed": "Zoo", "startSec": 18, "endSec": 40}],
    ))
    response = client.post("/project-telos/thumbnail-truth/analyse-youtube", json=youtube_body())
    assert response.status_code == 502
    assert "outside the video timeline" in response.json()["detail"]

ZOO = Video(videoId="jNQXAC9IVRw", canonicalUrl="https://www.youtube.com/watch?v=jNQXAC9IVRw",
            title="Me at the zoo", channel="jawed", description="", durationSec=19.0)


@pytest.fixture
def linked(live, monkeypatch: pytest.MonkeyPatch):
    client, calls, responses = live
    recorded: list[dict[str, Any]] = []
    monkeypatch.setattr("project_telos_api.thumbnail_truth.resolve_link", lambda url, settings: ZOO)
    monkeypatch.setattr("project_telos_api.thumbnail_truth.fetch_thumbnail", lambda video_id: JPEG)
    monkeypatch.setattr("project_telos_api.thumbnail_truth.record_verdict",
                        lambda settings, row: recorded.append(row) or True)
    return client, calls, recorded


def youtube_body(**overrides: Any) -> dict[str, Any]:
    return {"url": "https://youtu.be/jNQXAC9IVRw", "transcript": "", "region": "US",
            "consentToGoogleAnalysis": True, **overrides}


def test_youtube_check_sends_the_real_thumbnail_and_public_video(linked) -> None:
    client, calls, recorded = linked
    response = client.post("/project-telos/thumbnail-truth/analyse-youtube", json=youtube_body())
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["youtubeVideo"]["videoId"] == "jNQXAC9IVRw"
    assert result["videoProvided"] is True and result["source"] == "gemini"
    contents = calls[0]["contents"]
    serialized = json.dumps(contents)
    assert len(contents) == 3 and contents[2] == {"file_data": {"file_uri": ZOO.canonicalUrl, "mime_type": "video/mp4"}}
    assert "public YouTube video" in serialized and "Me at the zoo" in serialized
    assert recorded and recorded[0]["kind"] == "thumbnail_truth" and recorded[0]["source"] == "youtube-link"
    assert recorded[0]["band"] == result["band"] and "title" not in recorded[0]


def test_youtube_check_requires_consent_and_live_configuration(client, linked) -> None:
    live_client, calls, _ = linked
    refused = live_client.post("/project-telos/thumbnail-truth/analyse-youtube",
                               json=youtube_body(consentToGoogleAnalysis=False))
    assert refused.status_code == 422 and not calls


def test_youtube_check_is_refused_offline(client) -> None:
    response = client.post("/project-telos/thumbnail-truth/analyse-youtube", json=youtube_body())
    assert response.status_code == 503


def test_youtube_check_rejects_long_videos(linked, monkeypatch: pytest.MonkeyPatch) -> None:
    client, calls, _ = linked
    long_video = ZOO.model_copy(update={"durationSec": 21 * 60.0})
    monkeypatch.setattr("project_telos_api.thumbnail_truth.resolve_link", lambda url, settings: long_video)
    response = client.post("/project-telos/thumbnail-truth/analyse-youtube", json=youtube_body())
    assert response.status_code == 422 and not calls


def test_youtube_check_can_analyse_only_the_opening_of_a_long_video(linked, monkeypatch: pytest.MonkeyPatch) -> None:
    client, calls, _ = linked
    long_video = ZOO.model_copy(update={"durationSec": 21 * 60.0})
    monkeypatch.setattr("project_telos_api.thumbnail_truth.resolve_link", lambda url, settings: long_video)
    response = client.post("/project-telos/thumbnail-truth/analyse-youtube", json=youtube_body(clipSeconds=60))
    assert response.status_code == 200, response.text
    assert response.json()["analysedWindowSec"] == 60
    video_part = calls[0]["contents"][2]
    assert video_part["video_metadata"] == {"start_offset": "0s", "end_offset": "60s"}
    assert "first 60 seconds" in calls[0]["contents"][0]["text"]


def test_youtube_clip_longer_than_the_video_analyses_the_whole_video(linked) -> None:
    client, calls, _ = linked
    response = client.post("/project-telos/thumbnail-truth/analyse-youtube", json=youtube_body(clipSeconds=60))
    assert response.status_code == 200, response.text
    assert response.json()["analysedWindowSec"] is None
    assert "video_metadata" not in calls[0]["contents"][2]


def test_a_stalled_scan_is_retried_once(linked, monkeypatch: pytest.MonkeyPatch) -> None:
    client, _, _ = linked
    attempts: list[str] = []
    payloads = iter([json.dumps(ghost_payload()), json.dumps(sentiment_payload())])

    class Deadline(Exception):
        code = 504

    def generate(**kwargs: Any) -> SimpleNamespace:
        attempts.append(kwargs["config"]["system_instruction"])
        if len(attempts) == 1:
            raise Deadline("DEADLINE_EXCEEDED")
        return SimpleNamespace(text=next(payloads))

    @contextmanager
    def fake_client(**_: Any):
        yield SimpleNamespace(models=SimpleNamespace(generate_content=generate))

    monkeypatch.setattr("project_telos_api.thumbnail_truth.build_client", fake_client)
    response = client.post("/project-telos/thumbnail-truth/analyse-youtube", json=youtube_body())
    assert response.status_code == 200, response.text
    assert len(attempts) == 3 and attempts[0] == attempts[1]


def test_youtube_preview_returns_metadata_without_a_model_call(linked) -> None:
    client, calls, _ = linked
    response = client.post("/project-telos/thumbnail-truth/youtube-preview", json={"url": "https://youtu.be/jNQXAC9IVRw"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["video"]["durationSec"] == 19 and body["maxFullSeconds"] == 20 * 60 and not calls


def test_non_english_drafts_are_translated_before_scanning(live, monkeypatch: pytest.MonkeyPatch) -> None:
    from project_telos_api.translation import TranslationOutcome

    client, calls, _ = live
    monkeypatch.setattr(
        "project_telos_api.thumbnail_truth.translate_fields",
        lambda fields, settings: ({"title": "I washed my car"},
                                  TranslationOutcome(detectedLanguage="hi", translated=True)),
    )
    monkeypatch.setattr("project_telos_api.thumbnail_truth.record_verdict", lambda settings, row: True)
    response = client.post("/project-telos/thumbnail-truth/analyse",
                           json=request_body(title="मैंने अपनी कार धोई"))
    assert response.status_code == 200, response.text
    assert response.json()["translation"] == {"detectedLanguage": "hi", "translated": True,
                                              "provider": "Cloud Translation v3"}
    assert "englishTranslation" in json.dumps(calls[0]["contents"])


# --- Imagen redesign --------------------------------------------------------------------------

def redesign_body(**overrides: Any) -> dict[str, Any]:
    return {"title": 'Washing my "hatchback"', "videoSummary": "A calm hatchback wash.",
            "avoid": ["Ferrari", "  "], "remediationTip": "Show the real car.",
            "consentToGoogleAnalysis": True, **overrides}


@pytest.fixture(params=["gemini", "vertex"])
def imagen(monkeypatch: pytest.MonkeyPatch, tmp_path: Path, request):
    monkeypatch.setenv("PROJECT_TELOS_PROVIDER", request.param)
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "vertex-test")
    monkeypatch.setenv("GEMINI_API_KEY", "private-gemini-key")
    monkeypatch.setenv("PROJECT_TELOS_LOCAL_DATA_DIR", str(tmp_path))
    get_settings.cache_clear()
    calls: list[dict[str, Any]] = []
    images: list[Any] = [SimpleNamespace(image=SimpleNamespace(image_bytes=b"\x89PNG", mime_type="image/png"))]

    def generate_images(**kwargs: Any) -> SimpleNamespace:
        calls.append(kwargs)
        return SimpleNamespace(generated_images=images)

    @contextmanager
    def fake_client(**kwargs: Any):
        assert kwargs == (
            {"api_key": None, "project": "vertex-test", "location": "us-central1"}
            if request.param == "vertex" else {"api_key": "private-gemini-key"}
        )
        yield SimpleNamespace(models=SimpleNamespace(generate_images=generate_images))

    monkeypatch.setattr("project_telos_api.thumbnail_truth.build_client", fake_client)
    with TestClient(create_app()) as instance:
        yield instance, calls, images
    get_settings.cache_clear()


def test_redesign_returns_an_imagen_suggestion_with_a_constrained_prompt(imagen) -> None:
    client, calls, _ = imagen
    response = client.post("/project-telos/thumbnail-truth/redesign", json=redesign_body())
    assert response.status_code == 200, response.text
    body = response.json()
    assert base64.b64decode(body["imageBase64"]) == b"\x89PNG" and body["mimeType"] == "image/png"
    assert "SynthID" in body["note"]
    prompt = calls[0]["prompt"]
    assert "Do not depict: Ferrari." in prompt and "No text, words, or logos" in prompt
    assert "Washing my 'hatchback'" in prompt and '"hatchback"' not in prompt
    assert calls[0]["config"] == {"number_of_images": 1, "aspect_ratio": "16:9"}


def test_redesign_reports_filtered_output_instead_of_inventing_one(imagen) -> None:
    client, _, images = imagen
    images.clear()
    response = client.post("/project-telos/thumbnail-truth/redesign", json=redesign_body())
    assert response.status_code == 502


def test_redesign_requires_consent_and_live_configuration(client, imagen) -> None:
    live_client, calls, _ = imagen
    assert live_client.post("/project-telos/thumbnail-truth/redesign",
                            json=redesign_body(consentToGoogleAnalysis=False)).status_code == 422
    assert not calls


def test_redesign_is_refused_offline(client) -> None:
    assert client.post("/project-telos/thumbnail-truth/redesign", json=redesign_body()).status_code == 503


def test_status_reports_new_capabilities_without_secrets(imagen) -> None:
    client, _, _ = imagen
    body = client.get("/project-telos/thumbnail-truth/status").json()
    assert body["imagenConfigured"] is True and body["imagenModel"]
    assert body["translationEnabled"] is False and body["analyticsEnabled"] is False
    assert "private-gemini-key" not in json.dumps(body)