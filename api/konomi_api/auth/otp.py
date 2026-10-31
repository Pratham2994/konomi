import secrets
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import EmailOtp
from . import mailer
from .ratelimit import hit, undo
from .security import keyed_hash

send_mail = mailer.send_mail  # module attribute so tests can swap the transport


def issue(db: Session, email: str, purpose: str, pending_hash: str | None = None,
          pending_username: str | None = None) -> None:
    """Create a fresh code (invalidating older ones) and email it. Resend: >= 60 s apart, <= 5/hour.
    If the mail can't be sent, nothing is kept and the resend limits are not charged."""
    email = email.lower()
    keys = (f"otp-gap:{purpose}:{email}", f"otp-hour:{purpose}:{email}")
    hit(keys[0], 1, 60)
    try:
        hit(keys[1], 5, 3600)
    except HTTPException:
        undo(keys[0])
        raise
    now = datetime.now(UTC)
    db.execute(update(EmailOtp)
               .where(EmailOtp.email == email, EmailOtp.purpose == purpose, EmailOtp.consumed_at.is_(None))
               .values(consumed_at=now))
    code = f"{secrets.randbelow(1_000_000):06d}"
    db.add(EmailOtp(email=email, purpose=purpose, code_hash=keyed_hash(f"{purpose}:{email}:{code}"),
                    expires_at=now + timedelta(minutes=get_settings().otp_ttl_minutes),
                    pending_hash=pending_hash, pending_username=pending_username))
    try:
        send_mail(email, *mailer.otp_email(code, purpose))
    except Exception:
        db.rollback()
        for k in keys:
            undo(k)
        raise HTTPException(503, {"code": "mail_failed"})
    db.commit()


def check(db: Session, email: str, purpose: str, code: str,
          accept: Callable[[EmailOtp], bool] = lambda row: True) -> EmailOtp | None:
    """Consume the live code if it matches and `accept(row)` agrees. Wrong guesses count; after max attempts
    the code is dead. A right code that `accept` rejects counts as a wrong guess and is not consumed."""
    email = email.lower()
    row = db.scalars(
        select(EmailOtp)
        .where(EmailOtp.email == email, EmailOtp.purpose == purpose, EmailOtp.consumed_at.is_(None))
        .order_by(EmailOtp.id.desc()).limit(1).with_for_update()
    ).first()
    now = datetime.now(UTC)
    if row is None or row.expires_at < now or row.attempts >= get_settings().otp_max_attempts:
        db.rollback()
        return None
    if secrets.compare_digest(row.code_hash, keyed_hash(f"{purpose}:{email}:{code.strip()}")) and accept(row):
        row.consumed_at = now
        db.commit()
        return row
    row.attempts += 1
    db.commit()
    return None


def latest_pending(db: Session, email: str) -> EmailOtp | None:
    """Most recent sign-up code for this email (consumed or not), to resend with the same credentials."""
    return db.scalars(select(EmailOtp).where(EmailOtp.email == email.lower(), EmailOtp.purpose == "verify",
                                             EmailOtp.pending_hash.is_not(None))
                      .order_by(EmailOtp.id.desc()).limit(1)).first()
