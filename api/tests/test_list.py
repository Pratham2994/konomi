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
