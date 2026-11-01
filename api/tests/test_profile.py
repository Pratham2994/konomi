from fastapi.testclient import TestClient

from konomi_api.main import app

from .conftest import signup_verified


def test_private_profile_404_for_anon(client):
    signup_verified(client)
    anon = TestClient(app)
    r = anon.get("/api/u/aki")
    assert r.status_code == 404
    assert "favourites" not in r.text and "entries" not in r.text
    assert client.get("/api/u/aki").status_code == 200  # the owner still sees it


def test_private_og_404(client):
    signup_verified(client)
    assert client.get("/og/u/aki.png").status_code == 404  # even for the owner: share images are public-only


def test_private_match_404(client):
    signup_verified(client)
    client.post("/api/auth/logout")
    signup_verified(client, email="b@x.dev", username="bea")
    assert client.get("/api/u/aki/match").status_code == 404


def test_public_profile_visible(client):
    signup_verified(client)
    r = client.patch("/api/profile", json={"is_public": True, "bio": "hi", "accent": "spring"})
    assert r.status_code == 200 and r.json()["is_public"] is True
    anon = TestClient(app)
    p = anon.get("/api/u/aki").json()
    assert p["user"]["bio"] == "hi" and p["is_owner"] is False
    assert anon.get("/og/u/aki.png").headers["content-type"] == "image/png"


def test_favourites_only_from_own_list(client):
    signup_verified(client)
    r = client.patch("/api/profile", json={"favourites": [1, 2, 3]})
    assert r.json()["favourites"] == []


def test_profile_options_and_public_stripping(client):
    signup_verified(client)
    r = client.patch("/api/profile", json={
        "is_public": True, "pronouns": "she/her", "links": ["myanimelist.net/profile/aki"], "header": "poster",
        "scores": "off", "stats_hidden": ["hours", "track"], "chart_lists": ["completed"], "accent": "matcha"})
    s = r.json()
    assert r.status_code == 200 and s["links"] == ["https://myanimelist.net/profile/aki"] and s["header"] == "poster"
    assert {x["id"] for x in s["sections"]} >= {"hill", "watching", "drops"}
    assert client.patch("/api/profile", json={"header": "neon"}).status_code == 422
    assert client.patch("/api/profile", json={"links": ["javascript:alert(1)"]}).status_code == 422
    assert client.patch("/api/profile", json={"hill": {"anime_id": 1, "text": "x"}}).json()["hill"] is None  # not on list
    p = TestClient(app).get("/api/u/aki").json()
    assert p["stats"]["hours"] is None and p["track"] is None and p["look"]["scores"] == "off"
    assert p["user"]["pronouns"] == "she/her" and p["hot_takes"] == []
    assert TestClient(app).get("/og/u/aki.png").status_code == 200
