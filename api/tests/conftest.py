import re

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from konomi_api.auth import ratelimit
from konomi_api.db import engine
from konomi_api.main import app

MAILPIT = "http://localhost:8025/api/v1"


@pytest.fixture(autouse=True)
def clean():
    with engine.begin() as c:
        c.execute(text("truncate users, sessions, email_otps, list_entries, duels cascade"))
    httpx.delete(f"{MAILPIT}/messages")
    ratelimit.reset()
    yield


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def last_code(email: str) -> str:
    msgs = httpx.get(f"{MAILPIT}/search", params={"query": f"to:{email}"}).json()["messages"]
    assert msgs, f"no mail for {email}"
    body = httpx.get(f"{MAILPIT}/message/{msgs[0]['ID']}").json()["Text"]
    return re.search(r"\b(\d{6})\b", body).group(1)


def signup_verified(client: TestClient, email="a@x.dev", username="aki", password="password123") -> dict:
    client.post("/api/auth/signup", json={"email": email, "username": username, "password": password})
    r = client.post("/api/auth/verify", json={"email": email, "code": last_code(email)})
    assert r.status_code == 200, r.text
    return r.json()
