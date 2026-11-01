from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, select, update
from sqlalchemy.dialects.postgresql import insert

from ..catalog.routes import brief
from ..deps import CurrentUser, Db
from ..models import Anime, ListEntry

router = APIRouter(prefix="/api/list", tags=["list"])
Status = Literal["completed", "watching", "dropped", "planned"]


class EntryIn(BaseModel):
    status: Status
    episodes_watched: int | None = Field(default=None, ge=0)


def entry_out(e: ListEntry) -> dict:
    return {"anime_id": e.anime_id, "status": e.status, "episodes_watched": e.episodes_watched,
            "tier": e.tier, "between": e.between, "score": e.score, "strength": e.strength, "predicted": e.predicted,
            "facets": e.facets,
            "source": e.source, "updated_at": e.updated_at.isoformat() if e.updated_at else None}


@router.get("")
def get_list(user: CurrentUser, db: Db) -> dict:
    from ..rating.routes import ensure_strength  # late import: rating imports the taste engine
    ensure_strength(db, user.id)
    rows = db.execute(select(ListEntry, Anime).join(Anime, Anime.id == ListEntry.anime_id)
                      .where(ListEntry.user_id == user.id).order_by(ListEntry.updated_at.desc())).all()
    return {"entries": [entry_out(e) | {"anime": brief(a)} for e, a in rows]}


@router.put("/{anime_id}")
def put_entry(anime_id: int, body: EntryIn, user: CurrentUser, db: Db) -> dict:
    if db.get(Anime, anime_id) is None:
        raise HTTPException(404, {"code": "not_found"})
    values = {"status": body.status, "episodes_watched": body.episodes_watched}
    db.execute(insert(ListEntry).values(user_id=user.id, anime_id=anime_id, **values)
               .on_conflict_do_update(index_elements=["user_id", "anime_id"], set_=values))
    db.commit()
    e = db.get(ListEntry, (user.id, anime_id))
    db.refresh(e)
    return entry_out(e)


class RestoreIn(BaseModel):
    anime_id: int
    status: Status
    tier: int | None = Field(default=None, ge=1, le=5)
    between: bool = False
    predicted: float | None = Field(default=None, ge=1, le=10)  # Konomi's earlier guess, so the score returns exactly


class BulkIn(BaseModel):
    action: Literal["status", "remove", "restore"]
    ids: list[int] = Field(default_factory=list, max_length=5000)
    status: Status | None = None
    entries: list[RestoreIn] = Field(default_factory=list, max_length=5000)


@router.post("/bulk")
def bulk(body: BulkIn, user: CurrentUser, db: Db) -> dict:
    """Change many titles in one go: move them to a status, remove them, or put removed ones back (Undo).
    Only titles already on the list are moved or removed; scores are refitted when rated titles leave or return."""
    from ..rating.routes import recompute  # late import: rating imports the taste engine

    mine = ListEntry.user_id == user.id
    rated = False
    if body.action == "status":
        if body.status is None:
            raise HTTPException(422, {"code": "status_required"})
        n = db.execute(update(ListEntry).where(mine, ListEntry.anime_id.in_(body.ids))
                       .values(status=body.status)).rowcount
    elif body.action == "remove":
        rated = bool(db.scalars(select(ListEntry.anime_id).where(
            mine, ListEntry.anime_id.in_(body.ids), ListEntry.tier.is_not(None))).first())
        n = db.execute(delete(ListEntry).where(mine, ListEntry.anime_id.in_(body.ids))).rowcount
    else:
        known = set(db.scalars(select(Anime.id).where(Anime.id.in_([e.anime_id for e in body.entries]))))
        n = 0
        for e in body.entries:
            if e.anime_id not in known:
                continue
            values = {"status": e.status, "tier": e.tier, "between": e.between and (e.tier or 0) > 1, "predicted": e.predicted}
            db.execute(insert(ListEntry).values(user_id=user.id, anime_id=e.anime_id, **values)
                       .on_conflict_do_update(index_elements=["user_id", "anime_id"], set_=values))
            n += 1
            rated = rated or e.tier is not None
    db.commit()
    if rated:
        recompute(db, user.id)
    return {"changed": n}


@router.delete("/{anime_id}")
def delete_entry(anime_id: int, user: CurrentUser, db: Db) -> dict:
    db.execute(delete(ListEntry).where(ListEntry.user_id == user.id, ListEntry.anime_id == anime_id))
    db.commit()
    return {"ok": True}
