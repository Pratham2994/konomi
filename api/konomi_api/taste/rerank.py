"""Hybrid re-rank for "what to watch next", and the plain reason shown with every pick.

The taste model alone ranks by "people who rated like you also rated this". A fan also weighs genre, how loved a
title is, and how close it sits to the shows they loved. So the model's candidates are re-scored with:
  genre affinity      the user's own ratings per genre, shrunk toward neutral when they rated few titles there
  popularity/quality  well-liked, widely watched titles rise; obscure ones need stronger evidence to get in
  liked neighbours    item-item similarity in the taste space to the titles the user loved (classic item-kNN)
and the final list is picked with MMR (maximal marginal relevance) so it is not one kind of show only.
Pure numpy, no database: the engine passes arrays in. Everything here runs on a few hundred rows per request.
"""
from __future__ import annotations

import numpy as np

# Plain genres a normal fan knows. Odd catalogue genres (and adult ones) never reach the reasons or the scoring.
GENRES = (("action", "Action"), ("adventure", "Adventure"), ("comedy", "Comedy"), ("drama", "Drama"),
          ("fantasy", "Fantasy"), ("horror", "Horror"), ("mahou shoujo", "Magical girl"), ("mecha", "Mecha"),
          ("music", "Music"), ("mystery", "Mystery"), ("psychological", "Psychological"), ("romance", "Romance"),
          ("sci-fi", "Sci-fi"), ("slice of life", "Slice of life"), ("sports", "Sports"),
          ("supernatural", "Supernatural"), ("thriller", "Thriller"))
GENRE_BIT = {k: i for i, (k, _) in enumerate(GENRES)}
N_GENRES = len(GENRES)

# Blend weights, on z-scores. The model leads; the rest nudge it the way a fan would.
W_GENRE, W_POP, W_QUALITY, W_NEAR = 0.40, 0.35, 0.30, 0.60
POP_CLIP = (-2.0, 1.5)        # obscure titles lose more than the biggest hits gain
MMR_LAMBDA = 0.35             # how much a pick is held back for looking like the ones already chosen
AFFINITY_NAMED = 0.30         # a genre is "one you rate highly" from here, with at least two titles in it
FAN_FAVOURITE = 1.0           # popularity prior from which a pick is called a fan favourite
TIER_LIKING = {5: 1.1, 4: 0.75, 3: 0.35, 2: -0.3, 1: -0.9}


def genre_bits(genres: list[str] | None) -> int:
    """A title's plain genres as one bit mask (17 genres fit in 32 bits: 160 KB for the whole catalogue)."""
    out = 0
    for g in genres or []:
        b = GENRE_BIT.get(g.strip().lower())
        if b is not None:
            out |= 1 << b
    return out


def bit_matrix(bits: np.ndarray) -> np.ndarray:
    """(rows, genres) 0/1 matrix. Only for small row sets."""
    return ((bits[:, None] >> np.arange(N_GENRES, dtype=np.uint32)) & 1).astype(np.float32)


def liking(status: str, tier: int | None, score: float | None) -> float | None:
    """How much a list entry says "more like this, please", about -1 to 1.3. None: says nothing (planned)."""
    if status == "planned":
        return None
    if status == "dropped":
        return -0.6
    if score is not None:
        return float(np.clip((score - 6.0) / 3.0, -1.0, 1.3))
    if tier is not None:
        return TIER_LIKING[tier]
    return 0.1  # watched, no feeling given yet


def verb(v: float) -> str:
    return "loved" if v >= 0.66 else "liked" if v >= 0.15 else "watched"  # 8.0+ is loved, 6.5+ liked


def genre_affinity(bits: np.ndarray, values: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Per genre: the user's summed liking over (titles in it + 2). Many loved titles in a genre score high; one
    loved title, or a genre they watch but rate low, stays near neutral."""
    if len(bits) == 0:
        return np.zeros(N_GENRES, dtype=np.float32), np.zeros(N_GENRES, dtype=np.float32)
    m = bit_matrix(bits)
    n = m.sum(0)
    return (m * values[:, None]).sum(0) / (n + 2.0), n


def genre_score(bits: np.ndarray, aff: np.ndarray) -> np.ndarray:
    """Sum of the user's affinities over a title's genres, over sqrt(genre count): no genre bonus for listing many."""
    out = np.zeros(len(bits), dtype=np.float32)
    for g in range(N_GENRES):
        if aff[g]:
            out[((bits >> g) & 1).astype(bool)] += aff[g]
    return out / np.sqrt(np.maximum(np.bitwise_count(bits), 1)).astype(np.float32)


def popularity_prior(pop: np.ndarray, year: np.ndarray) -> np.ndarray:
    """z-like popularity: half all-time (log of watchers), half rank within the title's own year, so a 2024 hit is
    not punished for having had less time to collect watchers."""
    has = pop > 0
    lp = np.log1p(np.maximum(pop, 0))
    glob = (lp - lp[has].mean()) / (lp[has].std() + 1e-9) if has.any() else np.zeros_like(lp)
    yr = glob.copy()
    for y in np.unique(year[has]):
        idx = np.where(has & (year == y))[0]
        if len(idx) >= 20:
            yr[idx] = (lp[idx].argsort().argsort() / (len(idx) - 1) - 0.5) * 3.4
    out = 0.5 * glob + 0.5 * yr
    out[~has] = POP_CLIP[0]
    return out.astype(np.float32)


def zscore(v: np.ndarray, ref: np.ndarray | None = None) -> np.ndarray:
    ref = v if ref is None else ref
    return (v - ref.mean()) / (ref.std() + 1e-9) if len(ref) else v


def top_n(v: np.ndarray, n: int) -> np.ndarray:
    """Indices of the n largest values, unordered (a partition, not a full sort of 40k titles)."""
    return np.arange(len(v)) if len(v) <= n else np.argpartition(-v, n)[:n]


def near_liked(sims: np.ndarray, like_w: np.ndarray, top: int = 3) -> np.ndarray:
    """Item-kNN evidence per candidate: mean of its `top` best (similarity x liking) over the titles the user liked."""
    s = sims * like_w[None, :]
    t = min(top, s.shape[1])
    return np.sort(s, axis=1)[:, -t:].mean(1)


def mmr(rel: np.ndarray, unit: np.ndarray, bits: np.ndarray, k: int, lam: float = MMR_LAMBDA,
        capped: np.ndarray | None = None, cap: int | None = None) -> list[int]:
    """Greedy maximal marginal relevance: each next pick is the most relevant one left, minus how much it looks
    like a pick already made (taste-space cosine, plus genre overlap). `capped` rows (sequels of shows you saw)
    take at most `cap` places while other picks remain."""
    n = len(rel)
    if n == 0:
        return []
    r = (rel - rel.min()) / (rel.max() - rel.min() + 1e-9)
    cos = unit @ unit.T
    inter = np.bitwise_count(bits[:, None] & bits[None, :]).astype(np.float32)
    union = np.bitwise_count(bits[:, None] | bits[None, :]).astype(np.float32)
    sim = 0.7 * cos + 0.3 * inter / np.maximum(union, 1)
    most = np.zeros(n, dtype=np.float32)
    left = np.ones(n, dtype=bool)
    picked: list[int] = []
    n_capped = 0
    while len(picked) < min(k, n):
        score = np.where(left, r - lam * most, -np.inf)
        if capped is not None and cap is not None and n_capped >= cap and (left & ~capped).any():
            score = np.where(capped, -np.inf, score)
        i = int(np.argmax(score))
        picked.append(i)
        left[i] = False
        n_capped += int(capped is not None and capped[i])
        most = np.maximum(most, sim[i])
    return picked


def _names(names: list[str]) -> str:
    return names[0] if len(names) == 1 else ", ".join(names[:-1]) + " and " + names[-1]


def reason_text(kind: str, names: list[str], verbs: list[str], genres: list[str], fan: bool = False,
                rec_type: str | None = None) -> str:
    """One plain sentence. No em dashes, no jargon."""
    if kind == "sequel" and names:
        return f"Next season of {names[0]}, which you {verbs[0]}"
    if kind == "side" and names:
        what = "A film" if rec_type == "MOVIE" else "More"
        return f"{what} from {names[0]}, which you {verbs[0]}"
    if kind == "similar" and names:
        if len(names) == 1:
            return f"Because you {verbs[0]} {names[0]}"
        if verbs[0] == verbs[1]:
            return f"Because you {verbs[0]} {names[0]} and {names[1]}"
        return f"Because you {verbs[0]} {names[0]} and {verbs[1]} {names[1]}"
    if kind == "genre" and genres:
        lead = "A fan favourite" if fan else "Top pick"
        return f"{lead} in {_names(genres)}, which you rate highly"
    if kind == "popular":
        return "One of the most watched anime"
    return "Fans with taste like yours rate it highly"


def summary_text(names: list[str], verbs: list[str]) -> str | None:
    """The list in one line: the titles most picks came from."""
    if not names:
        return None
    v = "loved" if all(x == "loved" for x in verbs) else "liked"
    return f"Mostly because you {v} {_names(names)}"
