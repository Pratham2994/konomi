import re
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Query, Response
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


SEASONS: tuple[Season, ...] = ("WINTER", "SPRING", "SUMMER", "FALL")
_showcase: dict[tuple[int, str], dict] = {}


def _words(a: Anime) -> str:
    return " ".join(re.sub(r"[^0-9a-z]+", " ", (a.title_en or a.title).lower()).split())


def _one_per_franchise(rows: list[Anime], n: int) -> list[Anime]:
    """Skip sequels and films of a title already taken: same name start ("Attack on Titan Season 2" after "Attack on
    Titan"), same first three words ("The Apothecary Diaries: ..." after "The Apothecary Diaries Season 3"), or related."""
    out: list[Anime] = []
    seen: list[str] = []
    for a in rows:
        w = _words(a)
        taken = {o.id for o in out}
        three = w.split()[:3]
        if any(w == s or w.startswith(s + " ") or s.startswith(w + " ") or (len(three) == 3 and s.split()[:3] == three)
               for s in seen) or taken & set(a.related or []):
            continue
        out.append(a)
        seen.append(w)
        if len(out) == n:
            break
    return out


@router.get("/showcase")
def showcase(db: Db, response: Response) -> dict:
    """Covers for the signed-out landing wall: the all-time most popular titles (one per franchise) and the
    season airing now. The same for everyone, so it is built once per season and cached by browsers and CDNs."""
    today = datetime.now(timezone.utc)
    year, season = today.year, SEASONS[(today.month - 1) // 3]
    if (year, season) not in _showcase:
        kinds = ["TV", "MOVIE", "ONA", "OVA"]
        top = db.scalars(select(Anime).where(Anime.popularity > 0, Anime.status != "UPCOMING", Anime.type.in_(kinds))
                         .order_by(Anime.popularity.desc(), Anime.id).limit(200)).all()
        now = db.scalars(select(Anime).where(Anime.year == year, Anime.season == season, Anime.popularity > 0,
                                             Anime.type.in_(kinds))
                         .order_by(Anime.popularity.desc(), Anime.id).limit(40)).all()
        _showcase.clear()
        _showcase[(year, season)] = {
            "year": year, "season": season,
            "classics": [brief(a) for a in _one_per_franchise(list(top), 40)],
            "now": [brief(a) for a in _one_per_franchise(list(now), 16)],
        }
    response.headers["Cache-Control"] = "public, max-age=3600, s-maxage=21600"
    return _showcase[(year, season)]
