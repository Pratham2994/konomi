import smtplib
from email.message import EmailMessage

import httpx

from ..config import get_settings


RESERVED = ("example.com", "example.org", "example.net")
RESERVED_TLDS = (".test", ".example", ".invalid", ".localhost")


def is_reserved(address: str) -> bool:
    """RFC 2606 / 6761 domains can never receive mail: route them to the local test inbox, never to Resend."""
    domain = address.rsplit("@", 1)[-1].lower()
    return domain in RESERVED or domain.endswith(RESERVED_TLDS)


def send_mail(to: str, subject: str, html: str, text: str) -> None:
    s = get_settings()
    if s.resend_api_key and not is_reserved(to):
        r = httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {s.resend_api_key}"},
            json={"from": s.mail_from, "to": [to], "subject": subject, "html": html, "text": text},
            timeout=15,
        )
        r.raise_for_status()
        return
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = s.mail_from, to, subject
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")
    with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=10) as smtp:
        smtp.send_message(msg)


def otp_email(code: str, purpose: str) -> tuple[str, str, str]:
    """Return (subject, html, text) for an OTP mail."""
    if purpose == "verify":
        subject, lead = f"{code} is your Konomi code", "Welcome to Konomi. Enter this code to verify your email:"
    else:
        subject, lead = f"{code} is your Konomi reset code", "Enter this code to set a new password:"
    text = f"{lead}\n\n{code}\n\nIt expires in 10 minutes. If you didn't ask for this, ignore this email."
    html = (
        '<div style="font-family:system-ui,sans-serif;max-width:420px;margin:auto;padding:32px;color:#16141f">'
        '<p style="font-size:20px;font-weight:700;margin:0 0 16px">好み Konomi</p>'
        f'<p style="margin:0 0 20px">{lead}</p>'
        f'<p style="font-size:34px;letter-spacing:10px;font-weight:700;margin:0 0 20px">{code}</p>'
        '<p style="color:#6b6880;font-size:13px">It expires in 10 minutes. '
        "If you didn't ask for this, ignore this email.</p></div>"
    )
    return subject, html, text
