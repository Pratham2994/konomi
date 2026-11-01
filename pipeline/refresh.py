"""Refresh the catalogue with the latest anime-offline-database release (new seasons, new titles).

Runs: download AOD -> AniList metadata (cached) + live AniList season lists -> catalog -> bridge/galaxy export ->
calibration -> seed.
The rating-trained models are reused; new titles are placed by the content bridge.

Usage (from the repo root):  api/.venv/Scripts/python pipeline/refresh.py [--db <sqlalchemy url>]
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
AOD_URL = "https://github.com/manami-project/anime-offline-database/releases/latest/download/anime-offline-database-minified.json"
API_PY = ROOT / "api" / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
ML_PY = ROOT / "ml" / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def run(py: Path, *args: str, cwd: Path = ROOT, env: dict | None = None) -> None:
    print(f"> {' '.join(args)}", flush=True)
    subprocess.run([str(py), *args], cwd=cwd, check=True,
                   env={**os.environ, "PYTHONIOENCODING": "utf-8", **(env or {})})


def main() -> None:
    db = sys.argv[sys.argv.index("--db") + 1] if "--db" in sys.argv else None
    raw = ROOT / "data" / "raw" / "aod.json"
    old = json.loads(raw.read_text(encoding="utf-8"))["lastUpdate"] if raw.exists() else None
    print("downloading anime-offline-database...", flush=True)
    with httpx.Client(follow_redirects=True, timeout=120) as c:
        r = c.get(AOD_URL)
        r.raise_for_status()
    new = json.loads(r.content)["lastUpdate"]
    print(f"catalogue snapshot: {old} -> {new}")
    raw.parent.mkdir(parents=True, exist_ok=True)
    raw.write_bytes(r.content)
    run(API_PY, "pipeline/anilist.py")
    # The snapshot can lag for months; AniList's live season lists add new announcements and current status.
    run(API_PY, "pipeline/anilist_seasons.py")
    run(API_PY, "pipeline/catalog.py")
    run(ML_PY, "export.py", cwd=ROOT / "ml")
    run(ML_PY, "calibrate.py", cwd=ROOT / "ml")
    run(API_PY, "seed.py", "--no-demo", cwd=ROOT / "api", env={"KONOMI_DATABASE_URL": db} if db else None)
    print("done — restart the API so the taste engine loads the new artifacts")


if __name__ == "__main__":
    main()
