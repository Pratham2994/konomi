"""Bridge between request handlers and the taste engine."""
from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import ListEntry
from .engine import UserEntry, get_engine


def user_entries(db: Session, user_id: uuid.UUID) -> list[UserEntry]:
    rows = db.execute(select(ListEntry.anime_id, ListEntry.status, ListEntry.tier, ListEntry.score)
                      .where(ListEntry.user_id == user_id)).all()
    return [UserEntry(a, s, t, sc) for a, s, t, sc in rows]


def predict_for(db: Session, user, anime_id: int) -> float | None:
    eng = get_engine()
    if eng is None:
        return None
    return eng.predict(user_entries(db, user.id), anime_id)
