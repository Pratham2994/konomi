"""Fresh season lists from AniList, to cover what anime-offline-database (a weekly snapshot that can lag) misses:
titles announced since the snapshot, and up-to-date airing status.

Usage: python pipeline/anilist_seasons.py     (writes data/cache/anilist_seasons/, refetches every run)
"""
from __future__ import annotations

import json
import time
from datetime import date
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "cache" / "anilist_seasons"
URL = "https://graphql.anilist.co"
SEASONS = ["WINTER", "SPRING", "SUMMER", "FALL"]

QUERY = """
query ($season: MediaSeason, $year: Int, $page: Int) {
  Page(page: $page, perPage: 50) {
    pageInfo { hasNextPage }
    media(season: $season, seasonYear: $year, type: ANIME, sort: POPULARITY_DESC) {
      id idMal isAdult format episodes duration status season seasonYear popularity averageScore genres
      title { romaji english } synonyms description(asHtml: false)
      coverImage { large medium color }
      studios(isMain: true) { nodes { name } }
      tags { name rank }
      relations { edges { relationType node { id type } } }
    }
  }
}
"""


def seasons_around(today: date, back: int = 2, ahead: int = 2) -> list[tuple[str, int]]:
    idx = (today.month - 1) // 3
    out = []
    for k in range(-back, ahead + 1):
        i = idx + k
        out.append((SEASONS[i % 4], today.year + i // 4))
    return out


def fetch(today: date | None = None) -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    n = 0
    last = 0.0
    with httpx.Client(timeout=30) as client:
        for season, year in seasons_around(today or date.today()):
            for page in range(1, 8):
                for attempt in range(6):
                    wait = 2.1 - (time.monotonic() - last)
                    if wait > 0:
                        time.sleep(wait)
                    last = time.monotonic()
                    r = client.post(URL, json={"query": QUERY, "variables": {"season": season, "year": year, "page": page}})
                    if r.status_code == 429:
                        time.sleep(int(r.headers.get("Retry-After", "60")) + 1)
                        continue
                    r.raise_for_status()
                    break
                data = r.json()["data"]["Page"]
                (OUT / f"{year}-{season}-{page}.json").write_text(json.dumps(data["media"]), encoding="utf-8")
                n += len(data["media"])
                if not data["pageInfo"]["hasNextPage"]:
                    break
            print(f"{season} {year}: done", flush=True)
    return n


if __name__ == "__main__":
    print(f"{fetch()} titles fetched")
