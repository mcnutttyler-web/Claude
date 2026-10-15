"""Ownership v1 (heuristic; build prompt §5). Separate GPP and cash fields; Showdown CPT/FLEX.

Within each position: score = sum(beta_k * z_k) over value (pts/$1K), projection, salary, implied team total,
value rank and a free-square flag (cheap player projecting >= free_square_pts_per_k). weight = exp(T*score) * p_play.
Classic totals: QB 100%, RB 200%, WR 300%, TE 100%, DST 100%, plus a FLEX 100% allocated across RB/WR/TE by the
same weights -> 900%. Cash uses a higher temperature (sharper field). Showdown: CPT 100%, FLEX 500%.
Every output is an estimate (no independent NFL benchmark exists); treat as directional.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from core.projections.params import Params


def _z(x: pd.Series) -> pd.Series:
    s = x.std()
    return (x - x.mean()) / s if s and s == s else x * 0.0


def scores(df: pd.DataFrame, params: Params) -> pd.Series:
    b = params.get("ownership.beta")
    fs = float(params.get("ownership.free_square_pts_per_k"))
    out = pd.Series(0.0, index=df.index)
    for pos, g in df.groupby("position"):
        pts = g["median"].fillna(g["mean"]).fillna(0)
        sc = b["points"] * _z(pts)
        if "salary" in g and g["salary"].notna().all() and (g["salary"] > 0).all():
            val = pts / (g["salary"] / 1000)
            sc += b["value"] * _z(val) + b["salary"] * _z(g["salary"])
            sc += b["value_rank"] * _z(-val.rank(ascending=False))
            sc += b["free_square"] * ((g["salary"] <= 4500) & (val >= fs)).astype(float)
        if "team_total" in g and g["team_total"].notna().any():
            sc += b["team_total"] * _z(g["team_total"].fillna(g["team_total"].mean()))
        out.loc[g.index] = sc
    return out


def _cap(share: pd.Series, cap: float) -> pd.Series:
    share = share.copy()
    for _ in range(50):
        over = share > cap + 1e-12
        if not over.any():
            break
        excess = (share[over] - cap).sum()
        share[over] = cap
        free = ~over & (share > 0)
        if not free.any():
            break
        share[free] += excess * share[free] / share[free].sum()
    return share


def _classic(df, sc, pp, totals, temp, cap, theta, sal_k):
    w = np.exp(temp * sc - theta * sal_k) * pp
    own = pd.Series(0.0, index=df.index)
    for pos, g in df.groupby("position"):
        if pos in totals:
            own.loc[g.index] = w[g.index] / w[g.index].sum() * totals[pos]
    flex = df["position"].isin(["RB", "WR", "TE"])
    if flex.any() and "FLEX" in totals:
        wf = np.exp(temp * 1.3 * sc[flex] - theta * sal_k[flex]) * pp[flex]      # FLEX goes to the best values
        own.loc[flex] += wf / wf.sum() * totals["FLEX"]
    for pos, g in df.groupby("position"):
        own.loc[g.index] = _cap(own.loc[g.index], cap)
    return own


def classic_ownership(df: pd.DataFrame, params: Params, field: str = "gpp") -> pd.Series:
    """Salary-feasible: if the field implied by the shares would average more than max_implied_salary per lineup
    (sum of own x salary; DK cap $50,000), a salary tilt exp(-theta x $K) is added and theta found by bisection.
    Without it, studs at the ownership cap can imply a $57k "average lineup" that no real field can roster."""
    totals = params.get("ownership.roster_totals")
    temp = float(params.get("ownership.temperature")[field])
    cap = float(params.get("ownership.cap")[field])
    pp = df["p_play"].fillna(1.0) if "p_play" in df else pd.Series(1.0, index=df.index)
    sc = scores(df, params)
    if "salary" not in df or df["salary"].isna().any():
        return _classic(df, sc, pp, totals, temp, cap, 0.0, pd.Series(0.0, index=df.index))
    sal_k = df["salary"].astype(float) / 1000
    limit = float(params.get("ownership.max_implied_salary")[field])
    implied = lambda o: float((o * df["salary"]).sum())
    own = _classic(df, sc, pp, totals, temp, cap, 0.0, sal_k)
    if implied(own) <= limit:
        return own
    lo, hi = 0.0, 0.5
    while implied(_classic(df, sc, pp, totals, temp, cap, hi, sal_k)) > limit and hi < 64:
        hi *= 2
    for _ in range(40):
        mid = (lo + hi) / 2
        if implied(_classic(df, sc, pp, totals, temp, cap, mid, sal_k)) > limit:
            lo = mid
        else:
            hi = mid
    return _classic(df, sc, pp, totals, temp, cap, hi, sal_k)


def showdown_ownership(df: pd.DataFrame, params: Params, field: str = "gpp") -> tuple[pd.Series, pd.Series]:
    t = params.get("ownership.showdown_totals")
    temp = float(params.get("ownership.temperature")[field])
    tc = float(params.get("ownership.temperature")["cpt"])
    cap = float(params.get("ownership.cap")[field])
    pp = df["p_play"].fillna(1.0) if "p_play" in df else pd.Series(1.0, index=df.index)
    d = df.assign(position="ALL")
    sc = scores(d, params)
    wc = np.exp(tc * sc) * pp
    wf = np.exp(temp * sc) * pp
    cpt = _cap(wc / wc.sum() * t["CPT"], cap)
    flex = _cap(wf / wf.sum() * t["FLEX"], min(cap * 1.5, 1.0))
    return cpt, flex
