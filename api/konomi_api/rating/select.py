"""Which question to ask next."""
from __future__ import annotations

import math

import numpy as np

from .score import BETA, PRIOR_GAMES, DuelRec, ranked_in_tier, strength

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


def uncertainty(tiers: dict[int, int], duels: list[DuelRec], s: dict[int, float]) -> dict[int, float]:
    """anime_id -> how unsure the fit is about its position: the variance of its Bradley-Terry log-strength
    (inverse curvature of the fit at its answer). Few comparisons, or only lopsided ones, leave it high."""
    info = {i: PRIOR_GAMES / 4 for i in tiers}  # the prior's phantom games, played near even
    for d in duels:
        if d.a in info and d.b in info and d.a != d.b:
            p = 1 / (1 + math.exp(-BETA * (s[d.a] - s[d.b])))
            info[d.a] += p * (1 - p)
            info[d.b] += p * (1 - p)
    return {i: 1 / v for i, v in info.items()}


# How far up the chart a title is paired, and how much a duel must be worth (in bits) to be asked: before the
# facet taps (about 3 answers per title), and after them (about 10). Below the second, the chart is settled.
WINDOW = 8
TOP = 10  # every other question goes to your top TOP while it still tells something
ASK_BITS = 0.15
MORE_BITS = 0.06
_L2 = math.pi / 8  # logistic ~ probit with this squared scale
_C2 = math.pi * math.log(2) / 2


def pair_gain(mu: np.ndarray, var: np.ndarray) -> np.ndarray:
    """Expected information (bits) a duel gives about who is better, for log-strength gaps ~ Normal(mu, var).
    BALD's closed form (Houlsby et al. 2011): entropy of the predicted answer minus its expected entropy."""
    p = 1 / (1 + np.exp(-mu / np.sqrt(1 + _L2 * var)))
    h = -(p * np.log2(np.maximum(p, 1e-12)) + (1 - p) * np.log2(np.maximum(1 - p, 1e-12)))
    return np.maximum(0, h - np.sqrt(_C2 / (_L2 * var + _C2)) * np.exp(-_L2 * mu * mu / (2 * (_L2 * var + _C2))))


def best_duel(tiers: dict[int, int], duels: list[DuelRec], s: dict[int, float],
              top: int | None = None) -> tuple[float, int, int] | None:
    """(bits, better, worse) for the most informative pair not compared yet, over the whole chart. Each title is
    paired with the next WINDOW titles above it, so far-apart pairs whose answer is certain are never asked,
    pairs across a band edge are (that is how a title earns its way across), and every part of the chart gets
    questions in proportion to how unsure it is. With `top`, only pairs whose better title is in your top `top`."""
    ranked = sorted(tiers, key=lambda i: (s[i], -i))
    if len(ranked) < 2:
        return None
    v = uncertainty(tiers, duels, s)
    asked = {(d.a, d.b) for d in duels} | {(d.b, d.a) for d in duels}
    pos = np.array([s[i] for i in ranked]) * BETA
    var = np.array([v[i] for i in ranked])
    rid = np.array(ranked, dtype=np.int64)
    best: tuple[float, int, int] | None = None
    for k in range(1, min(WINDOW, len(ranked) - 1) + 1):
        gain = pair_gain(pos[k:] - pos[:-k], var[k:] + var[:-k])
        # Equal gains (uncompared titles of one feeling sit together) are broken by a fixed shuffle of the ids,
        # so neither end of the chart is favoured.
        gain += ((rid[k:] * 40503 + rid[:-k] * 9973) % 1009) * 1e-12
        gain[[x for x in range(len(gain)) if (ranked[x], ranked[x + k]) in asked]] = -1  # never the same pair twice
        if top is not None:
            gain[: max(0, len(ranked) - top - k)] = -1
        x = int(np.argmax(gain))
        if gain[x] >= 0 and (best is None or gain[x] > best[0]):
            best = (float(gain[x]), ranked[x + k], ranked[x])
    return best


def next_session_question(tiers: dict[int, int], duels: list[DuelRec], untiered: list[int],
                          facets_missing: list[int], scores: dict[int, float] | None = None) -> dict | None:
    """1) completed titles without a feeling, 2) the duel that tells the most about your whole chart, while it is
    worth asking, 3) facet taps for the best titles, 4) smaller duels, until your chart is settled. Every other
    duel settles your top TOP first (where the exact order matters most), so the rest still gets half.
    `scores` are the fit's exact strengths; without them the fit runs here."""
    if untiered:
        return {"kind": "tier", "anime_id": untiered[0]}
    s = scores if scores is not None else strength(tiers, duels)
    if len(duels) % 2 == 0 and (best := best_duel(tiers, duels, s, TOP)) is not None and best[0] >= MORE_BITS:
        return {"kind": "duel", "a": best[1], "b": best[2]}
    best = best_duel(tiers, duels, s)
    if best is not None and best[0] >= ASK_BITS:
        return {"kind": "duel", "a": best[1], "b": best[2]}
    if facets_missing:
        return {"kind": "facets", "anime_id": facets_missing[0]}
    if best is not None and best[0] >= MORE_BITS:
        return {"kind": "duel", "a": best[1], "b": best[2]}
    return None
