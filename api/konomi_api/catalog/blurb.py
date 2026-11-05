"""One short line on what happens in a title, so seasons of one show can be told apart while rating.

Picked from the title's own synopsis: the sentence that shares the fewest words with the synopses of its other
seasons (their recaps of the premise score low), cut to about one line. No synopsis, no line."""
from __future__ import annotations

import math
import re
from collections import Counter

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Anime

# Room for about two lines on a card; the page trims it to what fits there and shows the rest on hover.
MAX = 160
_NOISE = re.compile(r"\((source|written by)[^)]*\)|\[[^\]]*\]|^\s*(note|notes)\s*:.*$", re.I | re.M)
_SPLIT = re.compile(r"(?<=[.!?])[\"”’)]?\s+(?=[\"“‘(]?[A-Z])")
# Openers that retell the premise, or talk about the show instead of what happens in it.
_RECAP = re.compile(r"^(for (centuries|years|decades|generations)|centuries ago|years ago|long ago|once upon|in a world"
                    r"|the (second|third|fourth|fifth|final|last) (season|part|cour)|season \w+ of|sequel to"
                    r"|adaptation of|based on|this is|the anime|and (so|thus) begins|the (first|second|third|final) episode)",
                    re.I)
# Notes after the story: runtimes, sources, broadcast details.
_NOTE = re.compile(r"^\s*([•*(\[]|notes?\s*:|source\s*:)", re.I)
_STOP = set("""about after again against also among another back been before being between both cannot could does
doing down during each even ever every from further have having here into just like made make many more most much
must never only other over same should since some still such than that their them then there these they this those
through till under until very want were what when where which while whom whose will with within without would your
yours itself himself herself themselves however finally soon once now new""".split())

_cache: dict[int, str | None] = {}


def _words(s: str) -> set[str]:
    return {w for w in re.findall(r"[a-z][a-z'’-]+", s.lower()) if len(w) > 3 and w not in _STOP}


def sentences(text: str) -> list[str]:
    text = "\n".join(line for line in text.splitlines() if not _NOTE.match(line)).split("•")[0]
    text = " ".join(_NOISE.sub(" ", text).replace(" — ", ", ").replace("—", ", ").split())
    return [s.strip() for s in _SPLIT.split(text) if len(s.split()) >= 6]


def pick(text: str | None, siblings: list[str]) -> str | None:
    """The line for one synopsis, given its other seasons' synopses."""
    sents = sentences(text or "")[:8]
    if not sents:
        return None
    seen = Counter(w for s in siblings for w in _words(s))
    def score(i: int, s: str) -> float:
        ws = _words(s)
        fresh = sum(1 / (1 + seen[w]) for w in ws) / math.sqrt(max(4, len(ws)))
        return fresh - 0.06 * i - (1.0 if _RECAP.match(s) else 0)
    best = max(enumerate(sents), key=lambda t: score(*t))[1] if siblings else \
        next((s for s in sents if not _RECAP.match(s)), sents[0])
    # A line about the show rather than what happens in it tells the seasons apart no better than none.
    return None if _RECAP.match(best) else shorten(best)


def shorten(s: str) -> str:
    if len(s) <= MAX:
        return s
    cut = s[:MAX - 1].rsplit(" ", 1)[0].rstrip(",;:—–- ")
    return cut + "…"


def blurbs(db: Session, items: list[Anime]) -> dict[int, str | None]:
    """anime_id -> its line, worked out once per process (synopses only change with a catalogue refresh)."""
    todo = [a for a in items if a.id not in _cache]
    if todo:
        sib_ids = {r for a in todo for r in (a.related or [])}
        syn = dict(db.execute(select(Anime.id, Anime.synopsis).where(Anime.id.in_(sib_ids))).all()) if sib_ids else {}
        for a in todo:
            _cache[a.id] = pick(a.synopsis, [syn[r] for r in (a.related or []) if syn.get(r)])
    return {a.id: _cache[a.id] for a in items}
