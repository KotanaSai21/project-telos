"""FastAPI application entry point.

Only foundations are wired here: configuration, structured logging, request
correlation, CORS, and the OpenAPI document. Analysis endpoints arrive with
their own tasks.
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.types import ASGIApp, Receive, Scope, Send

from project_telos_api import __version__
from project_telos_api.access import LOCKED_DETAIL, is_protected, is_unlocked
from project_telos_api.access import router as access_router
from project_telos_api.analytics import analytics_enabled
from project_telos_api.config import Settings, get_settings
from project_telos_api.contracts import SCHEMA_FILES
from project_telos_api.logging_setup import configure_logging, get_logger, set_request_id
from project_telos_api.project_telos import router as project_telos_router
from project_telos_api.ratelimit import LIMITED_DETAIL, is_limited, retry_after
from project_telos_api.routes import router
from project_telos_api.thumbnail_truth import router as thumbnail_truth_router
from project_telos_api.translation import translation_enabled
from project_telos_api.youtube_discovery import router as youtube_router

REQUEST_ID_HEADER = "X-Request-ID"


class HealthResponse(BaseModel):
    """Liveness payload."""

    status: str = Field(..., examples=["ok"])
    version: str = Field(..., examples=[__version__])
    environment: str = Field(..., examples=["development"])
    provider: str = Field(..., description="Active analysis provider: local, gemini, or vertex.")
    uses_model_calls: bool = Field(
        ..., description="False when verdicts are served from fixtures without any model call."
    )
    offline_fallback: bool = Field(
        ..., description="True when verdicts are served from cache without model calls."
    )
    contracts: list[str] = Field(..., description="Contract schemas this build validates against.")
    integrations: dict[str, bool | str] = Field(
        default_factory=dict,
        description="Which Google Cloud integrations are configured. Presence, not a live check.",
    )


class StripApiPrefix:
    """Serves the API under both ``/`` and ``/api``.

    The web app always calls ``/api/...``: Vite proxies it in development, and on
    Cloud Run this shim lets one service host the web app and the API together.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] in ("http", "websocket"):
            path: str = scope["path"]
            if path == "/api" or path.startswith("/api/"):
                stripped = path[4:] or "/"
                scope = {**scope, "path": stripped, "raw_path": stripped.encode("utf-8")}
        await self.app(scope, receive, send)


def integrations(settings: Settings) -> dict[str, bool | str]:
    return {
        "storage": settings.storage,
        "gemini": settings.uses_model_calls,
        "imagen": settings.uses_model_calls,
        "youtubeDataApi": bool(settings.youtube_api_key),
        "bigquery": analytics_enabled(settings),
        "translation": translation_enabled(settings),
        "cloudRun": bool(os.environ.get("K_SERVICE")),
    }


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings: Settings = get_settings()
    configure_logging(settings.log_level)
    get_logger().info(
        "api.startup",
        extra={
            "version": __version__,
            "environment": settings.environment,
            "provider": settings.provider,
            "uses_model_calls": settings.uses_model_calls,
            "offline_fallback": settings.offline_fallback,
        },
    )
    yield
    get_logger().info("api.shutdown", extra={"version": __version__})


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="Project Telos API",
        version=__version__,
        summary="Consent-driven media understanding and adaptation.",
        description=(
            "Understands incoming media before it is experienced, decides against a "
            "viewer-declared profile, and returns an adapted experience. A Project Telos "
            "decision governs presentation for one viewer; it is not a legal determination."
        ),
        lifespan=lifespan,
        docs_url="/docs",
        openapi_url="/openapi.json",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", REQUEST_ID_HEADER],
    )

    @app.middleware("http")
    async def correlate_request(request: Request, call_next):  # type: ignore[no-untyped-def]
        request_id = set_request_id(request.headers.get(REQUEST_ID_HEADER))
        response: Response = await call_next(request)
        response.headers[REQUEST_ID_HEADER] = request_id
        return response

    @app.middleware("http")
    async def require_access_code(request: Request, call_next):  # type: ignore[no-untyped-def]
        if is_protected(request.url.path) and not is_unlocked(request, settings):
            return JSONResponse({"detail": LOCKED_DETAIL}, status_code=401)
        return await call_next(request)

    @app.middleware("http")
    async def limit_model_calls(request: Request, call_next):  # type: ignore[no-untyped-def]
        if is_limited(request):
            wait = retry_after(request, settings.rate_limit_per_minute)
            if wait is not None:
                return JSONResponse({"detail": LIMITED_DETAIL}, status_code=429, headers={"Retry-After": str(wait)})
        return await call_next(request)

    @app.get("/health", response_model=HealthResponse, tags=["system"])
    async def health() -> HealthResponse:
        """Reports liveness, build version, and which contracts are enforced."""
        return HealthResponse(
            status="ok",
            version=__version__,
            environment=settings.environment,
            provider=settings.provider,
            uses_model_calls=settings.uses_model_calls,
            offline_fallback=settings.offline_fallback,
            contracts=sorted(SCHEMA_FILES),
            integrations=integrations(settings),
        )

    app.include_router(access_router)
    app.include_router(router)
    app.include_router(project_telos_router)
    app.include_router(youtube_router)
    app.include_router(thumbnail_truth_router)

    # Mounted last so every API route above takes precedence over static files.
    if settings.web_dist_dir is not None:
        if not (settings.web_dist_dir / "index.html").is_file():
            raise RuntimeError(f"PROJECT_TELOS_WEB_DIST has no index.html: {settings.web_dist_dir}")
        app.mount("/", StaticFiles(directory=settings.web_dist_dir, html=True), name="web")

    app.add_middleware(StripApiPrefix)
    return app


# No module-level instantiation: importing this module must not require configuration.
# Run with: uvicorn project_telos_api.main:create_app --factory
