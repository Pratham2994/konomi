from collections import Counter
from typing import Literal
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from ..catalog.routes import brief
from ..deps import CurrentUser, Db, OptionalUser
from ..models import Anime, ListEntry, User
from ..taste.engine import get_engine
from ..taste.service import user_entries

router = APIRouter(prefix="/api", tags=["profile"])
SectionId = Literal["favourites", "hill", "watching", "hot_takes", "years", "dna", "drops", "chart"]
SECTIONS = list(SectionId.__args__)
HIDDEN_BY_DEFAULT = {"drops"}
ACCENTS = {"auto", "spring", "summer", "fall", "winter", "matcha", "violet", "crimson", "mono"}
StatId = Literal["hours", "watching", "studio", "track"]
StatusId = Literal["completed", "watching", "planned", "dropped"]

# Look and chart options: each has a fixed set of values, the first is the default.
LOOK = {
    "header": ("art", "poster", "ink", "plain"),
    "banner_focus": ("center", "top", "bottom"),
    "avatar": ("initial", "cover", "none"),
    "name_style": ("poster", "quiet"),
    "fav_layout": ("hero", "even", "podium"),
    "scores": ("ten", "hundred", "off"),
    "chart_group": ("season", "score", "flat"),
    "chart_tab": ("completed", "watching", "planned", "dropped"),
}


class SectionIn(BaseModel):
    id: SectionId
    visible: bool


class HillIn(BaseModel):
    anime_id: int
    text: str = Field(default="", max_length=140)


class ProfileIn(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=40)
    bio: str | None = Field(default=None, max_length=160)
    is_public: bool | None = None
    accent: str | None = None
    banner_anime_id: int | None = None
    favourites: list[int] | None = Field(default=None, max_length=10)
    sections: list[SectionIn] | None = None
    pronouns: str | None = Field(default=None, max_length=24)
    location: str | None = Field(default=None, max_length=40)
    links: list[str] | None = Field(default=None, max_length=4)
    fav_title: str | None = Field(default=None, max_length=32)
    fan: bool | None = None
    hill: HillIn | None = None
    stats_hidden: list[StatId] | None = None
    chart_lists: list[StatusId] | None = Field(default=None, min_length=1)
    header: str | None = None
    banner_focus: str | None = None
    avatar: str | None = None
    name_style: str | None = None
    fav_layout: str | None = None
    scores: str | None = None
    chart_group: str | None = None
    chart_tab: str | None = None


def clean_link(url: str) -> str | None:
    url = url.strip()
    if url and "://" not in url:
        url = "https://" + url
    u = urlparse(url)
    return url if u.scheme in ("http", "https") and "." in u.netloc and len(url) <= 200 else None


def settings_out(u: User) -> dict:
    p = u.profile or {}
    stored = [s for s in p.get("sections", []) if s["id"] in SECTIONS]
    seen = {s["id"] for s in stored}
    # Sections added after the owner last saved are appended with their default visibility.
    sections = stored + [{"id": s, "visible": s not in HIDDEN_BY_DEFAULT} for s in SECTIONS if s not in seen]
    return {"username": u.username, "display_name": u.display_name, "is_public": u.is_public,
            "bio": p.get("bio", ""), "accent": p.get("accent", "auto"), "banner_anime_id": p.get("banner_anime_id"),
            "favourites": p.get("favourites", []), "sections": sections,
            "pronouns": p.get("pronouns", ""), "location": p.get("location", ""), "links": p.get("links", []),
            "fav_title": p.get("fav_title", ""), "fan": p.get("fan", True), "hill": p.get("hill"),
            "stats_hidden": p.get("stats_hidden", []),
            "chart_lists": p.get("chart_lists", list(LOOK["chart_tab"]))} | {
                k: p.get(k, opts[0]) for k, opts in LOOK.items()}


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
        p["sections"] = [s.model_dump() for s in body.sections] + [
            {"id": s, "visible": s not in HIDDEN_BY_DEFAULT} for s in SECTIONS if s not in seen]
    for key in ("pronouns", "location", "fav_title"):
        if (v := getattr(body, key)) is not None:
            p[key] = v.strip()
    if body.links is not None:
        links = [clean_link(x) for x in body.links if x.strip()]
        if None in links:
            raise HTTPException(422, {"code": "bad_link"})
        p["links"] = list(dict.fromkeys(links))
    if body.fan is not None:
        p["fan"] = body.fan
    if body.stats_hidden is not None:
        p["stats_hidden"] = list(dict.fromkeys(body.stats_hidden))
    if body.chart_lists is not None:
        p["chart_lists"] = [s for s in LOOK["chart_tab"] if s in body.chart_lists]
    for key, opts in LOOK.items():
        if (v := getattr(body, key)) is not None:
            if v not in opts:
                raise HTTPException(422, {"code": f"bad_{key}"})
            p[key] = v
    if "hill" in body.model_fields_set:
        mine = body.hill and db.scalars(select(ListEntry).where(
            ListEntry.user_id == user.id, ListEntry.anime_id == body.hill.anime_id)).first()
        p["hill"] = {"anime_id": body.hill.anime_id, "text": body.hill.text.strip()} if mine else None
    user.profile = p
    db.commit()
    return settings_out(user)


def visible_user(db, username: str, viewer: User | None) -> User:
    u = db.scalars(select(User).where(User.username == username.lower(), User.verified_at.is_not(None))).first()
    if u is None or (not u.is_public and (viewer is None or viewer.id != u.id)):
        # Private and missing look identical, so a private profile leaks nothing, not even that it exists.
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
    score_of = {a.id: e.score for e, a in rows}
    hill_a = by_id.get(s["hill"]["anime_id"]) if s["hill"] else None
    watching = sorted([(e, a) for e, a in rows if e.status == "watching"], key=lambda t: t[0].updated_at, reverse=True)
    dropped = sorted([(e, a) for e, a in rows if e.status == "dropped"], key=lambda t: t[0].updated_at, reverse=True)
    return {
        "user": {"username": u.username, "display_name": u.display_name, "bio": s["bio"], "accent": s["accent"],
                 "since": u.created_at.year, "is_public": u.is_public,
                 "pronouns": s["pronouns"], "location": s["location"], "links": s["links"]},
        "look": {k: s[k] for k in (*LOOK, "fav_title", "fan", "stats_hidden", "chart_lists")},
        "sections": s["sections"],
        "hill": {"anime": brief(hill_a), "text": s["hill"]["text"], "score": score_of[hill_a.id],
                 "everyone": round(hill_a.score, 1) if hill_a.score else None} if hill_a else None,
        "watching": [brief(a) | {"progress": e.episodes_watched} for e, a in watching[:12]],
        "drops": [brief(a) | {"progress": e.episodes_watched} for e, a in dropped[:24]],
        "banner": brief(banner) if banner else None,
        "stats": {"watched": len(done), "watching": sum(1 for e, _ in rows if e.status == "watching"),
                  "hours": round(hours), "top_studio": studios.most_common(1)[0][0] if studios else None,
                  "rated": sum(1 for e, _ in done if e.score is not None)},
        "favourites": favourites, "hot_takes": hot_takes,
        "years": sorted([[y, n] for y, n in years.items()]), "dna": dna, "entries": entries, "track": track,
    }


def public_view(p: dict) -> dict:
    """What visitors may see: sections the owner hid are removed server-side, not just hidden in the UI."""
    hidden = {s["id"] for s in p["sections"] if not s["visible"]}
    empty = {"favourites": [], "hot_takes": [], "years": [], "dna": None, "chart": [], "hill": None,
             "watching": [], "drops": []}
    out = dict(p)
    for sec in hidden:
        out["entries" if sec == "chart" else sec] = empty[sec]
    look = p["look"]
    out["entries"] = [e for e in out["entries"] if e["status"] in look["chart_lists"]]
    stats = dict(p["stats"])
    for k in look["stats_hidden"]:
        if k == "track":
            out["track"] = None
        else:
            stats["top_studio" if k == "studio" else k] = None
    out["stats"] = stats
    if look["scores"] == "off":
        # Hidden scores are removed from the payload, not just from the page.
        out["entries"] = [e | {"score": None} for e in out["entries"]]
        out["favourites"] = [f | {"score": None} for f in out["favourites"]]
        out["hot_takes"], out["track"] = [], None
        if out["hill"]:
            out["hill"] = out["hill"] | {"score": None}
    return out


@router.get("/u/{username}")
def public_profile(username: str, db: Db, viewer: OptionalUser) -> dict:
    u = visible_user(db, username, viewer)
    owner = bool(viewer and viewer.id == u.id)
    p = profile_payload(db, u)
    return (p if owner else public_view(p)) | {"is_owner": owner}


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
