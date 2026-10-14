"""Correlated slate simulation (Section 5.1): Gaussian copula -> per-player quantile functions.

    z ~ MVN(0, Sigma)  (Sigma repaired to nearest PSD, Higham; largest adjustment logged)
    u = Phi(z)  -> x = quantile_i(u) with the bust mixture applied
Fixed seed; the run log records seed + hashes of config and inputs. Output is float32 (n_sims x n_players).
A projection-engine sims.npz (matching dk_id) can be loaded instead of simulating.
"""
from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import norm

from core.correlation import repaired_correlation
from core.distributions import Marginals, fit_marginals
from sports.base import SportConfig

log = logging.getLogger(__name__)


@dataclass
class SlateSims:
    scores: np.ndarray            # (n_sims, n_players) float32
    corr: np.ndarray | None
    max_adjustment: float
    seed: int
    run_log: dict = field(default_factory=dict)

    @property
    def n_sims(self) -> int:
        return self.scores.shape[0]


def _hash(obj) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True, default=str).encode()).hexdigest()[:16]


def correlated_normals(C: np.ndarray, n: int, rng: np.random.Generator) -> np.ndarray:
    """z ~ MVN(0, C) via Cholesky (C must be PSD; use repaired_correlation first)."""
    return rng.standard_normal((n, C.shape[0])) @ np.linalg.cholesky(C).T


def simulate_slate(slate: pd.DataFrame, sport: SportConfig, n_sims: int = 10000, seed: int = 20261013,
                   mode: str = "classic", chunk: int = 2000, marginals: Marginals | None = None,
                   bust: bool = True) -> SlateSims:
    roles = slate["role"] if "role" in slate else sport.roles(slate)
    C, adj = repaired_correlation(slate, sport.correlation_prior, roles, mode)
    L = np.linalg.cholesky(C)
    m = marginals or fit_marginals(slate, sport, bust=bust)
    rng = np.random.default_rng(seed)
    n = len(slate)
    out = np.empty((n_sims, n), dtype=np.float32)
    for s in range(0, n_sims, chunk):
        k = min(chunk, n_sims - s)
        z = rng.standard_normal((k, n)) @ L.T
        bu = rng.random((k, n))
        out[s:s + k] = m.quantile(norm.cdf(z), bu).astype(np.float32)
    cols = [c for c in ("id", "median", "ceiling", "std_dev") if c in slate]
    run_log = {"seed": seed, "n_sims": n_sims, "max_psd_adjustment": round(adj, 6),
               "config_hash": _hash([sport.correlation_prior, sport.distribution_defaults]),
               "input_hash": _hash(slate[cols].round(4).to_dict("list"))}
    if adj > 0:
        log.info("slate sims: PSD repair max adjustment %.4f", adj)
    return SlateSims(out, C, adj, seed, run_log)


def load_engine_sims(path: str | Path, slate: pd.DataFrame) -> SlateSims:
    """Use the projection engine's sims.npz (columns matched by DK ID; missing players are zero)."""
    z = np.load(path, allow_pickle=False)
    ids = [str(x) for x in z["dk_id"]]
    pos = {d: k for k, d in enumerate(ids)}
    sims = z["sims"]
    out = np.zeros((sims.shape[0], len(slate)), dtype=np.float32)
    missing = []
    for j, d in enumerate(slate["id"].astype(str)):
        if d in pos:
            out[:, j] = sims[:, pos[d]]
        else:
            missing.append(d)
    if missing:
        log.warning("engine sims missing %d slate players (zeros)", len(missing))
    return SlateSims(out, None, 0.0, -1, {"source": str(path), "missing": len(missing)})


def player_metrics(slate: pd.DataFrame, sims: SlateSims, sport: SportConfig) -> pd.DataFrame:
    """mean, p10/p50/p90, boom% / bust% (thresholds = x salary/1000 from the sport's distribution defaults)."""
    d = sport.distribution_defaults
    boom, bust = float(d.get("boom_threshold_x_value", 3.0)), float(d.get("bust_threshold_x_value", 1.5))
    x = sims.scores
    q = np.percentile(x, [10, 50, 90], axis=0)
    sal = slate["salary"].to_numpy(float) / 1000
    return pd.DataFrame({
        "name": slate["name"], "team": slate["team"], "position": slate["position"], "salary": slate["salary"],
        "median_in": slate["median"], "mean": x.mean(0), "p10": q[0], "p50": q[1], "p90": q[2],
        f"boom%(>={boom:g}x)": (x >= boom * sal).mean(0), f"bust%(<{bust:g}x)": (x < bust * sal).mean(0),
    }).round(3)
