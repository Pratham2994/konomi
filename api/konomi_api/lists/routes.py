from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
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
            "tier": e.tier, "between": e.between, "score": e.score, "predicted": e.predicted, "facets": e.facets,
            "source": e.source, "updated_at": e.updated_at.isoformat() if e.updated_at else None}


@router.get("")
def get_list(user: CurrentUser, db: Db) -> dict:
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


@router.delete("/{anime_id}")
def delete_entry(anime_id: int, user: CurrentUser, db: Db) -> dict:
    db.execute(delete(ListEntry).where(ListEntry.user_id == user.id, ListEntry.anime_id == anime_id))
    db.commit()
    return {"ok": True}
