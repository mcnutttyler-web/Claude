"""Build and publish projections (P1: consensus blend + implied totals + injuries + overrides).

    python -m core.projections.publish --salaries data/sample/DKSalaries.csv \
        --sources data/sample/proj_sources/sources.yaml --odds data/sample/proj_sources/odds.csv \
        --injuries data/sample/proj_sources/injuries.csv --out data/published

Outputs:
    projections.parquet   full schema (§1); columns a later phase fills are present and NaN
    projections.csv       the lineup generator's input format (name, team, position, median, ...)
    run_log.json          seed, input hash, weights, uncalibrated parameters, warnings
"""
from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from core.ingest import read_dk_salaries
from core.projections import backtest
from core.projections.blend import blend
from core.projections.params import DEFAULT_PATH, Params
from core.projections.sources import (SourceSpec, load_source_specs, read_actuals, read_history,
                                      read_injuries, read_overrides, read_source)
from core.projections.vegas import consensus_lines, read_odds, team_environment
from sports.base import SportConfig, load_sport

SCHEMA_IDENTITY = ["player_id", "dk_id", "name", "team", "opp", "position", "salary", "game_id", "lock_time",
                   "status", "role", "is_dome", "wind_mph", "precip"]
SCHEMA_STATS = ["dropbacks", "pass_att", "completions", "pass_yds", "pass_td", "int", "sacks_taken", "rush_att",
                "rush_yds", "rush_td", "routes", "targets", "rec", "rec_yds", "rec_td", "fumble_lost", "two_pt"]
SCHEMA_DST = ["sacks", "def_int", "fum_rec", "def_td", "ret_td", "safety", "blocked_kick"] + \
    [f"p_pa_tier{k}" for k in range(7)]
SCHEMA_K = ["fga_0_39", "fga_40_49", "fga_50_plus", "fgm", "xp"]
SCHEMA_POINTS = ["mean", "median", "p10", "p25", "p75", "p90", "std", "p_value_cash", "p_value_gpp",
                 "p_300_pass", "p_100_rush", "p_100_rec"]
SCHEMA_OWN = ["own_gpp", "own_cash", "own_cpt", "own_flex"]
SCHEMA_META = ["source_breakdown", "n_sources", "source_sd", "confidence", "disagreement_flag", "override_flag",
               "p_play", "team_total", "game_total", "spread", "updated_at", "input_hash", "seed"]


@dataclass
class ProjectionRun:
    table: pd.DataFrame
    team_check: pd.DataFrame
    log: dict
    warnings: list[str] = field(default_factory=list)


def _hash_inputs(paths: list) -> str:
    h = hashlib.sha256()
    for p in paths:
        if p is None:
            continue
        h.update(Path(p).read_bytes())
    h.update(Path(DEFAULT_PATH).read_bytes())
    return h.hexdigest()[:16]


def team_consistency(table: pd.DataFrame) -> pd.DataFrame:
    """Σ projected offensive DK points per team vs its implied total. Diagnostic only in P1 (reconciliation
    to team budgets arrives with the bottom-up model in P3). Flags teams > 2 SD from the slate norm."""
    off = table[table["position"].isin(["QB", "RB", "WR", "TE"]) & table["mean"].notna()]
    g = off.groupby("team").agg(off_points=("mean", "sum"), team_total=("team_total", "first")).reset_index()
    g["pts_per_implied"] = g["off_points"] / g["team_total"]
    mu, sd = g["pts_per_implied"].mean(), g["pts_per_implied"].std()
    g["flag"] = (g["pts_per_implied"] - mu).abs() > 2 * sd if sd == sd and sd > 0 else False
    return g.round(3)


def build_projections(
    salaries: str | Path,
    sources: list[SourceSpec],
    sport: SportConfig | str = "nfl",
    odds: str | Path | None = None,
    injuries: str | Path | None = None,
    overrides: str | Path | None = None,
    history: str | Path | None = None,
    actuals: str | Path | None = None,
    seed: int = 20261013,
    params: Params | None = None,
) -> ProjectionRun:
    sport = load_sport(sport) if isinstance(sport, str) else sport
    params = params or Params(sport.name)
    warnings: list[str] = []
    slate, mode = read_dk_salaries(salaries, sport)

    rows, unmatched = [], []
    for spec in sources:
        good, bad = read_source(spec, slate, sport, params)
        rows.append(good)
        bad = bad[pd.to_numeric(bad["points"], errors="coerce").fillna(0) > 0]
        if len(bad):
            warnings.append(f"{spec.name}: {len(bad)} projected rows unmatched to DK "
                            f"(e.g. {', '.join(bad['name'].head(3))})")
            unmatched.append(bad.assign(source=spec.name))
    rows = pd.concat(rows, ignore_index=True)

    weights, weight_method = None, "equal"
    if history is not None and actuals is not None:
        h, a = read_history(history), read_actuals(actuals)
        names = [s.name for s in sources]
        h = h[h["source"].isin(names)]
        if len(h):
            weights = backtest.inverse_mae_weights(h, a, params.get("validation.pool_size"), names,
                                                   sorted(slate["position"].unique()))
            weight_method = "inverse_mae"
        else:
            warnings.append("history has none of the configured source names — using equal weights")

    b = blend(rows, slate, params, weights)
    t = slate.copy()
    t = t.join(b.set_index("dk_index"), how="left")
    t["dk_id"] = t["id"]
    t["player_id"] = t["id"]          # nflverse gsis_id mapping arrives with the P3 bottom-up model

    # Vegas environment.
    if odds is not None:
        lines = consensus_lines(read_odds(odds, sport.team_aliases), params.get("vegas.book_weights"))
        env = team_environment(lines)
        t = t.merge(env[["team", "spread", "game_total", "team_total"]], on="team", how="left")
        missing = sorted(set(t["team"]) - set(env["team"]))
        if missing:
            warnings.append(f"no odds for teams {missing}")
    else:
        warnings.append("no odds file: team_total / game_total / spread left empty")

    # Injuries -> status, p_play.
    t["status"] = ""
    if "status" in rows.columns:
        st = rows.dropna(subset=["status"]).astype({"status": str})
        st = st[st["status"].str.strip() != ""].groupby("dk_index")["status"].first()
        t.loc[st.index, "status"] = st.str.upper()
    from core.projections.sources import p_play as _p_play
    t["p_play"] = [_p_play(s, "", params) for s in t["status"]]
    if injuries is not None:
        inj = read_injuries(injuries, slate, sport, params).set_index("dk_index")
        t.loc[inj.index, "status"] = inj["status"]
        t.loc[inj.index, "p_play"] = inj["p_play"]

    t["own_gpp"] = t.get("ownership", np.nan)
    t["own_cash"] = t.get("cash_ownership", np.nan)
    t["own_cpt"] = t.get("cpt_ownership", np.nan)
    t["median"] = t["mean"]           # P1: no skew table yet (P2 distributions); flagged in run log
    t["p10"] = t.get("floor", np.nan)
    t["p90"] = t.get("ceiling", np.nan)

    t["override_flag"] = False
    if overrides is not None:
        ov = read_overrides(overrides, slate, sport)
        for r in ov.itertuples():
            col = r.field
            val = r.value if col == "status" else float(r.value)
            t.loc[r.dk_index, col] = val
            if col == "mean" and "median" not in set(ov.loc[ov["dk_index"] == r.dk_index, "field"]):
                t.loc[r.dk_index, "median"] = val
            if col == "status":
                t.loc[r.dk_index, "p_play"] = _p_play(val, "", params)
            t.loc[r.dk_index, "override_flag"] = True

    try:
        t["role"] = sport.roles(t.assign(median=t["median"].fillna(0))).to_numpy()
    except Exception:  # roles need a median; never block publishing on a label
        t["role"] = t["position"]
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    ihash = _hash_inputs([salaries, odds, injuries, overrides, history, actuals] + [s.path for s in sources])
    t["updated_at"], t["input_hash"], t["seed"] = now, ihash, seed
    t["is_dome"], t["wind_mph"], t["precip"] = np.nan, np.nan, np.nan

    cols = SCHEMA_IDENTITY + SCHEMA_STATS + SCHEMA_DST + SCHEMA_K + SCHEMA_POINTS + SCHEMA_OWN + SCHEMA_META
    for c in cols:
        if c not in t.columns:
            t[c] = np.nan
    table = t[cols + ["floor", "ceiling"] if "floor" in t else cols].copy()
    if "floor" not in table:
        table["floor"], table["ceiling"] = np.nan, np.nan
    table = table.loc[:, ~table.columns.duplicated()]

    log = {"updated_at": now, "input_hash": ihash, "seed": seed, "sport": sport.name, "mode": mode,
           "sources": [s.name for s in sources], "weight_method": weight_method,
           "weights": weights, "median_is_mean": True, "players": int(table["mean"].notna().sum()),
           "uncalibrated_parameters": params.uncalibrated(), "warnings": warnings}
    return ProjectionRun(table, team_consistency(table), log, warnings)


def lineup_csv(table: pd.DataFrame) -> pd.DataFrame:
    """The lineup generator's projections.csv (DK names so matching is exact)."""
    t = table[table["mean"].notna()]
    out = pd.DataFrame({
        "name": t["name"].str.strip(), "team": t["team"], "position": t["position"],
        "median": t["median"].round(3), "floor": t["floor"], "ceiling": t["ceiling"],
        "ownership": t["own_gpp"], "cash_ownership": t["own_cash"], "cpt_ownership": t["own_cpt"],
        "team_total": t["team_total"], "game_total": t["game_total"], "spread": t["spread"],
        "status": np.where(t["p_play"] <= 0, "O", t["status"].fillna("")),
    })
    num = out.select_dtypes("number").columns
    out[num] = out[num].round(4)
    return out.dropna(axis=1, how="all")


def publish(run: ProjectionRun, out_dir: str | Path) -> dict[str, Path]:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    paths = {"parquet": out / "projections.parquet", "csv": out / "projections.csv",
             "log": out / "run_log.json", "team_check": out / "team_check.csv"}
    tbl = run.table.copy()
    tbl["lock_time"] = tbl["lock_time"].astype(str)
    tbl.to_parquet(paths["parquet"], index=False)
    lineup_csv(run.table).to_csv(paths["csv"], index=False)
    run.team_check.to_csv(paths["team_check"], index=False)
    paths["log"].write_text(json.dumps(run.log, indent=2, default=str))
    return paths


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(description="Build and publish DK projections (P1)")
    ap.add_argument("--salaries", required=True)
    ap.add_argument("--sources", required=True, help="sources.yaml")
    ap.add_argument("--sport", default="nfl")
    ap.add_argument("--odds")
    ap.add_argument("--injuries")
    ap.add_argument("--overrides")
    ap.add_argument("--history", help="historical source projections (for inverse-MAE weights)")
    ap.add_argument("--actuals", help="historical actuals (for inverse-MAE weights)")
    ap.add_argument("--seed", type=int, default=20261013)
    ap.add_argument("--out", default="data/published")
    a = ap.parse_args(argv)
    run = build_projections(a.salaries, load_source_specs(a.sources), a.sport, a.odds, a.injuries, a.overrides,
                            a.history, a.actuals, a.seed)
    paths = publish(run, a.out)
    for w in run.warnings:
        print("WARN", w)
    print(f"published {run.log['players']} players ({run.log['weight_method']} weights) -> {paths['csv']}")


if __name__ == "__main__":
    main()
