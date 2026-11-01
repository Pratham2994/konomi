"""Load the catalog (and taste artifacts when present) into the local DB, plus a demo user.

Usage: python seed.py [--no-demo]
"""
from __future__ import annotations

import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import polars as pl
from sqlalchemy import select, text

from konomi_api.auth.security import hash_password
from konomi_api.config import ROOT, get_settings
from konomi_api.db import SessionLocal, engine
from konomi_api.models import User

CATALOG = ROOT / "data" / "build" / "catalog.parquet"
COLS = ["related", "aod_key", "mal_id", "anilist_id", "title", "title_en", "synonyms", "type", "episodes", "status",
        "season", "year", "picture", "thumbnail", "duration_s", "score", "studios", "tags", "genres",
        "synopsis", "popularity", "color"]


def seed_catalog() -> None:
    df = pl.read_parquet(CATALOG)
    rows = df.with_columns(related=pl.lit([], dtype=pl.List(pl.Int32))).select(COLS).to_dicts()
    cols = ", ".join(COLS)
    params = ", ".join(f":{c}" for c in COLS)
    updates = ", ".join(f"{c} = excluded.{c}" for c in COLS if c not in ("aod_key", "related"))
    with engine.begin() as c:
        c.execute(text(f"insert into anime ({cols}) values ({params}) "
                       f"on conflict (aod_key) do update set {updates}"), rows)
        # Titles that left the catalog (e.g. newly flagged adult) are removed, list entries included.
        gone = c.execute(text("delete from anime where not (aod_key = any(:keys))"),
                         {"keys": df["aod_key"].to_list()}).rowcount
        if gone:
            print(f"removed {gone} titles no longer in the catalog")
        ids = dict(c.execute(text("select aod_key, id from anime")).all())
        rel = [{"id": ids[r["aod_key"]], "rel": [ids[k] for k in r["related_keys"] if k in ids]}
               for r in df.select("aod_key", "related_keys").to_dicts()]
        c.execute(text("update anime set related = :rel where id = :id"), rel)
    print(f"catalog: {len(rows)} rows")


def seed_artifacts() -> None:
    items_path = get_settings().artifacts_dir / "items.parquet"
    if not items_path.exists():
        print("artifacts: none yet")
        return
    items = pl.read_parquet(items_path)
    rows = [{"k": r["aod_key"], "e": "[" + ",".join(f"{v:.5f}" for v in np.asarray(r["emb"], dtype=np.float32)) + "]",
             "x": r["x"], "y": r["y"], "z": r["z"], "cl": r["cluster"], "cf": r["has_cf"]}
            for r in items.to_dicts()]
    with engine.begin() as c:
        c.execute(text("update anime set embedding = cast(:e as halfvec), x = :x, y = :y, z = :z, "
                       "cluster = :cl, has_cf = :cf where aod_key = :k"), rows)
    print(f"artifacts: {len(rows)} embeddings")


def seed_demo() -> None:
    cfg = json.loads((Path(__file__).parent / "seed_users.example.json").read_text())
    with SessionLocal() as db:
        for u in cfg:
            if db.scalars(select(User).where(User.email == u["email"])).first():
                continue
            db.add(User(email=u["email"], username=u["username"], display_name=u["display_name"],
                        password_hash=hash_password(u["password"]), verified_at=datetime.now(UTC),
                        is_public=True))
        db.commit()
    print("demo users ok")


if __name__ == "__main__":
    seed_catalog()
    seed_artifacts()
    if "--no-demo" not in sys.argv:
        seed_demo()
