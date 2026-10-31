from typing import Literal

from fastapi import APIRouter, Query
from sqlalchemy import select

from ..deps import Db
from ..models import Anime
from .routes import brief

router = APIRouter(prefix="/api", tags=["sweep"])
Season = Literal["WINTER", "SPRING", "SUMMER", "FALL"]


@router.get("/sweep")
def sweep(db: Db, year: int = Query(ge=1960, le=2100), season: Season = "FALL", limit: int = Query(48, le=96)) -> dict:
    """The season's chart: its most popular TV / movie / ONA / OVA titles."""
    rows = db.scalars(
        select(Anime).where(Anime.year == year, Anime.season == season, Anime.popularity > 0,
                            Anime.type.in_(["TV", "MOVIE", "ONA", "OVA"]))
        .order_by(Anime.popularity.desc()).limit(limit)).all()
    return {"year": year, "season": season, "items": [brief(a) for a in rows]}


@router.get("/showcase")
def showcase(db: Db) -> dict:
    """Popular covers for the landing page."""
    rows = db.scalars(select(Anime).where(Anime.type == "TV", Anime.color.is_not(None))
                      .order_by(Anime.popularity.desc()).limit(36)).all()
    return {"items": [brief(a) for a in rows]}
