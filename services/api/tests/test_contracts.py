"""Contract validation must use the shared schemas and reject malformed payloads."""

from __future__ import annotations

import json

import pytest

from project_telos_api.contracts import (
    SCHEMA_FILES,
    ContractValidationError,
    assert_valid,
    is_valid,
    load_schemas,
    schema_dir,
)
from project_telos_api.scales import ACTION_ORDER, INTENSITY_ORDER

FIXTURES = [
    ("ConsentProfile", "consent-profile.valid.json"),
    ("SegmentMap", "segment-map.valid.json"),
    ("Decision", "decision.valid.json"),
    ("ReceiptEvent", "receipt-event.valid.json"),
]


class TestSchemaSource:
    def test_resolves_the_shared_schema_directory(self) -> None:
        directory = schema_dir()
        assert directory.is_dir()
        assert directory.parts[-3:] == ("contracts", "schemas") or "schemas" in directory.parts

    def test_every_declared_schema_file_exists(self) -> None:
        directory = schema_dir()
        for filename in SCHEMA_FILES.values():
            assert (directory / filename).is_file(), filename

    def test_schemas_are_themselves_valid(self) -> None:
        assert set(load_schemas()) == set(SCHEMA_FILES)


class TestValidFixtures:
    @pytest.mark.parametrize(("schema_name", "filename"), FIXTURES)
    def test_fixture_matches_schema(self, schema_name, filename, load_fixture) -> None:  # type: ignore[no-untyped-def]
        assert_valid(schema_name, load_fixture(filename))

    @pytest.mark.parametrize(("schema_name", "filename"), FIXTURES)
    def test_fixture_survives_round_trip(self, schema_name, filename, load_fixture) -> None:  # type: ignore[no-untyped-def]
        original = load_fixture(filename)
        round_tripped = json.loads(json.dumps(original))
        assert round_tripped == original
        assert is_valid(schema_name, round_tripped)


class TestRejection:
    def test_rejects_unknown_property(self, load_fixture) -> None:  # type: ignore[no-untyped-def]
        payload = {**load_fixture("receipt-event.valid.json"), "sneaky": True}
        with pytest.raises(ContractValidationError):
            assert_valid("ReceiptEvent", payload)

    def test_rejects_missing_required_field(self, load_fixture) -> None:  # type: ignore[no-untyped-def]
        payload = load_fixture("receipt-event.valid.json")
        payload.pop("sessionId")
        with pytest.raises(ContractValidationError):
            assert_valid("ReceiptEvent", payload)

    def test_rejects_out_of_range_confidence(self, load_fixture) -> None:  # type: ignore[no-untyped-def]
        payload = {**load_fixture("decision.valid.json"), "confidence": 1.5}
        with pytest.raises(ContractValidationError):
            assert_valid("Decision", payload)

    def test_rejects_action_outside_enum(self, load_fixture) -> None:  # type: ignore[no-untyped-def]
        payload = {**load_fixture("decision.valid.json"), "action": "delete"}
        with pytest.raises(ContractValidationError):
            assert_valid("Decision", payload)

    def test_error_names_the_failing_field(self, load_fixture) -> None:  # type: ignore[no-untyped-def]
        payload = {**load_fixture("decision.valid.json"), "confidence": 9}
        with pytest.raises(ContractValidationError) as exc:
            assert_valid("Decision", payload)
        assert any("confidence" in issue for issue in exc.value.issues)

    def test_unknown_schema_name_raises(self) -> None:
        with pytest.raises(KeyError):
            assert_valid("NotARealContract", {})


class TestCrossLanguageAlignment:
    """Python scales must match the schema enums, which TypeScript also asserts against."""

    def test_intensity_order_matches_schema(self) -> None:
        schema_enum = load_schemas()["ConsentProfile"]["$defs"]["intensity"]["enum"]
        assert list(INTENSITY_ORDER) == schema_enum

    def test_action_order_matches_schema(self) -> None:
        schema_enum = load_schemas()["Decision"]["$defs"]["action"]["enum"]
        assert list(ACTION_ORDER) == schema_enum

    def test_receipt_actions_match_decision_actions(self) -> None:
        schemas = load_schemas()
        assert (
            schemas["ReceiptEvent"]["properties"]["action"]["enum"]
            == schemas["Decision"]["$defs"]["action"]["enum"]
        )
