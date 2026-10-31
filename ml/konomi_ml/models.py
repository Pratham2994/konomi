"""Taste models. Every model exposes score(x: csr fold-in rows) -> np.ndarray[n_users, n_items]."""
from __future__ import annotations

import math
import time
from collections.abc import Callable

import numpy as np
import scipy.sparse as sp
import torch
from torch import nn

DEV = torch.device("cuda" if torch.cuda.is_available() else "cpu")


def dense(x: sp.csr_matrix) -> torch.Tensor:
    return torch.from_numpy(np.asarray(x.todense(), dtype=np.float32)).to(DEV)


def gram(x: sp.csr_matrix, batch: int = 4000) -> torch.Tensor:
    g = torch.zeros(x.shape[1], x.shape[1], device=DEV)
    for s in range(0, x.shape[0], batch):
        b = dense(x[s:s + batch])
        g += b.T @ b
    return g


class Popularity:
    name = "popularity"

    def fit(self, x: sp.csr_matrix) -> "Popularity":
        self.pop = np.asarray(x.sum(0)).ravel().astype(np.float32)
        return self

    def score(self, x: sp.csr_matrix) -> np.ndarray:
        return np.tile(self.pop, (x.shape[0], 1))


class ItemKNN:
    name = "item-knn"

    def __init__(self, k: int = 200):
        self.k = k

    def fit(self, x: sp.csr_matrix, g: torch.Tensor | None = None) -> "ItemKNN":
        g = gram(x) if g is None else g.clone()
        norm = torch.sqrt(torch.diag(g)).clamp_min(1e-6)
        s = g / norm[:, None] / norm[None, :]
        s.fill_diagonal_(0)
        vals, idx = torch.topk(s, self.k, dim=0)
        self.s = torch.zeros_like(s).scatter_(0, idx, vals)
        return self

    def score(self, x: sp.csr_matrix) -> np.ndarray:
        return (dense(x) @ self.s).cpu().numpy()


class EASE:
    name = "ease"

    def __init__(self, lam: float = 500.0):
        self.lam = lam

    def fit(self, x: sp.csr_matrix, g: torch.Tensor | None = None) -> "EASE":
        g = gram(x) if g is None else g.clone()
        g += self.lam * torch.eye(g.shape[0], device=DEV)
        p = torch.linalg.inv(g)
        self.b = -p / torch.diag(p)[None, :]
        self.b.fill_diagonal_(0)
        return self

    def score(self, x: sp.csr_matrix) -> np.ndarray:
        return (dense(x) @ self.b).cpu().numpy()

    def topk_sparse(self, k: int = 200) -> sp.csr_matrix:
        """Keep each column's k largest weights (served on CPU)."""
        vals, idx = torch.topk(self.b, k, dim=0)
        cols = torch.arange(self.b.shape[1], device=DEV).expand(k, -1)
        m = sp.csr_matrix((vals.flatten().cpu().numpy(), (idx.flatten().cpu().numpy(),
                                                          cols.flatten().cpu().numpy())), shape=self.b.shape)
        return m


class MultVAENet(nn.Module):
    """Mult-VAE (Liang et al. 2018) with a linear decoder, so items and users share one d-dim taste space."""

    def __init__(self, n_items: int, hidden: int = 600, d: int = 200, dropout: float = 0.5):
        super().__init__()
        self.drop = nn.Dropout(dropout)
        self.enc = nn.Linear(n_items, hidden)
        self.mu = nn.Linear(hidden, d)
        self.logvar = nn.Linear(hidden, d)
        self.dec = nn.Linear(d, n_items)

    def encode(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        x = nn.functional.normalize(x, dim=1)
        h = torch.tanh(self.enc(self.drop(x)))
        return self.mu(h), self.logvar(h)

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        mu, logvar = self.encode(x)
        z = mu + torch.randn_like(mu) * torch.exp(0.5 * logvar) if self.training else mu
        return self.dec(z), mu, logvar


class MultVAE:
    name = "multvae"

    def __init__(self, d: int = 200, hidden: int = 600, beta_max: float = 0.2, anneal_steps: int = 200_000,
                 lr: float = 1e-3, batch: int = 500, max_epochs: int = 400, patience: int = 25):
        self.d, self.hidden, self.beta_max, self.anneal_steps = d, hidden, beta_max, anneal_steps
        self.lr, self.batch, self.max_epochs, self.patience = lr, batch, max_epochs, patience

    def fit(self, x: sp.csr_matrix, val_score: Callable[["MultVAE"], float], log: Callable[[str], None] = print
            ) -> "MultVAE":
        self.net = MultVAENet(x.shape[1], self.hidden, self.d).to(DEV)
        opt = torch.optim.Adam(self.net.parameters(), lr=self.lr)
        step, best, best_state, bad = 0, -math.inf, None, 0
        for epoch in range(self.max_epochs):
            t0 = time.time()
            self.net.train()
            order = np.random.permutation(x.shape[0])
            total = 0.0
            for s in range(0, len(order), self.batch):
                xb = dense(x[order[s:s + self.batch]])
                logits, mu, logvar = self.net(xb)
                nll = -(torch.log_softmax(logits, 1) * xb).sum(1).mean()
                kl = (-0.5 * (1 + logvar - mu.pow(2) - logvar.exp()).sum(1)).mean()
                beta = min(self.beta_max, step / self.anneal_steps)
                loss = nll + beta * kl
                opt.zero_grad()
                loss.backward()
                opt.step()
                step += 1
                total += loss.item()
            v = val_score(self)
            log(f"multvae epoch {epoch} loss {total / (len(order) / self.batch):.2f} val {v:.4f} "
                f"beta {beta:.3f} {time.time() - t0:.0f}s")
            if v > best:
                best, bad = v, 0
                best_state = {k: t.detach().clone() for k, t in self.net.state_dict().items()}
            else:
                bad += 1
                if bad >= self.patience:
                    break
        self.net.load_state_dict(best_state)
        self.best_val = best
        return self

    @torch.no_grad()
    def score(self, x: sp.csr_matrix) -> np.ndarray:
        self.net.eval()
        return self.net(dense(x))[0].cpu().numpy()
