import uuid
from dataclasses import dataclass
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from ..catalog.routes import brief
from ..deps import CurrentUser, Db
from ..models import Anime, Duel, ListEntry
from .score import DuelRec, fit, fit_scores
from .select import next_insertion_duel, next_session_question

router = APIRouter(prefix="/api/rate", tags=["rate"])
FACET_KEYS = {"story", "characters", "animation", "music", "ending", "rewatch", "still_think"}


class TierIn(BaseModel):
    tier: int = Field(ge=1, le=5)
    between: bool = False  # "between this feeling and the one below": starts on the band edge


class DuelIn(BaseModel):
    a: int
    b: int
    outcome: Literal["a", "b", "tie"]
    placing: int | None = None  # the title currently being placed, to continue its insertion


class FacetsIn(BaseModel):
    facets: dict[str, str]


@dataclass
class RatingState:
    tiers: dict[int, int]
    duels: list[DuelRec]
    between: set[int]
    guess: dict[int, float]


def _state(db: Session, user_id: uuid.UUID) -> RatingState:
    rows = db.execute(select(ListEntry.anime_id, ListEntry.tier, ListEntry.between, ListEntry.predicted)
                      .where(ListEntry.user_id == user_id, ListEntry.tier.is_not(None))).all()
    duels = [DuelRec(a, b, o) for a, b, o in db.execute(
        select(Duel.a_id, Duel.b_id, Duel.outcome).where(Duel.user_id == user_id).order_by(Duel.id)).all()]
    return RatingState({a: t for a, t, _, _ in rows}, duels, {a for a, _, b, _ in rows if b},
                       {a: g for a, _, _, g in rows if g is not None})


def recompute(db: Session, user_id: uuid.UUID) -> dict[int, float]:
    st = _state(db, user_id)
    scores = fit_scores(st.tiers, st.duels, st.between, st.guess)
    for e in db.scalars(select(ListEntry).where(ListEntry.user_id == user_id, ListEntry.tier.is_not(None))):
        if e.score != scores.get(e.anime_id):
            e.score = scores.get(e.anime_id)
    db.commit()
    return scores


def _duel_out(db: Session, placing: int, other: int | None) -> dict | None:
    if other is None:
        return None
    a, b = db.get(Anime, placing), db.get(Anime, other)
    return {"a": brief(a), "b": brief(b)}


def _predict(db: Session, user, anime_id: int) -> float | None:
    from ..taste.service import predict_for  # late import: taste engine loads model artifacts
    return predict_for(db, user, anime_id)


@router.post("/{anime_id}/tier")
def set_tier(anime_id: int, body: TierIn, user: CurrentUser, db: Db) -> dict:
    if db.get(Anime, anime_id) is None:
        raise HTTPException(404, {"code": "not_found"})
    entry = db.get(ListEntry, (user.id, anime_id))
    predicted = entry.predicted if entry else None
    if predicted is None:
        predicted = _predict(db, user, anime_id)
    values = {"status": "completed", "tier": body.tier, "between": body.between and body.tier > 1, "predicted": predicted}
    db.execute(insert(ListEntry).values(user_id=user.id, anime_id=anime_id, **values)
               .on_conflict_do_update(index_elements=["user_id", "anime_id"], set_=values))
    db.commit()
    scores = recompute(db, user.id)
    st = _state(db, user.id)
    return {"score": scores.get(anime_id), "predicted": predicted,
            "next_duel": _duel_out(db, anime_id, next_insertion_duel(st.tiers, st.duels, anime_id, st.between))}


@router.post("/duel")
def duel(body: DuelIn, user: CurrentUser, db: Db) -> dict:
    owned = set(db.scalars(select(ListEntry.anime_id).where(
        ListEntry.user_id == user.id, ListEntry.anime_id.in_([body.a, body.b]), ListEntry.tier.is_not(None))))
    if owned != {body.a, body.b} or body.a == body.b:
        raise HTTPException(422, {"code": "not_rated"})
    db.add(Duel(user_id=user.id, a_id=body.a, b_id=body.b, outcome=body.outcome))
    db.commit()
    scores = recompute(db, user.id)
    out: dict = {"scores": {str(k): v for k, v in scores.items() if k in (body.a, body.b)}}
    if body.placing in (body.a, body.b):
        st = _state(db, user.id)
        out["next_duel"] = _duel_out(db, body.placing, next_insertion_duel(st.tiers, st.duels, body.placing, st.between))
        out["score"] = scores.get(body.placing)
    return out


@router.post("/{anime_id}/facets")
def set_facets(anime_id: int, body: FacetsIn, user: CurrentUser, db: Db) -> dict:
    entry = db.get(ListEntry, (user.id, anime_id))
    if entry is None:
        raise HTTPException(404, {"code": "not_on_list"})
    # Merge: the Rate page sends one answer at a time and must not erase the others.
    entry.facets = (entry.facets or {}) | {k: str(v)[:20] for k, v in body.facets.items() if k in FACET_KEYS}
    db.commit()
    return {"facets": entry.facets}


@router.get("/session/next")
def session_next(user: CurrentUser, db: Db) -> dict:
    st = _state(db, user.id)
    untiered = list(db.scalars(
        select(ListEntry.anime_id).join(Anime, Anime.id == ListEntry.anime_id)
        .where(ListEntry.user_id == user.id, ListEntry.status == "completed", ListEntry.tier.is_(None))
        .order_by(Anime.popularity.desc()).limit(50)))
    facets_missing = list(db.scalars(
        select(ListEntry.anime_id).where(ListEntry.user_id == user.id, ListEntry.tier >= 4,
                                         ListEntry.facets == {}).order_by(ListEntry.score.desc()).limit(5)))
    q = next_session_question(st.tiers, st.duels, untiered, facets_missing, fit(st.tiers, st.duels, st.between, st.guess))
    remaining = db.query(ListEntry).filter(ListEntry.user_id == user.id, ListEntry.status == "completed",
                                           ListEntry.tier.is_(None)).count()
    if q is None:
        return {"question": None, "unrated": remaining}
    if q["kind"] == "duel":
        q = {"kind": "duel", "a": brief(db.get(Anime, q["a"])), "b": brief(db.get(Anime, q["b"]))}
    else:
        q = {"kind": q["kind"], "anime": brief(db.get(Anime, q["anime_id"]))}
    return {"question": q, "unrated": remaining}
