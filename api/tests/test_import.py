from sqlalchemy import text

from konomi_api.db import engine

from .conftest import signup_verified


def mal_ids(n):
    with engine.connect() as c:
        return list(c.execute(text("select mal_id from anime where mal_id is not null and type='TV' "
                                   "order by popularity desc limit :n"), {"n": n}).scalars())


def test_mal_xml_import(client):
    signup_verified(client)
    a, b, c = mal_ids(3)
    xml = f"""<?xml version="1.0"?><myanimelist>
      <anime><series_animedb_id>{a}</series_animedb_id><my_score>10</my_score><my_status>Completed</my_status></anime>
      <anime><series_animedb_id>{b}</series_animedb_id><my_score>0</my_score><my_status>Plan to Watch</my_status></anime>
      <anime><series_animedb_id>{c}</series_animedb_id><my_score>7</my_score><my_status>Dropped</my_status></anime>
      <anime><series_animedb_id>999999999</series_animedb_id><my_score>7</my_score><my_status>Completed</my_status></anime>
    </myanimelist>"""
    r = client.post("/api/import/mal", files={"file": ("animelist.xml", xml.encode(), "text/xml")})
    assert r.status_code == 200, r.text
    assert r.json() == {"added": 3, "skipped": 0, "unmatched": 1}
    statuses = sorted(e["status"] for e in client.get("/api/list").json()["entries"])
    assert statuses == ["completed", "dropped", "planned"]
    top = [e for e in client.get("/api/list").json()["entries"] if e["status"] == "completed"][0]
    assert top["tier"] == 5 and top["score"] == 9.5
    again = client.post("/api/import/mal", files={"file": ("animelist.xml", xml.encode(), "text/xml")}).json()
    assert again["added"] == 0 and again["skipped"] == 3


def test_rejects_non_mal_file(client):
    signup_verified(client)
    r = client.post("/api/import/mal", files={"file": ("x.xml", b"<html></html>", "text/xml")})
    assert r.status_code == 422
