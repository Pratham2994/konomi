"""Taste inference on CPU: fold a Konomi user into the Mult-VAE taste space and read everything off it.

Artifacts (data/build/artifacts, produced by ml/export.py):
  items.parquet  aod_key, has_cf, cf_i, emb[d], bias, x, y, z, cluster
  multvae.npz    encoder weights W1, b1, Wmu, bmu
  axes.npy/json  PCA mean + 6 components, pole names
  calibration.json  score percentile -> standardised rating (per model)
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np
import polars as pl
from sqlalchemy import text

from ..config import get_settings
from ..db import engine as db_engine

# Feeling tier -> how strongly a title says "this is my taste".
TIER_WEIGHT = {5: 1.0, 4: 0.8, 3: 0.4, 2: 0.0, 1: 0.0}
STATUS_WEIGHT = {"completed": 0.5, "watching": 0.3, "dropped": 0.0, "planned": 0.0}
MIN_POSITIVES = 3
DEFAULT_MEAN, DEFAULT_STD = 7.6, 1.5


@dataclass
class UserEntry:
    anime_id: int
    status: str
    tier: int | None
    score: float | None


def entry_weight(e: UserEntry) -> float:
    if e.status in ("dropped", "planned"):
        return 0.0  # a feeling given before dropping a show no longer says "this is my taste"
    return TIER_WEIGHT[e.tier] if e.tier is not None else STATUS_WEIGHT.get(e.status, 0.0)


class TasteEngine:
    def z_pred(self, pct: float, row: int) -> float:
        """Standardised predicted rating: calibrated taste rank, plus title quality when the fit exists."""
        rank = float(np.interp(pct * 100, np.arange(101), self.calibration))
        if not self.fit:
            return rank
        return self.fit["a"] * rank + self.fit["b"] * float(self.quality[row]) + self.fit["c"]

    def __init__(self, art: Path):
        items = pl.read_parquet(art / "items.parquet")
        with db_engine.connect() as c:
            ids = dict(c.execute(text("select aod_key, id from anime")).all())
            meta = c.execute(text("select id, type, popularity, year, score from anime")).all()
        keep = np.array([k in ids for k in items["aod_key"].to_list()])
        items = items.filter(pl.Series(keep))
        self.anime_ids = np.array([ids[k] for k in items["aod_key"].to_list()], dtype=np.int64)
        self.row_of = {int(a): r for r, a in enumerate(self.anime_ids)}
        self.emb = np.vstack(items["emb"].to_list()).astype(np.float32)
        self.unit = self.emb / (np.linalg.norm(self.emb, axis=1, keepdims=True) + 1e-9)
        self.bias = items["bias"].to_numpy().astype(np.float32)
        self.has_cf = items["has_cf"].to_numpy()
        self.cf_i = items["cf_i"].to_numpy()
        self.xyz = items.select("x", "y", "z").to_numpy().astype(np.float32)
        self.cluster = items["cluster"].to_numpy()
        m = {r.id: r for r in meta}
        self.type = np.array([m[int(a)].type for a in self.anime_ids])
        self.pop = np.array([m[int(a)].popularity for a in self.anime_ids], dtype=np.float64)
        self.year = np.array([m[int(a)].year or 0 for a in self.anime_ids])
        z = np.load(art / "multvae.npz")
        self.W1, self.b1, self.Wmu, self.bmu = z["W1"], z["b1"], z["Wmu"], z["bmu"]
        self.n_cf = self.W1.shape[1]
        self.cf_rows = np.where(self.has_cf)[0]
        self.unit_cf = self.unit[self.cf_rows]
        self.row_of_cf = np.full(self.n_cf, -1)
        self.row_of_cf[self.cf_i[self.cf_rows]] = self.cf_rows
        ax = np.load(art / "axes.npy")
        self.axes_mean, self.axes = ax[0], ax[1:]
        self.axes_meta = json.loads((art / "axes.json").read_text())
        self.clusters_meta = json.loads((art / "clusters.json").read_text())
        manifest = json.loads((art / "manifest.json").read_text())
        cal = json.loads((art / "calibration.json").read_text())
        self.calibration = np.array(cal.get("blend_table") or cal["multvae"])
        self.fit = cal.get("fit")
        self.quality = np.zeros(len(self.anime_ids), dtype=np.float32)
        if self.fit and (art / "item_quality.npy").exists():
            q_cf = np.load(art / "item_quality.npy")
            comm = np.array([m[int(a)].score or np.nan for a in self.anime_ids], dtype=np.float64)
            est = np.nan_to_num(self.fit["alpha"] * comm + self.fit["beta"], nan=0.0)
            self.quality = np.where(self.has_cf, q_cf[np.clip(self.cf_i, 0, None)], est).astype(np.float32)
        self.version = manifest["version"]
        self.blend = manifest.get("blend")
        self.ease = None
        if self.blend is not None and (art / "ease_topk.npz").exists():
            import scipy.sparse as sp
            self.ease = sp.load_npz(art / "ease_topk.npz").tocsr()

    # ---- folding a user in -------------------------------------------------------------------------------
    def input_vector(self, entries: list[UserEntry], exclude: int | None = None) -> np.ndarray:
        x = np.zeros(self.n_cf, dtype=np.float32)
        for e in entries:
            if e.anime_id == exclude:
                continue
            w = entry_weight(e)
            r = self.row_of.get(e.anime_id)
            if w <= 0 or r is None:
                continue
            if self.has_cf[r]:
                x[self.cf_i[r]] = max(x[self.cf_i[r]], w)
            else:
                # No ratings for this title: lend its weight to its 5 nearest rated neighbours.
                sims = self.unit_cf @ self.unit[r]
                top = np.argpartition(-sims, 5)[:5]
                for t in top:
                    ci = self.cf_i[self.cf_rows[t]]
                    x[ci] = max(x[ci], w * float(max(sims[t], 0)))
        return x

    def user_z(self, x: np.ndarray) -> np.ndarray | None:
        if (x > 0).sum() == 0:
            return None
        xn = x / (np.linalg.norm(x) + 1e-9)
        h = np.tanh(self.W1 @ xn + self.b1)
        return self.Wmu @ h + self.bmu

    def positives(self, entries: list[UserEntry]) -> int:
        return sum(1 for e in entries if entry_weight(e) >= 0.4 and e.anime_id in self.row_of)

    def scores(self, z: np.ndarray, x: np.ndarray | None = None) -> np.ndarray:
        """Taste score for every catalogue title. With a served blend, rated titles mix in EASE (both z-scored)."""
        s = self.emb @ z + self.bias
        if self.ease is None or x is None:
            return s
        cf = s[self.cf_rows]
        mu, sd = cf.mean(), cf.std() + 1e-9
        s = (s - mu) / sd
        e = np.asarray(self.ease.T.dot(x)).ravel()[self.cf_i[self.cf_rows]]
        e = (e - e.mean()) / (e.std() + 1e-9)
        s[self.cf_rows] = (1 - self.blend) * s[self.cf_rows] + self.blend * e
        cf = s[self.cf_rows]  # re-standardise so blended rated titles and bridge-only titles share one scale
        return (s - cf.mean()) / (cf.std() + 1e-9)

    # ---- products ---------------------------------------------------------------------------------------
    def recommend(self, entries: list[UserEntry], k: int = 24, types: set[str] | None = None,
                  era: tuple[int, int] | None = None, gems: bool = False) -> tuple[list[dict], str]:
        listed = {e.anime_id for e in entries}
        types = types or {"TV", "MOVIE", "ONA", "OVA"}
        mask = np.isin(self.type, list(types)) & (self.pop > 0)
        if era:
            mask &= (self.year >= era[0]) & (self.year <= era[1])
        if gems:
            mask &= self.pop < np.quantile(self.pop[self.pop > 0], 0.6)
        for a in listed:
            r = self.row_of.get(a)
            if r is not None:
                mask[r] = False
        if self.positives(entries) < MIN_POSITIVES:
            s = np.log1p(self.pop) + (self.year >= 2015) * 0.5
            mode = "popular"
        else:
            x = self.input_vector(entries)
            s = self.scores(self.user_z(x), x)
            mode = "model"
        s = np.where(mask, s, -np.inf)
        top = np.argsort(-s)[:k]
        top = top[np.isfinite(s[top])]
        likes = [e for e in entries if entry_weight(e) >= 0.4 and e.anime_id in self.row_of]
        like_rows = np.array([self.row_of[e.anime_id] for e in likes], dtype=np.int64)
        out = []
        for r in top:
            because: list[int] = []
            if mode == "model" and len(like_rows):
                sims = self.unit[like_rows] @ self.unit[r]
                because = [likes[j].anime_id for j in np.argsort(-sims)[:2]]
            out.append({"anime_id": int(self.anime_ids[r]), "because": because})
        return out, mode

    def predict(self, entries: list[UserEntry], anime_id: int) -> float | None:
        r = self.row_of.get(anime_id)
        if r is None:
            return None
        rest = [e for e in entries if e.anime_id != anime_id]
        if self.positives(rest) < MIN_POSITIVES:
            return None
        x = self.input_vector(rest, exclude=anime_id)
        s = self.scores(self.user_z(x), x)
        ref = s[self.cf_rows]
        pct = float((ref < s[r]).mean())
        zval = self.z_pred(pct, r)
        scored = [e.score for e in rest if e.score is not None]
        if len(scored) >= 5:
            mean, std = float(np.mean(scored)), float(np.std(scored)) + 0.3
        else:
            mean, std = DEFAULT_MEAN, DEFAULT_STD
        return round(float(np.clip(mean + std * zval, 1.0, 10.0)), 1)

    def predict_many(self, entries: list[UserEntry], anime_ids: list[int]) -> dict[int, float]:
        """Predictions for titles not on the list (one fold-in for all of them)."""
        if self.positives(entries) < MIN_POSITIVES:
            return {}
        x = self.input_vector(entries)
        s = self.scores(self.user_z(x), x)
        ref = np.sort(s[self.cf_rows])
        scored = [e.score for e in entries if e.score is not None]
        mean, std = (float(np.mean(scored)), float(np.std(scored)) + 0.3) if len(scored) >= 5 else (DEFAULT_MEAN, DEFAULT_STD)
        out = {}
        for a in anime_ids:
            r = self.row_of.get(a)
            if r is None:
                continue
            pct = np.searchsorted(ref, s[r]) / len(ref)
            out[a] = round(float(np.clip(mean + std * self.z_pred(float(pct), r), 1, 10)), 1)
        return out

    def dna(self, entries: list[UserEntry]) -> list[dict] | None:
        if self.positives(entries) < MIN_POSITIVES:
            return None
        x = self.input_vector(entries)
        rows = self.row_of_cf[np.where(x > 0)[0]]
        w = x[x > 0]
        centre = (self.unit[rows] * w[:, None]).sum(0) / w.sum()
        proj = (centre - self.axes_mean) @ self.axes.T
        out = []
        for a, p in zip(self.axes_meta, proj):
            v = float(np.clip((p - (a["lo"] + a["hi"]) / 2) / ((a["hi"] - a["lo"]) / 2), -1, 1))
            out.append({"id": a["id"], "neg": a["neg"], "pos": a["pos"], "value": round(v, 3)})
        return out

    def centroid(self, entries: list[UserEntry]) -> list[float] | None:
        rows, ws = [], []
        for e in entries:
            r, w = self.row_of.get(e.anime_id), entry_weight(e)
            if r is not None and w > 0:
                rows.append(r)
                ws.append(w)
        if not rows:
            return None
        w = np.array(ws)
        return [float(v) for v in (self.xyz[rows] * w[:, None]).sum(0) / w.sum()]

    def match(self, a: list[UserEntry], b: list[UserEntry]) -> dict | None:
        if self.positives(a) < MIN_POSITIVES or self.positives(b) < MIN_POSITIVES:
            return None
        za, zb = self.user_z(self.input_vector(a)), self.user_z(self.input_vector(b))
        sa, sb = self.scores(za)[self.cf_rows], self.scores(zb)[self.cf_rows]
        corr = float(np.corrcoef(sa, sb)[0, 1])
        percent = int(round(np.clip((corr - 0.5) / 0.5, 0, 1) * 100))
        sb_map = {e.anime_id: e.score for e in b if e.score is not None}
        both = [(e.anime_id, e.score, sb_map[e.anime_id]) for e in a if e.score is not None and e.anime_id in sb_map]
        agree = sorted(both, key=lambda t: -(t[1] + t[2]) + abs(t[1] - t[2]))[:5]
        fight = sorted([t for t in both if abs(t[1] - t[2]) >= 1.5], key=lambda t: -abs(t[1] - t[2]))[:5]
        return {"percent": percent, "shared": len(both),
                "agree": [{"anime_id": t[0], "a": t[1], "b": t[2]} for t in agree],
                "fight": [{"anime_id": t[0], "a": t[1], "b": t[2]} for t in fight]}

    def network(self, entries: list[UserEntry], recs: list[int]) -> dict | None:
        dna = self.dna(entries)
        if dna is None:
            return None
        x = self.input_vector(entries)
        inputs = sorted([e for e in entries if entry_weight(e) > 0 and e.anime_id in self.row_of],
                        key=lambda e: (-entry_weight(e), -(e.score or 0)))[:8]
        rec_rows = [self.row_of[a] for a in recs[:8] if a in self.row_of]
        ins = []
        for e in inputs:
            r = self.row_of[e.anime_id]
            proj = (self.unit[r] - self.axes_mean) @ self.axes.T
            ins.append({"anime_id": e.anime_id, "edges": [round(float(p * entry_weight(e)), 4) for p in proj]})
        outs = []
        for r in rec_rows:
            proj = (self.unit[r] - self.axes_mean) @ self.axes.T
            outs.append({"anime_id": int(self.anime_ids[r]),
                         "edges": [round(float(p * d["value"]), 4) for p, d in zip(proj, dna)]})
        del x
        return {"axes": dna, "inputs": ins, "outputs": outs}

    def galaxy_points(self) -> list[list]:
        return [[int(a), round(float(p[0]), 4), round(float(p[1]), 4), round(float(p[2]), 4), int(c)]
                for a, p, c in zip(self.anime_ids, self.xyz, self.cluster)]


@lru_cache(maxsize=1)
def get_engine() -> TasteEngine | None:
    art = get_settings().artifacts_dir
    if not (art / "items.parquet").exists():
        return None
    return TasteEngine(art)
