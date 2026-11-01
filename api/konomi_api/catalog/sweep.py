from typing import Literal

from fastapi import APIRouter, Query
from sqlalchemy import func, select

from ..deps import Db
from ..models import Anime
from .routes import brief

router = APIRouter(prefix="/api", tags=["sweep"])
Season = Literal["WINTER", "SPRING", "SUMMER", "FALL"]


@router.get("/sweep")
def sweep(db: Db, year: int = Query(ge=1960, le=2100), season: Season = "FALL", limit: int = Query(48, ge=1, le=96)) -> dict:
    """The season's chart: its most popular TV / movie / ONA / OVA titles."""
    rows = db.scalars(
        select(Anime).where(Anime.year == year, Anime.season == season, Anime.popularity > 0,
                            Anime.type.in_(["TV", "MOVIE", "ONA", "OVA"]))
        .order_by(Anime.popularity.desc()).limit(limit)).all()
    return {"year": year, "season": season, "items": [brief(a) for a in rows]}


Kind = Literal["all", "shounen", "isekai", "romance", "films"]


@router.get("/popular")
def popular(db: Db, limit: int = Query(60, ge=1, le=500), offset: int = Query(0, ge=0, le=2000),
            kind: Kind = "all") -> dict:
    """The most popular anime of all time, seasons, films and OVAs included: the fastest way to fill a new chart.
    `kind` narrows it to one tag (shounen, isekai, romance) or to films."""
    q = select(Anime).where(Anime.popularity > 0, Anime.status != "UPCOMING")
    if kind == "films":
        q = q.where(Anime.type == "MOVIE")
    else:
        q = q.where(Anime.type.in_(["TV", "MOVIE", "ONA", "OVA"]))
        if kind != "all":
            # Whole-word match in the title's tags and genres ("shounen" must not match "shounen ai").
            words = func.array_to_string(func.array_cat(Anime.tags, Anime.genres), "|")
            q = q.where(words.op("~*")(rf"(^|\|){kind}(\||$)"))
    rows = db.scalars(q.order_by(Anime.popularity.desc(), Anime.id).offset(offset).limit(limit)).all()
    return {"items": [brief(a) for a in rows]}


@router.get("/showcase")
def showcase(db: Db) -> dict:
    """Popular covers for the landing page."""
    rows = db.scalars(select(Anime).where(Anime.type == "TV", Anime.color.is_not(None))
                      .order_by(Anime.popularity.desc()).limit(36)).all()
    return {"items": [brief(a) for a in rows]}
