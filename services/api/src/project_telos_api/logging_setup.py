"""Structured JSON logging with request correlation.

Every log line carries a request ID so one request can be followed across
pipeline tiers, and each tier records its own latency. Payloads are never
logged; only identifiers, decisions, and timings.
"""

from __future__ import annotations

import logging
import sys
import time
import uuid
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any, Iterator

from pythonjsonlogger.json import JsonFormatter

_request_id: ContextVar[str | None] = ContextVar("request_id", default=None)

LOGGER_NAME = "project_telos"


def new_request_id() -> str:
    return uuid.uuid4().hex


def set_request_id(request_id: str | None) -> str:
    resolved = request_id or new_request_id()
    _request_id.set(resolved)
    return resolved


def get_request_id() -> str | None:
    return _request_id.get()


class RequestIdFilter(logging.Filter):
    """Attaches the current request ID to every record.

    Installed on the logger rather than the handler, so any handler attached
    downstream -- including a test runner's -- can format the attribute.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = get_request_id()
        return True


def configure_logging(level: str = "INFO") -> logging.Logger:
    """Installs the JSON handler. Safe to call more than once."""
    logger = logging.getLogger(LOGGER_NAME)
    logger.setLevel(level)
    logger.propagate = False

    for existing in list(logger.handlers):
        logger.removeHandler(existing)
    for existing_filter in list(logger.filters):
        logger.removeFilter(existing_filter)

    logger.addFilter(RequestIdFilter())

    handler = logging.StreamHandler(stream=sys.stdout)
    handler.setFormatter(
        JsonFormatter(
            "%(asctime)s %(levelname)s %(name)s %(message)s %(request_id)s",
            rename_fields={"asctime": "timestamp", "levelname": "severity"},
        )
    )
    logger.addHandler(handler)
    return logger


def get_logger() -> logging.Logger:
    return logging.getLogger(LOGGER_NAME)


@contextmanager
def timed_tier(tier: str, **fields: Any) -> Iterator[dict[str, Any]]:
    """Times one pipeline tier and emits a single structured line.

    The ``extra`` dict is yielded so callers can add outcome fields discovered
    during the tier, such as whether a cache hit avoided a model call.
    """
    started = time.perf_counter()
    extra: dict[str, Any] = {"tier": tier, **fields}
    try:
        yield extra
    finally:
        extra["duration_ms"] = round((time.perf_counter() - started) * 1000, 2)
        get_logger().info("tier.complete", extra=extra)
