"""Konomi score. Your feeling picks a starting point; your comparisons decide the score.

Every title gets a prior: the middle of its feeling's band (or the band edge for "in between"), nudged a little
inside the band by the taste model's guess. All comparisons are then fitted together with Bradley-Terry, across
bands, so a title that keeps beating higher-band titles crosses into their band. One answer is never enough.
"""
from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass

import numpy as np

# tier -> (low, high) on the 1.0 to 10.0 scale. Non-overlapping, top-heavy.
BANDS: dict[int, tuple[float, float]] = {5: (9.0, 10.0), 4: (8.0, 8.9), 3: (6.5, 7.9), 2: (5.0, 6.4), 1: (1.0, 4.9)}


@dataclass(frozen=True)
class DuelRec:
    a: int
    b: int
    outcome: str  # 'a' | 'b' | 'tie'


# How one score point maps to Bradley-Terry log-strength, and how many virtual games the prior is worth.
# Tuned so one win over a higher band moves a title up but keeps it in its band; three straight wins cross.
BETA = 1.5
PRIOR_GAMES = 3.0


def prior(tier: int, between: bool = False, guess: float | None = None) -> float:
    """Where a title starts on the 1 to 10 scale before any comparison."""
    lo, hi = BANDS[tier]
    if between and tier > 1:
        return (lo + BANDS[tier - 1][1]) / 2  # on the edge with the band below
    mid = (lo + hi) / 2
    if guess is None:
        return mid
    # The taste model's guess only orders uncompared titles inside their band, never moves them out of it.
    return mid + 0.5 * max(-(hi - lo) / 2, min((hi - lo) / 2, guess - mid))


def strength(tiers: dict[int, int], duels: list[DuelRec], between: set[int] | frozenset[int] = frozenset(),
             guess: dict[int, float] | None = None, iters: int = 400) -> dict[int, float]:
    """anime_id -> the model's exact position, on the score scale but neither rounded nor capped at 1 and 10.
    MM iterations; each title also plays PRIOR_GAMES ties against a phantom fixed at its prior, which anchors the
    scale and pulls titles with little evidence back to their feeling. All titles step at once in numpy (500 titles
    and 2000 duels in a few ms) and stop early once nothing moves."""
    guess = guess or {}
    ids = list(tiers)
    if not ids:
        return {}
    idx = {a: k for k, a in enumerate(ids)}
    q = np.exp(BETA * (np.array([prior(tiers[i], i in between, guess.get(i)) for i in ids]) - 6))
    wins = np.full(len(ids), PRIOR_GAMES / 2)
    games: dict[tuple[int, int], float] = defaultdict(float)
    for d in duels:
        x, y = idx.get(d.a), idx.get(d.b)
        if x is None or y is None or x == y:
            continue
        games[(x, y) if x < y else (y, x)] += 1
        if d.outcome == "a":
            wins[x] += 1
        elif d.outcome == "b":
            wins[y] += 1
        else:
            wins[x] += 0.5
            wins[y] += 0.5
    # Every pair in both directions, so one bincount gives each title's sum over its opponents.
    pairs = np.array(list(games), dtype=np.int64).reshape(-1, 2)
    i, j = np.concatenate([pairs[:, 0], pairs[:, 1]]), np.concatenate([pairs[:, 1], pairs[:, 0]])
    n = np.array(list(games.values()) * 2)
    p = q.copy()
    for _ in range(iters):
        new = wins / (PRIOR_GAMES / (p + q) + np.bincount(i, n / (p[i] + p[j]), len(ids)))
        done = np.max(np.abs(new / p - 1)) < 1e-13
        p = new
        if done:
            break
    return {a: 6 + math.log(v) / BETA for a, v in zip(ids, p.tolist())}


def to_score(v: float) -> float:
    """A strength as a shown score: 1.0 to 10.0, one decimal."""
    return round(min(10.0, max(1.0, v)) + 1e-9, 1)


def fit(tiers: dict[int, int], duels: list[DuelRec], between: set[int] | frozenset[int] = frozenset(),
        guess: dict[int, float] | None = None, iters: int = 400) -> dict[int, float]:
    """anime_id -> unrounded score on 1 to 10."""
    return {i: min(10.0, max(1.0, v)) for i, v in strength(tiers, duels, between, guess, iters).items()}


def fit_scores(tiers: dict[int, int], duels: list[DuelRec], between: set[int] | frozenset[int] = frozenset(),
               guess: dict[int, float] | None = None) -> dict[int, float]:
    """anime_id -> score on 1.0 to 10.0, one decimal."""
    return {i: to_score(v) for i, v in strength(tiers, duels, between, guess).items()}


def ranked_in_tier(tiers: dict[int, int], duels: list[DuelRec], tier: int, exclude: int | None = None,
                   between: set[int] | frozenset[int] = frozenset()) -> list[int]:
    """Titles in one tier ordered worst -> best, by the same fit that makes the scores."""
    ids = [a for a, t in tiers.items() if t == tier and a != exclude]
    v = fit(tiers, duels, between)
    return sorted(ids, key=lambda i: (v[i], -i))
