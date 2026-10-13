"""Walk-forward backtest harness (FFA protocol).

Protocol: each week, evaluate on the top-20 QB/TE and top-40 RB/WR by projection, excluding players who did
not play. All sources are scored on ONE common pool (ranked by the simple-average consensus) so the
comparison is apples to apples. Metrics: MAE, RMSE, bias, weekly-MAE CV, within-position Spearman,
calibration slope (actual ~ a + b*proj), p10/p90 coverage when percentiles exist.

Leakage rule: the blend for week (s, w) may use only data from seasons < s (FFA inverse-MAE weights use all
prior seasons). Nothing timestamped after (s, w) is read; tests perturb the future and assert no change.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.stats import spearmanr

from core.projections.params import Params

KEY = ["season", "week", "player"]


def consensus_reference(history: pd.DataFrame) -> pd.DataFrame:
    """Simple-average projection per (season, week, player) — used to pick the common evaluation pool."""
    return (history.groupby(KEY + ["position"], as_index=False)["points"].mean()
            .rename(columns={"points": "proj_ref"}))


def evaluation_pool(history: pd.DataFrame, actuals: pd.DataFrame, pool_size: dict[str, int]) -> pd.DataFrame:
    """Rows (season, week, player, position) in the FFA pool: top-N by consensus, inactive players removed."""
    ref = consensus_reference(history)
    act = actuals[KEY + ["dk_points", "active"]]
    ref = ref.merge(act, on=KEY, how="inner")
    ref = ref[ref["active"].astype(bool) & ref["position"].isin(pool_size)]
    ref = ref.sort_values("proj_ref", ascending=False)
    ref["rank"] = ref.groupby(["season", "week", "position"]).cumcount() + 1
    ref = ref[ref["rank"] <= ref["position"].map(pool_size)]
    return ref[KEY + ["position", "dk_points"]]


def source_errors(history: pd.DataFrame, actuals: pd.DataFrame, pool_size: dict[str, int],
                  ref_history: pd.DataFrame | None = None) -> pd.DataFrame:
    """Per-row errors on the common pool. ref_history (default: history) defines the pool, so derived rows
    such as the blend can be scored on exactly the raw sources' pool."""
    pool = evaluation_pool(history if ref_history is None else ref_history, actuals, pool_size)
    cols = KEY + ["source", "points"] + [c for c in ("p10", "p90") if c in history.columns]
    e = pool.merge(history[cols], on=KEY, how="inner")
    e["err"] = e["points"] - e["dk_points"]
    return e


def metrics(errors: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for (src, pos), g in errors.groupby(["source", "position"]):
        weekly = g.groupby(["season", "week"])["err"].apply(lambda x: x.abs().mean())
        sp = [spearmanr(w["points"], w["dk_points"]).statistic for _, w in g.groupby(["season", "week"])
              if len(w) > 2 and w["points"].nunique() > 1]
        b = np.polyfit(g["points"], g["dk_points"], 1)[0] if g["points"].nunique() > 1 else np.nan
        r = {"source": src, "position": pos, "n": len(g), "mae": g["err"].abs().mean(),
             "rmse": float(np.sqrt((g["err"] ** 2).mean())), "bias": g["err"].mean(),
             "weekly_mae_cv": weekly.std() / weekly.mean() if len(weekly) > 1 else np.nan,
             "spearman": float(np.nanmean(sp)) if sp else np.nan, "calibration_slope": b}
        if "p10" in g and g["p10"].notna().any():
            r["below_p10"] = float((g["dk_points"] < g["p10"]).mean())
            r["above_p90"] = float((g["dk_points"] > g["p90"]).mean())
        rows.append(r)
    return pd.DataFrame(rows).round(4)


def inverse_mae_weights(history: pd.DataFrame, actuals: pd.DataFrame, pool_size: dict[str, int],
                        sources: list[str], positions: list[str]) -> dict[str, dict[str, float]]:
    """FFA weighting: w = 1/MAE over all supplied (prior-season) data, normalized within position.

    A source with no history at a position gets the mean raw weight of the others (neutral entry).
    No history at all -> equal weights.
    """
    out: dict[str, dict[str, float]] = {}
    m = metrics(source_errors(history, actuals, pool_size)) if len(history) else pd.DataFrame()
    for pos in positions:
        raw = {}
        if len(m):
            mp = m[m["position"] == pos].set_index("source")["mae"]
            raw = {s: 1.0 / mp[s] for s in sources if s in mp.index and mp[s] > 0}
        if not raw:
            out[pos] = {s: 1.0 / len(sources) for s in sources}
            continue
        fill = float(np.mean(list(raw.values())))
        raw = {s: raw.get(s, fill) for s in sources}
        tot = sum(raw.values())
        out[pos] = {s: v / tot for s, v in raw.items()}
    return out


def blend_week(week_rows: pd.DataFrame, weights: dict[str, dict[str, float]]) -> pd.DataFrame:
    """Weighted mean of source points per player (weights renormalized over the sources present)."""
    r = week_rows[KEY + ["position", "source", "points"]].copy()
    r["w"] = [weights.get(p, {}).get(s, 0.0) for p, s in zip(r["position"], r["source"])]
    r["wp"] = r["w"] * r["points"]
    g = r.groupby(KEY + ["position"], as_index=False)[["wp", "w", "points"]].agg(
        wp=("wp", "sum"), w=("w", "sum"), mean=("points", "mean"))
    g["points"] = np.where(g["w"] > 0, g["wp"] / g["w"].where(g["w"] > 0, 1), g["mean"])
    return g[KEY + ["position", "points"]]


def walk_forward(history: pd.DataFrame, actuals: pd.DataFrame, params: Params,
                 label: str = "blend") -> pd.DataFrame:
    """Append walk-forward blend rows (source=label) and a simple average (source='consensus_avg')."""
    pool_size = params.get("validation.pool_size")
    sources = sorted(history["source"].unique())
    positions = sorted(history["position"].unique())
    out = [history]
    weight_log = []
    for season in sorted(history["season"].unique()):
        prior_h = history[history["season"] < season]
        prior_a = actuals[actuals["season"] < season]
        w = inverse_mae_weights(prior_h, prior_a, pool_size, sources, positions)
        for pos, ws in w.items():
            for s, v in ws.items():
                weight_log.append({"season": season, "position": pos, "source": s, "weight": v})
        cur = history[history["season"] == season]
        for _, wk in cur.groupby("week"):
            out.append(blend_week(wk, w).assign(source=label))
            eq = {p: {s: 1.0 for s in sources} for p in positions}
            out.append(blend_week(wk, eq).assign(source="consensus_avg"))
    res = pd.concat(out, ignore_index=True)
    res.attrs["weights"] = pd.DataFrame(weight_log)
    return res


def run_backtest(history: pd.DataFrame, actuals: pd.DataFrame, params: Params) -> dict:
    """Full walk-forward run: blended history, errors, metrics, the accuracy-bar report and weights."""
    wf = walk_forward(history, actuals, params)
    pool_size = params.get("validation.pool_size")
    errs = source_errors(wf, actuals, pool_size, ref_history=history)
    # Score seasons that had prior-season history (their blend weights were actually learned).
    seasons = sorted(history["season"].unique())
    eval_seasons = seasons[1:] if len(seasons) > 1 else seasons
    m = metrics(errs[errs["season"].isin(eval_seasons)])
    return {"projections": wf, "errors": errs, "metrics": m, "report": accuracy_report(m, params),
            "weights": wf.attrs["weights"], "eval_seasons": eval_seasons}


def accuracy_report(m: pd.DataFrame, params: Params, blend: str = "blend",
                    consensus: str = "consensus_avg") -> pd.DataFrame:
    bar = params.get("validation.mae_bar")
    need = params.get("validation.beat_consensus_by")
    rows = []
    for pos, lim in bar.items():
        b = m[(m["source"] == blend) & (m["position"] == pos)]
        c = m[(m["source"] == consensus) & (m["position"] == pos)]
        if b.empty:
            continue
        bm = float(b["mae"].iloc[0])
        cm = float(c["mae"].iloc[0]) if len(c) else np.nan
        rows.append({"position": pos, "blend_mae": bm, "bar": lim, "meets_bar": bm <= lim,
                     "consensus_mae": cm, "improvement": (cm - bm) / cm if cm == cm else np.nan,
                     "beats_consensus_1pct": bool(cm == cm and (cm - bm) / cm >= need)})
    return pd.DataFrame(rows).round(4)


def biggest_misses(errors: pd.DataFrame, source: str, season: int, week: int, n: int = 10,
                   stat_actuals: pd.DataFrame | None = None, stat_proj: pd.DataFrame | None = None) -> pd.DataFrame:
    """Ten biggest misses for a week. If stat lines are supplied for both projection and actual, attribute
    each miss to volume (receptions), efficiency (yards) or TD. (Inactive players are outside the pool.)"""
    e = errors[(errors["source"] == source) & (errors["season"] == season) & (errors["week"] == week)].copy()
    e["abs_err"] = e["err"].abs()
    e = e.sort_values("abs_err", ascending=False).head(n)
    if stat_actuals is not None and stat_proj is not None:
        def part(df, cols, mult):
            return sum(df.get(c, 0) * k for c, k in zip(cols, mult))
        a = e[KEY].merge(stat_actuals, on=KEY, how="left").fillna(0)
        p = e[KEY].merge(stat_proj, on=KEY, how="left").fillna(0)
        e["d_volume"] = (part(a, ["rec"], [1]) - part(p, ["rec"], [1])).to_numpy()
        e["d_yards"] = (part(a, ["pass_yds", "rush_yds", "rec_yds"], [0.04, 0.1, 0.1])
                        - part(p, ["pass_yds", "rush_yds", "rec_yds"], [0.04, 0.1, 0.1])).to_numpy()
        e["d_td"] = (part(a, ["pass_td", "rush_td", "rec_td"], [4, 6, 6])
                     - part(p, ["pass_td", "rush_td", "rec_td"], [4, 6, 6])).to_numpy()
        e["attribution"] = e[["d_volume", "d_yards", "d_td"]].abs().idxmax(axis=1).str[2:]
    return e


def main(argv=None) -> None:
    import argparse
    from pathlib import Path

    from core.projections.sources import read_actuals, read_history

    ap = argparse.ArgumentParser(description="Walk-forward projection backtest (FFA protocol)")
    ap.add_argument("--history", required=True, help="season,week,source,player,position,points")
    ap.add_argument("--actuals", required=True, help="season,week,player,position,dk_points[,active]")
    ap.add_argument("--sport", default="nfl")
    ap.add_argument("--out", default="data/backtest")
    a = ap.parse_args(argv)
    params = Params(a.sport)
    res = run_backtest(read_history(a.history), read_actuals(a.actuals), params)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    for k in ("metrics", "report", "weights"):
        res[k].to_csv(out / f"{k}.csv", index=False)
    pd.set_option("display.width", 200)
    print(res["metrics"].pivot(index="source", columns="position", values="mae").round(3))
    print(res["report"].to_string(index=False))
    print(f"wrote {out}/metrics.csv, report.csv, weights.csv")


if __name__ == "__main__":
    main()
