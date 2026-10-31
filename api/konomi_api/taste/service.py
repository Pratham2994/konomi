"""Bridge between request handlers and the taste engine (filled in by the taste engine task)."""
from __future__ import annotations

from sqlalchemy.orm import Session


def predict_for(db: Session, user, anime_id: int) -> float | None:
    return None
