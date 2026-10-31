"""Build serving artifacts from the trained models: bridge, taste space, galaxy, encoder weights.

Usage: python export.py        (after train.py)
Writes data/build/artifacts/ and appends the bridge evaluation to docs/model-report.md.
"""
from __future__ import annotations

import json
import shutil
import time

import numpy as np
import polars as pl
import torch

from konomi_ml.bridge import featurize, neighbour_overlap, predict, synopsis_embeddings, train_bridge
from konomi_ml.data import BUILD, ROOT
from konomi_ml.models import MultVAENet
from konomi_ml.space import clusters, galaxy, taste_axes, unit

ART = BUILD / "artifacts"
MODELS = BUILD / "models"


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def main() -> None:
    ART.mkdir(parents=True, exist_ok=True)
    cat = pl.read_parquet(BUILD / "catalog.parquet")
    cf = pl.read_parquet(BUILD / "items_cf.parquet").sort("i")
    state = torch.load(MODELS / "multvae.pt", map_location="cpu")
    n_items, d = state["dec.weight"].shape
    net = MultVAENet(n_items, state["enc.weight"].shape[0], d)
    net.load_state_dict(state)
    w_cf = state["dec.weight"].numpy()
    b_cf = state["dec.bias"].numpy()
    log(f"multvae: {n_items} items, d={d}")

    # Align catalog rows with CF items.
    key_to_cf = {k: i for i, k in enumerate(cf["aod_key"].to_list())}
    cat = cat.with_columns(pl.col("aod_key").replace_strict(key_to_cf, default=-1).alias("cf_i"))
    has_cf = cat["cf_i"].to_numpy() >= 0

    # Features (+ cached synopsis embeddings).
    x, vocab = featurize(cat)
    syn_path = BUILD / "synopsis_minilm.npy"
    if syn_path.exists():
        syn = np.load(syn_path)
    else:
        log("embedding synopses with MiniLM…")
        syn = synopsis_embeddings(cat["synopsis"].to_list())
        np.save(syn_path, syn)
    x = np.concatenate([x, syn], 1).astype(np.float32)
    log(f"features: {x.shape}")

    cf_rows = np.where(has_cf)[0]
    y = np.concatenate([w_cf, b_cf[:, None]], 1)[cat["cf_i"].to_numpy()[cf_rows]]
    rng = np.random.default_rng(0)
    hold = rng.random(len(cf_rows)) < 0.1
    bridge = train_bridge(x[cf_rows], y, hold, log=log)
    p_hold = predict(bridge, x[cf_rows][hold])
    cos = float(np.mean(np.sum(unit(p_hold[:, :-1]) * unit(y[hold][:, :-1]), 1)))
    overlap = neighbour_overlap(y[hold][:, :-1], p_hold[:, :-1], y[~hold][:, :-1])
    rand = neighbour_overlap(y[hold][:, :-1], rng.normal(size=p_hold[:, :-1].shape), y[~hold][:, :-1])
    log(f"bridge holdout: cosine {cos:.3f}, neighbour overlap@10 {overlap:.3f} (random {rand:.3f})")

    # Final vectors: true for CF items, bridged for the rest.
    pred_all = predict(bridge, x)
    w_all = pred_all[:, :-1].astype(np.float32)
    b_all = pred_all[:, -1].astype(np.float32)
    w_all[cf_rows] = w_cf[cat["cf_i"].to_numpy()[cf_rows]]
    b_all[cf_rows] = b_cf[cat["cf_i"].to_numpy()[cf_rows]]

    pop = cat["popularity"].to_numpy().astype(np.float64)
    tags = cat["tags"].to_list()
    axes_mat, axes = taste_axes(w_all[cf_rows], [tags[i] for i in cf_rows], np.log1p(pop[cf_rows]) + 1)
    log("axes: " + " | ".join(f"{' · '.join(a['neg'])} ↔ {' · '.join(a['pos'])}" for a in axes))
    log("umap galaxy…")
    xyz = galaxy(w_all)
    labels, cl = clusters(w_all, tags)
    log("clusters: " + " | ".join(c["label"] for c in cl))

    pl.DataFrame({
        "aod_key": cat["aod_key"], "has_cf": has_cf, "cf_i": cat["cf_i"],
        "emb": list(w_all), "bias": b_all, "x": xyz[:, 0], "y": xyz[:, 1], "z": xyz[:, 2], "cluster": labels,
    }).write_parquet(ART / "items.parquet")
    np.savez(ART / "multvae.npz", W1=state["enc.weight"].numpy(), b1=state["enc.bias"].numpy(),
             Wmu=state["mu.weight"].numpy(), bmu=state["mu.bias"].numpy(), d=np.array(d))
    np.save(ART / "axes.npy", axes_mat.astype(np.float32))
    (ART / "axes.json").write_text(json.dumps(axes, indent=1))
    (ART / "clusters.json").write_text(json.dumps(cl, indent=1))
    shutil.copy(MODELS / "calibration.json", ART / "calibration.json")
    if (MODELS / "ease_topk.npz").exists():
        shutil.copy(MODELS / "ease_topk.npz", ART / "ease_topk.npz")
    results = json.loads((MODELS / "results.json").read_text())
    manifest = {"ship": results["ship"], "d": int(d), "n_cf": int(n_items), "n_all": int(cat.height),
                "version": time.strftime("%Y%m%d%H%M"), "bridge": {"cosine": cos, "overlap10": overlap, "random10": rand}}
    (ART / "manifest.json").write_text(json.dumps(manifest, indent=1))

    report = ROOT / "docs" / "model-report.md"
    text = report.read_text(encoding="utf-8").split("\n## Content bridge")[0]
    text += (f"\n## Content bridge (anime without ratings)\n\n{(~has_cf).sum():,} catalogue titles have no ratings "
             f"(mostly post-2020). A {x.shape[1]}-feature MLP (tags, studios, genres, type, year, length, MiniLM "
             f"synopsis embedding) predicts where each sits in the taste space. On 10% held-out rated titles:\n\n"
             f"- mean cosine to the true vector: **{cos:.3f}**\n"
             f"- top-10 neighbour overlap: **{overlap:.1%}** (random vectors: {rand:.1%})\n\n"
             f"## Taste axes\n\n" + "\n".join(f"{a['id'] + 1}. {' · '.join(a['neg'])} ↔ {' · '.join(a['pos'])}"
                                               for a in axes) + "\n")
    report.write_text(text, encoding="utf-8")
    log("done")


if __name__ == "__main__":
    main()
