"""Per-visitor rate limit on the routes that can spend model calls.

Every POST under the app's API prefixes may reach Gemini, Imagen, or the YouTube
API, so each client address gets PROJECT_TELOS_RATE_LIMIT_PER_MINUTE of them per
rolling minute. Reads are not limited.

The counters live in memory, so each Cloud Run instance keeps its own. With at
most three instances this is a best-effort cap on one visitor, not a global quota;
the billing budget alert is the backstop.
"""

from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Final

from fastapi import Request

WINDOW_SECONDS: Final[int] = 60
LIMITED_PREFIXES: Final[tuple[str, ...]] = ("/project-telos", "/profiles")
LIMITED_DETAIL: Final[str] = "Too many requests. Wait a minute and try again."

_requests: defaultdict[str, deque[float]] = defaultdict(deque)


def is_limited(request: Request) -> bool:
    path = request.url.path
    return request.method == "POST" and any(path == prefix or path.startswith(prefix + "/") for prefix in LIMITED_PREFIXES)


def retry_after(request: Request, limit: int) -> int | None:
    """Records the request; returns seconds to wait if the client is over the limit, else None."""
    client = request.client.host if request.client else "unknown"
    now = time.monotonic()
    recent = _requests[client]
    while recent and recent[0] <= now - WINDOW_SECONDS:
        recent.popleft()
    if len(recent) >= limit:
        return max(1, int(recent[0] + WINDOW_SECONDS - now) + 1)
    recent.append(now)
    return None


def reset() -> None:
    _requests.clear()
