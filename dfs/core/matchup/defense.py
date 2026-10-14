"""Defense profiles as of each week (only games BEFORE the week), schedule-adjusted and blended with last season.

  schedule adjustment   stat_adj = defense's result vs an offense - that offense's average in its OTHER games this
                        season (before the week). Positive pass_epa_adj = this defense is worse than the
                        offense's norm.
  prior season          last season's final value, shrunk `prior_shrink` (30%) toward the league average
  blend                 weight_current = games / (games + k)        (k from config/matchup.yaml, tuned in backtest)
  coverage (man/blitz)  scheme rates are not schedule-adjusted; missing (e.g. 2026 man/zone) -> league average,
                        i.e. the feature is switched off
"""
from __future__ import annotations

import numpy as np
import pandas as pd

ADJUSTED = ["pass_epa", "rush_epa", "explosive_rate", "pressure_rate", "mid_share"]
SCHEME = ["man_rate", "blitz_rate"]
GENERIC = [f"{c}_adj" for c in ADJUSTED] + SCHEME + ["funnel"]


def schedule_adjust(sub: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    """Within `sub` (one season, games before the week): value - opponent offense's mean in its other games."""
    out = sub.copy()
    for c in cols:
        g = sub.groupby("opp")[c]
        s, n = g.transform("sum"), g.transform("count")
        other = (s - sub[c]) / (n - 1).where(n > 1)
        out[f"{c}_adj"] = sub[c] - other.fillna(sub[c].mean())
    return out


def asof_blend(rows: pd.DataFrame, cols: list[str], group: list[str], k: float, prior_shrink: float,
               league: dict[str, float] | None = None, eb_k: dict[str, float] | None = None,
               count_col: str | None = None) -> pd.DataFrame:
    """For every (season, week) and group: mean of `cols` over rows with week < that week (current season),
    blended with last season's final mean shrunk toward `league` (default 0), weight g/(g+k).
    eb_k: optional extra empirical-Bayes shrink of the blended value by n/(n + eb_k[col]) on row counts."""
    league = league or {}
    out = []
    seasons = sorted(rows["season"].unique())
    final_prev = None
    for s in seasons:
        cur = rows[rows["season"] == s]
        weeks = range(1, int(cur["week"].max()) + 2)
        for w in weeks:
            sub = cur[cur["week"] < w]
            if len(sub):
                agg = sub.groupby(group)[cols].agg(["mean", "count"])
                g_games = sub.groupby(group)[count_col or cols[0]].size() if count_col is None else \
                    sub.groupby(group)[count_col].nunique()
            else:
                agg, g_games = None, None
            keys = set()
            if agg is not None:
                keys |= set(agg.index)
            if final_prev is not None:
                keys |= set(final_prev.index)
            if not keys:
                continue
            idx = pd.Index(sorted(keys), name=group[0]) if len(group) == 1 else pd.MultiIndex.from_tuples(
                sorted(keys), names=group)
            res = pd.DataFrame(index=idx)
            g = g_games.reindex(idx).fillna(0).to_numpy(float) if g_games is not None else np.zeros(len(idx))
            wc = g / (g + k)
            for c in cols:
                lv = float(league.get(c, 0.0))
                cm = agg[(c, "mean")].reindex(idx).to_numpy(float) if agg is not None else np.full(len(idx), np.nan)
                cn = agg[(c, "count")].reindex(idx).fillna(0).to_numpy(float) if agg is not None else np.zeros(len(idx))
                if final_prev is not None and c in final_prev:
                    pm = final_prev[c].reindex(idx).to_numpy(float)
                    pn = final_prev[f"{c}__n"].reindex(idx).fillna(0).to_numpy(float)
                else:
                    pm, pn = np.full(len(idx), np.nan), np.zeros(len(idx))
                pm = np.where(np.isnan(pm), lv, (1 - prior_shrink) * pm + prior_shrink * lv)
                cmv = np.where(np.isnan(cm), lv, cm)
                v = np.where(cn > 0, wc * cmv + (1 - wc) * pm, pm)
                if eb_k and c in eb_k:
                    n_eff = cn + (1 - wc) * pn
                    v = lv + (v - lv) * n_eff / (n_eff + eb_k[c])
                res[c] = v
            res["games"] = g
            res["season"], res["week"] = s, w
            out.append(res.reset_index())
        fin = cur.groupby(group)[cols].agg(["mean", "count"])
        final_prev = pd.DataFrame({**{c: fin[(c, "mean")] for c in cols}, **{f"{c}__n": fin[(c, "count")] for c in cols}})
    return pd.concat(out, ignore_index=True) if out else pd.DataFrame()


def generic_profiles(dg: pd.DataFrame, k: float, prior_shrink: float,
                     coverage_off: dict[int, set[str]] | None = None) -> pd.DataFrame:
    """Per (season, week, team=defense): schedule-adjusted generic features as of kickoff.
    coverage_off: {season: {"man_rate", "blitz_rate"}} features switched off (set to league average)."""
    rows = []
    league_scheme = {c: float(dg[c].mean()) for c in SCHEME}
    coverage_off = coverage_off or {}
    prev_final = None
    for s in sorted(dg["season"].unique()):
        sd = dg[dg["season"] == s]
        last_w = int(sd["week"].max()) + 1
        for w in range(1, last_w + 1):
            sub = sd[sd["week"] < w]
            a = schedule_adjust(sub, ADJUSTED) if len(sub) else sub
            teams = sorted(set(sd["team"]))
            g = a.groupby("team").size().reindex(teams).fillna(0).to_numpy(float) if len(a) else np.zeros(len(teams))
            wc = g / (g + k)
            res = pd.DataFrame({"team": teams, "season": s, "week": w, "games": g})
            for c in [f"{x}_adj" for x in ADJUSTED] + SCHEME:
                lv = league_scheme.get(c, 0.0)
                cm = a.groupby("team")[c].mean().reindex(teams).to_numpy(float) if len(a) else np.full(len(teams), np.nan)
                pm = prev_final[c].reindex(teams).to_numpy(float) if prev_final is not None and c in prev_final else \
                    np.full(len(teams), np.nan)
                pm = np.where(np.isnan(pm), lv, (1 - prior_shrink) * pm + prior_shrink * lv)
                v = np.where(np.isnan(cm), pm, wc * cm + (1 - wc) * pm)
                if c in SCHEME and c in coverage_off.get(int(s), set()):
                    v = np.full(len(teams), lv)
                res[c] = v
            res["funnel"] = res["pass_epa_adj"] - res["rush_epa_adj"]
            rows.append(res)
        fa = schedule_adjust(sd, ADJUSTED)
        prev_final = fa.groupby("team")[[f"{x}_adj" for x in ADJUSTED] + SCHEME].mean()
    out = pd.concat(rows, ignore_index=True)
    for c in SCHEME:                                     # seasons without the data -> league average (feature off)
        out[c] = out[c].fillna(league_scheme[c])
    return out


def coverage_status(dg: pd.DataFrame, season: int, min_charted: float = 0.9) -> dict:
    """Is coverage charting usable for `season`? man/zone needs participation; blitz needs FTN on >=90% of dropbacks."""
    sd = dg[dg["season"] == season]
    if sd.empty:
        return {"man_rate": False, "blitz_rate": False, "ftn_charted_share": 0.0}
    charted = float(sd["charted"].sum() / max(sd["dropbacks"].sum(), 1))
    return {"man_rate": bool(sd["man_rate"].notna().mean() > 0.5), "blitz_rate": charted >= min_charted,
            "ftn_charted_share": round(charted, 3)}
