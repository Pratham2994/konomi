import pytest
from sqlalchemy import text

from konomi_api.db import engine
from konomi_api.taste.engine import UserEntry, get_engine

from .conftest import signup_verified

pytestmark = pytest.mark.skipif(get_engine() is None, reason="taste artifacts not built")


def ids(sql: str, n: int) -> list[int]:
    with engine.connect() as c:
        return list(c.execute(text(sql + " limit :n"), {"n": n}).scalars())


def cf_ids(n):
    return ids("select id from anime where has_cf and type='TV' order by popularity desc", n)


def test_empty_user_fallback(client):
    signup_verified(client)
    r = client.get("/api/taste/recs").json()
    assert r["mode"] == "popular" and len(r["items"]) > 0 and r["need"] == 3
    assert client.get(f"/api/taste/predict/{cf_ids(1)[0]}").json()["predicted"] is None
    assert client.get("/api/taste/dna").json()["axes"] is None
    # two rated titles is still not enough — never NaN, never 500
    for a in cf_ids(2):
        client.post(f"/api/rate/{a}/tier", json={"tier": 5})
    assert client.get("/api/taste/recs").json()["mode"] == "popular"


def test_non_cf_title_contributes():
    eng = get_engine()
    non_cf = ids("select id from anime where not has_cf and type='TV' and popularity > 1000 order by popularity desc", 1)[0]
    x = eng.input_vector([UserEntry(non_cf, "completed", 5, None)])
    assert (x > 0).sum() >= 1
    entries = [UserEntry(a, "completed", 5, 9.5) for a in cf_ids(4)]
    p = eng.predict(entries, non_cf)
    assert p is not None and 1.0 <= p <= 10.0


def test_recs_exclude_listed_and_predict_in_range(client):
    signup_verified(client)
    mine = cf_ids(6)
    for i, a in enumerate(mine):
        client.post(f"/api/rate/{a}/tier", json={"tier": 5 if i < 3 else 4})
    r = client.get("/api/taste/recs").json()
    assert r["mode"] == "model"
    got = [it["anime"]["id"] for it in r["items"]]
    assert not set(got) & set(mine)
    assert all(it["predicted"] is None or 1 <= it["predicted"] <= 10 for it in r["items"])
    assert any(it["because"] for it in r["items"])
    dna = client.get("/api/taste/dna").json()["axes"]
    assert len(dna) == 6 and all(-1 <= a["value"] <= 1 for a in dna)
