"""Calibration utilities: refit the "default — calibrate" parameters from YOUR history.

Inputs
  player history CSV: season, week, team, opp, position, median, actual[, role, game_id, floor, ceiling]
  DK standings exports (core/standings.py) for ownership and field-behaviour calibration
Every estimate is shrunk toward the shipped prior:  est = (n * sample + k * prior) / (n + k).
Outputs are SUGGESTIONS (a dict / YAML text); nothing is written to sports/*/ automatically.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import yaml
from scipy.stats import spearmanr

from core.correlation import pair_corr
from core.lineup import lineup_salary
from sports.base import SportConfig


def _shrink(sample: float, n: int, prior: float, k: float) -> float:
    return float((n * sample + k * prior) / (n + k))


def read_player_history(path_or_buf) -> pd.DataFrame:
    h = pd.read_csv(path_or_buf)
    need = {"season", "week", "team", "opp", "position", "median", "actual"}
    if not need <= set(h.columns):
        raise ValueError(f"player history needs {sorted(need)}")
    return h


def _roles(h: pd.DataFrame, sport: SportConfig) -> pd.Series:
    if "role" in h and h["role"].notna().all():
        return h["role"].astype(str)
    out = pd.Series(index=h.index, dtype=object)
    for _, g in h.groupby(["season", "week"]):
        out.loc[g.index] = sport.roles(g.reset_index(drop=True)).to_numpy()
    return out.astype(str)


def fit_cv(h: pd.DataFrame, sport: SportConfig, k: float = 200.0, min_median: float = 3.0) -> pd.DataFrame:
    """Coefficient of variation by position: sd(actual - median) / mean(median), shrunk toward the prior."""
    prior = sport.distribution_defaults.get("cv_by_position", {})
    rows = []
    for pos, g in h[h["median"] >= min_median].groupby("position"):
        sample = float((g["actual"] - g["median"]).std() / g["median"].mean())
        n = len(g)
        p = float(prior.get(pos, sample))
        rows.append({"position": pos, "n": n, "prior": p, "sample": round(sample, 4),
                     "suggested": round(_shrink(sample, n, p, k), 4)})
    return pd.DataFrame(rows)


def fit_correlations(h: pd.DataFrame, sport: SportConfig, k: float = 100.0, min_pairs: int = 20) -> pd.DataFrame:
    """Role-pair correlations of standardized residuals within team-weeks (same team) and game-weeks (opponents)."""
    cv = sport.distribution_defaults.get("cv_by_position", {})
    d = h.copy()
    d["role"] = _roles(d, sport).to_numpy()
    d["z"] = (d["actual"] - d["median"]) / (d["position"].map(lambda p: cv.get(p, 0.6)) * d["median"].clip(lower=1))
    prior = sport.correlation_prior
    same = {kk: v for kk, v in (prior.get("same_team") or {}).items() if kk != "showdown"}
    oppt = prior.get("opponent") or {}
    pairs: dict[tuple[str, str, str], list[tuple[float, float]]] = {}
    for (season, week), g in d.groupby(["season", "week"]):
        recs = g[["team", "opp", "role", "z"]].to_numpy()
        for a in range(len(recs)):
            for b in range(a + 1, len(recs)):
                ta, oa, ra, za = recs[a]
                tb, ob, rb, zb = recs[b]
                if ta == tb:
                    kind = "same_team"
                elif oa == tb:
                    kind = "opponent"
                else:
                    continue
                key = (kind,) + tuple(sorted((ra, rb)))
                pairs.setdefault(key, []).append((za, zb))
    rows = []
    for (kind, ra, rb), v in pairs.items():
        if len(v) < min_pairs:
            continue
        x = np.array(v)
        r = float(np.corrcoef(x[:, 0], x[:, 1])[0, 1])
        table = same if kind == "same_team" else oppt
        p = pair_corr(table, ra, rb)
        rows.append({"kind": kind, "pair": f"{ra}|{rb}", "n": len(v), "prior": round(p, 3), "sample": round(r, 3),
                     "suggested": round(_shrink(r, len(v), p, k), 3)})
    return pd.DataFrame(rows).sort_values(["kind", "n"], ascending=[True, False]) if rows else pd.DataFrame(rows)


def coverage_report(h: pd.DataFrame) -> pd.DataFrame:
    """Share of outcomes below floor / above ceiling by position (targets: ~p15/p85 or ~p10/p90 of your source)."""
    if not {"floor", "ceiling"} <= set(h.columns):
        return pd.DataFrame()
    g = h.assign(below=h["actual"] < h["floor"], above=h["actual"] > h["ceiling"])
    return g.groupby("position")[["below", "above"]].mean().assign(n=g.groupby("position").size()).round(4)


def ownership_report(projected: pd.Series, actual: pd.Series, position: pd.Series) -> pd.DataFrame:
    """Projected vs actual ownership by position: MAE (pp), bias, Spearman, and a linear recalibration fit."""
    df = pd.DataFrame({"p": projected.astype(float), "a": actual.astype(float), "pos": position})
    rows = []
    for pos, g in df.groupby("pos"):
        if len(g) < 3:
            continue
        b, a = np.polyfit(g["p"], g["a"], 1) if g["p"].nunique() > 1 else (np.nan, np.nan)
        rows.append({"position": pos, "n": len(g), "mae_pp": round(100 * float((g["p"] - g["a"]).abs().mean()), 2),
                     "bias_pp": round(100 * float((g["p"] - g["a"]).mean()), 2),
                     "spearman": round(float(spearmanr(g["p"], g["a"]).statistic), 3),
                     "recal_a": round(float(a), 4), "recal_b": round(float(b), 4)})
    big = df[df["p"] >= 0.10]
    rows.append({"position": "ALL >=10% proj", "n": len(big),
                 "mae_pp": round(100 * float((big["p"] - big["a"]).abs().mean()), 2) if len(big) else np.nan,
                 "bias_pp": round(100 * float((big["p"] - big["a"]).mean()), 2) if len(big) else np.nan,
                 "spearman": np.nan, "recal_a": np.nan, "recal_b": np.nan})
    return pd.DataFrame(rows)


def field_params_from_standings(lineups, slate: pd.DataFrame, spec, sport: SportConfig, kind: str = "gpp",
                                k: float = 2000.0) -> dict:
    """Stacker share q, second-catcher and bring-back rates, salary use and duplicate rate of a REAL field."""
    lus = [lu for lu in lineups if lu is not None]
    if not lus:
        return {}
    pos = slate["position"].to_numpy()
    team = slate["team"].to_numpy()
    opp = slate["opp"].to_numpy()
    stack = second = bb = 0
    for lu in lus:
        p = np.array(lu.players)
        qbs = p[pos[p] == "QB"]
        if not len(qbs):
            continue
        q = qbs[0]
        mates = [x for x in p if team[x] == team[q] and pos[x] in ("WR", "TE")]
        if mates:
            stack += 1
            second += len(mates) >= 2
            bb += any(team[x] == opp[q] and pos[x] in ("RB", "WR", "TE") for x in p)
    n = len(lus)
    sal = np.array([lineup_salary(lu, slate, spec) for lu in lus])
    keys = pd.Series([lu.key(slate, spec) for lu in lus])
    prior = sport.preset("field").get(kind, {})
    q_s = stack / n
    out = {"n_lineups": n, "stacker_q": round(q_s, 4),
           "second_catcher_p": round(second / max(stack, 1), 4), "bring_back_p": round(bb / max(stack, 1), 4),
           "avg_salary": round(float(sal.mean()), 1), "p5_salary": round(float(np.percentile(sal, 5)), 1),
           "dupe_rate": round(float(keys.duplicated(keep=False).mean()), 4)}
    out["suggested"] = {"stacker_q": round(_shrink(q_s, n, float(prior.get("stacker_q", q_s)), k), 4),
                        "salary_floor": float(np.floor(np.percentile(sal, 5) / 100) * 100)}
    return out


def suggestions_yaml(cv: pd.DataFrame | None = None, corr: pd.DataFrame | None = None,
                     field_params: dict | None = None) -> str:
    """YAML snippet with suggested replacements (paste into the sport plugin after review)."""
    doc: dict = {}
    if cv is not None and len(cv):
        doc["distribution_defaults"] = {"cv_by_position": {r.position: float(r.suggested) for r in cv.itertuples()}}
    if corr is not None and len(corr):
        for kind in ("same_team", "opponent"):
            c = corr[corr["kind"] == kind]
            if len(c):
                doc.setdefault("correlations", {})[kind] = {r.pair: float(r.suggested) for r in c.itertuples()}
    if field_params:
        doc["field"] = field_params.get("suggested", {})
    return "# Suggested calibration — review before pasting into sports/<sport>/*.yaml\n" + yaml.safe_dump(
        doc, sort_keys=False)
