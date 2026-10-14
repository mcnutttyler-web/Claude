"""DST projection (build prompt §3.9; fantasytools.ai-style recipe). Defaults are calibrated: false.

  points allowed ~ Normal(opponent implied total, sigma)  -> E[tier points] over DK's 7 tiers
  sacks          ~ Poisson(opp dropbacks x avg(def sack rate, opp sack rate allowed)), each shrunk g/(g+3)
  INT            ~ Poisson(opp INT lambda from the INT prop if present, else shrunk rate x attempts)
  fumble rec     ~ opp fumbles lost (league base) ; def/return TD base rate with a small turnover bump
dst_inputs.csv (optional): team, def_sack_rate, def_games, off_sack_rate_allowed, off_int_rate, off_games
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from core.projections.params import Params


def _shrink(rate, games, league, k):
    if rate is None or rate != rate:
        return league
    w = games / (games + k)
    return w * rate + (1 - w) * league


def dst_projection(opp_implied: float, params: Params, scoring: dict, *, opp_dropbacks: float | None = None,
                   def_sack_rate=None, def_games=0, opp_sack_rate=None, opp_games=0, opp_int_rate=None,
                   opp_int_lambda: float | None = None) -> dict:
    from sports.nfl.scoring import pa_tier_probs
    r = params.get("distributions.dst_rates")
    k = float(params.get("dst.rate_shrink_games_k"))
    sigma = float(params.get("dst.opp_score_sigma"))
    db = float(opp_dropbacks or params.get("distributions.dst_default_dropbacks"))
    sr = 0.5 * (_shrink(def_sack_rate, def_games, r["sacks_per_dropback"], k)
                + _shrink(opp_sack_rate, opp_games, r["sacks_per_dropback"], k))
    sacks = db * sr
    ints = opp_int_lambda if opp_int_lambda is not None else \
        _shrink(opp_int_rate, opp_games, r["int_per_att"], k) * db * 0.92
    fr = float(r["fumbles_lost_per_game"])           # offensive fumbles LOST = defensive recoveries
    to_bump = (ints + fr) / (r["int_per_att"] * db * 0.92 + r["fumbles_lost_per_game"])
    td = float(r["def_td_per_game"]) * (0.5 + 0.5 * to_bump)
    tiers = scoring["dst_points_allowed"]
    probs = pa_tier_probs(opp_implied, sigma, tiers)
    tier_pts = float(sum(p * pts for p, (_, pts) in zip(probs, tiers)))
    d = scoring["dst"]
    mean = (sacks * d["sacks"] + ints * d["def_int"] + fr * d["fum_rec"] + td * d["def_td"]
            + r["safety_per_game"] * d["safety"] + r["block_per_game"] * d["blocked_kick"] + tier_pts)
    return {"sacks": sacks, "def_int": ints, "fum_rec": fr, "def_td": td, "safety": r["safety_per_game"],
            "blocked_kick": r["block_per_game"], "tier_probs": probs, "tier_points": tier_pts,
            "opp_implied": opp_implied, "sigma": sigma, "mean": float(mean)}


def dst_model_rows(slate: pd.DataFrame, team_env: pd.DataFrame, params: Params, scoring: dict,
                   dst_inputs: pd.DataFrame | None = None,
                   int_lambdas: dict[str, float] | None = None,
                   opp_dropbacks: dict[str, float] | None = None) -> tuple[pd.DataFrame, dict[int, dict]]:
    """One 'model' component row per DST whose opponent has an implied total."""
    implied = team_env.set_index("team")["team_total"].to_dict()
    inp = dst_inputs.set_index("team") if dst_inputs is not None else None
    rows, detail = [], {}
    for i in np.flatnonzero(slate["position"].eq("DST").to_numpy()):
        team, opp = slate.at[i, "team"], slate.at[i, "opp"]
        if opp not in implied:
            continue
        kw = {}
        if inp is not None:
            if team in inp.index:
                kw.update(def_sack_rate=inp.at[team, "def_sack_rate"], def_games=inp.at[team, "def_games"])
            if opp in inp.index:
                kw.update(opp_sack_rate=inp.at[opp, "off_sack_rate_allowed"], opp_games=inp.at[opp, "off_games"],
                          opp_int_rate=inp.at[opp, "off_int_rate"])
        if opp_dropbacks and opp in opp_dropbacks:
            kw["opp_dropbacks"] = opp_dropbacks[opp]
        if int_lambdas and opp in int_lambdas:
            kw["opp_int_lambda"] = int_lambdas[opp]
        d = dst_projection(implied[opp], params, scoring, **kw)
        detail[int(i)] = d
        rows.append({"dk_index": int(i), "source": "dst_model", "component": "model", "points": d["mean"],
                     "sacks": d["sacks"], "def_int": d["def_int"], "fum_rec": d["fum_rec"], "def_td": d["def_td"],
                     "safety": d["safety"], "blocked_kick": d["blocked_kick"]})
    return pd.DataFrame(rows), detail
