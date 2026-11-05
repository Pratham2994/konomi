"""A few lines on what happens in a title, so seasons of one show can be told apart while rating.

The most popular titles have a summary written for them (summaries.json, keyed by AniList and MAL id so it survives a
catalogue rebuild). Every other title gets the start of its own synopsis, in order: a sequel's starts where its own
story does, after the sentences that retell its earlier seasons. No synopsis, no line."""
from __future__ import annotations

import json
import math
import re
from collections import Counter
from functools import cache
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Anime

# About three lines on the rating card; "More" shows the whole synopsis.
MAX = 300
_NOISE = re.compile(r"\((source|written by)[^)]*\)|\[[^\]]*\]|^\s*(note|notes)\s*:.*$", re.I | re.M)
_SPLIT = re.compile(r"(?<=[.!?])[\"”’)]?\s+(?=[\"“‘(]?[A-Z])")
# Openers that talk about the show instead of what happens in it: never shown.
_META = re.compile(r"^(the (second|third|fourth|fifth|final|last) (season|part|cour)|season \w+ of|sequel to|adaptation of"
                   r"|based on|this is|the anime|and (so|thus) begins|the (first|second|third|final) episode)", re.I)
# Openers that retell the premise: the setup of a first season, a recap in a later one.
_PREMISE = re.compile(r"^(for (centuries|years|decades|generations)|centuries ago|years ago|long ago|once upon|in a world)",
                      re.I)
# Notes after the story: runtimes, sources, broadcast details.
_NOTE = re.compile(r"^\s*([•*(\[]|notes?\s*:|source\s*:)", re.I)
_STOP = set("""about after again against also among another back been before being between both cannot could does
doing down during each even ever every from further have having here into just like made make many more most much
must never only other over same should since some still such than that their them then there these they this those
through till under until very want were what when where which while whom whose will with within without would your
yours itself himself herself themselves however finally soon once now new""".split())

_cache: dict[int, str | None] = {}


@cache
def written() -> dict[str, str]:
    """'a<anilist id>' or 'm<mal id>' -> its written summary."""
    rows = json.loads((Path(__file__).with_name("summaries.json")).read_text(encoding="utf-8"))
    out: dict[str, str] = {}
    for r in rows:
        if r.get("summary"):
            if r.get("anilist_id"):
                out[f"a{r['anilist_id']}"] = r["summary"]
            if r.get("mal_id"):
                out[f"m{r['mal_id']}"] = r["summary"]
    return out


def _words(s: str) -> set[str]:
    return {w for w in re.findall(r"[a-z][a-z'’-]+", s.lower()) if len(w) > 3 and w not in _STOP}


def clean(text: str) -> str:
    text = "\n".join(line for line in text.splitlines() if not _NOTE.match(line)).split("•")[0]
    return " ".join(_NOISE.sub(" ", text).replace(" — ", ", ").replace("—", ", ").split())


def sentences(text: str) -> list[str]:
    return [s.strip() for s in _SPLIT.split(clean(text)) if len(s.split()) >= 6]


def excerpt(text: str | None, siblings: list[str], first: bool = True) -> str | None:
    """The start of a synopsis as one readable passage, beginning where this title's own story does.
    `first`: the earliest title of its show, whose opening is the setup rather than a recap."""
    sents = sentences(text or "")[:10]
    if not sents:
        return None
    def skip(s: str) -> bool:
        # A sentence that starts in lower case lost its first letters in the source data: start after it.
        return bool(_META.match(s) or (not first and _PREMISE.match(s)) or s[0].islower())
    start = next((i for i, s in enumerate(sents) if not skip(s)), None)
    if start is None:
        return None  # only lines about the show, nothing about what happens in it
    if siblings and not first:
        # Sentences shared with the other seasons' synopses retell the premise: skip them, but never past the
        # sentence most this title's own.
        seen = Counter(w for s in siblings for w in _words(s))
        fresh = [sum(1 / (1 + seen[w]) for w in _words(s)) / math.sqrt(max(4, len(_words(s)))) for s in sents]
        own = max(range(start, len(sents)), key=lambda i: fresh[i])
        start = next(i for i in range(start, own + 1) if fresh[i] >= 0.6 * fresh[own] and not skip(sents[i]))
    out = sents[start]
    for s in sents[start + 1:]:
        if len(out) + 1 + len(s) > MAX:
            break
        out += " " + s
    return shorten(out)


def shorten(s: str) -> str:
    if len(s) <= MAX:
        return s
    cut = s[:MAX - 1].rsplit(" ", 1)[0].rstrip(",;:—–- ")
    return cut + "…"


def blurbs(db: Session, items: list[Anime]) -> dict[int, str | None]:
    """anime_id -> its lines, worked out once per process (synopses only change with a catalogue refresh)."""
    todo = [a for a in items if a.id not in _cache]
    if todo:
        mine = written()
        sib_ids = {r for a in todo for r in (a.related or [])}
        sib = {i: (t, y) for i, t, y in db.execute(select(Anime.id, Anime.synopsis, Anime.year)
                                                   .where(Anime.id.in_(sib_ids))).all()} if sib_ids else {}
        for a in todo:
            others = [sib[r] for r in (a.related or []) if r in sib]
            first = not any(y and a.year and y < a.year for _, y in others)
            _cache[a.id] = mine.get(f"a{a.anilist_id}") or mine.get(f"m{a.mal_id}") or \
                excerpt(a.synopsis, [t for t, _ in others if t], first)
    return {a.id: _cache[a.id] for a in items}
