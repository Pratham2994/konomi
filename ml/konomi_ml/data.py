"""Ratings -> user split + sparse matrices.

Positives are a user's ratings >= that user's own mean (taste signal, robust to people who rate everything 10).
Users are split 90/5/5 into train / val / test. Held-out users' positives are split 80% fold-in / 20% target;
their raw ratings are split the same way for the rating-error evaluation.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import polars as pl
import scipy.sparse as sp

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "data" / "build"


@dataclass
class Heldout:
    fold_in: sp.csr_matrix   # positives used as model input
    target: sp.csr_matrix    # positives to recover
    r_in: sp.csr_matrix      # all ratings in the fold-in part (values 1..10)
    r_out: sp.csr_matrix     # all ratings in the held-out part


@dataclass
class Split:
    n_items: int
    train: sp.csr_matrix
    val: Heldout
    test: Heldout


def _csr(u: np.ndarray, i: np.ndarray, v: np.ndarray, n_users: int, n_items: int) -> sp.csr_matrix:
    m = sp.csr_matrix((v.astype(np.float32), (u, i)), shape=(n_users, n_items))
    m.sum_duplicates()
    return m


def load_ratings() -> tuple[np.ndarray, np.ndarray, np.ndarray, int]:
    df = pl.read_parquet(BUILD / "ratings.parquet")
    n_items = pl.read_parquet(BUILD / "items_cf.parquet").height
    return df["u"].to_numpy(), df["i"].to_numpy(), df["r"].to_numpy(), n_items


def positive_mask(u: np.ndarray, r: np.ndarray) -> np.ndarray:
    n = u.max() + 1
    mean = np.bincount(u, weights=r, minlength=n) / np.maximum(np.bincount(u, minlength=n), 1)
    return r >= mean[u]


def _heldout(u, i, r, pos, users: np.ndarray, n_items: int, rng: np.random.Generator) -> Heldout:
    sel = np.isin(u, users)
    u, i, r, pos = u[sel], i[sel], r[sel], pos[sel]
    remap = np.full(u.max() + 1 if len(u) else 1, -1, dtype=np.int64)
    remap[users] = np.arange(len(users))
    uu = remap[u]
    out = rng.random(len(uu)) < 0.2
    n = len(users)
    return Heldout(
        fold_in=_csr(uu[~out & pos], i[~out & pos], np.ones((~out & pos).sum()), n, n_items),
        target=_csr(uu[out & pos], i[out & pos], np.ones((out & pos).sum()), n, n_items),
        r_in=_csr(uu[~out], i[~out], r[~out], n, n_items),
        r_out=_csr(uu[out], i[out], r[out], n, n_items),
    )


def make_split(seed: int = 0) -> Split:
    u, i, r, n_items = load_ratings()
    pos = positive_mask(u, r)
    rng = np.random.default_rng(seed)
    users = rng.permutation(u.max() + 1)
    n = len(users)
    tr, va, te = users[: int(n * 0.9)], users[int(n * 0.9): int(n * 0.95)], users[int(n * 0.95):]
    sel = np.isin(u, tr) & pos
    remap = np.full(u.max() + 1, -1, dtype=np.int64)
    remap[tr] = np.arange(len(tr))
    train = _csr(remap[u[sel]], i[sel], np.ones(sel.sum()), len(tr), n_items)
    return Split(n_items, train, _heldout(u, i, r, pos, np.sort(va), n_items, rng),
                 _heldout(u, i, r, pos, np.sort(te), n_items, rng))


def load_split(seed: int = 0) -> Split:
    path = BUILD / f"split_{seed}.npz"
    names = ["train", "val.fold_in", "val.target", "val.r_in", "val.r_out",
             "test.fold_in", "test.target", "test.r_in", "test.r_out"]
    if path.exists():
        z = np.load(path, allow_pickle=False)
        m = {k: sp.csr_matrix((z[f"{k}.data"], z[f"{k}.indices"], z[f"{k}.indptr"]), shape=tuple(z[f"{k}.shape"]))
             for k in names}
        return Split(int(z["n_items"]), m["train"],
                     Heldout(m["val.fold_in"], m["val.target"], m["val.r_in"], m["val.r_out"]),
                     Heldout(m["test.fold_in"], m["test.target"], m["test.r_in"], m["test.r_out"]))
    s = make_split(seed)
    flat = {"train": s.train}
    for part in ("val", "test"):
        h = getattr(s, part)
        for f in ("fold_in", "target", "r_in", "r_out"):
            flat[f"{part}.{f}"] = getattr(h, f)
    arrays = {"n_items": np.array(s.n_items)}
    for k, m in flat.items():
        arrays.update({f"{k}.data": m.data, f"{k}.indices": m.indices, f"{k}.indptr": m.indptr,
                       f"{k}.shape": np.array(m.shape)})
    np.savez(path, **arrays)
    return s
