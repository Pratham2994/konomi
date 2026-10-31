from sqlalchemy import text

from konomi_api.db import engine

from .conftest import last_code, signup_verified

E, P = "a@x.dev", "password123"


def test_signup_verify_login(client):
    r = client.post("/api/auth/signup", json={"email": E, "username": "Aki_9", "password": P})
    assert r.status_code == 202
    assert client.get("/api/me").status_code == 401
    r = client.post("/api/auth/verify", json={"email": E, "code": last_code(E)})
    assert r.status_code == 200 and r.json()["username"] == "aki_9"
    assert client.get("/api/me").json()["email"] == E
    client.post("/api/auth/logout")
    assert client.get("/api/me").status_code == 401
    assert client.post("/api/auth/login", json={"email": E, "password": "wrong-pass"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": E, "password": P}).status_code == 200
    assert client.get("/api/me").status_code == 200


def test_wrong_code_five_times_locks(client):
    client.post("/api/auth/signup", json={"email": E, "username": "aki", "password": P})
    code = last_code(E)
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(5):
        assert client.post("/api/auth/verify", json={"email": E, "code": wrong}).status_code == 400
    assert client.post("/api/auth/verify", json={"email": E, "code": code}).status_code == 400


def test_expired_code_rejected(client):
    client.post("/api/auth/signup", json={"email": E, "username": "aki", "password": P})
    code = last_code(E)
    with engine.begin() as c:
        c.execute(text("update email_otps set expires_at = now() - interval '1 minute'"))
    assert client.post("/api/auth/verify", json={"email": E, "code": code}).status_code == 400


def test_resend_rate_limited(client):
    client.post("/api/auth/signup", json={"email": E, "username": "aki", "password": P})
    r = client.post("/api/auth/resend", json={"email": E})
    assert r.status_code == 429


def test_login_unverified_403(client):
    client.post("/api/auth/signup", json={"email": E, "username": "aki", "password": P})
    r = client.post("/api/auth/login", json={"email": E, "password": P})
    assert r.status_code == 403 and r.json()["detail"]["code"] == "unverified"


def test_reset_password(client):
    signup_verified(client)
    client.post("/api/auth/logout")
    assert client.post("/api/auth/reset/request", json={"email": E}).status_code == 202
    r = client.post("/api/auth/reset/confirm", json={"email": E, "code": last_code(E), "password": "newpass456"})
    assert r.status_code == 200
    client.post("/api/auth/logout")
    assert client.post("/api/auth/login", json={"email": E, "password": P}).status_code == 401
    assert client.post("/api/auth/login", json={"email": E, "password": "newpass456"}).status_code == 200


def test_signup_does_not_reveal_existing_account(client):
    signup_verified(client)
    r = client.post("/api/auth/signup", json={"email": E, "username": "other", "password": P})
    assert r.status_code == 202


def test_username_taken(client):
    signup_verified(client)
    r = client.post("/api/auth/signup", json={"email": "b@x.dev", "username": "aki", "password": P})
    assert r.status_code == 409
