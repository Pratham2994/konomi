"""Taste inference on CPU: fold a Konomi user into the Mult-VAE taste space and read everything off it.

Artifacts (data/build/artifacts, produced by ml/export.py):
  items.parquet  aod_key, has_cf, cf_i, emb[d], bias, x, y, z, cluster
  multvae.npz    encoder weights W1, b1, Wmu, bmu
  axes.npy/json  PCA mean + 6 components, pole names
  calibration.json  score percentile -> standardised rating (per model)
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import date
import threading
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


SEASON_START = {"WINTER": 1, "SPRING": 4, "SUMMER": 7, "FALL": 10}


def has_aired(year: int | None, season: str | None, status: str | None, today: date | None = None) -> bool:
    """Judge from the calendar: the catalogue's status labels are a snapshot and go stale (a Fall title marked
    UPCOMING in July is airing by October)."""
    today = today or date.today()
    if status in ("FINISHED", "ONGOING"):
        return True
    if not year:
        return status != "UPCOMING"
    if season in SEASON_START:
        return (year, SEASON_START[season]) <= (today.year, today.month)
    return year < today.year or (year == today.year and status != "UPCOMING")


def entry_weight(e: UserEntry) -> float:
    if e.status in ("dropped", "planned"):
        return 0.0  # a feeling given before dropping a show no longer says "this is my taste"
    return TIER_WEIGHT[e.tier] if e.tier is not None else STATUS_WEIGHT.get(e.status, 0.0)


class TasteEngine:
    def unit(self, rows):
        """Unit-length taste vector(s) for row index or index array."""
        if np.ndim(rows) == 0:
            return self.emb[rows] / self.norm[rows]
        rows = np.asarray(rows)
        return self.emb[rows] / self.norm[rows, None]

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
            meta = c.execute(text("select id, type, popularity, year, score, related, title, season, status from anime")).all()
        keep = np.array([k in ids for k in items["aod_key"].to_list()])
        items = items.filter(pl.Series(keep))
        self.anime_ids = np.array([ids[k] for k in items["aod_key"].to_list()], dtype=np.int64)
        self.row_of = {int(a): r for r, a in enumerate(self.anime_ids)}
        # One contiguous float32 matrix, built without a Python list of 40k small arrays (that copy alone cost
        # tens of MB at startup on a 512 MB host). Unit vectors are derived per row from the stored norms.
        d = len(items["emb"][0])
        self.emb = np.ascontiguousarray(items["emb"].explode().to_numpy().astype(np.float32).reshape(-1, d))
        self.norm = (np.linalg.norm(self.emb, axis=1) + 1e-9).astype(np.float32)
        self.bias = items["bias"].to_numpy().astype(np.float32)
        self.has_cf = items["has_cf"].to_numpy()
        self.cf_i = items["cf_i"].to_numpy()
        self.xyz = items.select("x", "y", "z").to_numpy().astype(np.float32)
        self.cluster = items["cluster"].to_numpy()
        m = {r.id: r for r in meta}
        order = {"WINTER": 0, "SPRING": 1, "SUMMER": 2, "FALL": 3}
        self.tv_year = {r.id: (r.year, order.get(r.season or "", 4)) for r in meta if r.type == "TV" and r.year}
        self.title = {r.id: r.title for r in meta}
        self.upcoming = np.array([not has_aired(m[int(a)].year, m[int(a)].season, m[int(a)].status)
                                  for a in self.anime_ids])
        self.related = {r.id: [x for x in (r.related or []) if x in m and m[x].type == "TV"] for r in meta if r.type == "TV"}
        self.type = np.array([m[int(a)].type for a in self.anime_ids])
        self.pop = np.array([m[int(a)].popularity for a in self.anime_ids], dtype=np.float64)
        self.year = np.array([m[int(a)].year or 0 for a in self.anime_ids])
        z = np.load(art / "multvae.npz")
        self.W1, self.b1, self.Wmu, self.bmu = z["W1"], z["b1"], z["Wmu"], z["bmu"]
        self.n_cf = self.W1.shape[1]
        self.cf_rows = np.where(self.has_cf)[0]
        self.bridge_rows = np.where(~self.has_cf)[0]
        self.unit_cf = self.emb[self.cf_rows] / self.norm[self.cf_rows, None]
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
                sims = self.unit_cf @ self.unit(r)
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

    BRIDGE_SHRINK = 0.9

    def scores(self, z: np.ndarray, x: np.ndarray | None = None) -> np.ndarray:
        """Taste score for every catalogue title, on one standardised scale.
        Rated titles: Mult-VAE logits, blended with EASE when served. Unrated (bridge-placed) titles: their bridged
        logits regress toward the mean, so they are re-standardised among themselves and mapped onto the rated
        titles' scale (shrunk a little, since the bridge is less sure) — otherwise post-2020 anime never surface."""
        s = self.emb @ z + self.bias
        cf = s[self.cf_rows]
        out = (s - cf.mean()) / (cf.std() + 1e-9)
        if self.ease is not None and x is not None:
            e = np.asarray(self.ease.T.dot(x)).ravel()[self.cf_i[self.cf_rows]]
            e = (e - e.mean()) / (e.std() + 1e-9)
            blended = (1 - self.blend) * out[self.cf_rows] + self.blend * e
            out[self.cf_rows] = (blended - blended.mean()) / (blended.std() + 1e-9)
        if len(self.bridge_rows):
            b = s[self.bridge_rows]
            out[self.bridge_rows] = self.BRIDGE_SHRINK * (b - b.mean()) / (b.std() + 1e-9)
        return out

    # ---- products ---------------------------------------------------------------------------------------
    def recommend(self, entries: list[UserEntry], k: int = 24, types: set[str] | None = None,
                  era: tuple[int, int] | None = None, gems: bool = False) -> tuple[list[dict], str]:
        listed = {e.anime_id for e in entries}
        types = types or {"TV", "MOVIE", "ONA", "OVA"}
        mask = np.isin(self.type, list(types)) & (self.pop > 0) & ~self.upcoming
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
        ranked = np.argsort(-s)[: k * 5]
        ranked = ranked[np.isfinite(s[ranked])]
        top, roots = [], set()
        for r in ranked:
            root = self.franchise_root(int(self.anime_ids[r]), listed)
            rr = self.row_of.get(root, r)
            if not mask[rr]:  # e.g. the first season is outside the chosen era: show this one, but once per series
                rr = r
            if root in roots:
                continue
            roots.add(root)
            top.append(rr)
            if len(top) == k:
                break
        likes = [e for e in entries if entry_weight(e) >= 0.4 and e.anime_id in self.row_of]
        like_rows = np.array([self.row_of[e.anime_id] for e in likes], dtype=np.int64)
        out = []
        for r in top:
            because: list[int] = []
            if mode == "model" and len(like_rows):
                sims = self.unit(like_rows) @ self.unit(r)
                because = [likes[j].anime_id for j in np.argsort(-sims)[:2]]
            out.append({"anime_id": int(self.anime_ids[r]), "because": because})
        return out, mode

    def series_key(self, anime_id: int) -> str:
        """First word of the romaji title, e.g. 'shingeki' for every Attack on Titan season. Related links in the
        catalogue also join different series by the same author; seasons of one series share this key."""
        words = re.findall(r"[a-z0-9]+", (self.title.get(anime_id) or "").lower())
        return words[0] if words else ""

    def _norm(self, anime_id: int) -> str:
        t = re.sub(r"\(\d{4}\)", "", (self.title.get(anime_id) or "").lower())
        return re.sub(r"[^a-z0-9]+", "", t)

    def is_remake(self, older: int, newer: int) -> bool:
        """A remake reuses (a prefix of) the older title years later: Dororo (2019) vs Dororo to Hyakkimaru (1969),
        Hunter x Hunter (2011) vs Hunter x Hunter. A sequel extends it: Bleach -> Bleach: Sennen Kessen-hen."""
        if abs(self.tv_year[older][0] - self.tv_year[newer][0]) <= 5:
            return False
        o, n = self._norm(older), self._norm(newer)
        return bool(n) and o.startswith(n)

    def franchise_root(self, anime_id: int, listed: set[int]) -> int:
        """The first unwatched TV season in a title's franchise (seasons linked as related TV entries, up to
        three hops). Recommending season 4 to someone who never saw season 1 is useless."""
        if anime_id not in self.tv_year:
            return anime_id
        key = self.series_key(anime_id)
        seen, frontier = {anime_id}, [anime_id]
        for _ in range(3):
            nxt = []
            for a in frontier:
                for r in self.related.get(a, []):
                    # Same series, but not a remake: Dororo (2019) shouldn't send you to Dororo (1969), while
                    # Bleach: Thousand-Year Blood War (2022) rightly sends you to Bleach (2004).
                    if (r not in seen and r in self.tv_year and self.series_key(r) == key
                            and not (self.tv_year[r] < self.tv_year[a] and self.is_remake(r, a))):
                        seen.add(r)
                        nxt.append(r)
            frontier = nxt
        unseen = [a for a in seen if a not in listed and self.tv_year[a] <= self.tv_year[anime_id]]
        return min(unseen, key=lambda a: (self.tv_year[a], a)) if unseen else anime_id

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
        centre = (self.unit(rows) * w[:, None]).sum(0) / w.sum()
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
            proj = (self.unit(r) - self.axes_mean) @ self.axes.T
            ins.append({"anime_id": e.anime_id, "edges": [round(float(p * entry_weight(e)), 4) for p in proj]})
        outs = []
        for r in rec_rows:
            proj = (self.unit(r) - self.axes_mean) @ self.axes.T
            outs.append({"anime_id": int(self.anime_ids[r]),
                         "edges": [round(float(p * d["value"]), 4) for p, d in zip(proj, dna)]})
        del x
        return {"axes": dna, "inputs": ins, "outputs": outs}

    def galaxy_points(self) -> list[list]:
        return [[int(a), round(float(p[0]), 4), round(float(p[1]), 4), round(float(p[2]), 4), int(c)]
                for a, p, c in zip(self.anime_ids, self.xyz, self.cluster)]


_engine: TasteEngine | None = None
_engine_lock = threading.Lock()


def get_engine() -> TasteEngine | None:
    """Load once, even when the startup warm-up and the first requests race (two copies would not fit in 512 MB)."""
    global _engine
    if _engine is not None:
        return _engine
    with _engine_lock:
        if _engine is None:
            art = get_settings().artifacts_dir
            if not (art / "items.parquet").exists():
                return None
            _engine = TasteEngine(art)
    return _engine

