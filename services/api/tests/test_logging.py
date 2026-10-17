"""Structured logging must emit JSON and correlate lines by request ID."""

from __future__ import annotations

import json
import logging

from project_telos_api.logging_setup import (
    configure_logging,
    get_logger,
    get_request_id,
    new_request_id,
    set_request_id,
    timed_tier,
)


class TestRequestCorrelation:
    def test_generates_an_id_when_none_supplied(self) -> None:
        request_id = set_request_id(None)
        assert request_id
        assert get_request_id() == request_id

    def test_preserves_an_inbound_id(self) -> None:
        set_request_id("inbound-123")
        assert get_request_id() == "inbound-123"

    def test_ids_are_unique(self) -> None:
        assert new_request_id() != new_request_id()


class TestJsonOutput:
    def test_emits_valid_json_with_request_id(self, capsys) -> None:  # type: ignore[no-untyped-def]
        configure_logging("INFO")
        set_request_id("req-abc")
        get_logger().info("test.event", extra={"asset_hash": "abc123"})

        line = capsys.readouterr().out.strip().splitlines()[-1]
        payload = json.loads(line)
        assert payload["message"] == "test.event"
        assert payload["request_id"] == "req-abc"
        assert payload["asset_hash"] == "abc123"
        assert payload["severity"] == "INFO"

    def test_configure_is_idempotent(self) -> None:
        configure_logging("INFO")
        configure_logging("INFO")
        assert len(logging.getLogger("project_telos").handlers) == 1

    def test_respects_configured_level(self, capsys) -> None:  # type: ignore[no-untyped-def]
        configure_logging("WARNING")
        get_logger().info("suppressed.event")
        assert "suppressed.event" not in capsys.readouterr().out


class TestTierTiming:
    def test_records_duration_for_a_tier(self, capsys) -> None:  # type: ignore[no-untyped-def]
        configure_logging("INFO")
        set_request_id("req-timing")

        with timed_tier("segment_analysis", asset_hash="abc123"):
            pass

        payload = json.loads(capsys.readouterr().out.strip().splitlines()[-1])
        assert payload["tier"] == "segment_analysis"
        assert payload["asset_hash"] == "abc123"
        assert payload["duration_ms"] >= 0

    def test_caller_can_add_outcome_fields(self, capsys) -> None:  # type: ignore[no-untyped-def]
        configure_logging("INFO")
        with timed_tier("cache_lookup") as fields:
            fields["cache_hit"] = True

        payload = json.loads(capsys.readouterr().out.strip().splitlines()[-1])
        assert payload["cache_hit"] is True

    def test_logs_even_when_the_tier_raises(self, capsys) -> None:  # type: ignore[no-untyped-def]
        configure_logging("INFO")
        try:
            with timed_tier("failing_tier"):
                raise RuntimeError("boom")
        except RuntimeError:
            pass

        payload = json.loads(capsys.readouterr().out.strip().splitlines()[-1])
        assert payload["tier"] == "failing_tier"
        assert "duration_ms" in payload
