"""Site-wide access code.

When PROJECT_TELOS_ACCESS_CODE is set, every API route except health and this
router needs a cookie that proves the visitor entered the code. The static web
app still loads, so it can show the code prompt; it holds no data on its own.

The cookie carries an HMAC derived from the code, never the code itself, so
changing the code signs everyone out.
"""

from __future__ import annotations

import hashlib
import hmac
import time
from collections import defaultdict, deque
from typing import Final

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from project_telos_api.config import Settings, get_settings
from project_telos_api.logging_setup import get_logger

# Firebase Hosting forwards only a cookie named "__session" to Cloud Run, so use that name.
COOKIE_NAME: Final[str] = "__session"
COOKIE_MAX_AGE: Final[int] = 7 * 24 * 60 * 60
PROTECTED_PREFIXES: Final[tuple[str, ...]] = ("/project-telos", "/profiles", "/docs", "/openapi.json")
LOCKED_DETAIL: Final[str] = "Access code required."

MAX_FAILURES: Final[int] = 10
FAILURE_WINDOW_SECONDS: Final[int] = 5 * 60
_failures: defaultdict[str, deque[float]] = defaultdict(deque)

router = APIRouter(prefix="/access", tags=["access"])


def _normalise(code: str) -> str:
    """Ignores case and all spaces: 'ChinnadlerBong' and 'chinnadler bong' both match."""
    return "".join(code.split()).casefold()


def _token(settings: Settings) -> str | None:
    if settings.access_code is None:
        return None
    key = _normalise(settings.access_code.get_secret_value()).encode("utf-8")
    return hmac.new(key, b"project-telos-access-v1", hashlib.sha256).hexdigest()


def is_unlocked(request: Request, settings: Settings) -> bool:
    expected = _token(settings)
    if expected is None:
        return True
    return hmac.compare_digest(request.cookies.get(COOKIE_NAME, ""), expected)


def is_protected(path: str) -> bool:
    return any(path == prefix or path.startswith(prefix + "/") for prefix in PROTECTED_PREFIXES)


def _too_many_failures(client: str) -> bool:
    attempts = _failures[client]
    cutoff = time.monotonic() - FAILURE_WINDOW_SECONDS
    while attempts and attempts[0] < cutoff:
        attempts.popleft()
    return len(attempts) >= MAX_FAILURES


class AccessStatus(BaseModel):
    required: bool
    unlocked: bool
    hint: str | None = Field(None, description="Shown only when PROJECT_TELOS_ACCESS_HINT_ENABLED=true.")
    rate_limit_per_minute: int = Field(description="Model-backed requests each visitor may make per minute.")


class VerifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=1, max_length=200)


@router.get("/status", response_model=AccessStatus)
def access_status(request: Request, settings: Settings = Depends(get_settings)) -> AccessStatus:
    required = settings.access_code is not None
    hint = settings.access_hint.strip() if required and settings.access_hint_enabled else ""
    return AccessStatus(
        required=required,
        unlocked=is_unlocked(request, settings),
        hint=hint or None,
        rate_limit_per_minute=settings.rate_limit_per_minute,
    )


@router.post("/verify", status_code=204)
def verify(
    body: VerifyRequest, request: Request, response: Response, settings: Settings = Depends(get_settings),
) -> Response:
    expected = _token(settings)
    if expected is None:
        response.status_code = 204
        return response
    client = request.client.host if request.client else "unknown"
    if _too_many_failures(client):
        raise HTTPException(429, "Too many attempts. Wait a few minutes and try again.")
    given = _normalise(body.code)
    if not hmac.compare_digest(
        given.encode("utf-8"), _normalise(settings.access_code.get_secret_value()).encode("utf-8")  # type: ignore[union-attr]
    ):
        _failures[client].append(time.monotonic())
        get_logger().warning("access.denied")
        raise HTTPException(401, "That access code is not right.")
    _failures.pop(client, None)
    response.set_cookie(
        COOKIE_NAME, expected, max_age=COOKIE_MAX_AGE, httponly=True, samesite="lax",
        secure=settings.is_production, path="/",
    )
    response.status_code = 204
    return response
