from sqlalchemy import text

from konomi_api.db import engine

from .conftest import signup_verified


def some_anime_id() -> int:
    with engine.connect() as c:
        return c.execute(text("select id from anime order by popularity desc limit 1")).scalar_one()


def test_catalog_index_gzip_and_etag(client):
    r = client.get("/api/catalog/index")
    assert r.status_code == 200
    data = r.json()
    assert len(data["items"]) > 30000 and data["version"]
    r2 = client.get("/api/catalog/index", headers={"If-None-Match": r.headers["etag"]})
    assert r2.status_code == 304


def test_put_is_idempotent_and_listed(client):
    signup_verified(client)
    aid = some_anime_id()
    for _ in range(2):
        assert client.put(f"/api/list/{aid}", json={"status": "completed"}).status_code == 200
    entries = client.get("/api/list").json()["entries"]
    assert len(entries) == 1 and entries[0]["anime"]["id"] == aid
    client.put(f"/api/list/{aid}", json={"status": "dropped"})
    assert client.get("/api/list").json()["entries"][0]["status"] == "dropped"
    client.delete(f"/api/list/{aid}")
    assert client.get("/api/list").json()["entries"] == []


def test_list_requires_login(client):
    assert client.get("/api/list").status_code == 401


def test_bulk_move_remove_and_restore(client):
    signup_verified(client)
    from .test_rate_api import top_ids
    ids = top_ids(4)
    for aid in ids:
        client.post(f"/api/rate/{aid}/tier", json={"tier": 4})
    client.post("/api/rate/duel", json={"a": ids[0], "b": ids[1], "outcome": "a"})
    before = {e["anime_id"]: e for e in client.get("/api/list").json()["entries"]}

    r = client.post("/api/list/bulk", json={"action": "status", "ids": ids[2:], "status": "dropped"})
    assert r.json()["changed"] == 2
    after = {e["anime_id"]: e["status"] for e in client.get("/api/list").json()["entries"]}
    assert after[ids[2]] == after[ids[3]] == "dropped" and after[ids[0]] == "completed"

    assert client.post("/api/list/bulk", json={"action": "remove", "ids": ids[:2]}).json()["changed"] == 2
    left = {e["anime_id"] for e in client.get("/api/list").json()["entries"]}
    assert not left & set(ids[:2])

    # Undo: the same feelings come back, and the kept comparisons give back the same scores.
    restore = [{"anime_id": a, "status": before[a]["status"], "tier": before[a]["tier"], "between": before[a]["between"],
                "predicted": before[a]["predicted"]} for a in ids[:2]]
    assert client.post("/api/list/bulk", json={"action": "restore", "entries": restore}).json()["changed"] == 2
    back = {e["anime_id"]: e for e in client.get("/api/list").json()["entries"]}
    assert [back[a]["score"] for a in ids[:2]] == [before[a]["score"] for a in ids[:2]]


def test_bulk_ignores_titles_not_on_the_list(client):
    signup_verified(client)
    r = client.post("/api/list/bulk", json={"action": "status", "ids": [1, 2, 3], "status": "planned"})
    assert r.json()["changed"] == 0
