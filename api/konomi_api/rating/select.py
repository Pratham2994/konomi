"""Which question to ask next."""
from __future__ import annotations

from collections import Counter

from .score import DuelRec, ranked_in_tier

MAX_INSERTION_DUELS = 6


def insertion_bounds(lo: int, hi: int) -> int | None:
    """Binary-search probe index in [lo, hi), or None when the slot is found."""
    return (lo + hi) // 2 if lo < hi else None


def next_insertion_duel(tiers: dict[int, int], duels: list[DuelRec], new_id: int,
                        between: set[int] | frozenset[int] = frozenset()) -> int | None:
    """Opponent for placing `new_id` inside its tier, derived statelessly from the duels so far."""
    tier = tiers.get(new_id)
    if tier is None:
        return None
    ranked = ranked_in_tier(tiers, duels, tier, exclude=new_id, between=between)
    pos = {aid: k for k, aid in enumerate(ranked)}
    lo, hi, n = 0, len(ranked), 0
    for d in duels:
        if new_id not in (d.a, d.b):
            continue
        other = d.b if d.a == new_id else d.a
        if other not in pos:
            continue
        n += 1
        if d.outcome == "tie":
            return None
        new_won = (d.outcome == "a") == (d.a == new_id)
        k = pos[other]
        if new_won:
            lo = max(lo, k + 1)
        else:
            hi = min(hi, k)
    if n >= MAX_INSERTION_DUELS:
        return None
    mid = insertion_bounds(lo, hi)
    return None if mid is None else ranked[mid]


def next_session_question(tiers: dict[int, int], duels: list[DuelRec], untiered: list[int],
                          facets_missing: list[int], scores: dict[int, float] | None = None) -> dict | None:
    """1) completed titles without a feeling, 2) the least-compared neighbours on your whole chart, best first,
    including pairs that sit either side of a band edge (that is how a title earns its way across),
    3) facet taps for the best titles."""
    if untiered:
        return {"kind": "tier", "anime_id": untiered[0]}
    pair_count = Counter(frozenset((d.a, d.b)) for d in duels)
    best: tuple | None = None
    if scores is not None:
        ranked = sorted(tiers, key=lambda i: (scores.get(i, 0), -i))
        for k, (x, y) in enumerate(zip(ranked, ranked[1:])):
            c = pair_count[frozenset((x, y))]
            key = (c, -k)  # fewest comparisons first; among those, the higher end of your chart
            if best is None or key < best[0]:
                best = (key, x, y)
    else:
        for tier in sorted(set(tiers.values()), reverse=True):
            ranked = ranked_in_tier(tiers, duels, tier)
            for x, y in zip(ranked, ranked[1:]):
                c = pair_count[frozenset((x, y))]
                key = (c, -tier)
                if best is None or key < best[0]:
                    best = (key, x, y)
    if best is not None and best[0][0] == 0:
        return {"kind": "duel", "a": best[2], "b": best[1]}
    if facets_missing:
        return {"kind": "facets", "anime_id": facets_missing[0]}
    if best is not None and best[0][0] < 2:
        return {"kind": "duel", "a": best[2], "b": best[1]}
    return None
