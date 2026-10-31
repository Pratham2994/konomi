import re
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Cookie, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select

from ..config import get_settings
from ..deps import CurrentUser, Db
from ..models import User
from . import otp
from .ratelimit import hit
from .security import COOKIE, end_all_sessions, end_session, hash_password, new_session, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])
USERNAME_RE = re.compile(r"^[a-z0-9_]{3,20}$")


class SignupIn(BaseModel):
    email: EmailStr
    username: str
    password: str = Field(min_length=8, max_length=200)


class EmailIn(BaseModel):
    email: EmailStr


class VerifyIn(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class ResetIn(VerifyIn):
    password: str = Field(min_length=8, max_length=200)


def me_out(user: User) -> dict:
    return {"id": str(user.id), "email": user.email, "username": user.username,
            "display_name": user.display_name, "is_public": user.is_public, "profile": user.profile}


def _set_cookie(response: Response, token: str) -> None:
    secure = not get_settings().public_url.startswith("http://localhost")
    response.set_cookie(COOKIE, token, max_age=get_settings().session_days * 86400, httponly=True,
                        samesite="lax", secure=secure, path="/")


@router.post("/signup", status_code=202)
def signup(body: SignupIn, db: Db, request: Request) -> dict:
    hit(f"signup:{request.client.host if request.client else '-'}", 20, 3600)
    username = body.username.strip().lower()
    if not USERNAME_RE.match(username):
        raise HTTPException(422, {"code": "bad_username"})
    email = body.email.lower()
    existing = db.scalars(select(User).where(User.email == email)).first()
    if existing and existing.verified_at:
        # Don't reveal the account exists; the owner can log in or reset.
        return {"ok": True}
    taken = db.scalars(select(User).where(User.username == username)).first()
    if taken and taken is not existing:
        raise HTTPException(409, {"code": "username_taken"})
    if existing:
        existing.username, existing.password_hash = username, hash_password(body.password)
    else:
        db.add(User(email=email, username=username, display_name=username,
                    password_hash=hash_password(body.password)))
    db.commit()
    otp.issue(db, email, "verify")
    return {"ok": True}


@router.post("/verify")
def verify(body: VerifyIn, db: Db, response: Response) -> dict:
    email = body.email.lower()
    if not otp.check(db, email, "verify", body.code):
        raise HTTPException(400, {"code": "bad_code"})
    user = db.scalars(select(User).where(User.email == email)).one()
    user.verified_at = user.verified_at or datetime.now(UTC)
    db.commit()
    _set_cookie(response, new_session(db, user))
    return me_out(user)


@router.post("/resend", status_code=202)
def resend(body: EmailIn, db: Db) -> dict:
    email = body.email.lower()
    user = db.scalars(select(User).where(User.email == email)).first()
    if user and not user.verified_at:
        otp.issue(db, email, "verify")
    return {"ok": True}


@router.post("/login")
def login(body: LoginIn, db: Db, request: Request, response: Response) -> dict:
    email = body.email.lower()
    hit(f"login:{email}:{request.client.host if request.client else '-'}", 10, 900)
    user = db.scalars(select(User).where(User.email == email)).first()
    if user is None or not verify_password(user.password_hash, body.password):
        raise HTTPException(401, {"code": "bad_credentials"})
    if not user.verified_at:
        raise HTTPException(403, {"code": "unverified"})
    _set_cookie(response, new_session(db, user))
    return me_out(user)


@router.post("/logout")
def logout(db: Db, response: Response, konomi_session: Annotated[str | None, Cookie()] = None) -> dict:
    end_session(db, konomi_session)
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@router.post("/reset/request", status_code=202)
def reset_request(body: EmailIn, db: Db) -> dict:
    email = body.email.lower()
    if db.scalars(select(User).where(User.email == email)).first():
        otp.issue(db, email, "reset")
    return {"ok": True}


@router.post("/reset/confirm")
def reset_confirm(body: ResetIn, db: Db, response: Response) -> dict:
    email = body.email.lower()
    if not otp.check(db, email, "reset", body.code):
        raise HTTPException(400, {"code": "bad_code"})
    user = db.scalars(select(User).where(User.email == email)).one()
    user.password_hash = hash_password(body.password)
    user.verified_at = user.verified_at or datetime.now(UTC)
    end_all_sessions(db, user)
    db.commit()
    _set_cookie(response, new_session(db, user))
    return me_out(user)


me_router = APIRouter(tags=["auth"])


@me_router.get("/api/me")
def me(user: CurrentUser) -> dict:
    return me_out(user)
