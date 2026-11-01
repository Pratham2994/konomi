import os
import re

# Tests truncate user tables, so they run against their own database (created + seeded once, see README).
os.environ.setdefault("KONOMI_DATABASE_URL", "postgresql+psycopg://konomi:konomi@localhost:5433/konomi_test")
os.environ["KONOMI_RESEND_API_KEY"] = ""  # tests read codes from Mailpit, never send real email

import httpx  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

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
    r = client.post("/api/auth/verify", json={"email": email, "code": last_code(email), "password": password})
    assert r.status_code == 200, r.text
    return r.json()
