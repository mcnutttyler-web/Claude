"""Weekly scorecard (review Q8): measure the process every week, because ROI is too noisy at $50/week.

Run Tuesday (after nflverse has Monday night's game):
    python scripts/weekly_scorecard.py 2026 6

Reads data/archive/<season>/w<NN>/ (my_projections.csv, standings_*.csv, cash_lineups.csv, snapshots/) plus
nflverse play-by-play for actual DK points, and the tracking log for cash predictions/results. Writes
scorecard.md into that folder and appends one row per metric to data/archive/scorecard_history.csv.

Sections
  1 projection quality   MAE / bias / relative MAE by position for model, calibrated model, each source (DFF, OWS),
                         consensus and the final projection — all on the SAME pool (top-20 QB/TE, top-40 RB/WR by
                         final projection, players who played)
  2 coverage             share of actuals above p90 / above p85 / below p10 (targets 10% / 15% / 10%)
  3 ownership            MAE (pts) of each ownership column vs actual %Drafted (contest-size weighted), and the
                         chalk check (top-10 projected: actual - projected)
  4 cash                 predicted P(win) vs results for the week (Brier), sim lineup vs max-median shadow lineup
  5 news check           Saturday -> Sunday snapshot: did the model's disagreement with Saturday consensus point the
                         way consensus later moved?
Single weeks are noise — read the history file's rolling averages (4+ weeks) before changing anything.
"""
from __future__ import annotations

import glob
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

from core.archive import DEFAULT_ROOT, week_dir
from core.names import match_players

POOL = {"QB": 20, "RB": 40, "WR": 40, "TE": 20}
HISTORY = DEFAULT_ROOT / "scorecard_history.csv"


# ------------------------------------------------------------------------------------------------ actuals
def actual_points(season: int, week: int, aliases: dict) -> pd.DataFrame:
    """name, team, position, dk for every player with a stat that week, plus DST rows (approximate, see below)."""
    from core.matchup.data import build_season
    from core.projections import nflverse
    d = build_season(season, aliases)
    pg = d["player_games"]
    pg = pg[pg["week"] == week][["name", "team", "position", "dk"]].copy()
    dst = dst_points(season, week, aliases, nflverse)
    return pd.concat([pg, dst], ignore_index=True)


def dst_points(season: int, week: int, aliases: dict, nflverse) -> pd.DataFrame:
    """DK DST points from play-by-play: sacks 1, INT 2, fumble rec 2, return/defensive TD 6, safety 2, blocked kick 2,
    plus the points-allowed tier from the opponent's final score (approximation: DK excludes points the offense
    didn't score against the defense, e.g. pick-sixes thrown by the DST's own offense)."""
    from core.names import normalize_team
    p = pd.read_parquet(nflverse.path_for("pbp", season))
    p = p[(p["season_type"] == "REG") & (p["week"] == week)]
    if p.empty:
        return pd.DataFrame(columns=["name", "team", "position", "dk"])
    rows = []
    for (gid, home, away), g in p.groupby(["game_id", "home_team", "away_team"]):
        final = g.sort_values("play_id").iloc[-1]
        score = {home: final["total_home_score"], away: final["total_away_score"]}
        for team, opp in ((home, away), (away, home)):
            dg = g[g["defteam"] == team]
            sacks = dg["sack"].fillna(0).sum()
            ints = dg["interception"].fillna(0).sum()
            fum = dg["fumble_lost"].fillna(0).sum()
            tds = (g["td_team"] == team).sum() - (g[(g["posteam"] == team)]["touchdown"].fillna(0).sum())
            saf = dg["safety"].fillna(0).sum()
            blk = ((g["field_goal_result"] == "blocked") | (g["extra_point_result"] == "blocked")) & (g["defteam"] == team)
            pa = float(score[opp])
            tier = 10 if pa == 0 else 7 if pa <= 6 else 4 if pa <= 13 else 1 if pa <= 20 else 0 if pa <= 27 \
                else -1 if pa <= 34 else -4
            pts = sacks + 2 * ints + 2 * fum + 6 * max(tds, 0) + 2 * saf + 2 * blk.sum() + tier
            rows.append({"name": normalize_team(team, aliases), "team": normalize_team(team, aliases),
                         "position": "DST", "dk": float(pts)})
    return pd.DataFrame(rows)


def attach_actuals(pool: pd.DataFrame, actual: pd.DataFrame, aliases: dict) -> pd.DataFrame:
    """pool (my_projections.csv) + `actual` (NaN = did not record a stat / not played)."""
    sal = pool.assign(id=pool.index.astype(str), position=pool["pos"])[["id", "name", "team", "position"]]
    a = actual.copy()
    m = match_players(sal, a, aliases, {"DST"})
    m = m[m["dk_index"] >= 0]
    out = pool.copy()
    out["actual"] = np.nan
    vals = m.groupby("dk_index")["dk"].sum()
    out.loc[out.index[vals.index.astype(int)], "actual"] = vals.to_numpy()
    # DST rows in the pool are named like "Ravens"/"Baltimore Ravens": match by team
    dst = actual[actual["position"] == "DST"].set_index("team")["dk"]
    is_dst = out["pos"].isin(["DST", "D", "DEF"])
    out.loc[is_dst, "actual"] = out.loc[is_dst, "team"].map(dst)
    return out


# --------------------------------------------------------------------------------------------- sections
def projection_table(p: pd.DataFrame) -> pd.DataFrame:
    played = p[p["actual"].notna()]
    pool = pd.concat([played[played["pos"] == pos].sort_values("proj", ascending=False).head(n)
                      for pos, n in POOL.items()])
    cols = [c for c in p.columns if c.startswith("proj")]
    rows = []
    for pos, g in pool.groupby("pos"):
        for c in cols:
            x = g[[c, "actual"]].dropna()
            if len(x) < 5:
                continue
            e = x[c] - x["actual"]
            rows.append({"pos": pos, "projection": c, "n": len(x), "MAE": e.abs().mean(), "bias": e.mean(),
                         "rel_MAE": e.abs().mean() / max(x[c].mean(), 1e-9)})
    return pd.DataFrame(rows).round(3)


def coverage_table(p: pd.DataFrame) -> pd.DataFrame:
    x = p.dropna(subset=["actual", "p10", "p90"]) if {"p10", "p90"} <= set(p.columns) else pd.DataFrame()
    if x.empty:
        return pd.DataFrame()
    x = x[x["proj"] >= 3]
    rows = []
    for pos, g in x.groupby("pos"):
        r = {"pos": pos, "n": len(g), "above_p90": (g["actual"] > g["p90"]).mean(), "below_p10": (g["actual"] < g["p10"]).mean()}
        if "p85" in g:
            r["above_p85"] = (g["actual"] > g["p85"]).mean()
        rows.append(r)
    return pd.DataFrame(rows).round(3)


def actual_ownership(folder: Path) -> pd.DataFrame | None:
    """name_key, own (0-1) averaged over the week's standings files, weighted by contest size (entries)."""
    from core.projections.ownership_fit import parse_standings
    parts = []
    for f in sorted(folder.glob("standings_*.csv")):
        try:
            o = parse_standings(str(f))
        except ValueError:
            continue
        n = max(int(pd.read_csv(f, usecols=[0]).iloc[:, 0].notna().sum()), 1)
        parts.append(o.assign(w=n))
    if not parts:
        return None
    d = pd.concat(parts)
    return d.groupby("name_key").apply(lambda g: np.average(g["own"], weights=g["w"]),
                                       include_groups=False).rename("own").reset_index()


def ownership_table(p: pd.DataFrame, own: pd.DataFrame | None) -> tuple[pd.DataFrame, pd.DataFrame]:
    from core.projections.ownership_fit import norm_name
    if own is None:
        return pd.DataFrame(), pd.DataFrame()
    x = p.assign(name_key=p["name"].map(norm_name)).merge(own, on="name_key", how="left")
    x["own"] = 100 * x["own"].fillna(0.0)
    cols = [c for c in ("own_source", "own_gpp", "own_heuristic") if c in x]
    rows, chalk = [], []
    for c in cols:
        rel = (x["own"] >= 3) | (x[c].fillna(0) >= 3)
        e = (x.loc[rel, c].fillna(0) - x.loc[rel, "own"])
        rows.append({"ownership": c, "n": int(rel.sum()), "MAE_pts": e.abs().mean(), "bias_pts": e.mean()})
        top = x.sort_values(c, ascending=False).head(10)
        chalk.append({"ownership": c, "top10_projected": top[c].mean(), "top10_actual": top["own"].mean()})
    return pd.DataFrame(rows).round(2), pd.DataFrame(chalk).round(2)


def cash_table(season: int, week: int, folder: Path, p: pd.DataFrame, since: pd.Timestamp | None) -> dict:
    from core.tracking import load_log
    out = {}
    log = load_log()
    if len(log):
        log["logged_at"] = pd.to_datetime(log["logged_at"], errors="coerce", utc=True)
        cash = log[log["contest_type"].astype(str).str.lower().isin(["h2h", "5050", "double_up", "cash"])
                   & log["settled"].astype(str).str.lower().isin(["true", "1"])]
        if since is not None:
            cash = cash[cash["logged_at"] >= since]
        if len(cash):
            pw = pd.to_numeric(cash["pred_p_win"], errors="coerce")
            won = cash["cashed"].astype(str).str.lower().isin(["true", "1"]).astype(float)
            ok = pw.notna()
            out.update({"cash_entries": int(len(cash)), "pred_win_rate": float(pw[ok].mean()) if ok.any() else np.nan,
                        "actual_win_rate": float(won.mean()),
                        "brier": float(((pw[ok] - won[ok]) ** 2).mean()) if ok.any() else np.nan})
    lf = folder / "cash_lineups.csv"
    if lf.exists():
        lu = pd.read_csv(lf)
        pts = p.set_index("name")["actual"]
        for kind, g in lu.groupby("kind"):
            out[f"{kind}_points"] = float(pts.reindex(g["name"]).sum())
            out[f"{kind}_missing"] = int(pts.reindex(g["name"]).isna().sum())
        kinds = list(lu["kind"].unique())
        if len(kinds) == 2:
            a, b = (set(lu.loc[lu["kind"] == k, "name"]) for k in kinds)
            out["sim_vs_shadow_overlap"] = len(a & b)
    return out


def news_check(folder: Path) -> dict:
    snaps = sorted((folder / "snapshots").glob("*/my_projections.csv"))
    if len(snaps) < 2:
        return {}
    first, last = pd.read_csv(snaps[0]), pd.read_csv(snaps[-1])
    cc = "proj_consensus" if "proj_consensus" in first and "proj_consensus" in last else "proj_dff"
    if cc not in first or cc not in last or "proj_model" not in first:
        return {}
    x = first[["name", "proj_model", cc]].merge(last[["name", cc]], on="name", suffixes=("", "_final"))
    x["model_lean"] = x["proj_model"] - x[cc]
    x["cons_move"] = x[f"{cc}_final"] - x[cc]
    m = x[(x["model_lean"].abs() > 1) & (x["cons_move"].abs() > 0.5)]
    if m.empty:
        return {"news_moves": 0}
    return {"news_moves": int(len(m)), "model_called_direction": float((np.sign(m["model_lean"]) ==
                                                                        np.sign(m["cons_move"])).mean()),
            "snapshots": f"{snaps[0].parent.name} -> {snaps[-1].parent.name}"}


def md_table(df: pd.DataFrame) -> str:
    """Markdown table without the optional `tabulate` dependency."""
    if df is None or not len(df):
        return ""
    cols = list(df.columns)
    fmt = lambda v: f"{v:.3f}" if isinstance(v, float) else str(v)
    lines = ["| " + " | ".join(cols) + " |", "|" + "---|" * len(cols)]
    lines += ["| " + " | ".join(fmt(v) for v in row) + " |" for row in df.itertuples(index=False)]
    return "\n".join(lines)


# ----------------------------------------------------------------------------------------------- report
def build(season: int, week: int, aliases: dict, root: Path = DEFAULT_ROOT) -> tuple[str, list[dict]]:
    folder = week_dir(season, week, root)
    pool = pd.read_csv(folder / "my_projections.csv")
    p = attach_actuals(pool, actual_points(season, week, aliases), aliases)
    pt, cov = projection_table(p), coverage_table(p)
    own_t, chalk = ownership_table(p, actual_ownership(folder))
    since = pd.Timestamp(date.today(), tz="UTC") - pd.Timedelta(days=10)
    cash, news = cash_table(season, week, folder, p, since), news_check(folder)
    md = [f"# Scorecard — {season} week {week}", "",
          f"Players with actuals: {int(p['actual'].notna().sum())} of {len(p)} in the pool. "
          "One week is noise: compare 4+ week averages in scorecard_history.csv.", "",
          "## 1. Projection quality (same pool for every column)", md_table(pt) if len(pt) else "_none_",
          "", "## 2. Outcome-range coverage (targets: above p90 ≈ 10%, above p85 ≈ 15%, below p10 ≈ 10%)",
          md_table(cov) if len(cov) else "_no percentiles in the pool (build with sims on)_", "",
          "## 3. Ownership vs actual %Drafted (players ≥3% actual or projected)",
          md_table(own_t) if len(own_t) else "_no standings archived yet_",
          "", md_table(chalk) if len(chalk) else "", "",
          "## 4. Cash", "\n".join(f"- {k}: {round(v, 3) if isinstance(v, float) else v}" for k, v in cash.items())
          or "_no logged cash entries / cash_lineups.csv this week_", "",
          "## 5. News check (Saturday snapshot → Sunday final)",
          "\n".join(f"- {k}: {round(v, 3) if isinstance(v, float) else v}" for k, v in news.items())
          or "_needs two snapshots (archive Saturday and again Sunday)_"]
    hist = []
    for r in pt.to_dict("records"):
        hist.append({"season": season, "week": week, "section": "projection", "key": f"{r['pos']}:{r['projection']}",
                     "MAE": r["MAE"], "bias": r["bias"], "n": r["n"]})
    for r in cov.to_dict("records"):
        hist.append({"season": season, "week": week, "section": "coverage", "key": r["pos"],
                     "above_p90": r["above_p90"], "below_p10": r["below_p10"], "n": r["n"]})
    for r in own_t.to_dict("records"):
        hist.append({"season": season, "week": week, "section": "ownership", "key": r["ownership"],
                     "MAE": r["MAE_pts"], "bias": r["bias_pts"], "n": r["n"]})
    if cash:
        hist.append({"season": season, "week": week, "section": "cash", "key": "week", **cash})
    if news:
        hist.append({"season": season, "week": week, "section": "news", "key": "week", **news})
    return "\n".join(md) + "\n", hist


def write(season: int, week: int, aliases: dict, root: Path = DEFAULT_ROOT) -> Path:
    md, hist = build(season, week, aliases, root)
    out = week_dir(season, week, root) / "scorecard.md"
    out.write_text(md)
    h = Path(root) / "scorecard_history.csv"
    old = pd.read_csv(h) if h.exists() else pd.DataFrame()
    if len(old):
        old = old[~((old["season"] == season) & (old["week"] == week))]
    pd.concat([old, pd.DataFrame(hist)], ignore_index=True).to_csv(h, index=False)
    return out
