"""YouTube URL handling.

The server never fetches the video itself. A validated URL is handed to Gemini,
which retrieves it -- so there is no scraping, and no request is ever made to a
host the user controls.

Validation is strict for that reason: only YouTube hosts, only a well-formed
video id. An attacker-supplied string must not become an outbound request to
somewhere else.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Final
from urllib.parse import parse_qs, urlparse

# YouTube ids are exactly 11 characters from a fixed alphabet.
VIDEO_ID_PATTERN: Final[re.Pattern[str]] = re.compile(r"^[A-Za-z0-9_-]{11}$")

ALLOWED_HOSTS: Final[frozenset[str]] = frozenset(
    {
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "music.youtube.com",
        "youtu.be",
        "www.youtu.be",
    }
)

# Path prefixes that carry the id in the path rather than a query parameter.
PATH_PREFIXES: Final[tuple[str, ...]] = ("/shorts/", "/embed/", "/v/", "/live/")

MAX_URL_LENGTH: Final[int] = 2048


class InvalidYouTubeUrlError(ValueError):
    """Raised when a string is not a YouTube video URL we will accept."""


@dataclass(frozen=True)
class YouTubeVideo:
    """A validated reference. `canonical_url` is the only form sent onward."""

    video_id: str
    canonical_url: str
    is_short: bool

    @property
    def thumbnail_url(self) -> str:
        return f"https://i.ytimg.com/vi/{self.video_id}/hqdefault.jpg"

    @property
    def asset_hash(self) -> str:
        """Stable, content-addressed key. Same video, same cache entry."""
        import hashlib  # noqa: PLC0415

        return hashlib.sha256(self.video_id.encode("ascii")).hexdigest()[:16]


def parse_youtube_url(raw: str) -> YouTubeVideo:
    """Parses and validates a YouTube URL, including Shorts.

    Accepts watch, shorts, embed, live, and youtu.be forms.
    """
    if not raw or not raw.strip():
        raise InvalidYouTubeUrlError("No URL supplied")
    if len(raw) > MAX_URL_LENGTH:
        raise InvalidYouTubeUrlError("URL is too long")

    candidate = raw.strip()
    if "://" not in candidate:
        candidate = f"https://{candidate}"

    parsed = urlparse(candidate)

    if parsed.scheme not in {"http", "https"}:
        raise InvalidYouTubeUrlError("Only http and https URLs are accepted")

    host = (parsed.hostname or "").lower()
    if host not in ALLOWED_HOSTS:
        raise InvalidYouTubeUrlError(f"Not a YouTube URL: {host or 'missing host'}")

    video_id, is_short = _extract_id(parsed.path, parsed.query, host)

    if not VIDEO_ID_PATTERN.match(video_id):
        raise InvalidYouTubeUrlError("Could not find a valid video id in that URL")

    return YouTubeVideo(
        video_id=video_id,
        canonical_url=f"https://www.youtube.com/watch?v={video_id}",
        is_short=is_short,
    )


def _extract_id(path: str, query: str, host: str) -> tuple[str, bool]:
    for prefix in PATH_PREFIXES:
        if path.startswith(prefix):
            return path[len(prefix) :].split("/")[0], prefix == "/shorts/"

    if host in {"youtu.be", "www.youtu.be"}:
        return path.lstrip("/").split("/")[0], False

    if path == "/watch":
        values = parse_qs(query).get("v", [])
        if values:
            return values[0], False

    raise InvalidYouTubeUrlError("That URL does not point at a specific video")


def looks_like_youtube(raw: str) -> bool:
    """Cheap check for whether a string is worth parsing."""
    try:
        parse_youtube_url(raw)
    except InvalidYouTubeUrlError:
        return False
    return True
