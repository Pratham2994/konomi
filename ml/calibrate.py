"""Better score prediction. A rank alone says "you'll like this more than most", but not *how much*: every top
recommendation lands in the same calibration bin. Add how well a title is liked by everyone (its "quality
residual": mean of users' standardised ratings, shrunk) and fit  z = a * rank_term + b * quality + c
on validation users; report the rating error on test users.

Usage: python calibrate.py      (after train.py, ensemble.py and export.py)
"""
from __future__ import annotations

import json
import sys

import numpy as np
import polars as pl
import scipy.sparse as sp
import torch

from ensemble import Blend
from konomi_ml.data import BUILD, ROOT, Heldout, load_ratings, load_split
from konomi_ml.models import MultVAE, MultVAENet

ART = BUILD / "artifacts"
MODELS = BUILD / "models"
SHRINK = 20


def item_quality(n_items: int) -> np.ndarray:
    """Mean standardised rating per item from training users only (same user permutation as data.make_split)."""
    u, i, r, _ = load_ratings()
    rng = np.random.default_rng(0)
    users = rng.permutation(u.max() + 1)
    train = np.zeros(u.max() + 1, dtype=bool)
    train[users[: int(len(users) * 0.9)]] = True
    sel = train[u]
    u, i, r = u[sel], i[sel], r[sel].astype(np.float64)
    n = np.bincount(u, minlength=train.size)
    mean = np.bincount(u, weights=r, minlength=train.size) / np.maximum(n, 1)
    sq = np.bincount(u, weights=r * r, minlength=train.size) / np.maximum(n, 1)
    std = np.sqrt(np.maximum(sq - mean ** 2, 0)) + 0.5
    z = (r - mean[u]) / std[u]
    return np.bincount(i, weights=z, minlength=n_items) / (np.bincount(i, minlength=n_items) + SHRINK)


def rows(model, h: Heldout, users: np.ndarray):
    sc = model.score(h.fold_in[users])
    pct = sc.argsort(1).argsort(1) / (sc.shape[1] - 1)
    r_in, r_out = h.r_in[users], h.r_out[users]
    n_in = np.asarray((r_in > 0).sum(1)).ravel()
    mean = np.asarray(r_in.sum(1)).ravel() / np.maximum(n_in, 1)
    sq = np.asarray(r_in.multiply(r_in).sum(1)).ravel() / np.maximum(n_in, 1)
    std = np.sqrt(np.maximum(sq - mean ** 2, 0)) + 0.5
    rr, cc = r_out.nonzero()
    true = np.asarray(r_out[rr, cc]).ravel()
    ok = n_in[rr] >= 3
    return pct[rr, cc][ok], mean[rr][ok], std[rr][ok], true[ok], cc[ok]


def batched(model, h: Heldout, n_users: int):
    users = np.where(np.asarray((h.r_out > 0).sum(1)).ravel() > 0)[0][:n_users]
    parts = [rows(model, h, users[s:s + 1500]) for s in range(0, len(users), 1500)]
    return [np.concatenate(x) for x in zip(*parts)]


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    split = load_split()
    state = torch.load(MODELS / "multvae.pt", map_location="cpu")
    n_items, d = state["dec.weight"].shape
    vae = MultVAE(d=d)
    vae.net = MultVAENet(n_items, state["enc.weight"].shape[0], d)
    vae.net.load_state_dict(state)
    vae.net.to(torch.device("cuda" if torch.cuda.is_available() else "cpu"))
    manifest = json.loads((ART / "manifest.json").read_text())
    w = manifest.get("blend") or 0.0
    model = Blend(vae, sp.load_npz(MODELS / "ease_topk.npz").tocsr(), w)
    quality = item_quality(n_items)

    p, m, s, t, it = batched(model, split.val, 8000)
    z = (t - m) / s
    bins = np.clip((p * 100).round().astype(int), 0, 100)
    table = np.array([np.median(z[bins == b]) if (bins == b).sum() > 20 else np.nan for b in range(101)])
    good = ~np.isnan(table)
    table = np.maximum.accumulate(np.interp(np.arange(101), np.arange(101)[good], table[good]))
    f1 = np.interp(p * 100, np.arange(101), table)
    X = np.stack([f1, quality[it], np.ones_like(f1)], 1)
    a, b, c = np.linalg.lstsq(X, z, rcond=None)[0]
    print(f"fit: z = {a:.3f}*rank + {b:.3f}*quality + {c:.3f}", flush=True)

    p, m, s, t, it = batched(model, split.test, 8000)
    f1 = np.interp(p * 100, np.arange(101), table)
    old = np.clip(m + s * f1, 1, 10)
    new = np.clip(m + s * (a * f1 + b * quality[it] + c), 1, 10)
    mae_old, mae_new, mae_mean = (float(np.abs(x - t).mean()) for x in (old, new, np.clip(m, 1, 10)))
    print(f"test MAE: user mean {mae_mean:.3f} · rank only {mae_old:.3f} · rank + quality {mae_new:.3f}", flush=True)

    # Titles without ratings: predict their quality from the cross-site community score.
    cat = pl.read_parquet(BUILD / "catalog.parquet", columns=["aod_key", "score"])
    cf = pl.read_parquet(BUILD / "items_cf.parquet").sort("i").join(cat, on="aod_key", how="left")
    sc = cf["score"].to_numpy().astype(float)
    ok = ~np.isnan(sc)
    alpha, beta = np.polyfit(sc[ok], quality[ok], 1)

    np.save(ART / "item_quality.npy", quality.astype(np.float32))
    cal = json.loads((ART / "calibration.json").read_text())
    cal["blend_table"] = table.tolist()
    cal["fit"] = {"a": float(a), "b": float(b), "c": float(c), "alpha": float(alpha), "beta": float(beta)}
    (ART / "calibration.json").write_text(json.dumps(cal))

    report = ROOT / "docs" / "model-report.md"
    text = report.read_text(encoding="utf-8").split("\n## Score prediction")[0].rstrip("\n")
    text += (f"\n\n## Score prediction\n\nPredicting a held-out rating (1–10) for {len(t):,} test ratings:\n\n"
             f"| Method | MAE |\n|---|---|\n| user's own mean | {mae_mean:.3f} |\n"
             f"| served model rank, calibrated | {mae_old:.3f} |\n| rank + title quality (served) | **{mae_new:.3f}** |\n\n"
             f"Title quality = a title's mean standardised rating among training users. Fitted on validation "
             f"users: z = {a:.2f}·rank + {b:.2f}·quality + {c:.2f}. Titles with no ratings estimate quality "
             f"from their community score.\n")
    report.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
