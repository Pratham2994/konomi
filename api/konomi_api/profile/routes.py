from collections import Counter
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from ..catalog.routes import brief
from ..deps import CurrentUser, Db, OptionalUser
from ..models import Anime, ListEntry, User
from ..taste.engine import get_engine
from ..taste.service import user_entries

router = APIRouter(prefix="/api", tags=["profile"])
SECTIONS = ["favourites", "hot_takes", "years", "dna", "chart"]
ACCENTS = {"auto", "spring", "summer", "fall", "winter"}


class SectionIn(BaseModel):
    id: Literal["favourites", "hot_takes", "years", "dna", "chart"]
    visible: bool


class ProfileIn(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=40)
    bio: str | None = Field(default=None, max_length=160)
    is_public: bool | None = None
    accent: str | None = None
    banner_anime_id: int | None = None
    favourites: list[int] | None = Field(default=None, max_length=10)
    sections: list[SectionIn] | None = None


def settings_out(u: User) -> dict:
    p = u.profile or {}
    return {"username": u.username, "display_name": u.display_name, "is_public": u.is_public,
            "bio": p.get("bio", ""), "accent": p.get("accent", "auto"), "banner_anime_id": p.get("banner_anime_id"),
            "favourites": p.get("favourites", []),
            "sections": p.get("sections", [{"id": s, "visible": True} for s in SECTIONS])}


@router.get("/profile")
def get_profile(user: CurrentUser) -> dict:
    return settings_out(user)


@router.patch("/profile")
def patch_profile(body: ProfileIn, user: CurrentUser, db: Db) -> dict:
    p = dict(user.profile or {})
    if body.display_name is not None:
        user.display_name = body.display_name.strip()
    if body.is_public is not None:
        user.is_public = body.is_public
    if body.bio is not None:
        p["bio"] = body.bio.strip()
    if body.accent is not None:
        if body.accent not in ACCENTS:
            raise HTTPException(422, {"code": "bad_accent"})
        p["accent"] = body.accent
    if body.banner_anime_id is not None:
        p["banner_anime_id"] = body.banner_anime_id if db.get(Anime, body.banner_anime_id) else None
    if body.favourites is not None:
        mine = set(db.scalars(select(ListEntry.anime_id).where(ListEntry.user_id == user.id,
                                                               ListEntry.anime_id.in_(body.favourites))))
        p["favourites"] = [a for a in dict.fromkeys(body.favourites) if a in mine]
    if body.sections is not None:
        seen = {s.id for s in body.sections}
        p["sections"] = [s.model_dump() for s in body.sections] + [{"id": s, "visible": True} for s in SECTIONS if s not in seen]
    user.profile = p
    db.commit()
    return settings_out(user)


def visible_user(db, username: str, viewer: User | None) -> User:
    u = db.scalars(select(User).where(User.username == username.lower(), User.verified_at.is_not(None))).first()
    if u is None or (not u.is_public and (viewer is None or viewer.id != u.id)):
        # Private and missing look identical, so a private profile leaks nothing — not even that it exists.
        raise HTTPException(404, {"code": "private_or_missing"})
    return u


def profile_payload(db, u: User) -> dict:
    rows = db.execute(select(ListEntry, Anime).join(Anime, Anime.id == ListEntry.anime_id)
                      .where(ListEntry.user_id == u.id)).all()
    entries = [{"anime": brief(a), "status": e.status, "score": e.score, "tier": e.tier} for e, a in rows]
    done = [(e, a) for e, a in rows if e.status == "completed"]
    s = settings_out(u)
    fav_ids = s["favourites"] or [a.id for e, a in sorted(done, key=lambda t: -(t[0].score or 0)) if e.score][:10]
    by_id = {a.id: a for _, a in rows}
    favourites = [brief(by_id[i]) | {"score": next((e.score for e, a in rows if a.id == i), None)}
                  for i in fav_ids if i in by_id]
    hot = sorted([(e, a) for e, a in done if e.score is not None and a.score],
                 key=lambda t: -abs(t[0].score - t[1].score))[:6]
    hot_takes = [{"anime": brief(a), "you": e.score, "everyone": round(a.score, 1)} for e, a in hot
                 if abs(e.score - a.score) >= 1.0]
    years = Counter(a.year for _, a in done if a.year)
    hours = sum((a.episodes or 1) * (a.duration_s or 1440) for _, a in done) / 3600
    studios = Counter(st for _, a in done for st in (a.studios or [])[:1])
    eng = get_engine()
    dna = eng.dna(user_entries(db, u.id)) if eng else None
    guesses = [(e.predicted, e.score) for e, _ in done if e.predicted is not None and e.score is not None]
    track = ({"n": len(guesses), "within1": round(sum(abs(p - s) <= 1 for p, s in guesses) / len(guesses), 3)}
             if len(guesses) >= 3 else None)
    banner = db.get(Anime, s["banner_anime_id"]) if s["banner_anime_id"] else (
        by_id.get(fav_ids[0]) if fav_ids and fav_ids[0] in by_id else None)
    return {
        "user": {"username": u.username, "display_name": u.display_name, "bio": s["bio"], "accent": s["accent"],
                 "since": u.created_at.year, "is_public": u.is_public},
        "sections": s["sections"],
        "banner": brief(banner) if banner else None,
        "stats": {"watched": len(done), "watching": sum(1 for e, _ in rows if e.status == "watching"),
                  "hours": round(hours), "top_studio": studios.most_common(1)[0][0] if studios else None,
                  "rated": sum(1 for e, _ in done if e.score is not None)},
        "favourites": favourites, "hot_takes": hot_takes,
        "years": sorted([[y, n] for y, n in years.items()]), "dna": dna, "entries": entries, "track": track,
    }


@router.get("/u/{username}")
def public_profile(username: str, db: Db, viewer: OptionalUser) -> dict:
    u = visible_user(db, username, viewer)
    return profile_payload(db, u) | {"is_owner": bool(viewer and viewer.id == u.id)}


@router.get("/u/{username}/match")
def match(username: str, db: Db, viewer: CurrentUser) -> dict:
    u = visible_user(db, username, viewer)
    eng = get_engine()
    if eng is None:
        raise HTTPException(503, {"code": "model_not_ready"})
    m = eng.match(user_entries(db, viewer.id), user_entries(db, u.id))
    if m is None:
        return {"match": None}
    ids = [x["anime_id"] for x in m["agree"] + m["fight"]]
    b = {a.id: brief(a) for a in db.scalars(select(Anime).where(Anime.id.in_(ids)))}
    for part in ("agree", "fight"):
        m[part] = [x | {"anime": b[x.pop("anime_id")]} for x in m[part]]
    return {"match": m}
