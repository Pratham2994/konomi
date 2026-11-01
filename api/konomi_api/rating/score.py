"""Konomi score: feeling tier picks a band, Bradley-Terry strengths from duels order titles inside it."""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass

# tier -> (low, high) on the 1.0 to 10.0 scale. Non-overlapping, top-heavy.
BANDS: dict[int, tuple[float, float]] = {5: (9.0, 10.0), 4: (8.0, 8.9), 3: (6.5, 7.9), 2: (5.0, 6.4), 1: (1.0, 4.9)}


@dataclass(frozen=True)
class DuelRec:
    a: int
    b: int
    outcome: str  # 'a' | 'b' | 'tie'


def strengths(items: list[int], duels: list[DuelRec], iters: int = 200) -> dict[int, float]:
    """Bradley-Terry via MM iterations. Each item also plays one virtual tie against a phantom of strength 1,
    a weak prior that keeps unbeaten / winless items finite."""
    present = set(items)
    wins: dict[int, float] = {i: 0.5 for i in items}
    games: dict[int, dict[int, float]] = defaultdict(lambda: defaultdict(float))
    for d in duels:
        if d.a not in present or d.b not in present or d.a == d.b:
            continue
        games[d.a][d.b] += 1
        games[d.b][d.a] += 1
        if d.outcome == "a":
            wins[d.a] += 1
        elif d.outcome == "b":
            wins[d.b] += 1
        else:
            wins[d.a] += 0.5
            wins[d.b] += 0.5
    p = {i: 1.0 for i in items}
    for _ in range(iters):
        new = {}
        for i in items:
            denom = 1.0 / (p[i] + 1.0) + sum(n / (p[i] + p[j]) for j, n in games[i].items())
            new[i] = wins[i] / denom
        norm = sum(new.values()) / len(new)
        p = {i: v / norm for i, v in new.items()}
    return p


def fit_scores(tiers: dict[int, int], duels: list[DuelRec]) -> dict[int, float]:
    """anime_id -> tier (1..5)  =>  anime_id -> score. Within a band: n=1 -> midpoint; else spread so the
    best title sits exactly at the band top and the worst at the bottom."""
    if not tiers:
        return {}
    p = strengths(list(tiers), duels)
    out: dict[int, float] = {}
    by_tier: dict[int, list[int]] = defaultdict(list)
    for aid, t in tiers.items():
        by_tier[t].append(aid)
    for t, ids in by_tier.items():
        lo, hi = BANDS[t]
        ids.sort(key=lambda i: (p[i], -i))
        n = len(ids)
        for r, aid in enumerate(ids):
            v = (lo + hi) / 2 if n == 1 else lo + (hi - lo) * r / (n - 1)
            out[aid] = round(v + 1e-9, 1)
    return out


def ranked_in_tier(tiers: dict[int, int], duels: list[DuelRec], tier: int, exclude: int | None = None) -> list[int]:
    """Titles in one tier ordered worst -> best."""
    ids = [a for a, t in tiers.items() if t == tier and a != exclude]
    p = strengths(list(tiers), duels)
    return sorted(ids, key=lambda i: (p[i], -i))
