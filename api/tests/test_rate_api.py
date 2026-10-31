from sqlalchemy import text

from konomi_api.db import engine

from .conftest import signup_verified


def top_ids(n: int) -> list[int]:
    with engine.connect() as c:
        return list(c.execute(text("select id from anime where type='TV' order by popularity desc limit :n"),
                              {"n": n}).scalars())


def test_tier_then_insertion_duels_place_title(client):
    signup_verified(client)
    ids = top_ids(6)
    for aid in ids[:5]:
        r = client.post(f"/api/rate/{aid}/tier", json={"tier": 4})
        assert r.status_code == 200
    # newest title: duel until placed; always say it's better -> ends at the top of the band
    r = client.post(f"/api/rate/{ids[5]}/tier", json={"tier": 4}).json()
    n = 0
    while r.get("next_duel"):
        d = r["next_duel"]
        r = client.post("/api/rate/duel", json={"a": d["a"]["id"], "b": d["b"]["id"], "outcome": "a",
                                               "placing": ids[5]}).json()
        n += 1
    assert 1 <= n <= 6
    assert r["score"] == 8.9


def test_session_asks_untiered_first(client):
    signup_verified(client)
    aid = top_ids(1)[0]
    client.put(f"/api/list/{aid}", json={"status": "completed"})
    q = client.get("/api/rate/session/next").json()
    assert q["question"]["kind"] == "tier" and q["question"]["anime"]["id"] == aid and q["unrated"] == 1


def test_duel_requires_rated_titles(client):
    signup_verified(client)
    a, b = top_ids(2)
    assert client.post("/api/rate/duel", json={"a": a, "b": b, "outcome": "a"}).status_code == 422
