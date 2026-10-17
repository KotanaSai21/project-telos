"""Shot-boundary detection.

Deliberately not AI. Histogram and motion deltas find cuts in milliseconds, and
the result is what makes sampling affordable: instead of guessing where content
might change, we sample first where it demonstrably does.

Gradual transitions -- slow fades, opacity ramps, picture-in-picture -- do not
produce a histogram jump, so this is one signal of three. The periodic floor in
``sampling`` covers what it misses.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

import cv2
import numpy as np

# Bhattacharyya distance is bounded 0 (identical) to 1 (unrelated), so the
# threshold means something without a fudge factor. Measured on the corpus:
# cuts score 0.97-0.99, the 99th percentile of non-cut frames is 0.13. The gap
# is wide, so 0.35 is not a tuned number -- it sits in the middle of nothing.
DEFAULT_CUT_THRESHOLD = 0.35

# Frames closer together than this are treated as one cut, not several.
MIN_SHOT_SECONDS = 0.5

HISTOGRAM_BINS = 32


@dataclass(frozen=True)
class Cut:
    """A detected shot boundary."""

    time_sec: float
    score: float


@dataclass(frozen=True)
class VideoInfo:
    path: Path
    fps: float
    frame_count: int
    duration_sec: float


def probe(path: Path) -> VideoInfo:
    capture = cv2.VideoCapture(str(path))
    if not capture.isOpened():
        raise FileNotFoundError(f"Could not open video: {path}")
    try:
        fps = capture.get(cv2.CAP_PROP_FPS) or 1.0
        frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
        return VideoInfo(path=path, fps=fps, frame_count=frames, duration_sec=frames / fps)
    finally:
        capture.release()


def _histogram(frame: np.ndarray) -> np.ndarray:
    """Normalised HSV histogram. HSV is more stable than BGR under lighting change."""
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    hist = cv2.calcHist([hsv], [0, 1], None, [HISTOGRAM_BINS, HISTOGRAM_BINS], [0, 180, 0, 256])
    cv2.normalize(hist, hist, 0, 1, cv2.NORM_MINMAX)
    return hist


def _distance(previous: np.ndarray, current: np.ndarray) -> float:
    """Bhattacharyya distance between two histograms, bounded 0..1."""
    return float(cv2.compareHist(previous, current, cv2.HISTCMP_BHATTACHARYYA))


def iter_frames(path: Path, stride: int = 1) -> Iterator[tuple[int, float, np.ndarray]]:
    """Yields (index, time_sec, frame) without holding the whole video in memory."""
    capture = cv2.VideoCapture(str(path))
    if not capture.isOpened():
        raise FileNotFoundError(f"Could not open video: {path}")

    fps = capture.get(cv2.CAP_PROP_FPS) or 1.0
    index = 0
    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                return
            if index % stride == 0:
                yield index, index / fps, frame
            index += 1
    finally:
        capture.release()


def detect_cuts(
    path: Path,
    *,
    threshold: float = DEFAULT_CUT_THRESHOLD,
    min_shot_seconds: float = MIN_SHOT_SECONDS,
) -> list[Cut]:
    """Finds shot boundaries by comparing consecutive frame histograms."""
    cuts: list[Cut] = []
    previous: np.ndarray | None = None
    last_cut_sec = -min_shot_seconds

    for _, time_sec, frame in iter_frames(path):
        current = _histogram(frame)
        if previous is not None:
            score = _distance(previous, current)
            if score >= threshold and (time_sec - last_cut_sec) >= min_shot_seconds:
                cuts.append(Cut(time_sec=round(time_sec, 3), score=round(score, 4)))
                last_cut_sec = time_sec
        previous = current

    return cuts


def shots_from_cuts(cuts: list[Cut], duration_sec: float) -> list[tuple[float, float]]:
    """Turns boundaries into contiguous (start, end) shots covering the asset."""
    boundaries = [0.0, *[cut.time_sec for cut in cuts], duration_sec]
    return [
        (round(start, 3), round(end, 3))
        for start, end in zip(boundaries, boundaries[1:])
        if end > start
    ]
