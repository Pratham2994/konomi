"""Batched AniList GraphQL fetch with on-disk cache.

Usage: python pipeline/anilist.py   (reads data/raw/aod.json, fills data/cache/anilist/)
"""
from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "data" / "cache" / "anilist"
URL = "https://graphql.anilist.co"
PAGE = 50
MIN_INTERVAL = 2.1  # seconds; stays under 30 requests/minute

QUERY = """
query ($ids: [Int]) {
  Page(perPage: 50) {
    media(id_in: $ids, type: ANIME) {
      id idMal isAdult popularity genres
      description(asHtml: false)
      coverImage { color }
      title { english }
    }
  }
}
"""

ANILIST_RE = re.compile(r"anilist\.co/anime/(\d+)")


def anilist_ids(aod_path: Path) -> list[int]:
    data = json.loads(aod_path.read_text(encoding="utf-8"))["data"]
    ids = set()
    for entry in data:
        for src in entry.get("sources", []):
            m = ANILIST_RE.search(src)
            if m:
                ids.add(int(m.group(1)))
    return sorted(ids)


def fetch(ids: list[int]) -> dict[int, dict]:
    """Fetch AniList media for the given ids; cached per 50-id chunk."""
    CACHE.mkdir(parents=True, exist_ok=True)
    out: dict[int, dict] = {}
    last = 0.0
    with httpx.Client(timeout=30) as client:
        for start in range(0, len(ids), PAGE):
            chunk = ids[start:start + PAGE]
            path = CACHE / f"{chunk[0]}-{chunk[-1]}.json"
            if not path.exists():
                for attempt in range(8):
                    wait = MIN_INTERVAL - (time.monotonic() - last)
                    if wait > 0:
                        time.sleep(wait)
                    last = time.monotonic()
                    try:
                        r = client.post(URL, json={"query": QUERY, "variables": {"ids": chunk}})
                    except httpx.HTTPError:
                        time.sleep(5 * (attempt + 1))
                        continue
                    if r.status_code == 429:
                        time.sleep(int(r.headers.get("Retry-After", "60")) + 1)
                        continue
                    if r.status_code >= 500:
                        time.sleep(10 * (attempt + 1))
                        continue
                    r.raise_for_status()
                    path.write_text(json.dumps(r.json()["data"]["Page"]["media"]), encoding="utf-8")
                    break
                else:
                    print(f"giving up on chunk {chunk[0]}", file=sys.stderr)
                    continue
            for m in json.loads(path.read_text(encoding="utf-8")):
                out[m["id"]] = m
            if (start // PAGE) % 50 == 0:
                print(f"{start + len(chunk)}/{len(ids)}", flush=True)
    return out


if __name__ == "__main__":
    ids = anilist_ids(ROOT / "data" / "raw" / "aod.json")
    print(f"{len(ids)} AniList ids")
    got = fetch(ids)
    print(f"fetched {len(got)}")
