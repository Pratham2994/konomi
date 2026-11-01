"""Build the Konomi catalog: AOD + Kaggle anime.csv + AniList cache -> data/build/catalog.parquet

Usage: python pipeline/catalog.py
"""
from __future__ import annotations

import html
import json
import re
from pathlib import Path

import polars as pl

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "aod.json"
ARCHIVE = ROOT / "archive"
CACHE = ROOT / "data" / "cache" / "anilist"
OUT = ROOT / "data" / "build" / "catalog.parquet"

MAL_RE = re.compile(r"myanimelist\.net/anime/(\d+)")
ANILIST_RE = re.compile(r"anilist\.co/anime/(\d+)")
SOURCE_NOTE_RE = re.compile(r"\s*[\(\[]\s*(Source|Written by)[^\)\]]*[\)\]]\s*$", re.I)
TAG_RE = re.compile(r"<[^>]+>")


def aod_key(mal_id: int | None, anilist_id: int | None, sources: list[str]) -> str:
    if mal_id is not None:
        return f"mal:{mal_id}"
    if anilist_id is not None:
        return f"anilist:{anilist_id}"
    return sources[0]


def clean_synopsis(text: str | None) -> str | None:
    if not text:
        return None
    text = html.unescape(TAG_RE.sub("", text.replace("<br>", "\n")))
    text = SOURCE_NOTE_RE.sub("", text.strip())
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if not text or text.lower().startswith("no synopsis"):
        return None
    return text


def pick_synopsis(kaggle: str | None, anilist: str | None) -> str | None:
    """Kaggle text is often mojibake-damaged ('�'); prefer AniList when that happens."""
    k, a = clean_synopsis(kaggle), clean_synopsis(anilist)
    if k and "�" in k and a:
        return a
    return (k.replace("�", "—") if k else None) or a


def load_anilist() -> dict[int, dict]:
    out: dict[int, dict] = {}
    for path in CACHE.glob("*.json"):
        for m in json.loads(path.read_text(encoding="utf-8")):
            out[m["id"]] = m
    return out


def load_kaggle() -> dict[int, dict]:
    anime = pl.read_csv(ARCHIVE / "anime.csv", infer_schema_length=0)
    syn = pl.read_csv(ARCHIVE / "anime_with_synopsis.csv", infer_schema_length=0)
    syn_map = dict(zip(syn["MAL_ID"].cast(pl.Int64).to_list(), syn["sypnopsis"].to_list()))
    out: dict[int, dict] = {}
    for row in anime.iter_rows(named=True):
        mal = int(row["MAL_ID"])
        members = row["Members"]
        out[mal] = {
            "name": row["Name"],
            "english": None if row["English name"] in (None, "Unknown") else row["English name"],
            "members": int(members) if members and members.isdigit() else 0,
            "rating": row["Rating"] or "",
            "genres": [g.strip() for g in (row["Genres"] or "").split(",") if g.strip() and g.strip() != "Unknown"],
            "synopsis": syn_map.get(mal),
        }
    return out


def is_adult(tags: list[str], al: dict | None, kg: dict | None) -> bool:
    if "hentai" in tags:
        return True
    if al and al.get("isAdult"):
        return True
    if kg and kg["rating"].startswith("Rx"):
        return True
    return False


FRESH = ROOT / "data" / "cache" / "anilist_seasons"
FORMAT = {"TV": "TV", "TV_SHORT": "TV", "MOVIE": "MOVIE", "OVA": "OVA", "ONA": "ONA", "SPECIAL": "SPECIAL",
          "MUSIC": "SPECIAL"}
STATUS = {"FINISHED": "FINISHED", "RELEASING": "ONGOING", "NOT_YET_RELEASED": "UPCOMING", "HIATUS": "ONGOING",
          "CANCELLED": "UNKNOWN"}


def merge_fresh_seasons(rows: list[dict], url_to_key: dict[str, str]) -> None:
    """Fold in AniList's live season lists (pipeline/anilist_seasons.py): refresh status / popularity / art for
    titles we have, and add titles announced after the anime-offline-database snapshot."""
    if not FRESH.exists():
        return
    by_al = {r["anilist_id"]: r for r in rows if r["anilist_id"] is not None}
    by_mal = {r["mal_id"]: r for r in rows if r["mal_id"] is not None}
    added = updated = 0
    for path in sorted(FRESH.glob("*.json")):
        for m in json.loads(path.read_text(encoding="utf-8")):
            if m.get("isAdult") or m.get("format") not in FORMAT:
                continue
            row = by_al.get(m["id"]) or (by_mal.get(m["idMal"]) if m.get("idMal") else None)
            cover = m.get("coverImage") or {}
            if row is not None:
                row["status"] = STATUS.get(m.get("status"), row["status"])
                row["popularity"] = max(row["popularity"], int(m.get("popularity") or 0))
                row["color"] = row["color"] or cover.get("color")
                updated += 1
                continue
            tags = [t["name"].lower() for t in (m.get("tags") or []) if (t.get("rank") or 0) >= 50]
            if "hentai" in tags:
                continue
            key = f"mal:{m['idMal']}" if m.get("idMal") else f"anilist:{m['id']}"
            url_to_key[f"https://anilist.co/anime/{m['id']}"] = key
            title = (m.get("title") or {}).get("romaji") or (m.get("title") or {}).get("english")
            row = {
                "aod_key": key, "mal_id": m.get("idMal"), "anilist_id": m["id"], "title": title,
                "title_en": (m.get("title") or {}).get("english"),
                "synonyms": [x for x in (m.get("synonyms") or []) if x][:8],
                "type": FORMAT[m["format"]], "episodes": m.get("episodes"),
                "status": STATUS.get(m.get("status"), "UNKNOWN"), "season": m.get("season"), "year": m.get("seasonYear"),
                "picture": cover.get("large"), "thumbnail": cover.get("medium"),
                "duration_s": (m["duration"] * 60) if m.get("duration") else None,
                "score": (m["averageScore"] / 10) if m.get("averageScore") else None,
                "studios": [n["name"].lower() for n in ((m.get("studios") or {}).get("nodes") or [])],
                "tags": tags, "genres": m.get("genres") or [], "synopsis": clean_synopsis(m.get("description")),
                "popularity": int(m.get("popularity") or 0), "color": cover.get("color"),
                "related_urls": [f"https://anilist.co/anime/{e['node']['id']}"
                                 for e in ((m.get("relations") or {}).get("edges") or [])
                                 if (e.get("node") or {}).get("type") == "ANIME"],
            }
            if row["title_en"] == row["title"]:
                row["title_en"] = None
            rows.append(row)
            by_al[m["id"]] = row
            added += 1
    print(f"fresh seasons: {updated} refreshed, {added} added")


def build() -> pl.DataFrame:
    data = json.loads(RAW.read_text(encoding="utf-8"))["data"]
    anilist = load_anilist()
    kaggle = load_kaggle()

    rows = []
    url_to_key: dict[str, str] = {}
    for e in data:
        sources = e.get("sources", [])
        mal = next((int(m.group(1)) for s in sources if (m := MAL_RE.search(s))), None)
        ali = next((int(m.group(1)) for s in sources if (m := ANILIST_RE.search(s))), None)
        key = aod_key(mal, ali, sources)
        for s in sources:
            url_to_key[s] = key
        al = anilist.get(ali) if ali is not None else None
        kg = kaggle.get(mal) if mal is not None else None
        tags = e.get("tags", [])
        if is_adult(tags, al, kg):
            continue
        season = e.get("animeSeason") or {}
        duration = e.get("duration") or {}
        score = e.get("score") or {}
        if al and al.get("popularity") is not None:
            popularity = int(al["popularity"])
        elif kg:
            popularity = int(kg["members"] * 0.4)
        else:
            popularity = 0
        title_en = (al or {}).get("title", {}).get("english") or (kg or {}).get("english")
        rows.append({
            "aod_key": key,
            "mal_id": mal,
            "anilist_id": ali,
            "title": e["title"],
            "title_en": title_en if title_en and title_en != e["title"] else None,
            "synonyms": e.get("synonyms", []),
            "type": e.get("type", "UNKNOWN"),
            "episodes": e.get("episodes") or None,
            "status": e.get("status", "UNKNOWN"),
            "season": None if season.get("season") in (None, "UNDEFINED") else season["season"],
            "year": season.get("year"),
            "picture": e.get("picture"),
            "thumbnail": e.get("thumbnail"),
            "duration_s": duration.get("value"),
            "score": score.get("arithmeticMean"),
            "studios": e.get("studios", []),
            "tags": tags,
            "genres": (al or {}).get("genres") or (kg or {}).get("genres") or [],
            "synopsis": pick_synopsis((kg or {}).get("synopsis"), (al or {}).get("description")),
            "popularity": popularity,
            "color": ((al or {}).get("coverImage") or {}).get("color"),
            "related_urls": e.get("relatedAnime", []),
        })

    merge_fresh_seasons(rows, url_to_key)

    keys = {r["aod_key"] for r in rows}
    for r in rows:
        rel = []
        for u in r.pop("related_urls"):
            k = url_to_key.get(u)
            if k and k in keys and k != r["aod_key"] and k not in rel:
                rel.append(k)
        r["related_keys"] = rel

    df = pl.DataFrame(rows, infer_schema_length=None)
    return df.unique(subset="aod_key", keep="first")


if __name__ == "__main__":
    df = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    df.write_parquet(OUT)
    print(df.shape)
    print(df.filter(pl.col("title").str.starts_with("Sousou no Frieren")).select(
        "aod_key", "title", "title_en", "year", "color", "popularity", pl.col("synopsis").str.slice(0, 60)))
    print("hentai rows:", df.filter(pl.col("tags").list.contains("hentai")).height)
    print("with synopsis:", df["synopsis"].is_not_null().sum(), "with color:", df["color"].is_not_null().sum())
