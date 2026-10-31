"""rating_complete.csv -> data/build/ratings.parquet (u, i, r) + items_cf.parquet (i, aod_key, mal_id)

Keeps only catalog titles (adult already removed), items with >= 10 ratings and users with >= 5.
Usage: python pipeline/ratings.py
"""
from __future__ import annotations

from pathlib import Path

import polars as pl

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "data" / "build"
MIN_ITEM = 10
MIN_USER = 5


def build() -> tuple[pl.DataFrame, pl.DataFrame]:
    catalog = pl.read_parquet(BUILD / "catalog.parquet", columns=["aod_key", "mal_id"]).drop_nulls("mal_id")
    allowed = catalog["mal_id"].cast(pl.Int32)
    df = (
        pl.scan_csv(ROOT / "archive" / "rating_complete.csv",
                    schema={"user_id": pl.Int32, "anime_id": pl.Int32, "rating": pl.Int8})
        .filter(pl.col("anime_id").is_in(allowed.implode()) & (pl.col("rating") > 0))
        .collect()
    )
    # Iterate the two count filters until stable.
    while True:
        n = df.height
        item_ok = df.group_by("anime_id").len().filter(pl.col("len") >= MIN_ITEM)["anime_id"]
        df = df.filter(pl.col("anime_id").is_in(item_ok.implode()))
        user_ok = df.group_by("user_id").len().filter(pl.col("len") >= MIN_USER)["user_id"]
        df = df.filter(pl.col("user_id").is_in(user_ok.implode()))
        if df.height == n:
            break

    items = (
        df.select(pl.col("anime_id").unique().sort())
        .with_row_index("i")
        .join(catalog.with_columns(pl.col("mal_id").cast(pl.Int32)), left_on="anime_id", right_on="mal_id")
        .select(pl.col("i").cast(pl.Int32), "aod_key", pl.col("anime_id").alias("mal_id"))
        .sort("i")
    )
    users = df.select(pl.col("user_id").unique().sort()).with_row_index("u")
    ratings = (
        df.join(users, on="user_id")
        .join(items.select("i", "mal_id"), left_on="anime_id", right_on="mal_id")
        .select(pl.col("u").cast(pl.Int32), "i", pl.col("rating").alias("r"))
    )
    return ratings, items


if __name__ == "__main__":
    ratings, items = build()
    ratings.write_parquet(BUILD / "ratings.parquet")
    items.write_parquet(BUILD / "items_cf.parquet")
    print("ratings", ratings.height, "users", ratings["u"].n_unique(), "items", items.height)
