"""Profile declaration and lifecycle endpoints shared by the Project Telos experience."""

from __future__ import annotations

import uuid
from typing import Annotated, Any, Final, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, StringConstraints

from project_telos_api.config import Settings, get_settings
from project_telos_api.contracts import ContractValidationError
from project_telos_api.firestore_store import store_for
from project_telos_api.logging_setup import get_logger, timed_tier
from project_telos_api.intent import ViewerGoal
from project_telos_api.providers import ProviderUnavailableError, get_profile_extractor
from project_telos_api.providers.local import load_presets
from project_telos_api.store import Store

router = APIRouter()

ProfileContext = Literal["work", "family", "learning", "personal", "commute"]

HTTP_422_UNPROCESSABLE: Final[int] = 422


def get_store(settings: Settings = Depends(get_settings)) -> Store:
    return store_for(settings)


class DeclareRequest(BaseModel):
    """One sentence describing what the viewer wants and does not want."""

    utterance: str = Field(..., min_length=1, max_length=1000, examples=[
        "I'm on my work laptop. No graphic violence or explicit content. "
        "Medical education is fine. I'm learning aviation and I like Indian classical music."
    ])
    context: ProfileContext = "work"
    goal: ViewerGoal = "learn"
    topics: list[Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]] | None = Field(
        None, max_length=50,
    )


@router.post("/profiles", status_code=status.HTTP_201_CREATED, tags=["declare"])
def declare_profile(
    request: DeclareRequest,
    store: Store = Depends(get_store),
) -> dict[str, Any]:
    """Turns one sentence into a structured, editable profile."""
    extractor = get_profile_extractor()
    profile_id = f"profile-{uuid.uuid4().hex[:12]}"

    try:
        with timed_tier("profile_extraction", provider=extractor.name) as fields:
            profile = extractor.extract(
                request.utterance,
                profile_id=profile_id,
                context=request.context,
            )
            if request.topics is not None:
                profile["interests"] = list(dict.fromkeys(request.topics))
            fields["boundaries"] = len(profile.get("avoid", []))
            fields["interests"] = len(profile.get("interests", []))
    except ProviderUnavailableError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(HTTP_422_UNPROCESSABLE, str(exc)) from exc

    try:
        saved = store.save_profile(profile)
        store.viewer_preferences.put(profile_id, {
            "profileId": profile_id, "goal": request.goal,
            "utterance": request.utterance, "context": request.context,
        })
        return saved
    except ContractValidationError as exc:
        get_logger().error("profile.invalid", extra={"issues": exc.issues})
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Extracted profile did not match the contract",
        ) from exc


@router.get("/profiles/presets", tags=["declare"])
def read_presets() -> list[dict[str, Any]]:
    """Seeded profiles for local exploration."""
    return load_presets()


@router.post("/profiles/presets", status_code=status.HTTP_201_CREATED, tags=["declare"])
def seed_presets(store: Store = Depends(get_store)) -> list[dict[str, Any]]:
    """Loads the presets into the store so the demo starts from a known state."""
    return [store.save_profile(preset) for preset in load_presets()]


@router.get("/profiles/{profile_id}", tags=["declare"])
def read_profile(profile_id: str, store: Store = Depends(get_store)) -> dict[str, Any]:
    profile = store.profiles.get(profile_id)
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found")
    return profile


@router.get("/profiles/{profile_id}/preferences", tags=["declare"])
def read_preferences(profile_id: str, store: Store = Depends(get_store)) -> dict[str, Any]:
    """Keep viewer goals outside the shared ConsentProfile contract."""
    if store.profiles.get(profile_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found")
    preferences = store.viewer_preferences.get(profile_id)
    return preferences or {"profileId": profile_id, "goal": "learn"}


@router.delete("/profiles/{profile_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["declare"])
def forget_profile(profile_id: str, store: Store = Depends(get_store)) -> None:
    """The profile belongs to the viewer, so deletion takes its derived data too."""
    if not store.forget_profile(profile_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found")
