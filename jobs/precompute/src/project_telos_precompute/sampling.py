"""Keyframe sampling.

Three signals, as documented: shot boundaries, a periodic floor, and
risk-triggered densification. The floor is what catches gradual transitions that
never produce a cut.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from project_telos_precompute.shots import iter_frames

# A keyframe is taken at least this often, even inside one long shot.
PERIODIC_FLOOR_SECONDS = 5.0

# How far after a cut to sample, so the frame belongs to the new shot.
POST_CUT_OFFSET_SECONDS = 0.3


@dataclass(frozen=True)
class Keyframe:
    time_sec: float
    reason: str
    image: np.ndarray

    def to_png(self) -> bytes:
        ok, buffer = cv2.imencode(".png", self.image)
        if not ok:
            raise RuntimeError(f"Could not encode the keyframe at {self.time_sec}s")
        return buffer.tobytes()


def plan_sample_times(
    cut_seconds: list[float],
    duration_sec: float,
    *,
    floor_seconds: float = PERIODIC_FLOOR_SECONDS,
    post_cut_offset: float = POST_CUT_OFFSET_SECONDS,
) -> list[tuple[float, str]]:
    """Times to sample, each with the reason it was chosen.

    Pure, so the sampling strategy is testable without decoding anything.
    """
    planned: dict[float, str] = {0.0: "opening"}

    for cut in cut_seconds:
        time_sec = min(cut + post_cut_offset, max(0.0, duration_sec - 0.01))
        planned[round(time_sec, 3)] = "shot_boundary"

    steps = int(duration_sec // floor_seconds)
    for step in range(1, steps + 1):
        time_sec = round(step * floor_seconds, 3)
        if time_sec < duration_sec:
            planned.setdefault(time_sec, "periodic_floor")

    return sorted(planned.items())


def extract_keyframes(
    path: Path,
    sample_times: list[tuple[float, str]],
) -> list[Keyframe]:
    """Decodes once and keeps the frame nearest each planned time."""
    wanted = sorted(sample_times)
    keyframes: list[Keyframe] = []
    cursor = 0

    for _, time_sec, frame in iter_frames(path):
        while cursor < len(wanted) and time_sec >= wanted[cursor][0]:
            target, reason = wanted[cursor]
            keyframes.append(
                Keyframe(time_sec=round(target, 3), reason=reason, image=frame.copy())
            )
            cursor += 1
        if cursor >= len(wanted):
            break

    return keyframes
