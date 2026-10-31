from __future__ import annotations

import numpy as np
import scipy.sparse as sp


def topk(scores: np.ndarray, fold_in: sp.csr_matrix, k: int) -> np.ndarray:
    """Top-k item indices per row, excluding fold-in items."""
    scores = scores.copy()
    rows, cols = fold_in.nonzero()
    scores[rows, cols] = -np.inf
    part = np.argpartition(-scores, k, axis=1)[:, :k]
    order = np.argsort(-np.take_along_axis(scores, part, axis=1), axis=1)
    return np.take_along_axis(part, order, axis=1)


def recall_at_k(top: np.ndarray, target: sp.csr_matrix, k: int) -> np.ndarray:
    """Per-user recall@k normalised by min(k, |target|) (Liang et al. 2018). Users without targets -> nan."""
    hits = np.asarray(target[np.arange(top.shape[0])[:, None], top[:, :k]].todense()) > 0
    n = np.asarray((target > 0).sum(axis=1)).ravel()
    with np.errstate(invalid="ignore", divide="ignore"):
        return np.where(n > 0, hits.sum(1) / np.minimum(k, n), np.nan)


def ndcg_at_k(top: np.ndarray, target: sp.csr_matrix, k: int) -> np.ndarray:
    hits = np.asarray(target[np.arange(top.shape[0])[:, None], top[:, :k]].todense()) > 0
    disc = 1.0 / np.log2(np.arange(2, k + 2))
    dcg = (hits * disc).sum(1)
    n = np.asarray((target > 0).sum(axis=1)).ravel()
    idcg = np.array([disc[: min(int(x), k)].sum() for x in n])
    with np.errstate(invalid="ignore", divide="ignore"):
        return np.where(n > 0, dcg / idcg, np.nan)
