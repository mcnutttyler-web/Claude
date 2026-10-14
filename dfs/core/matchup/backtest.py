"""Walk-forward evaluation of the matchup layer against the opportunity/Vegas baseline.

A  = own bottom-up projection (scripts/matchup_baseline.py), built only from games before the week
B  = A x matchup multiplier (effect model refit each offseason on all prior seasons)
DvP raw    = A x (defense's DK points allowed per game to the position this season / league average), uncapped
DvP capped = the same ratio clipped to +-8% (same cap as B)
Pool: FFA protocol — top-20 QB/TE, top-40 RB/WR by A each week, among players who played.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
import yaml

from core.matchup import defense as D
from core.matchup import effect as E

ROOT = Path(__file__).resolve().parents[2]
CFG_PATH = ROOT / "config" / "matchup.yaml"
POOL = {"QB": 20, "RB": 40, "WR": 40, "TE": 20}
METHODS = {"A": "proj_A", "B": "proj_B", "DvP raw": "proj_dvp", "DvP capped": "proj_dvp_cap"}


def load_config(path: Path = CFG_PATH) -> dict:
    return yaml.safe_load(Path(path).read_text())


def config_obj(cfg: dict, k: float | None = None) -> E.MatchupConfig:
    a = cfg["archetypes"]
    return E.MatchupConfig(k_def=float(k if k is not None else cfg["defense"]["k"]),
                           prior_shrink=float(cfg["defense"]["prior_shrink"]), cap=float(cfg["cap"]),
                           window=int(a["window_games"]), blend_k=float(a["blend_k"]),
                           blend_before_week=int(a["blend_before_week"]), role_change_pts=float(a["role_change_pts"]),
                           clusters=dict(a["clusters"]), min_proj=float(cfg["min_projection"]))


def oc_changes(path: Path = ROOT / "config" / "coordinator_changes.yaml") -> set[tuple[int, str]]:
    if not Path(path).exists():
        return set()
    d = yaml.safe_load(Path(path).read_text()) or {}
    return {(int(c["season"]), str(c["team"]).upper()) for c in (d.get("changes") or [])}


def coverage_off(dg: pd.DataFrame) -> dict[int, set[str]]:
    out = {}
    for s in sorted(dg["season"].unique()):
        st = D.coverage_status(dg, int(s))
        out[int(s)] = {f for f in ("man_rate", "blitz_rate") if not st[f]}
    return out


def raw_dvp(pg: pd.DataFrame) -> pd.DataFrame:
    """Unadjusted DvP: defense's DK points allowed per game to a position (season to date) / league average."""
    g = pg.groupby(["season", "week", "game_id", "opp", "position"])["dk"].sum().reset_index()
    rows = []
    for s, gs in g.groupby("season"):
        for w in range(1, int(gs["week"].max()) + 2):
            sub = gs[gs["week"] < w]
            if sub.empty:
                continue
            lg = sub.groupby("position")["dk"].mean()
            d = sub.groupby(["opp", "position"])["dk"].mean().reset_index()
            d["dvp"] = d["dk"] / d["position"].map(lg)
            d["season"], d["week"] = s, w
            rows.append(d.drop(columns="dk"))
    return pd.concat(rows, ignore_index=True)


def attach(base: pd.DataFrame, ft: pd.DataFrame, dvp: pd.DataFrame, cap: float, min_proj: float) -> pd.DataFrame:
    x = base.merge(ft[["player_id", "season", "week", "opp", "arch", "effect", "profile_source"]],
                   left_on=["pid", "season", "week"], right_on=["player_id", "season", "week"], how="left")
    x["effect"] = x["effect"].fillna(0.0)
    x["proj_A"] = x["points"]
    x["mult_B"] = E.multiplier(x["effect"], x["proj_A"], cap, min_proj)
    x["proj_B"] = x["proj_A"] * x["mult_B"]
    x = x.merge(dvp, on=["season", "week", "opp", "position"], how="left")
    x["dvp"] = x["dvp"].fillna(1.0)
    x["proj_dvp"] = x["proj_A"] * x["dvp"]
    x["proj_dvp_cap"] = x["proj_A"] * x["dvp"].clip(1 - cap, 1 + cap)
    return x


def pool(x: pd.DataFrame) -> pd.DataFrame:
    parts = [x[x["position"] == p].sort_values("proj_A", ascending=False).groupby(["season", "week"]).head(n)
             for p, n in POOL.items()]
    return pd.concat(parts, ignore_index=True)


def metrics(p: pd.DataFrame, col: str) -> dict:
    e = p[col] - p["actual"]
    rho = p.groupby(["season", "week"]).apply(lambda g: g[col].rank().corr(g["actual"].rank()),
                                              include_groups=False).mean()
    slope = float(np.polyfit(p[col], p["actual"], 1)[0]) if len(p) > 2 else np.nan
    return {"MAE": float(e.abs().mean()), "bias": float(e.mean()), "spearman": float(rho), "calib_slope": slope}


def bootstrap(p: pd.DataFrame, a: str, b: str, n: int = 2000, seed: int = 0) -> dict:
    """Week-clustered bootstrap of MAE(b) - MAE(a) and Spearman(b) - Spearman(a)."""
    rng = np.random.default_rng(seed)
    wk = p.groupby(["season", "week"])
    stats = []
    for _, g in wk:
        da = (g[a] - g["actual"]).abs().sum()
        db = (g[b] - g["actual"]).abs().sum()
        ra = g[a].rank().corr(g["actual"].rank())
        rb = g[b].rank().corr(g["actual"].rank())
        stats.append((da, db, len(g), (rb - ra) if ra == ra and rb == rb else 0.0))
    s = np.array(stats)
    idx = rng.integers(0, len(s), size=(n, len(s)))
    dmae = (s[idx, 1].sum(axis=1) - s[idx, 0].sum(axis=1)) / s[idx, 2].sum(axis=1)
    drho = s[idx, 3].mean(axis=1)
    point = (s[:, 1].sum() - s[:, 0].sum()) / s[:, 2].sum()
    return {"dMAE": float(point), "dMAE_lo": float(np.percentile(dmae, 2.5)), "dMAE_hi": float(np.percentile(dmae, 97.5)),
            "dRho": float(s[:, 3].mean()), "dRho_lo": float(np.percentile(drho, 2.5)),
            "dRho_hi": float(np.percentile(drho, 97.5)), "weeks": int(len(s))}


def table(p: pd.DataFrame, n_boot: int = 2000) -> pd.DataFrame:
    rows = []
    for pos in POOL:
        q = p[p["position"] == pos]
        if q.empty:
            continue
        r = {"position": pos, "n": len(q)}
        for name, col in METHODS.items():
            m = metrics(q, col)
            r.update({f"{name} {k}": v for k, v in m.items()})
        bt = bootstrap(q, "proj_A", "proj_B", n_boot)
        r.update({f"B-A {k}": v for k, v in bt.items()})
        bd = bootstrap(q, "proj_A", "proj_dvp", n_boot)
        r.update({"DvP-A dMAE": bd["dMAE"], "DvP-A dMAE_lo": bd["dMAE_lo"], "DvP-A dMAE_hi": bd["dMAE_hi"]})
        rows.append(r)
    return pd.DataFrame(rows)
