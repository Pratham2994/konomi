import gzip
import json
import threading
from collections import OrderedDict

from fastapi import APIRouter, HTTPException, Query, Request, Response
from sqlalchemy import select

from ..catalog.routes import brief
from ..deps import CurrentUser, Db
from ..models import Anime, ListEntry
from .engine import MIN_POSITIVES, get_engine
from .service import user_entries

router = APIRouter(prefix="/api/taste", tags=["taste"])
_galaxy: dict | None = None


def _engine():
    eng = get_engine()
    if eng is None:
        raise HTTPException(503, {"code": "model_not_ready"})
    return eng


def _briefs(db, ids: list[int]) -> dict[int, dict]:
    if not ids:
        return {}
    return {a.id: brief(a) for a in db.scalars(select(Anime).where(Anime.id.in_(ids)))}


# Model answers only change when someone's list (or the model) changes, but on the free server's small CPU they
# take seconds to compute. Keep recent answers, keyed by a fingerprint of the list: a repeat visit is instant.
_answers: OrderedDict = OrderedDict()
_answers_lock = threading.Lock()
ANSWERS_KEPT = 256


def _remembered(key: tuple, compute):
    with _answers_lock:
        if key in _answers:
            _answers.move_to_end(key)
            return _answers[key]
    value = compute()
    with _answers_lock:
        _answers[key] = value
        while len(_answers) > ANSWERS_KEPT:
            _answers.popitem(last=False)
    return value


def _fingerprint(entries) -> int:
    return hash(tuple(sorted((e.anime_id, e.status, e.tier, e.score) for e in entries)))


ERAS = {"new": (2020, 2100), "2010s": (2010, 2019), "2000s": (2000, 2009), "classic": (1900, 1999)}


@router.get("/recs")
def recs(user: CurrentUser, db: Db, type: str | None = None, era: str | None = None, gems: bool = False,
         k: int = Query(24, ge=1, le=60)) -> dict:
    eng = _engine()
    entries = user_entries(db, user.id)
    key = ("recs", user.id, eng.version, type, era, gems, k, _fingerprint(entries))
    return _remembered(key, lambda: _recs(eng, db, entries, type, era, gems, k))


def _recs(eng, db, entries, type, era, gems, k) -> dict:
    types = {type} if type in {"TV", "MOVIE", "ONA", "OVA"} else None
    items, mode = eng.recommend(entries, k=k, types=types, era=ERAS.get(era or ""), gems=gems)
    ids = [i["anime_id"] for i in items]
    b = _briefs(db, ids + [x for i in items for x in i["because"]])
    preds = eng.predict_many(entries, ids) if mode == "model" else {}
    return {"mode": mode, "need": max(0, MIN_POSITIVES - eng.positives(entries)),
            "items": [{"anime": b[i["anime_id"]], "predicted": preds.get(i["anime_id"]),
                       "because": [b[x] for x in i["because"] if x in b]} for i in items if i["anime_id"] in b]}


@router.get("/predict/{anime_id}")
def predict(anime_id: int, user: CurrentUser, db: Db) -> dict:
    return {"predicted": _engine().predict(user_entries(db, user.id), anime_id)}


@router.get("/dna")
def dna(user: CurrentUser, db: Db) -> dict:
    eng = _engine()
    entries = user_entries(db, user.id)
    return _remembered(("dna", user.id, eng.version, _fingerprint(entries)),
                       lambda: {"axes": eng.dna(entries), "need": max(0, MIN_POSITIVES - eng.positives(entries))})


@router.get("/galaxy")
def galaxy(request: Request) -> Response:
    global _galaxy
    eng = _engine()
    if _galaxy is None or _galaxy["version"] != eng.version:
        body = json.dumps({"points": eng.galaxy_points(), "clusters": eng.clusters_meta},
                          separators=(",", ":")).encode()
        _galaxy = {"version": eng.version, "gz": gzip.compress(body, 6)}
    etag = f'"g{_galaxy["version"]}"'
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag})
    return Response(_galaxy["gz"], media_type="application/json",
                    headers={"Content-Encoding": "gzip", "ETag": etag, "Cache-Control": "public, max-age=3600"})


@router.get("/me")
def me(user: CurrentUser, db: Db) -> dict:
    eng = _engine()
    entries = user_entries(db, user.id)
    items, mode = eng.recommend(entries, k=24)
    return {"mine": [{"id": e.anime_id, "status": e.status, "score": e.score} for e in entries],
            "centroid": eng.centroid(entries), "recs": [i["anime_id"] for i in items], "mode": mode}


@router.get("/network")
def network(user: CurrentUser, db: Db) -> dict:
    eng = _engine()
    entries = user_entries(db, user.id)
    items, _ = eng.recommend(entries, k=8)
    net = eng.network(entries, [i["anime_id"] for i in items])
    if net is None:
        return {"network": None, "need": max(0, MIN_POSITIVES - eng.positives(entries))}
    b = _briefs(db, [i["anime_id"] for i in net["inputs"]] + [o["anime_id"] for o in net["outputs"]])
    for part in ("inputs", "outputs"):
        for n in net[part]:
            n["anime"] = b.get(n.pop("anime_id"))
    return {"network": net, "need": 0}


@router.get("/track")
def track(user: CurrentUser, db: Db) -> dict:
    """How often Konomi's guess (made before the user answered) landed within 1 point."""
    rows = db.execute(select(ListEntry.predicted, ListEntry.score).where(
        ListEntry.user_id == user.id, ListEntry.predicted.is_not(None), ListEntry.score.is_not(None))).all()
    pairs = [(p, s) for p, s in rows]
    if not pairs:
        return {"n": 0, "within1": None, "mae": None}
    within = sum(1 for p, s in pairs if abs(p - s) <= 1.0) / len(pairs)
    mae = sum(abs(p - s) for p, s in pairs) / len(pairs)
    return {"n": len(pairs), "within1": round(within, 3), "mae": round(mae, 2)}
