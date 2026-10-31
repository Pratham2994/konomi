import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import EmailOtp
from .mailer import otp_email, send_mail
from .ratelimit import hit
from .security import keyed_hash


def issue(db: Session, email: str, purpose: str) -> None:
    """Create a fresh code (invalidating older ones) and email it. Resend: >= 60 s apart, <= 5/hour."""
    email = email.lower()
    hit(f"otp-gap:{purpose}:{email}", 1, 60)
    hit(f"otp-hour:{purpose}:{email}", 5, 3600)
    now = datetime.now(UTC)
    db.execute(update(EmailOtp)
               .where(EmailOtp.email == email, EmailOtp.purpose == purpose, EmailOtp.consumed_at.is_(None))
               .values(consumed_at=now))
    code = f"{secrets.randbelow(1_000_000):06d}"
    db.add(EmailOtp(email=email, purpose=purpose, code_hash=keyed_hash(f"{purpose}:{email}:{code}"),
                    expires_at=now + timedelta(minutes=get_settings().otp_ttl_minutes)))
    db.commit()
    send_mail(email, *otp_email(code, purpose))


def check(db: Session, email: str, purpose: str, code: str) -> bool:
    """Consume the live code if it matches. Wrong guesses count; after max attempts the code is dead."""
    email = email.lower()
    row = db.scalars(
        select(EmailOtp)
        .where(EmailOtp.email == email, EmailOtp.purpose == purpose, EmailOtp.consumed_at.is_(None))
        .order_by(EmailOtp.id.desc()).limit(1).with_for_update()
    ).first()
    now = datetime.now(UTC)
    if row is None or row.expires_at < now or row.attempts >= get_settings().otp_max_attempts:
        db.rollback()
        return False
    if secrets.compare_digest(row.code_hash, keyed_hash(f"{purpose}:{email}:{code.strip()}")):
        row.consumed_at = now
        db.commit()
        return True
    row.attempts += 1
    db.commit()
    return False
