"""BigQuery verdict analytics.

Every completed AI verdict is streamed to ``<dataset>.verdicts`` so moderation trends
can be queried (for example, the share of uploads flagged high risk per region).
Rows hold outcome metadata only: no titles, transcripts, media, profile ids, or keys.
Analytics is best-effort and runs after the response, so it can never block or fail
a creator's check.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any, Final, Literal

from project_telos_api.config import Settings
from project_telos_api.logging_setup import get_logger

TABLE: Final[str] = "verdicts"
VerdictKind = Literal["thumbnail_truth", "youtube_audit"]

# Field name -> BigQuery type. Also documented in the README deployment section.
SCHEMA: Final[tuple[tuple[str, str], ...]] = (
    ("event_id", "STRING"),
    ("occurred_at", "TIMESTAMP"),
    ("kind", "STRING"),
    ("source", "STRING"),
    ("model", "STRING"),
    ("band", "STRING"),
    ("risk_score", "INTEGER"),
    ("ghost_entity_count", "INTEGER"),
    ("video_provided", "BOOLEAN"),
    ("region", "STRING"),
    ("detected_language", "STRING"),
    ("recommendation", "STRING"),
)


def analytics_enabled(settings: Settings) -> bool:
    return bool(settings.bigquery_enabled and settings.google_cloud_project and settings.bigquery_dataset)


def verdict_row(kind: VerdictKind, **fields: Any) -> dict[str, Any]:
    """Builds one row, dropping anything outside the published schema."""
    allowed = {name for name, _ in SCHEMA}
    row = {name: value for name, value in fields.items() if name in allowed}
    row.update(
        event_id=uuid.uuid4().hex,
        occurred_at=datetime.now(timezone.utc).isoformat(),
        kind=kind,
    )
    return row


@lru_cache(maxsize=2)
def _client(project: str) -> Any:  # pragma: no cover - needs GCP
    from google.cloud import bigquery  # noqa: PLC0415

    return bigquery.Client(project=project)


@lru_cache(maxsize=4)
def _ensure_table(project: str, dataset: str) -> str:  # pragma: no cover - needs GCP
    """Creates the dataset and table once per process when they do not exist."""
    from google.cloud import bigquery  # noqa: PLC0415

    client = _client(project)
    client.create_dataset(f"{project}.{dataset}", exists_ok=True)
    table = bigquery.Table(
        f"{project}.{dataset}.{TABLE}",
        schema=[bigquery.SchemaField(name, kind) for name, kind in SCHEMA],
    )
    table.time_partitioning = bigquery.TimePartitioning(field="occurred_at")
    client.create_table(table, exists_ok=True)
    return table.table_id


def insert_rows(project: str, dataset: str, rows: list[dict[str, Any]]) -> list[Any]:  # pragma: no cover
    _ensure_table(project, dataset)
    return _client(project).insert_rows_json(f"{project}.{dataset}.{TABLE}", rows)


def record_verdict(settings: Settings, row: dict[str, Any]) -> bool:
    """Streams one verdict row. Returns False (and logs) instead of raising."""
    if not analytics_enabled(settings):
        return False
    assert settings.google_cloud_project and settings.bigquery_dataset
    try:
        errors = insert_rows(settings.google_cloud_project, settings.bigquery_dataset, [row])
    except Exception:
        # SDK errors may echo request details; log the event name only.
        get_logger().warning("analytics.insert_failed", extra={"kind": row.get("kind")})
        return False
    if errors:
        get_logger().warning("analytics.insert_rejected", extra={"kind": row.get("kind")})
        return False
    get_logger().info("analytics.recorded", extra={"kind": row.get("kind")})
    return True
