import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from sqlalchemy import delete
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import Session_, User

_hasher = PasswordHasher()
COOKIE = "konomi_session"


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(hash_: str, password: str) -> bool:
    try:
        return _hasher.verify(hash_, password)
    except (VerificationError, InvalidHashError):
        return False


def keyed_hash(value: str) -> str:
    """HMAC for OTP codes and session tokens (fast, secret-keyed; codes are short-lived)."""
    return hmac.new(get_settings().secret.encode(), value.encode(), hashlib.sha256).hexdigest()


def new_session(db: Session, user: User) -> str:
    token = secrets.token_urlsafe(32)
    expires = datetime.now(UTC) + timedelta(days=get_settings().session_days)
    db.add(Session_(token_hash=keyed_hash(token), user_id=user.id, expires_at=expires))
    db.commit()
    return token


def user_for_token(db: Session, token: str | None) -> User | None:
    if not token:
        return None
    row = db.get(Session_, keyed_hash(token))
    if row is None or row.expires_at < datetime.now(UTC):
        return None
    return db.get(User, row.user_id)


def end_session(db: Session, token: str | None) -> None:
    if token:
        db.execute(delete(Session_).where(Session_.token_hash == keyed_hash(token)))
        db.commit()


def end_all_sessions(db: Session, user: User) -> None:
    db.execute(delete(Session_).where(Session_.user_id == user.id))
