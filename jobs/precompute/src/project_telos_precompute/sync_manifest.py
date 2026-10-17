"""Syncs manifest asset hashes with the maps produced by analysis.

Run after `project-telos-precompute analyse` so the manifest points at the real
content hashes rather than placeholders.
"""

from __future__ import annotations

import json
from pathlib import Path


def repo_root() -> Path:
    for parent in Path(__file__).resolve().parents:
        if (parent / "package.json").is_file() and (parent / "packages").is_dir():
            return parent
    raise FileNotFoundError("Could not locate the repository root")


def main() -> int:
    root = repo_root()
    manifest_path = root / "corpus" / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    updated = 0
    for asset in manifest["assets"]:
        segment_path = root / "corpus" / "segments" / f"{asset['id']}.json"
        if not segment_path.is_file():
            continue
        segment_map = json.loads(segment_path.read_text(encoding="utf-8"))
        if asset["assetHash"] != segment_map["assetHash"]:
            asset["assetHash"] = segment_map["assetHash"]
            updated += 1
        print(f"{asset['id']:<22} {asset['assetHash']}")

    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"{updated} hashes updated")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
