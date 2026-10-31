from typing import Annotated

from fastapi import Cookie, Depends, HTTPException
from sqlalchemy.orm import Session

from .auth.security import COOKIE, user_for_token
from .db import get_db
from .models import User

Db = Annotated[Session, Depends(get_db)]


def optional_user(db: Db, konomi_session: Annotated[str | None, Cookie()] = None) -> User | None:
    user = user_for_token(db, konomi_session)
    return user if user and user.verified_at else None


def current_user(user: Annotated[User | None, Depends(optional_user)]) -> User:
    if user is None:
        raise HTTPException(401, {"code": "unauthenticated"})
    return user


CurrentUser = Annotated[User, Depends(current_user)]
OptionalUser = Annotated[User | None, Depends(optional_user)]
