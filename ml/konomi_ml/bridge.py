"""Content -> taste bridge: place anime with no ratings (everything after 2020) in the Mult-VAE item space.

Target per CF item = its decoder row (d weights + bias). Features = tags, studios, genres, type, year, episodes,
duration and a MiniLM embedding of the synopsis. Trained on CF items, applied to the rest.
"""
from __future__ import annotations

import numpy as np
import polars as pl
import torch
from torch import nn

from .models import DEV


def featurize(cat: pl.DataFrame, n_tags: int = 1000, n_studios: int = 300) -> tuple[np.ndarray, dict]:
    def top(col: str, n: int) -> list[str]:
        return (cat.select(pl.col(col).explode()).drop_nulls().group_by(col).len()
                .sort("len", descending=True).head(n)[col].to_list())

    vocab = {"tags": top("tags", n_tags), "studios": top("studios", n_studios), "genres": top("genres", 60)}
    blocks = []
    for col, words in vocab.items():
        idx = {w: k for k, w in enumerate(words)}
        m = np.zeros((cat.height, len(words)), dtype=np.float32)
        for r, vals in enumerate(cat[col].to_list()):
            for v in vals or []:
                k = idx.get(v)
                if k is not None:
                    m[r, k] = 1.0
        blocks.append(m)
    types = ["TV", "MOVIE", "ONA", "OVA", "SPECIAL", "UNKNOWN"]
    t = np.stack([(cat["type"] == x).to_numpy().astype(np.float32) for x in types], 1)
    year = cat["year"].fill_null(2005).to_numpy().astype(np.float32)
    eps = np.log1p(cat["episodes"].fill_null(1).to_numpy().astype(np.float32))
    dur = np.log1p(cat["duration_s"].fill_null(1440).to_numpy().astype(np.float32) / 60)
    num = np.stack([(year - 2005) / 15, eps / 4, dur / 4, cat["year"].is_null().to_numpy().astype(np.float32)], 1)
    blocks += [t, num]
    return np.concatenate(blocks, 1), vocab


def synopsis_embeddings(texts: list[str | None]) -> np.ndarray:
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2", device=str(DEV))
    clean = [t if t else "" for t in texts]
    emb = model.encode(clean, batch_size=256, show_progress_bar=False, normalize_embeddings=True)
    emb[np.array([not t for t in texts])] = 0.0
    return emb.astype(np.float32)


class BridgeNet(nn.Module):
    def __init__(self, n_in: int, n_out: int):
        super().__init__()
        self.net = nn.Sequential(nn.Dropout(0.1), nn.Linear(n_in, 768), nn.GELU(), nn.Dropout(0.3),
                                 nn.Linear(768, 768), nn.GELU(), nn.Dropout(0.3), nn.Linear(768, n_out))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


def train_bridge(x: np.ndarray, y: np.ndarray, holdout: np.ndarray, epochs: int = 400, log=print) -> BridgeNet:
    """y = [decoder weights | bias]. Loss = cosine on weights + MSE on standardised targets."""
    mu, sd = y.mean(0), y.std(0) + 1e-6
    xt = torch.from_numpy(x).to(DEV)
    yt = torch.from_numpy((y - mu) / sd).to(DEV)
    train_idx = torch.from_numpy(np.where(~holdout)[0]).to(DEV)
    net = BridgeNet(x.shape[1], y.shape[1]).to(DEV)
    opt = torch.optim.AdamW(net.parameters(), lr=1e-3, weight_decay=1e-4)
    for ep in range(epochs):
        net.train()
        perm = train_idx[torch.randperm(len(train_idx), device=DEV)]
        for s in range(0, len(perm), 512):
            b = perm[s:s + 512]
            p = net(xt[b])
            loss = nn.functional.mse_loss(p, yt[b]) + (1 - nn.functional.cosine_similarity(p[:, :-1], yt[b, :-1])).mean()
            opt.zero_grad()
            loss.backward()
            opt.step()
        if ep % 100 == 0:
            log(f"bridge epoch {ep} loss {loss.item():.4f}")
    net.eval()
    net.mu, net.sd = mu, sd  # type: ignore[attr-defined]
    return net


@torch.no_grad()
def predict(net: BridgeNet, x: np.ndarray) -> np.ndarray:
    out = net(torch.from_numpy(x).to(DEV)).cpu().numpy()
    return out * net.sd + net.mu  # type: ignore[attr-defined]


def neighbour_overlap(true: np.ndarray, pred: np.ndarray, ref: np.ndarray, k: int = 10) -> float:
    """Mean overlap of each held-out item's top-k cosine neighbours (among reference items), true vs predicted."""
    def nn_idx(q: np.ndarray) -> np.ndarray:
        qn = q / (np.linalg.norm(q, axis=1, keepdims=True) + 1e-9)
        rn = ref / (np.linalg.norm(ref, axis=1, keepdims=True) + 1e-9)
        return np.argsort(-(qn @ rn.T), axis=1)[:, :k]
    a, b = nn_idx(true), nn_idx(pred)
    return float(np.mean([len(set(x) & set(y)) / k for x, y in zip(a, b)]))
