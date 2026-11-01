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
    # It beat every title it met, so it ends above all of them (soft bands: it may even reach past the band top).
    others = [e["score"] for e in client.get("/api/list").json()["entries"] if e["anime_id"] in ids[:5]]
    assert r["score"] > max(others) and r["score"] >= 8.45


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


def test_facets_answered_one_at_a_time_are_all_kept(client):
    signup_verified(client)
    aid = top_ids(1)[0]
    client.post(f"/api/rate/{aid}/tier", json={"tier": 4})
    client.post(f"/api/rate/{aid}/facets", json={"facets": {"rewatch": "Yes"}})
    r = client.post(f"/api/rate/{aid}/facets", json={"facets": {"still_think": "Often"}})
    assert r.json()["facets"] == {"rewatch": "Yes", "still_think": "Often"}



def test_in_between_feeling_starts_on_the_edge(client):
    signup_verified(client)
    aid = top_ids(1)[0]
    r = client.post(f"/api/rate/{aid}/tier", json={"tier": 4, "between": True}).json()
    assert 7.8 <= r["score"] <= 8.1


def test_answer_can_carry_the_next_question(client):
    # One round trip per answer on the Rate page: the reply already holds the next question.
    signup_verified(client)
    ids = top_ids(3)
    for aid in ids:
        client.post(f"/api/rate/{aid}/tier", json={"tier": 4})
    r = client.post("/api/rate/duel?next=1", json={"a": ids[0], "b": ids[1], "outcome": "a"}).json()
    assert "session" in r and set(r["session"]) == {"question", "unrated"}
    assert r["session"] == client.get("/api/rate/session/next").json()
    t = client.post(f"/api/rate/{ids[2]}/tier?next=1", json={"tier": 3}).json()
    assert "session" in t


def test_explain_breaks_a_score_down(client):
    signup_verified(client)
    ids = top_ids(3)
    for aid in ids:
        client.post(f"/api/rate/{aid}/tier", json={"tier": 4})
    client.post("/api/rate/duel", json={"a": ids[0], "b": ids[1], "outcome": "a"})
    client.post("/api/rate/duel", json={"a": ids[0], "b": ids[2], "outcome": "tie"})
    x = client.get(f"/api/rate/{ids[0]}/explain").json()
    assert x["tier"] == 4 and x["between"] is False
    assert (x["wins"], x["losses"], x["ties"]) == (1, 0, 1)
    assert 8.0 <= x["start"] <= 8.9 and x["score"] > x["start"] - 0.05
    assert client.get(f"/api/rate/{top_ids(4)[3]}/explain").status_code == 404  # not rated


def test_feeling_questions_come_with_the_next_titles(client):
    signup_verified(client)
    ids = top_ids(5)
    for a in ids:
        client.put(f"/api/list/{a}", json={"status": "completed"})
    s = client.get("/api/rate/session/next").json()
    assert s["question"]["kind"] == "tier"
    assert [x["id"] for x in s["queue"]] == [i for i in ids if i != s["question"]["anime"]["id"]][:4]


def test_start_over_clears_ratings_and_keeps_titles(client):
    signup_verified(client)
    a, b, c = top_ids(3)
    client.put(f"/api/list/{c}", json={"status": "watching"})
    for aid in (a, b):
        client.post(f"/api/rate/{aid}/tier", json={"tier": 4})
    client.post(f"/api/rate/{a}/facets", json={"facets": {"rewatch": "Yes"}})
    client.post("/api/rate/duel", json={"a": a, "b": b, "outcome": "a"})
    assert client.post("/api/rate/reset").json() == {"cleared": 2, "comparisons": 1}
    entries = {e["anime_id"]: e for e in client.get("/api/list").json()["entries"]}
    assert set(entries) == {a, b, c} and entries[c]["status"] == "watching"
    assert all(e["tier"] is None and e["score"] is None and e["predicted"] is None and not e["facets"] for e in entries.values())
    # Rated again, a title starts from its feeling alone: the old comparison is gone.
    client.post(f"/api/rate/{a}/tier", json={"tier": 4})
    assert client.get("/api/rate/session/next").json()["unrated"] == 1


def test_back_takes_answers_back(client):
    signup_verified(client)
    a, b = top_ids(2)
    for aid in (a, b):
        client.post(f"/api/rate/{aid}/tier", json={"tier": 4})
    duel = client.post("/api/rate/duel", json={"a": a, "b": b, "outcome": "a"}).json()
    moved = {e["anime_id"]: e["score"] for e in client.get("/api/list").json()["entries"]}
    assert moved[a] > moved[b]
    assert client.delete(f"/api/rate/duel/{duel['id']}").status_code == 200
    back = {e["anime_id"]: e["score"] for e in client.get("/api/list").json()["entries"]}
    assert back[a] == back[b]  # same feeling, no comparison left between them
    client.post(f"/api/rate/{b}/facets", json={"facets": {"rewatch": "Yes"}})
    client.delete(f"/api/rate/{b}/facets")
    client.delete(f"/api/rate/{b}/tier")
    e = {e["anime_id"]: e for e in client.get("/api/list").json()["entries"]}[b]
    assert e["tier"] is None and e["score"] is None and e["facets"] == {} and e["status"] == "completed"
    assert client.get("/api/rate/session/next").json()["question"]["anime"]["id"] == b


def test_same_score_titles_keep_one_order_everywhere(client):
    signup_verified(client)
    a, b, c = top_ids(3)
    for aid in (a, b, c):
        client.post(f"/api/rate/{aid}/tier", json={"tier": 5})
    for _ in range(3):  # a beats b beats c, again and again: all three end at the 10 cap
        client.post("/api/rate/duel", json={"a": a, "b": b, "outcome": "a"})
        client.post("/api/rate/duel", json={"a": b, "b": c, "outcome": "a"})
    mine = {e["anime_id"]: e for e in client.get("/api/list").json()["entries"]}
    assert mine[a]["strength"] > mine[b]["strength"] > mine[c]["strength"]
    username = client.get("/api/me").json()["username"]
    shown = {e["anime"]["id"]: e["strength"] for e in client.get(f"/api/u/{username}").json()["entries"]}
    assert all(shown[i] == mine[i]["strength"] for i in (a, b, c))
    # Titles scored before strengths existed get theirs on the next read.
    with engine.begin() as conn:
        conn.execute(text("update list_entries set strength = null"))
    again = {e["anime_id"]: e["strength"] for e in client.get("/api/list").json()["entries"]}
    assert again[a] > again[b] > again[c]
