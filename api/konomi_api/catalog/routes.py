import gzip
import hashlib
import json

from typing import Annotated

from fastapi import APIRouter, Body, HTTPException, Request, Response
from sqlalchemy import select, text

from ..db import engine
from ..deps import Db
from ..models import Anime

router = APIRouter(prefix="/api", tags=["catalog"])
_index: dict | None = None
MAX_SYNONYMS = 6


def _build_index() -> dict:
    """Compact rows for the in-browser search: [id, title, title_en, synonyms, type, year, thumb, pop, color, eps]."""
    with engine.connect() as c:
        rows = c.execute(text(
            "select id, title, title_en, synonyms, type, year, thumbnail, popularity, color, episodes "
            "from anime order by popularity desc, id")).all()
    items = []
    for r in rows:
        syn = [s for s in (r.synonyms or []) if s.isascii()][:MAX_SYNONYMS]
        items.append([r.id, r.title, r.title_en, syn, r.type, r.year, r.thumbnail, r.popularity, r.color,
                      r.episodes])
    body = json.dumps({"items": items}, separators=(",", ":"), ensure_ascii=False).encode()
    version = hashlib.sha1(body).hexdigest()[:12]
    payload = json.dumps({"version": version, "items": items}, separators=(",", ":"),
                         ensure_ascii=False).encode()
    return {"version": version, "gz": gzip.compress(payload, 6)}


def warm_index() -> None:
    """Build the search index at startup, so the first visitor after a deploy or wake-up doesn't wait for it."""
    global _index
    if _index is None:
        _index = _build_index()


def reset_index() -> None:
    global _index
    _index = None


@router.get("/catalog/index")
def catalog_index(request: Request) -> Response:
    global _index
    if _index is None:
        _index = _build_index()
    etag = f'"{_index["version"]}"'
    headers = {"ETag": etag, "Cache-Control": "public, max-age=86400", "Content-Encoding": "gzip",
               "Vary": "Accept-Encoding"}
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag})
    return Response(_index["gz"], media_type="application/json", headers=headers)


def brief(a: Anime) -> dict:
    return {"id": a.id, "title": a.title, "title_en": a.title_en, "type": a.type, "year": a.year,
            "season": a.season, "episodes": a.episodes, "thumbnail": a.thumbnail, "picture": a.picture,
            "color": a.color, "popularity": a.popularity, "duration_s": a.duration_s}


def detail(a: Anime) -> dict:
    return brief(a) | {
        "synonyms": a.synonyms, "status": a.status, "duration_s": a.duration_s, "score": a.score,
        "studios": a.studios, "tags": a.tags, "genres": a.genres, "synopsis": a.synopsis,
        "mal_id": a.mal_id, "anilist_id": a.anilist_id, "related": a.related,
    }


@router.get("/catalog/cut-synopses")
def cut_synopses(db: Db) -> list:
    """Temporary, for one repair: synopses whose first letters were lost in the source data (they start in lower
    case). Public catalogue fields only."""
    rows = db.execute(text("select id, anilist_id, mal_id, left(synopsis, 80) from anime where synopsis ~ '^[a-z]'"))
    return [list(r) for r in rows]


@router.get("/anime/{anime_id}")
def get_anime(anime_id: int, db: Db) -> dict:
    a = db.get(Anime, anime_id)
    if a is None:
        raise HTTPException(404, {"code": "not_found"})
    rel = db.scalars(select(Anime).where(Anime.id.in_(a.related or []))).all() if a.related else []
    rel = sorted(rel, key=lambda r: (r.year or 9999, r.id))
    return detail(a) | {"related": [brief(r) for r in rel]}


@router.post("/anime/batch")
def anime_batch(ids: Annotated[list[int], Body(max_length=500)], db: Db) -> list[dict]:
    rows = db.scalars(select(Anime).where(Anime.id.in_(ids[:500]))).all()
    return [brief(a) for a in rows]
