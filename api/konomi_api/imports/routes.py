"""Bring an existing list over: MAL XML export or a public AniList username.

Imported titles keep their status. An imported score only picks the feeling tier (scores elsewhere are inflated —
the reason Konomi exists); duels in the rate session place them properly. Existing Konomi entries are never touched.
"""
from __future__ import annotations

import zlib

import httpx
from defusedxml import ElementTree
from fastapi import APIRouter, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from ..deps import CurrentUser, Db
from ..models import Anime, ListEntry
from ..rating.routes import recompute

router = APIRouter(prefix="/api/import", tags=["import"])
MAX_BYTES = 10 * 1024 * 1024

MAL_STATUS = {"completed": "completed", "watching": "watching", "dropped": "dropped", "plan to watch": "planned",
              "on-hold": "watching"}
ANILIST_STATUS = {"COMPLETED": "completed", "CURRENT": "watching", "REPEATING": "completed", "DROPPED": "dropped",
                  "PLANNING": "planned", "PAUSED": "watching"}


def tier_hint(score: float) -> int | None:
    if score <= 0:
        return None
    if score >= 9:
        return 5
    if score >= 8:
        return 4
    if score >= 6:
        return 3
    if score >= 4:
        return 2
    return 1


def apply(db, user, rows: list[tuple[str, int, str, float]]) -> dict:
    """rows: (id_kind 'mal'|'anilist', id, status, score 0..10)."""
    mal_ids = [r[1] for r in rows if r[0] == "mal"]
    al_ids = [r[1] for r in rows if r[0] == "anilist"]
    by_mal = dict(db.execute(select(Anime.mal_id, Anime.id).where(Anime.mal_id.in_(mal_ids))).all()) if mal_ids else {}
    by_al = dict(db.execute(select(Anime.anilist_id, Anime.id).where(Anime.anilist_id.in_(al_ids))).all()) if al_ids else {}
    existing = set(db.scalars(select(ListEntry.anime_id).where(ListEntry.user_id == user.id)))
    added = skipped = unmatched = 0
    for kind, ext, status, score in rows:
        aid = (by_mal if kind == "mal" else by_al).get(ext)
        if aid is None:
            unmatched += 1
            continue
        if aid in existing:
            skipped += 1
            continue
        tier = tier_hint(score) if status == "completed" else None
        db.execute(insert(ListEntry).values(user_id=user.id, anime_id=aid, status=status, tier=tier, source="import")
                   .on_conflict_do_nothing())
        existing.add(aid)
        added += 1
    db.commit()
    recompute(db, user.id)
    return {"added": added, "skipped": skipped, "unmatched": unmatched}


@router.post("/mal")
def import_mal(file: UploadFile, user: CurrentUser, db: Db) -> dict:
    raw = file.file.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise HTTPException(413, {"code": "too_large"})
    if raw[:2] == b"\x1f\x8b":
        # Inflate with a ceiling: a small gzip can expand to gigabytes.
        d = zlib.decompressobj(16 + zlib.MAX_WBITS)
        out = d.decompress(raw, MAX_BYTES * 5)
        if d.unconsumed_tail:
            raise HTTPException(413, {"code": "too_large"})
        raw = out
    try:
        root = ElementTree.fromstring(raw)
    except Exception:
        raise HTTPException(422, {"code": "not_mal_xml"})
    rows = []
    for a in root.iter("anime"):
        try:
            mal = int(a.findtext("series_animedb_id") or 0)
            status = MAL_STATUS.get((a.findtext("my_status") or "").strip().lower())
            score = float(a.findtext("my_score") or 0)
        except ValueError:
            continue
        if mal and status:
            rows.append(("mal", mal, status, score))
    if not rows:
        raise HTTPException(422, {"code": "not_mal_xml"})
    return apply(db, user, rows)


class AniListIn(BaseModel):
    username: str = Field(min_length=2, max_length=40, pattern=r"^[A-Za-z0-9_\-]+$")


QUERY = """query ($u: String) { MediaListCollection(userName: $u, type: ANIME) {
  lists { entries { status score(format: POINT_10_DECIMAL) media { id } } } } }"""


@router.post("/anilist")
def import_anilist(body: AniListIn, user: CurrentUser, db: Db) -> dict:
    try:
        r = httpx.post("https://graphql.anilist.co", json={"query": QUERY, "variables": {"u": body.username}}, timeout=20)
    except httpx.HTTPError:
        raise HTTPException(502, {"code": "anilist_unreachable"})
    if r.status_code == 404 or (r.status_code == 200 and r.json().get("errors")):
        raise HTTPException(404, {"code": "anilist_user_not_found"})
    if r.status_code == 429:
        raise HTTPException(429, {"code": "rate_limited"})
    r.raise_for_status()
    rows = []
    for lst in r.json()["data"]["MediaListCollection"]["lists"]:
        for e in lst["entries"]:
            status = ANILIST_STATUS.get(e["status"])
            if status:
                rows.append(("anilist", e["media"]["id"], status, float(e["score"] or 0)))
    return apply(db, user, rows)
