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
    password: str = Field(min_length=1, max_length=200)


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


def _ip(request: Request) -> str:
    # Behind a proxy, run uvicorn with --proxy-headers --forwarded-allow-ips=<proxy> so this is the client.
    return request.client.host if request.client else "-"


_DUMMY_HASH = hash_password("timing-equaliser-not-a-password")


def _issue_quietly(db, email: str, **pending) -> None:
    """Send a sign-up code, but inside the resend limits answer exactly like a fresh sign-up would:
    a 429 here would reveal that this email has a pending sign-up. The earlier code is still valid."""
    try:
        otp.issue(db, email, "verify", **pending)
    except HTTPException as e:
        if e.status_code != 429:
            raise


@router.post("/signup", status_code=202)
def signup(body: SignupIn, db: Db, request: Request) -> dict:
    username = body.username.strip().lower()
    if not USERNAME_RE.match(username):
        raise HTTPException(422, {"code": "bad_username"})
    email = body.email.lower()
    hit(f"signup:{_ip(request)}", 20, 3600)
    if db.scalars(select(User).where(User.email == email)).first():
        # Don't reveal the account exists; the owner can log in or reset.
        return {"ok": True}
    if db.scalars(select(User).where(User.username == username)).first():
        raise HTTPException(409, {"code": "username_taken"})
    # Nothing is created yet: the credentials ride on this code and become an account only at /verify.
    _issue_quietly(db, email, pending_hash=hash_password(body.password), pending_username=username)
    return {"ok": True}


@router.post("/verify")
def verify(body: VerifyIn, db: Db, request: Request, response: Response) -> dict:
    hit(f"verify:{_ip(request)}", 20, 900)
    email = body.email.lower()
    row = otp.check(db, email, "verify", body.code,
                    accept=lambda r: bool(r.pending_hash) and verify_password(r.pending_hash, body.password))
    if row is None:
        raise HTTPException(400, {"code": "bad_code"})
    if db.scalars(select(User).where(User.email == email)).first():
        raise HTTPException(400, {"code": "bad_code"})
    if db.scalars(select(User).where(User.username == row.pending_username)).first():
        raise HTTPException(409, {"code": "username_taken"})
    user = User(email=email, username=row.pending_username, display_name=row.pending_username,
                password_hash=row.pending_hash, verified_at=datetime.now(UTC))
    db.add(user)
    db.commit()
    _set_cookie(response, new_session(db, user))
    return me_out(user)


@router.post("/resend", status_code=202)
def resend(body: EmailIn, db: Db) -> dict:
    email = body.email.lower()
    pending = otp.latest_pending(db, email)
    if pending and not db.scalars(select(User).where(User.email == email)).first():
        _issue_quietly(db, email, pending_hash=pending.pending_hash, pending_username=pending.pending_username)
    return {"ok": True}


@router.post("/login")
def login(body: LoginIn, db: Db, request: Request, response: Response) -> dict:
    email = body.email.lower()
    hit(f"login:{email}:{_ip(request)}", 10, 900)
    user = db.scalars(select(User).where(User.email == email)).first()
    if user is None:
        pending = otp.latest_pending(db, email)
        if pending and verify_password(pending.pending_hash, body.password):
            raise HTTPException(403, {"code": "unverified"})
        verify_password(_DUMMY_HASH, body.password)  # same cost as a real check: no account-existence timing
        raise HTTPException(401, {"code": "bad_credentials"})
    if not verify_password(user.password_hash, body.password):
        raise HTTPException(401, {"code": "bad_credentials"})
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
def reset_confirm(body: ResetIn, db: Db, request: Request, response: Response) -> dict:
    hit(f"verify:{_ip(request)}", 20, 900)
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
