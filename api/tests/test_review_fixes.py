"""Regression tests for the whole-branch review findings."""
import gzip

from fastapi.testclient import TestClient

from konomi_api.auth import mailer, ratelimit
from konomi_api.main import app
from konomi_api.taste.engine import UserEntry, entry_weight

from .conftest import last_code, signup_verified

E = "victim@x.dev"


def test_resignup_cannot_hijack_unverified_account(client):
    client.post("/api/auth/signup", json={"email": E, "username": "victim", "password": "victim-pass-1"})
    ratelimit.reset()  # as if the attacker waited out the 60 s resend gap
    attacker = TestClient(app)
    attacker.post("/api/auth/signup", json={"email": E, "username": "evil", "password": "attacker-pass"})
    # The victim types the newest code from their inbox together with their own password.
    r = client.post("/api/auth/verify", json={"email": E, "code": last_code(E), "password": "victim-pass-1"})
    assert r.status_code == 400  # newest code belongs to the attacker's signup -> refused for the victim's password
    ratelimit.reset()
    client.post("/api/auth/signup", json={"email": E, "username": "victim", "password": "victim-pass-1"})
    r = client.post("/api/auth/verify", json={"email": E, "code": last_code(E), "password": "victim-pass-1"})
    assert r.status_code == 200 and r.json()["username"] == "victim"
    fresh = TestClient(app)
    assert fresh.post("/api/auth/login", json={"email": E, "password": "attacker-pass"}).status_code in (401, 403)


def test_verify_requires_signup_password(client):
    client.post("/api/auth/signup", json={"email": E, "username": "victim", "password": "victim-pass-1"})
    code = last_code(E)
    assert client.post("/api/auth/verify", json={"email": E, "code": code, "password": "wrong-pass"}).status_code == 400
    r = client.post("/api/auth/verify", json={"email": E, "code": code, "password": "victim-pass-1"})
    assert r.status_code == 200 and r.json()["username"] == "victim"


def test_hidden_sections_not_sent_to_visitors(client):
    signup_verified(client)
    from sqlalchemy import text

    from konomi_api.db import engine
    with engine.connect() as c:
        aid = c.execute(text("select id from anime where type='TV' order by popularity desc limit 1")).scalar_one()
    client.post(f"/api/rate/{aid}/tier", json={"tier": 5})
    assert TestClient(app).get("/api/u/aki").status_code == 404  # still private here
    client.patch("/api/profile", json={"is_public": True, "sections": [
        {"id": "chart", "visible": False}, {"id": "dna", "visible": False}, {"id": "hot_takes", "visible": False},
        {"id": "years", "visible": False}, {"id": "favourites", "visible": False}]})
    anon = TestClient(app).get("/api/u/aki").json()
    assert anon["entries"] == [] and anon["dna"] is None and anon["hot_takes"] == []
    assert anon["years"] == [] and anon["favourites"] == []
    assert "entries" in client.get("/api/u/aki").json()  # owner still gets everything


def test_gzip_bomb_rejected(client):
    signup_verified(client)
    bomb = gzip.compress(b"<" * (60 * 1024 * 1024))
    r = client.post("/api/import/mal", files={"file": ("list.xml.gz", bomb, "application/gzip")})
    assert r.status_code == 413


def test_dropped_titles_are_not_taste_positives():
    assert entry_weight(UserEntry(1, "dropped", 5, 9.5)) == 0
    assert entry_weight(UserEntry(1, "planned", None, None)) == 0
    assert entry_weight(UserEntry(1, "completed", 5, 9.5)) == 1.0


def test_verify_rate_limited_per_ip(client):
    codes = [client.post("/api/auth/verify", json={"email": f"n{i}@x.dev", "code": "123456", "password": "x" * 8}).status_code
             for i in range(25)]
    assert 429 in codes


def test_mail_failure_does_not_block_resend(client, monkeypatch):
    def boom(*a, **k):
        raise OSError("smtp down")
    monkeypatch.setattr(mailer, "send_mail", boom)
    monkeypatch.setattr("konomi_api.auth.otp.send_mail", boom)
    r = client.post("/api/auth/signup", json={"email": E, "username": "victim", "password": "victim-pass-1"})
    assert r.status_code == 503
    monkeypatch.undo()
    r = client.post("/api/auth/signup", json={"email": E, "username": "victim", "password": "victim-pass-1"})
    assert r.status_code == 202  # not 429: the failed attempt didn't use up the resend gap
    assert last_code(E)


def test_negative_limits_rejected(client):
    assert client.get("/api/sweep?year=2020&season=FALL&limit=-1").status_code == 422


def test_og_fetcher_refuses_unknown_hosts():
    from konomi_api.profile.og import fetch_image
    assert fetch_image("http://169.254.169.254/latest/meta-data") is None
    assert fetch_image("http://localhost:8000/api/me") is None
