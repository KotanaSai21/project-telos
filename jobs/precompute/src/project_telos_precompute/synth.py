"""Synthetic corpus generation.

Produces real MP4 files with cuts at known seconds. Generating the media means
shot detection can be measured against ground truth we control, rather than
asserted against a fixture that agrees with itself.

Colour-block video only. No real imagery of any kind is produced or stored.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np

WIDTH = 320
HEIGHT = 180
FPS = 10

# Distinct BGR palettes so a cut produces a large, unambiguous histogram delta.
PALETTES: dict[str, tuple[int, int, int]] = {
    "cooking": (60, 140, 200),
    "explicit": (40, 40, 190),
    "news": (90, 90, 90),
    "news_graphic": (30, 60, 110),
    "medical": (170, 150, 90),
    "gambling": (40, 170, 220),
    "aviation": (200, 160, 80),
    "music": (150, 90, 170),
}


@dataclass(frozen=True)
class Scene:
    """One continuous shot."""

    label: str
    start_sec: float
    end_sec: float

    @property
    def duration(self) -> float:
        return self.end_sec - self.start_sec


@dataclass(frozen=True)
class ClipSpec:
    """A clip to generate, and the cuts it is guaranteed to contain."""

    asset_id: str
    scenes: list[Scene]
    fps: int = FPS
    seed: int = 0

    @property
    def duration_sec(self) -> float:
        return max(scene.end_sec for scene in self.scenes)

    @property
    def cut_seconds(self) -> list[float]:
        """Ground truth: every point where the scene changes."""
        return [scene.start_sec for scene in self.scenes[1:]]


def _frame(label: str, index: int, rng: np.random.Generator) -> np.ndarray:
    """A flat colour plus light noise, so frames differ without changing the shot."""
    colour = PALETTES.get(label, (120, 120, 120))
    canvas = np.full((HEIGHT, WIDTH, 3), colour, dtype=np.uint8)

    noise = rng.integers(-6, 7, size=(HEIGHT, WIDTH, 3), dtype=np.int16)
    canvas = np.clip(canvas.astype(np.int16) + noise, 0, 255).astype(np.uint8)

    # A moving bar gives intra-shot motion without a histogram jump.
    x = (index * 4) % WIDTH
    cv2.rectangle(canvas, (x, 0), (min(x + 18, WIDTH), HEIGHT), (255, 255, 255), -1)
    return canvas


def scene_at(spec: ClipSpec, time_sec: float) -> Scene:
    for scene in spec.scenes:
        if scene.start_sec <= time_sec < scene.end_sec:
            return scene
    return spec.scenes[-1]


def generate_clip(spec: ClipSpec, destination: Path) -> Path:
    """Writes the clip and returns its path."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(spec.seed)

    writer = cv2.VideoWriter(
        str(destination),
        cv2.VideoWriter_fourcc(*"mp4v"),
        spec.fps,
        (WIDTH, HEIGHT),
    )
    if not writer.isOpened():
        raise RuntimeError(f"Could not open a video writer for {destination}")

    try:
        total = int(round(spec.duration_sec * spec.fps))
        for index in range(total):
            time_sec = index / spec.fps
            writer.write(_frame(scene_at(spec, time_sec).label, index, rng))
    finally:
        writer.release()

    return destination


# The demo corpus. Switch seconds here are the ground truth every measurement uses.
CORPUS: list[ClipSpec] = [
    ClipSpec(
        asset_id="cooking-clean",
        scenes=[Scene("cooking", 0, 32)],
        seed=1,
    ),
    ClipSpec(
        asset_id="cooking-switch",
        scenes=[
            Scene("cooking", 0, 14),
            Scene("explicit", 14, 21),
            Scene("cooking", 21, 47),
        ],
        seed=2,
    ),
    ClipSpec(
        asset_id="news-graphic",
        scenes=[
            Scene("news", 0, 19),
            Scene("news_graphic", 19, 34),
            Scene("news", 34, 62),
        ],
        seed=3,
    ),
    ClipSpec(
        asset_id="anatomy-lesson",
        scenes=[Scene("medical", 0, 55)],
        seed=4,
    ),
    ClipSpec(
        asset_id="gambling-promo",
        scenes=[Scene("gambling", 0, 20)],
        seed=5,
    ),
    ClipSpec(
        asset_id="aviation-approach",
        scenes=[Scene("aviation", 0, 41)],
        seed=6,
    ),
    ClipSpec(
        asset_id="classical-music",
        scenes=[Scene("music", 0, 96)],
        seed=7,
    ),
]

CORPUS_BY_ID: dict[str, ClipSpec] = {spec.asset_id: spec for spec in CORPUS}


def generate_corpus(media_dir: Path, specs: list[ClipSpec] | None = None) -> list[Path]:
    """Generates every clip and returns the paths written."""
    return [
        generate_clip(spec, media_dir / f"{spec.asset_id}.mp4")
        for spec in (specs if specs is not None else CORPUS)
    ]
