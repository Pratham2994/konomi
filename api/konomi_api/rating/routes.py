import time
import uuid
from dataclasses import dataclass
from typing import Literal

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import delete, select, text, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from ..catalog.blurb import blurbs
from ..catalog.routes import brief
from ..deps import CurrentUser, Db
from ..models import Anime, Duel, ListEntry
from .score import DuelRec, prior, strength, to_score
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
class Row:
    status: str
    tier: int | None
    between: bool
    predicted: float | None
    score: float | None
    facets: dict
    popularity: int
    strength: float | None = None


@dataclass
class RatingState:
    """Everything rating needs, loaded once per request. The live server can be far from the database, where every
    query costs a long round trip, so requests load this once and work in memory."""
    rows: dict[int, Row]
    duels: list[DuelRec]

    @property
    def tiers(self) -> dict[int, int]:
        return {a: r.tier for a, r in self.rows.items() if r.tier is not None}

    @property
    def between(self) -> set[int]:
        return {a for a, r in self.rows.items() if r.tier is not None and r.between}

    @property
    def guess(self) -> dict[int, float]:
        return {a: r.predicted for a, r in self.rows.items() if r.tier is not None and r.predicted is not None}


def _state(db: Session, user_id: uuid.UUID) -> RatingState:
    rows = db.execute(select(ListEntry.anime_id, ListEntry.status, ListEntry.tier, ListEntry.between,
                             ListEntry.predicted, ListEntry.score, ListEntry.facets, Anime.popularity, ListEntry.strength)
                      .join(Anime, Anime.id == ListEntry.anime_id).where(ListEntry.user_id == user_id)).all()
    duels = [DuelRec(a, b, o) for a, b, o in db.execute(
        select(Duel.a_id, Duel.b_id, Duel.outcome).where(Duel.user_id == user_id).order_by(Duel.id)).all()]
    return RatingState({a: Row(s, t, bool(bw), p, sc, f or {}, pop or 0, sg) for a, s, t, bw, p, sc, f, pop, sg in rows},
                       duels)


def recompute(db: Session, user_id: uuid.UUID, st: RatingState | None = None, commit: bool = True) -> dict[int, float]:
    """Refit every score and write the changed ones in a single statement."""
    st = st or _state(db, user_id)
    exact = strength(st.tiers, st.duels, st.between, st.guess)
    scores = {a: to_score(v) for a, v in exact.items()}
    changed = [a for a, r in st.rows.items()
               if a in scores and (r.score != scores[a] or r.strength is None or abs(r.strength - exact[a]) > 1e-9)]
    if changed:
        db.execute(text("UPDATE list_entries AS e SET score = v.score, strength = v.strength "
                        "FROM unnest(CAST(:ids AS integer[]), CAST(:scores AS double precision[]), "
                        "CAST(:strengths AS double precision[])) AS v(anime_id, score, strength) "
                        "WHERE e.user_id = :u AND e.anime_id = v.anime_id"),
                   {"ids": changed, "scores": [scores[a] for a in changed], "strengths": [exact[a] for a in changed],
                    "u": user_id})
        for a in changed:
            st.rows[a].score, st.rows[a].strength = scores[a], exact[a]
    if commit:
        db.commit()
    return scores


def _briefs(db: Session, ids: list[int]) -> dict[int, dict]:
    """Cards for rating questions, each with one line on what happens in it, so seasons can be told apart."""
    if not ids:
        return {}
    rows = list(db.scalars(select(Anime).where(Anime.id.in_(ids))))
    lines = blurbs(db, rows)
    return {a.id: brief(a) | {"blurb": lines[a.id]} for a in rows}


def _duel_out(db: Session, placing: int, other: int | None) -> dict | None:
    if other is None:
        return None
    b = _briefs(db, [placing, other])
    return {"a": b[placing], "b": b[other]}


class _Clock:
    """Per-step timings for the Server-Timing header, so slow steps can be seen from the browser."""

    def __init__(self) -> None:
        self.t, self.marks = time.perf_counter(), []

    def mark(self, step: str) -> None:
        now = time.perf_counter()
        self.marks.append(f"{step};dur={(now - self.t) * 1000:.0f}")
        self.t = now

    def send(self, response: Response) -> None:
        response.headers["Server-Timing"] = ", ".join(self.marks)


def _predict(st: RatingState, anime_id: int) -> float | None:
    from ..taste.engine import UserEntry, get_engine  # late import: taste engine loads model artifacts
    eng = get_engine()
    if eng is None:
        return None
    return eng.predict([UserEntry(a, r.status, r.tier, r.score) for a, r in st.rows.items()], anime_id)


@router.post("/{anime_id}/tier")
def set_tier(anime_id: int, body: TierIn, user: CurrentUser, db: Db, response: Response, next: bool = False) -> dict:
    clock = _Clock()
    st = _state(db, user.id)
    row = st.rows.get(anime_id)
    if row is None and db.get(Anime, anime_id) is None:
        raise HTTPException(404, {"code": "not_found"})
    clock.mark("load")
    predicted = row.predicted if row else None
    if predicted is None:
        predicted = _predict(st, anime_id)
    clock.mark("guess")
    values = {"status": "completed", "tier": body.tier, "between": body.between and body.tier > 1, "predicted": predicted}
    db.execute(insert(ListEntry).values(user_id=user.id, anime_id=anime_id, **values)
               .on_conflict_do_update(index_elements=["user_id", "anime_id"], set_=values))
    st.rows[anime_id] = Row("completed", body.tier, values["between"], predicted, row.score if row else None,
                            row.facets if row else {}, row.popularity if row else 0)
    scores = recompute(db, user.id, st, commit=False)
    clock.mark("scores")
    out = {"score": scores.get(anime_id), "predicted": predicted,
           "next_duel": _duel_out(db, anime_id, next_insertion_duel(st.tiers, st.duels, anime_id, st.between))}
    if next:
        out["session"] = _session(db, st)
    db.commit()
    clock.mark("next")
    clock.send(response)
    return out


@router.post("/duel")
def duel(body: DuelIn, user: CurrentUser, db: Db, response: Response, next: bool = False) -> dict:
    clock = _Clock()
    st = _state(db, user.id)
    tiers = st.tiers
    if body.a == body.b or body.a not in tiers or body.b not in tiers:
        raise HTTPException(422, {"code": "not_rated"})
    row = Duel(user_id=user.id, a_id=body.a, b_id=body.b, outcome=body.outcome)
    db.add(row)
    db.flush()  # its id, so the answer can be taken back
    st.duels.append(DuelRec(body.a, body.b, body.outcome))
    clock.mark("load")
    scores = recompute(db, user.id, st, commit=False)
    clock.mark("scores")
    out: dict = {"id": row.id, "scores": {str(k): v for k, v in scores.items() if k in (body.a, body.b)}}
    if body.placing in (body.a, body.b):
        out["next_duel"] = _duel_out(db, body.placing, next_insertion_duel(st.tiers, st.duels, body.placing, st.between))
        out["score"] = scores.get(body.placing)
    if next:  # the Rate page: send the next question back with the answer, one round trip instead of two
        out["session"] = _session(db, st)
    db.commit()
    clock.mark("next")
    clock.send(response)
    return out


# Taking an answer back (the Rate page's Back): each undoes one answer and refits the scores.

@router.delete("/{anime_id}/tier")
def clear_tier(anime_id: int, user: CurrentUser, db: Db) -> dict:
    db.execute(update(ListEntry).where(ListEntry.user_id == user.id, ListEntry.anime_id == anime_id)
               .values(tier=None, between=False, score=None, strength=None))
    recompute(db, user.id)
    return {"ok": True}


@router.delete("/duel/{duel_id}")
def take_back_duel(duel_id: int, user: CurrentUser, db: Db) -> dict:
    db.execute(delete(Duel).where(Duel.user_id == user.id, Duel.id == duel_id))
    recompute(db, user.id)
    return {"ok": True}


@router.delete("/{anime_id}/facets")
def clear_facets(anime_id: int, user: CurrentUser, db: Db) -> dict:
    db.execute(update(ListEntry).where(ListEntry.user_id == user.id, ListEntry.anime_id == anime_id).values(facets={}))
    db.commit()
    return {"ok": True}


@router.post("/{anime_id}/facets")
def set_facets(anime_id: int, body: FacetsIn, user: CurrentUser, db: Db, next: bool = False) -> dict:
    entry = db.get(ListEntry, (user.id, anime_id))
    if entry is None:
        raise HTTPException(404, {"code": "not_on_list"})
    # Merge: the Rate page sends one answer at a time and must not erase the others.
    entry.facets = (entry.facets or {}) | {k: str(v)[:20] for k, v in body.facets.items() if k in FACET_KEYS}
    db.commit()
    return {"facets": entry.facets} | ({"session": _session(db, _state(db, user.id))} if next else {})


@router.get("/{anime_id}/explain")
def explain(anime_id: int, user: CurrentUser, db: Db) -> dict:
    """How one title's score came about: where its feeling started it, and what its comparisons did."""
    st = _state(db, user.id)
    if anime_id not in st.tiers:
        raise HTTPException(404, {"code": "not_rated"})
    wins = losses = ties = 0
    for d in st.duels:
        if anime_id not in (d.a, d.b):
            continue
        if d.outcome == "tie":
            ties += 1
        elif (d.outcome == "a") == (d.a == anime_id):
            wins += 1
        else:
            losses += 1
    return {"tier": st.tiers[anime_id], "between": anime_id in st.between,
            "start": round(prior(st.tiers[anime_id], anime_id in st.between, st.guess.get(anime_id)), 1),
            "guess": st.guess.get(anime_id), "score": st.rows[anime_id].score,
            "wins": wins, "losses": losses, "ties": ties}


def _session(db: Session, st: RatingState) -> dict:
    """The next most useful question, worked out in memory from the loaded state; one query for its cards."""
    untiered_rows = sorted(((a, r) for a, r in st.rows.items() if r.status == "completed" and r.tier is None),
                           key=lambda t: -t[1].popularity)
    untiered = [a for a, _ in untiered_rows[:50]]
    facets_missing = [a for a, r in sorted(((a, r) for a, r in st.rows.items()
                                            if r.tier is not None and r.tier >= 4 and not r.facets),
                                           key=lambda t: -(t[1].score or 0))][:5]
    q = next_session_question(st.tiers, st.duels, untiered, facets_missing,
                              strength(st.tiers, st.duels, st.between, st.guess))
    remaining = len(untiered_rows)
    if q is None:
        return {"question": None, "unrated": remaining}
    if q["kind"] == "duel":
        b = _briefs(db, [q["a"], q["b"]])
        return {"question": {"kind": "duel", "a": b[q["a"]], "b": b[q["b"]]}, "unrated": remaining}
    # For feeling questions, also send the titles that come next, so the page can show them the moment you answer
    # while the answer saves in the background.
    queue = [a for a in untiered[1:16]] if q["kind"] == "tier" else []
    b = _briefs(db, [q["anime_id"], *queue])
    return {"question": {"kind": q["kind"], "anime": b[q["anime_id"]]}, "unrated": remaining,
            "queue": [b[a] for a in queue if a in b]}


@router.post("/reset")
def reset(user: CurrentUser, db: Db) -> dict:
    """Start rating over: every feeling, comparison and answer goes. Titles and their statuses stay."""
    n = db.execute(update(ListEntry).where(ListEntry.user_id == user.id, ListEntry.tier.is_not(None))
                   .values(tier=None, between=False, predicted=None, score=None, strength=None, facets={})).rowcount
    d = db.execute(delete(Duel).where(Duel.user_id == user.id)).rowcount
    db.commit()
    return {"cleared": n, "comparisons": d}


def ensure_strength(db: Session, user_id: uuid.UUID) -> None:
    """Titles scored before strengths were saved get theirs once, on the first read that needs them."""
    if db.scalar(select(ListEntry.anime_id).where(ListEntry.user_id == user_id, ListEntry.tier.is_not(None),
                                                  ListEntry.strength.is_(None)).limit(1)) is not None:
        recompute(db, user_id)


@router.get("/session/next")
def session_next(user: CurrentUser, db: Db) -> dict:
    return _session(db, _state(db, user.id))
