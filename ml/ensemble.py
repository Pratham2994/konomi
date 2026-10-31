"""Does a blend of Mult-VAE and (pruned) EASE beat either alone? Tunes the weight on validation users,
reports on test users, and records the choice for serving.

Usage: python ensemble.py      (after train.py)
"""
from __future__ import annotations

import json

import numpy as np
import scipy.sparse as sp
import torch

from konomi_ml.data import BUILD, ROOT, load_split
from konomi_ml.models import MultVAE, MultVAENet
from train import evaluate

MODELS = BUILD / "models"


def zrows(s: np.ndarray) -> np.ndarray:
    return (s - s.mean(1, keepdims=True)) / (s.std(1, keepdims=True) + 1e-9)


class Blend:
    def __init__(self, vae: MultVAE, b: sp.csr_matrix, w: float):
        self.vae, self.b, self.w = vae, b, w

    def score(self, x: sp.csr_matrix) -> np.ndarray:
        v = zrows(self.vae.score(x))
        e = zrows(np.asarray((x @ self.b).todense()))
        return (1 - self.w) * v + self.w * e


def main() -> None:
    split = load_split()
    state = torch.load(MODELS / "multvae.pt", map_location="cpu")
    n_items, d = state["dec.weight"].shape
    vae = MultVAE(d=d)
    vae.net = MultVAENet(n_items, state["enc.weight"].shape[0], d)
    vae.net.load_state_dict(state)
    vae.net.to(torch.device("cuda" if torch.cuda.is_available() else "cpu"))
    b = sp.load_npz(MODELS / "ease_topk.npz").tocsr()

    best_w, best_v = 0.0, -1.0
    for w in (0.0, 0.2, 0.35, 0.5, 0.65, 0.8, 1.0):
        v = evaluate(Blend(vae, b, w), split.val, max_users=8000)["ndcg@20"]
        print(f"w={w} val ndcg@20 {v:.4f}", flush=True)
        if v > best_v:
            best_w, best_v = w, v
    test = evaluate(Blend(vae, b, best_w), split.test)
    print("blend test", test, flush=True)

    res = json.loads((MODELS / "results.json").read_text())
    res["results"][f"blend (Mult-VAE + EASE-top200, w={best_w})"] = test
    single = max(res["results"]["multvae"]["ndcg@20"], res["results"]["ease-top200"]["ndcg@20"])
    res["serve_blend"] = best_w if test["ndcg@20"] > single * 1.02 else None
    (MODELS / "results.json").write_text(json.dumps(res, indent=2))

    report = ROOT / "docs" / "model-report.md"
    text = report.read_text(encoding="utf-8")
    row = (f"| blend (Mult-VAE + EASE-top200, w={best_w}) | {test['recall@20']:.4f} | {test['ndcg@20']:.4f} | "
           f"{test['recall@100']:.4f} | {test['ndcg@100']:.4f} | — |")
    lines = text.split("\n")
    last_row = max(i for i, l in enumerate(lines) if l.startswith("| ") and "---" not in l)
    lines.insert(last_row + 1, row)
    verdict = (f"\n**Serving:** {'blend' if res['serve_blend'] is not None else 'Mult-VAE alone'} — the blend "
               f"{'beats' if res['serve_blend'] is not None else 'does not beat'} the best single servable model "
               f"by more than 2% on NDCG@20 ({test['ndcg@20']:.4f} vs {single:.4f}).\n")
    text = "\n".join(lines)
    marker = "\n## Content bridge"
    text = text.replace(marker, verdict + marker) if marker in text else text + verdict
    report.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
