"""Command line entry point.

    project-telos-precompute generate     # write synthetic MP4s
    project-telos-precompute analyse      # decode them into segment maps
    project-telos-precompute measure      # report detection accuracy vs ground truth
    project-telos-precompute all
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from project_telos_precompute.analyze import GeminiLabeller, PaletteLabeller, analyse
from project_telos_precompute.shots import detect_cuts
from project_telos_precompute.synth import CORPUS, CORPUS_BY_ID, generate_corpus

# Seconds of tolerance when matching a detected cut to its ground truth.
ACCURACY_TOLERANCE_SEC = 1.0


def repo_root() -> Path:
    for parent in Path(__file__).resolve().parents:
        if (parent / "package.json").is_file() and (parent / "packages").is_dir():
            return parent
    return Path.cwd()


def media_dir() -> Path:
    return repo_root() / "corpus" / "media"


def segments_dir() -> Path:
    return repo_root() / "corpus" / "segments"


def _build_labeller(name: str):  # type: ignore[no-untyped-def]
    """Detection is the replaceable tier. Everything downstream is unaffected."""
    if name == "palette":
        return PaletteLabeller()

    if name == "safesearch":
        from project_telos_precompute.vision import SafeSearchLabeller  # noqa: PLC0415

        return SafeSearchLabeller()

    import os  # noqa: PLC0415

    from project_telos_api.contracts import load_schemas  # noqa: PLC0415
    from google import genai  # noqa: PLC0415

    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise SystemExit("GEMINI_API_KEY is not set; use --labeller palette to stay offline")

    return GeminiLabeller(
        client=genai.Client(api_key=key),
        model=os.environ.get("PROJECT_TELOS_GEMINI_MODEL", "gemini-2.5-flash"),
        schema=load_schemas()["SegmentMap"],
    )


def command_generate() -> int:
    written = generate_corpus(media_dir())
    for path in written:
        print(f"generated {path.relative_to(repo_root())}")
    print(f"{len(written)} clips written to {media_dir().relative_to(repo_root())}")
    return 0


def command_analyse(labeller_name: str) -> int:
    labeller = _build_labeller(labeller_name)
    target = segments_dir()
    target.mkdir(parents=True, exist_ok=True)

    count = 0
    for spec in CORPUS:
        source = media_dir() / f"{spec.asset_id}.mp4"
        if not source.is_file():
            print(f"skipped {spec.asset_id}: no media. Run `generate` first.", file=sys.stderr)
            continue

        segment_map = analyse(source, labeller=labeller)
        destination = target / f"{spec.asset_id}.json"
        destination.write_text(json.dumps(segment_map, indent=2) + "\n", encoding="utf-8")

        print(
            f"analysed {spec.asset_id}: {len(segment_map['segments'])} segments, "
            f"hash {segment_map['assetHash']}"
        )
        count += 1

    print(f"{count} segment maps written using the {labeller.name} labeller")
    return 0


def _match(detected: list[float], expected: list[float]) -> tuple[int, list[float]]:
    """Counts expected cuts found within tolerance, and returns the offsets."""
    offsets: list[float] = []
    remaining = list(detected)

    for truth in expected:
        best = min(remaining, key=lambda value: abs(value - truth), default=None)
        if best is not None and abs(best - truth) <= ACCURACY_TOLERANCE_SEC:
            offsets.append(round(best - truth, 3))
            remaining.remove(best)

    return len(offsets), offsets


def command_measure() -> int:
    """Verification check V2, measured rather than asserted."""
    rows: list[dict[str, Any]] = []
    total_expected = 0
    total_found = 0
    total_false = 0

    for spec in CORPUS:
        source = media_dir() / f"{spec.asset_id}.mp4"
        if not source.is_file():
            continue

        detected = [cut.time_sec for cut in detect_cuts(source)]
        expected = spec.cut_seconds
        found, offsets = _match(detected, expected)

        total_expected += len(expected)
        total_found += found
        total_false += max(0, len(detected) - found)

        rows.append(
            {
                "asset": spec.asset_id,
                "expected": expected,
                "detected": detected,
                "found": found,
                "offsets": offsets,
            }
        )

    print(f"{'asset':<22} {'expected':<14} {'detected':<22} found  offsets")
    for row in rows:
        print(
            f"{row['asset']:<22} {str(row['expected']):<14} {str(row['detected']):<22} "
            f"{row['found']}/{len(row['expected'])}  {row['offsets']}"
        )

    recall = total_found / total_expected if total_expected else 1.0
    print()
    print(f"cuts found      : {total_found}/{total_expected}  (recall {recall:.0%})")
    print(f"false positives : {total_false}")
    print(f"tolerance       : ±{ACCURACY_TOLERANCE_SEC}s")

    return 0 if total_found == total_expected and total_false == 0 else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="project-telos-precompute", description=__doc__)
    parser.add_argument(
        "command", choices=["generate", "analyse", "measure", "all"], help="what to run"
    )
    parser.add_argument(
        "--labeller",
        choices=["palette", "gemini", "safesearch"],
        default="palette",
        help="which classifier labels the keyframes; the rest of the pipeline is identical",
    )
    parser.add_argument(
        "--gemini",
        action="store_true",
        help="shorthand for --labeller gemini",
    )
    args = parser.parse_args(argv)
    labeller_name = "gemini" if args.gemini else args.labeller

    if args.command == "generate":
        return command_generate()
    if args.command == "analyse":
        return command_analyse(labeller_name)
    if args.command == "measure":
        return command_measure()

    command_generate()
    command_analyse(labeller_name)
    return command_measure()


if __name__ == "__main__":
    raise SystemExit(main())
