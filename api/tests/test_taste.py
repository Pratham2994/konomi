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


def test_recent_titles_surface_in_recommendations():
    # Titles after 2020 have no ratings and are placed by the content bridge; they must still compete.
    eng = get_engine()
    entries = [UserEntry(a, "completed", 5, 9.5) for a in cf_ids(12)]
    recs, mode = eng.recommend(entries, k=40)
    assert mode == "model"
    recent = [r for r in recs if not eng.has_cf[eng.row_of[r["anime_id"]]]]
    assert len(recent) >= 4, f"only {len(recent)} post-2020 titles in the top 40"


def test_recs_start_franchises_at_first_unwatched_entry():
    eng = get_engine()
    entries = [UserEntry(a, "completed", 5, 9.5) for a in cf_ids(12)]
    listed = {e.anime_id for e in entries}
    recs, _ = eng.recommend(entries, k=40)
    ids = [r["anime_id"] for r in recs]
    with engine.connect() as c:
        rows = dict(c.execute(text("select id, related from anime where id = any(:ids)"), {"ids": ids}).all())
        years = dict(c.execute(text("select id, year from anime where type = 'TV'")).all())
    for a in ids:
        if a not in years:
            continue  # only TV seasons have a watch order
        earlier_unseen = [r for r in (rows[a] or []) if r in years and years[r] and years.get(a)
                          and years[r] < years[a] and r not in listed
                          and eng.series_key(r) == eng.series_key(a)]  # same series, not a shared-universe spin-off
        assert not earlier_unseen, f"{a} recommended before its earlier entry {earlier_unseen}"
    roots = [eng.franchise_root(a, listed) for a in ids]
    assert len(roots) == len(set(roots)), "two picks from one franchise"


def test_recs_skip_unaired_and_stay_in_series():
    eng = get_engine()
    entries = [UserEntry(a, "completed", 5, 9.5) for a in cf_ids(12)]
    listed = {e.anime_id for e in entries}
    recs, _ = eng.recommend(entries, k=40)
    ids = [r["anime_id"] for r in recs]
    with engine.connect() as c:
        status = dict(c.execute(text("select id, status from anime where id = any(:ids)"), {"ids": ids}).all())
    assert not [a for a in ids if status[a] == "UPCOMING"], "recommended an anime that hasn't aired"
    for a in ids:
        root = eng.franchise_root(a, listed)
        assert eng.series_key(root) == eng.series_key(a), f"{a} jumped to another series {root}"


def test_remake_not_replaced_by_decades_old_original():
    eng = get_engine()
    with engine.connect() as c:
        new = c.execute(text("select id from anime where title = 'Dororo' and year = 2019 and type = 'TV'")).scalar()
    assert new is not None
    assert eng.franchise_root(new, set()) == new


def test_long_gap_sequel_still_starts_at_original():
    eng = get_engine()
    with engine.connect() as c:
        tybw = c.execute(text("select id from anime where title = 'Bleach: Sennen Kessen-hen' and type = 'TV'")).scalar()
        bleach = c.execute(text("select id from anime where title = 'Bleach' and type = 'TV' and year = 2004")).scalar()
    assert eng.franchise_root(tybw, set()) == bleach


def test_aired_uses_the_calendar_not_a_stale_status():
    from datetime import date

    from konomi_api.taste.engine import has_aired
    today = date(2026, 11, 1)
    assert has_aired(2026, "FALL", "UPCOMING", today)       # stale July label, but Fall 2026 started in October
    assert has_aired(2026, "SUMMER", "UPCOMING", today)
    assert not has_aired(2027, "WINTER", "UPCOMING", today)
    assert not has_aired(2027, None, "UPCOMING", today)
    assert has_aired(2019, "SPRING", "FINISHED", today)


def test_era_filter_still_one_pick_per_series():
    eng = get_engine()
    entries = [UserEntry(a, "completed", 5, 9.5) for a in cf_ids(12)]
    listed = {e.anime_id for e in entries}
    recs, _ = eng.recommend(entries, k=30, era=(2020, 2100))
    roots = [eng.franchise_root(r["anime_id"], listed) for r in recs]
    assert len(roots) == len(set(roots))


def test_recs_are_cached_until_the_list_changes(client, monkeypatch):
    # The free server's CPU makes a fresh computation take seconds: repeat visits must not pay it again.
    signup_verified(client)
    eng = get_engine()
    calls = []
    real = eng.recommend
    monkeypatch.setattr(eng, "recommend", lambda *a, **kw: calls.append(1) or real(*a, **kw))
    first = client.get("/api/taste/recs").json()
    assert client.get("/api/taste/recs").json() == first and len(calls) == 1
    aid = first["items"][0]["anime"]["id"]
    client.put(f"/api/list/{aid}", json={"status": "completed"})
    client.get("/api/taste/recs")
    assert len(calls) == 2  # a changed list means fresh recommendations


def test_galaxy_clusters_have_plain_names_and_examples(client):
    meta = client.get("/api/taste/galaxy").json()["clusters"]
    assert meta and all(c["name"] and isinstance(c["examples"], list) for c in meta)
    assert any(len(c["examples"]) == 2 for c in meta)


def test_unnamed_model_falls_back_to_a_true_label():
    from konomi_api.taste.cluster_names import name_for
    assert name_for("some-other-version", 3, ["Death Note", "Naruto"]) == "Near Death Note"
    assert name_for("some-other-version", 3, []) == "Unnamed corner"


def test_dna_sliders_have_plain_names(client):
    signup_verified(client)
    for aid in cf_ids(8):
        client.post(f"/api/rate/{aid}/tier", json={"tier": 5})
    axes = client.get("/api/taste/dna").json()["axes"]
    assert axes and all(len(a["neg"]) == 1 and len(a["pos"]) == 1 for a in axes)
    assert "Gore" not in str(axes) and "Avant garde" not in str(axes)
    r = client.get("/api/taste/galaxy")
    assert r.headers["cache-control"] == "no-cache"  # always revalidated: renamed areas show up at once
