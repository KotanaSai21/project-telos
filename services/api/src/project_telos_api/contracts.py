"""Contract validation against the shared JSON Schemas.

The schemas in ``packages/contracts/schemas`` are the single source of truth.
Python validates against those same files rather than a re-declared copy, so
the API and the web app cannot drift apart.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Final

from jsonschema import Draft202012Validator
from jsonschema.exceptions import ValidationError as JsonSchemaValidationError

SCHEMA_FILES: Final[dict[str, str]] = {
    "ConsentProfile": "consent-profile.schema.json",
    "SegmentMap": "segment-map.schema.json",
    "Decision": "decision.schema.json",
    "ReceiptEvent": "receipt-event.schema.json",
}


def schema_dir() -> Path:
    """Locates ``packages/contracts/schemas`` by walking up to the repo root."""
    for parent in Path(__file__).resolve().parents:
        candidate = parent / "packages" / "contracts" / "schemas"
        if candidate.is_dir():
            return candidate
    raise FileNotFoundError("Could not locate packages/contracts/schemas from the API package")


@lru_cache(maxsize=1)
def _validators() -> dict[str, Draft202012Validator]:
    directory = schema_dir()
    compiled: dict[str, Draft202012Validator] = {}
    for name, filename in SCHEMA_FILES.items():
        schema = json.loads((directory / filename).read_text(encoding="utf-8"))
        Draft202012Validator.check_schema(schema)
        compiled[name] = Draft202012Validator(schema)
    return compiled


@lru_cache(maxsize=1)
def load_schemas() -> dict[str, dict[str, Any]]:
    directory = schema_dir()
    return {
        name: json.loads((directory / filename).read_text(encoding="utf-8"))
        for name, filename in SCHEMA_FILES.items()
    }


class ContractValidationError(ValueError):
    """Raised when a payload does not match its contract."""

    def __init__(self, schema_name: str, issues: list[str]) -> None:
        self.schema_name = schema_name
        self.issues = issues
        super().__init__(f"{schema_name} failed validation: {'; '.join(issues)}")


def assert_valid(schema_name: str, payload: Any) -> Any:
    """Returns the payload unchanged, or raises ContractValidationError."""
    try:
        validator = _validators()[schema_name]
    except KeyError as exc:
        raise KeyError(f"Unknown schema: {schema_name}") from exc

    errors: list[JsonSchemaValidationError] = sorted(
        validator.iter_errors(payload), key=lambda e: list(e.path)
    )
    if errors:
        issues = [f"{'/'.join(str(p) for p in e.path) or '/'} {e.message}" for e in errors]
        raise ContractValidationError(schema_name, issues)
    return payload


def is_valid(schema_name: str, payload: Any) -> bool:
    try:
        assert_valid(schema_name, payload)
    except ContractValidationError:
        return False
    return True
