"""Blend matched source rows into one projection per DK player.

Two levels:
  1. within a component (consensus / model / market): source weights per position
     (inverse-MAE from prior seasons, else equal), renormalized over the sources that cover the player;
  2. across components: component_weights.with_props when a market value exists, else without_props,
     renormalized over the components present.

DK points are blended as points. Each stat-based source was already converted with expected_score, which
prices the 300/100/100 bonuses and DST tiers by probability. Scoring a blended MEAN stat line would
mis-price those nonlinear pieces. Blended stat means are still returned for the output schema.
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

from core.projections.params import Params
from core.projections.sources import STAT_COLS

PASS_THROUGH = ["floor", "ceiling", "ownership", "cash_ownership", "cpt_ownership"]


def _wavg(values: np.ndarray, weights: np.ndarray) -> float:
    ok = ~np.isnan(values)
    if not ok.any():
        return np.nan
    w = weights[ok]
    return float(np.average(values[ok], weights=w if w.sum() > 0 else None))


def blend(rows: pd.DataFrame, slate: pd.DataFrame, params: Params,
          source_weights: dict[str, dict[str, float]] | None = None) -> pd.DataFrame:
    """rows: dk_index, source, component, points[, stats..., floor, ceiling, ownership...]."""
    comp_w_props = params.get("blend.component_weights.with_props")
    comp_w_none = params.get("blend.component_weights.without_props")
    mae_bar = params.get("validation.mae_bar")
    k_cov = float(params.get("confidence.source_count_k"))
    agree = float(params.get("confidence.agreement_scale"))
    pos = slate["position"]
    stat_cols = [c for c in STAT_COLS if c in rows.columns]
    extra = [c for c in PASS_THROUGH if c in rows.columns]
    out = []
    for i, g in rows.groupby("dk_index"):
        p = pos.iloc[int(i)]
        sw = (source_weights or {}).get(p, {})
        w = np.array([sw.get(s, 1.0) for s in g["source"]], dtype=float)
        comp_vals, breakdown = {}, {}
        for comp, gc in g.groupby("component"):
            wc = w[g["component"].to_numpy() == comp]
            comp_vals[comp] = _wavg(gc["points"].to_numpy(float), wc)
            breakdown[comp] = {"value": round(comp_vals[comp], 3),
                               "sources": {s: round(float(x), 3) for s, x in zip(gc["source"], gc["points"])}}
        cw = comp_w_props if comp_vals.get("market") == comp_vals.get("market") and "market" in comp_vals \
            else comp_w_none
        cws = {c: float(cw.get(c, 0.0)) for c in comp_vals}
        if sum(cws.values()) <= 0:
            cws = {c: 1.0 for c in comp_vals}
        tot = sum(cws.values())
        cws = {c: v / tot for c, v in cws.items()}
        mean = sum(cws[c] * comp_vals[c] for c in comp_vals)
        for c in breakdown:
            breakdown[c]["weight"] = round(cws[c], 3)
        r = {"dk_index": int(i), "mean": round(mean, 3), "n_sources": int(g["source"].nunique()),
             "source_sd": float(np.std(g["points"])) if len(g) > 1 else np.nan,
             "source_breakdown": json.dumps(breakdown, sort_keys=True)}
        for c in stat_cols + extra:
            r[c] = _wavg(g[c].to_numpy(float), w)
        # Confidence (P1 heuristic, default — calibrate): coverage x agreement.
        n = r["n_sources"]
        scale = agree * float(mae_bar.get(p, np.mean(list(mae_bar.values()))))
        agreement = np.exp(-(r["source_sd"] if r["source_sd"] == r["source_sd"] else scale) / scale)
        r["confidence"] = round(float(n / (n + k_cov) * agreement), 3)
        r["disagreement_flag"] = disagreement(comp_vals, p, params)
        out.append(r)
    return pd.DataFrame(out)


def disagreement(comp_vals: dict[str, float], position: str, params: Params) -> bool:
    """|model - market| > mae_mult x position MAE. Needs both components; otherwise False."""
    m, k = comp_vals.get("model"), comp_vals.get("market")
    if m is None or k is None or m != m or k != k:
        return False
    bar = params.get("validation.mae_bar").get(position, 5.0)
    return bool(abs(m - k) > float(params.get("blend.disagreement.mae_mult")) * bar)
