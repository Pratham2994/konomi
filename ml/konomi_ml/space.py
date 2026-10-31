"""Taste space: named axes (PCA), a 3D galaxy layout (UMAP) and labelled clusters (KMeans)."""
from __future__ import annotations

import numpy as np
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA

STOP_TAGS = {"anime", "tv", "present", "time", "asia", "earth", "japan", "japanese production", "tropes",
             "based on a manga", "based on a light novel", "based on a visual novel", "original work",
             "new", "female protagonist", "male protagonist", "ensemble cast", "cast", "setting",
             "themes", "technical", "elements", "storytelling", "cgi", "manga", "4-koma", "full cgi",
             "adapted into other media", "adapted into japanese movie", "adapted into jdrama"}


def unit(v: np.ndarray) -> np.ndarray:
    return v / (np.linalg.norm(v, axis=-1, keepdims=True) + 1e-9)


def tag_matrix(tags: list[list[str]], min_count: int) -> tuple[np.ndarray, list[str]]:
    counts: dict[str, int] = {}
    for ts in tags:
        for t in set(ts or []):
            if t not in STOP_TAGS:
                counts[t] = counts.get(t, 0) + 1
    vocab = sorted(t for t, c in counts.items() if c >= min_count)
    idx = {t: k for k, t in enumerate(vocab)}
    m = np.zeros((len(tags), len(vocab)), dtype=np.float32)
    for r, ts in enumerate(tags):
        for t in ts or []:
            if t in idx:
                m[r, idx[t]] = 1
    return m, vocab


def nice(tag: str) -> str:
    return tag[:1].upper() + tag[1:]


def taste_axes(emb_cf: np.ndarray, tags_cf: list[list[str]], weights: np.ndarray, n: int = 6) -> tuple[np.ndarray, list[dict]]:
    """PCA on popular-weighted unit vectors; each pole named by the tags most over-represented at that end."""
    x = unit(emb_cf)
    pca = PCA(n_components=n, random_state=0).fit(x, )
    proj = (x - pca.mean_) @ pca.components_.T
    m, vocab = tag_matrix(tags_cf, 40)
    axes = []
    for k in range(n):
        p = proj[:, k]
        hi, lo = p >= np.quantile(p, 0.85), p <= np.quantile(p, 0.15)
        w_hi, w_lo = weights * hi, weights * lo
        rate_hi = (m * w_hi[:, None]).sum(0) / w_hi.sum()
        rate_lo = (m * w_lo[:, None]).sum(0) / w_lo.sum()
        base = (m * weights[:, None]).sum(0) / weights.sum()
        lift_hi = (rate_hi + 0.01) / (base + 0.01) * np.sqrt(rate_hi)
        lift_lo = (rate_lo + 0.01) / (base + 0.01) * np.sqrt(rate_lo)
        pos = [nice(vocab[j]) for j in np.argsort(-lift_hi)[:2]]
        neg = [nice(vocab[j]) for j in np.argsort(-lift_lo)[:2] if vocab[j] not in {v.lower() for v in pos}][:2]
        axes.append({"id": k, "pos": pos, "neg": neg,
                     "lo": float(np.quantile(p, 0.02)), "hi": float(np.quantile(p, 0.98))})
    return np.vstack([pca.mean_[None], pca.components_]), axes


def galaxy(emb: np.ndarray, seed: int = 0) -> np.ndarray:
    import umap
    xyz = umap.UMAP(n_components=3, n_neighbors=30, min_dist=0.2, metric="cosine", random_state=seed,
                    low_memory=True).fit_transform(unit(emb))
    xyz = xyz - np.median(xyz, 0)
    scale = np.quantile(np.abs(xyz), 0.99)
    return np.clip(xyz / scale, -1.2, 1.2).astype(np.float32)


def clusters(emb: np.ndarray, tags: list[list[str]], k: int = 24, seed: int = 0) -> tuple[np.ndarray, list[dict]]:
    km = KMeans(n_clusters=k, n_init=4, random_state=seed).fit(unit(emb))
    m, vocab = tag_matrix(tags, 25)
    base = m.mean(0) + 1e-3
    out = []
    for c in range(k):
        sel = km.labels_ == c
        rate = m[sel].mean(0)
        lift = rate / base * np.sqrt(rate)
        top = [nice(vocab[j]) for j in np.argsort(-lift)[:3]]
        out.append({"id": c, "label": " · ".join(top[:2]), "tags": top, "size": int(sel.sum())})
    return km.labels_.astype(np.int16), out

