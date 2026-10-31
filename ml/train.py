"""Train and evaluate all taste models, write docs/model-report.md and data/build/models/.

Usage: python train.py
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np
import scipy.sparse as sp
import torch

from konomi_ml.data import BUILD, ROOT, Heldout, load_split
from konomi_ml.metrics import ndcg_at_k, recall_at_k, topk
from konomi_ml.models import EASE, ItemKNN, MultVAE, Popularity, gram

MODELS = BUILD / "models"
LOG = BUILD / "train.log"


def log(msg: str) -> None:
    line = f"[{time.strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    with LOG.open("a", encoding="utf-8") as f:
        f.write(line + "\n")


def evaluate(model, h: Heldout, ks=(20, 100), batch: int = 2000, max_users: int | None = None) -> dict:
    users = np.where(np.asarray((h.target > 0).sum(1)).ravel() > 0)[0]
    if max_users:
        users = users[:max_users]
    out = {f"recall@{k}": [] for k in ks} | {f"ndcg@{k}": [] for k in ks}
    for s in range(0, len(users), batch):
        u = users[s:s + batch]
        sc = model.score(h.fold_in[u])
        top = topk(sc, h.fold_in[u], max(ks))
        for k in ks:
            out[f"recall@{k}"].append(recall_at_k(top, h.target[u], k))
            out[f"ndcg@{k}"].append(ndcg_at_k(top, h.target[u], k))
    return {k: float(np.nanmean(np.concatenate(v))) for k, v in out.items()}


def percentiles(sc: np.ndarray) -> np.ndarray:
    """Row-wise rank percentile in [0,1] of each item's score."""
    ranks = sc.argsort(1).argsort(1)
    return ranks / (sc.shape[1] - 1)


def rating_rows(model, h: Heldout, users: np.ndarray):
    sc = model.score(h.fold_in[users])
    pct = percentiles(sc)
    r_in, r_out = h.r_in[users], h.r_out[users]
    n_in = np.asarray((r_in > 0).sum(1)).ravel()
    mean = np.asarray(r_in.sum(1)).ravel() / np.maximum(n_in, 1)
    sq = np.asarray(r_in.multiply(r_in).sum(1)).ravel() / np.maximum(n_in, 1)
    std = np.sqrt(np.maximum(sq - mean ** 2, 0)) + 0.5
    rows, cols = r_out.nonzero()
    true = np.asarray(r_out[rows, cols]).ravel()
    ok = n_in[rows] >= 3
    return pct[rows, cols][ok], mean[rows][ok], std[rows][ok], true[ok]


def fit_calibration(model, h: Heldout, n_users: int = 6000) -> np.ndarray:
    """Map score percentile -> standardised rating (z), as a 101-point lookup fitted on val users."""
    users = np.where(np.asarray((h.r_out > 0).sum(1)).ravel() > 0)[0][:n_users]
    p, m, s, t = rating_rows(model, h, users)
    z = (t - m) / s
    bins = np.clip((p * 100).round().astype(int), 0, 100)
    table = np.array([np.median(z[bins == b]) if (bins == b).sum() > 20 else np.nan for b in range(101)])
    idx = np.arange(101)
    good = ~np.isnan(table)
    table = np.interp(idx, idx[good], table[good])
    return np.maximum.accumulate(table)  # monotone: higher model score never predicts lower rating


def rating_mae(model, h: Heldout, table: np.ndarray, n_users: int = 6000) -> tuple[float, float]:
    users = np.where(np.asarray((h.r_out > 0).sum(1)).ravel() > 0)[0][:n_users]
    p, m, s, t = rating_rows(model, h, users)
    pred = np.clip(m + s * table[np.clip((p * 100).round().astype(int), 0, 100)], 1, 10)
    return float(np.abs(pred - t).mean()), float(np.abs(np.clip(m, 1, 10) - t).mean())


def main() -> None:
    MODELS.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    split = load_split()
    log(f"split: train {split.train.shape} nnz {split.train.nnz:,}; val {split.val.fold_in.shape[0]} "
        f"test {split.test.fold_in.shape[0]} ({time.time() - t0:.0f}s)")
    results: dict[str, dict] = {}
    val_users = 8000

    pop = Popularity().fit(split.train)
    results["popularity"] = evaluate(pop, split.test)
    log(f"popularity {results['popularity']}")

    g = gram(split.train)
    knn = ItemKNN(200).fit(split.train, g)
    results["item-knn"] = evaluate(knn, split.test)
    log(f"item-knn {results['item-knn']}")
    del knn
    torch.cuda.empty_cache()

    best_lam, best_v = None, -1.0
    for lam in (100, 300, 1000, 3000, 10000):
        e = EASE(lam).fit(split.train, g)
        v = evaluate(e, split.val, max_users=val_users)["ndcg@20"]
        log(f"ease lambda {lam} val ndcg@20 {v:.4f}")
        if v > best_v:
            best_lam, best_v = lam, v
        del e
        torch.cuda.empty_cache()
    ease = EASE(best_lam).fit(split.train, g)
    del g
    results["ease"] = evaluate(ease, split.test) | {"lambda": best_lam}
    log(f"ease {results['ease']}")
    ease_sparse = ease.topk_sparse(200)
    sp.save_npz(MODELS / "ease_topk.npz", ease_sparse)
    results["ease-top200"] = evaluate(_SparseScorer(ease_sparse), split.test)
    log(f"ease-top200 {results['ease-top200']}")
    ease_table = fit_calibration(ease, split.val)
    results["ease"]["mae"], baseline_mae = rating_mae(ease, split.test, ease_table)
    del ease
    torch.cuda.empty_cache()

    vae = MultVAE().fit(split.train,
                        lambda m: evaluate(m, split.val, max_users=val_users)["ndcg@100"], log)
    results["multvae"] = evaluate(vae, split.test)
    vae_table = fit_calibration(vae, split.val)
    results["multvae"]["mae"], _ = rating_mae(vae, split.test, vae_table)
    torch.save(vae.net.state_dict(), MODELS / "multvae.pt")
    log(f"multvae {results['multvae']}")

    results["user-mean (rating baseline)"] = {"mae": baseline_mae}
    a, b = results["ease"]["ndcg@20"], results["multvae"]["ndcg@20"]
    ship = "ease" if a > b * 1.02 else "multvae"
    (MODELS / "calibration.json").write_text(json.dumps({
        "ease": ease_table.tolist(), "multvae": vae_table.tolist()}))
    (MODELS / "results.json").write_text(json.dumps({"results": results, "ship": ship}, indent=2))
    write_report(results, ship, split)
    log(f"done in {(time.time() - t0) / 60:.1f} min; ship {ship}")


class _SparseScorer:
    def __init__(self, b: sp.csr_matrix):
        self.b = b

    def score(self, x: sp.csr_matrix) -> np.ndarray:
        return np.asarray((x @ self.b).todense())


def write_report(results: dict, ship: str, split) -> None:
    lines = [
        "# Konomi taste model — evaluation report", "",
        f"Data: {split.train.shape[1]:,} anime; {split.train.shape[0]:,} training users "
        f"({split.train.nnz:,} positive ratings); {split.test.fold_in.shape[0]:,} held-out test users.",
        "Positives = ratings ≥ the user's own mean. Each test user's positives: 80% shown to the model, "
        "20% hidden; metrics measure how well the hidden ones are recovered (Recall/NDCG, higher is better).",
        "Rating MAE: predict each test user's hidden ratings (1–10) from the model's rank, calibrated on "
        "validation users (lower is better).", "",
        "| Model | Recall@20 | NDCG@20 | Recall@100 | NDCG@100 | Rating MAE |",
        "|---|---|---|---|---|---|",
    ]
    for name, r in results.items():
        f = lambda k: f"{r[k]:.4f}" if k in r else "—"  # noqa: E731
        lines.append(f"| {name} | {f('recall@20')} | {f('ndcg@20')} | {f('recall@100')} | {f('ndcg@100')} "
                     f"| {f('mae')} |")
    pop, best = results["popularity"]["ndcg@20"], results[ship]["ndcg@20"]
    lines += ["", f"**Shipped: {ship}.** NDCG@20 is {best / pop:.1f}× the popularity baseline.",
              "Rule: EASE ships only if it beats Mult-VAE by more than 2% (Mult-VAE gives a shared user/item "
              "taste space that powers the galaxy, taste DNA and taste match)."]
    (ROOT / "docs" / "model-report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
