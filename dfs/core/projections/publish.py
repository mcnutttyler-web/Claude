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
from core.projections.distributions import simulate
from core.projections.dst import dst_model_rows
from core.projections.market import market_rows, read_props
from core.projections.ownership import classic_ownership, showdown_ownership
from core.projections.vegas import consensus_lines, read_odds, team_environment
from core.projections.weather import apply_weather, read_weather
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
    sims: object = None             # distributions.SimResult when outcomes were simulated


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
    props: str | Path | None = None,
    weather: str | Path | None = None,
    dst_inputs: str | Path | None = None,
    simulate_outcomes: bool = True,
    n_sims: int | None = None,
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
    rows = pd.concat(rows, ignore_index=True) if rows else pd.DataFrame(columns=["dk_index", "source", "component",
                                                                                 "points"])

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

    # Vegas environment (needed by the DST model).
    env = None
    if odds is not None:
        env = team_environment(consensus_lines(read_odds(odds, sport.team_aliases), params.get("vegas.book_weights")))
        missing = sorted(set(slate["team"]) - set(env["team"]))
        if missing:
            warnings.append(f"no odds for teams {missing}")
    else:
        warnings.append("no odds file: team_total / game_total / spread left empty")

    # Market component from props (secondary stats filled from the consensus stat blend where available).
    market_extra = pd.DataFrame()
    int_by_team: dict[str, float] = {}
    if props is not None:
        pre = blend(rows, slate, params, weights).set_index("dk_index") if len(rows) else None
        mrows, mplayers, mw = market_rows(read_props(props), slate, sport, params, pre)
        warnings.extend(mw)
        if len(mrows):
            rows = pd.concat([rows, mrows], ignore_index=True)
            keep = [c for c in mrows.columns if c.startswith(("sd_", "median_", "p_"))]
            market_extra = mrows.set_index("dk_index")[keep]
            for i, mp in mplayers.items():
                if slate.at[i, "position"] == "QB" and "int" in mp.lambdas:
                    int_by_team[slate.at[i, "team"]] = mp.lambdas["int"]

    # DST model component.
    dst_detail: dict[int, dict] = {}
    if env is not None and sport.name == "nfl":
        di = pd.read_csv(dst_inputs) if dst_inputs is not None else None
        drows, dst_detail = dst_model_rows(slate, env, params, sport.scoring_cfg, di, int_by_team)
        if len(drows):
            rows = pd.concat([rows, drows], ignore_index=True)

    b = blend(rows, slate, params, weights)
    t = slate.copy()
    t = t.join(b.set_index("dk_index"), how="left")
    if len(market_extra):
        t = t.join(market_extra, how="left", rsuffix="_mkt")
    t["dk_id"] = t["id"]
    t["player_id"] = t["id"]          # nflverse gsis_id mapping arrives with the P3 bottom-up model
    if env is not None:
        t = t.join(env.set_index("team")[["spread", "game_total", "team_total"]], on="team")

    # Injuries -> status, p_play.
    t["status"] = ""
    if "status" in rows.columns:
        st = rows.dropna(subset=["status"]).astype({"status": str})
        st = st[st["status"].str.strip() != ""].groupby("dk_index")["status"].first()
        t.loc[st.index, "status"] = st.str.upper()
    from core.projections.sources import p_play as _p_play
    t["p_play"] = [_p_play(s, "", params) for s in t["status"]]
    t.loc[t["position"].isin(sport.team_unit_positions) & (t["status"] == ""), "p_play"] = 1.0
    if injuries is not None:
        inj = read_injuries(injuries, slate, sport, params).set_index("dk_index")
        t.loc[inj.index, "status"] = inj["status"]
        t.loc[inj.index, "p_play"] = inj["p_play"]

    # Weather (outdoor games).
    t["is_dome"], t["wind_mph"], t["precip"] = pd.Series(pd.NA, index=t.index, dtype=object), np.nan, ""
    if weather is not None:
        t, wnotes = apply_weather(t, read_weather(weather), params)
        warnings.extend(wnotes)

    t["override_flag"] = False
    if overrides is not None:
        ov = read_overrides(overrides, slate, sport)
        for r in ov.itertuples():
            col = r.field
            val = r.value if col == "status" else float(r.value)
            t.loc[r.dk_index, col] = val
            if col == "status":
                t.loc[r.dk_index, "p_play"] = _p_play(val, "", params)
            t.loc[r.dk_index, "override_flag"] = True

    # Outcome distributions.
    sim = None
    if simulate_outcomes and t["mean"].notna().any():
        sim = simulate(t.assign(dk_index=t.index), params, sport.scoring_cfg, n_sims, seed, dst_detail)
        s = sim.summary.set_index("dk_index")
        for c in ("median", "p10", "p25", "p75", "p90", "std", "p_value_cash", "p_value_gpp"):
            if c in s:
                t.loc[s.index, c] = s[c]
        median_ov = ov[ov["field"] == "median"] if overrides is not None else pd.DataFrame()
        for r in median_ov.itertuples():
            t.loc[r.dk_index, "median"] = float(r.value)
    else:
        t["median"] = t["mean"]
        t["p10"] = t.get("floor", np.nan)
        t["p90"] = t.get("ceiling", np.nan)
    out_rows = t["p_play"].fillna(1.0) <= 0
    for c in ("mean", "median", "p10", "p25", "p75", "p90", "std", "p_value_cash", "p_value_gpp"):
        if c in t:
            t.loc[out_rows, c] = 0.0
    for stat, col in (("pass_yds", "p_300_pass"), ("rush_yds", "p_100_rush"), ("rec_yds", "p_100_rec")):
        if col not in t:
            t[col] = np.nan

    # Ownership: published sources first, v1 heuristic for anything missing.
    t["own_gpp"] = t.get("ownership", np.nan)
    t["own_cash"] = t.get("cash_ownership", np.nan)
    t["own_cpt"] = t.get("cpt_ownership", np.nan)
    pool = t["mean"].notna() & (t["mean"] > 0)
    if mode == "classic":
        for col, fld in (("own_gpp", "gpp"), ("own_cash", "cash")):
            if t.loc[pool, col].isna().all():
                t.loc[pool, col] = classic_ownership(t[pool], params, fld)
                warnings.append(f"{col}: v1 heuristic estimate (directional)")
    else:
        if t.loc[pool, "own_cpt"].isna().all():
            cpt, flex = showdown_ownership(t[pool], params, "gpp")
            t.loc[pool, "own_cpt"], t.loc[pool, "own_flex"] = cpt, flex
            warnings.append("own_cpt/own_flex: v1 heuristic estimate (directional)")

    try:
        t["role"] = sport.roles(t.assign(median=t["median"].fillna(0))).to_numpy()
    except Exception:  # roles need a median; never block publishing on a label
        t["role"] = t["position"]
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    ihash = _hash_inputs([salaries, odds, injuries, overrides, history, actuals, props, weather, dst_inputs]
                         + [s.path for s in sources])
    t["updated_at"], t["input_hash"], t["seed"] = now, ihash, seed

    cols = SCHEMA_IDENTITY + SCHEMA_STATS + SCHEMA_DST + SCHEMA_K + SCHEMA_POINTS + SCHEMA_OWN + SCHEMA_META
    for c in cols:
        if c not in t.columns:
            t[c] = np.nan
    extra = [c for c in ("floor", "ceiling") if c in t]
    table = t[cols + extra].copy()
    for c in ("floor", "ceiling"):
        if c not in table:
            table[c] = np.nan
    table = table.loc[:, ~table.columns.duplicated()]

    comps = sorted(rows["component"].unique()) if len(rows) else []
    log = {"updated_at": now, "input_hash": ihash, "seed": seed, "sport": sport.name, "mode": mode,
           "sources": [s.name for s in sources], "components": comps, "weight_method": weight_method,
           "weights": weights, "median_from_sims": sim is not None,
           "n_sims": int(sim.sims.shape[0]) if sim is not None else 0,
           "players": int(table["mean"].notna().sum()),
           "uncalibrated_parameters": params.uncalibrated(), "warnings": warnings}
    run = ProjectionRun(table, team_consistency(table), log, warnings)
    run.sims = sim
    return run


def lineup_csv(table: pd.DataFrame) -> pd.DataFrame:
    """The lineup generator's projections.csv (DK names so matching is exact)."""
    t = table[table["mean"].notna()]
    out = pd.DataFrame({
        "name": t["name"].str.strip(), "team": t["team"], "position": t["position"],
        "median": t["median"].round(3),
        "floor": t["p10"].where(t["p10"].notna(), t["floor"]), "ceiling": t["p90"].where(t["p90"].notna(), t["ceiling"]),
        "ownership": t["own_gpp"], "cash_ownership": t["own_cash"], "cpt_ownership": t["own_cpt"],
        "team_total": t["team_total"], "game_total": t["game_total"], "spread": t["spread"],
        "status": np.where(t["p_play"] <= 0, "O", t["status"].fillna("")),
        "p_play": t["p_play"],
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
    sim = getattr(run, "sims", None)
    if sim is not None:
        paths["sims"] = out / "sims.npz"
        ids = run.table.loc[sim.index, "dk_id"].astype(str).to_numpy()
        np.savez_compressed(paths["sims"], sims=sim.sims, dk_id=ids)
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
    ap.add_argument("--props", help="props.csv (book,name,team,market,line,over_odds,under_odds)")
    ap.add_argument("--weather", help="weather.csv (team,wind_mph,precip,dome)")
    ap.add_argument("--dst-inputs", help="dst_inputs.csv (team rates)")
    ap.add_argument("--n-sims", type=int, default=None)
    ap.add_argument("--no-sims", action="store_true")
    ap.add_argument("--seed", type=int, default=20261013)
    ap.add_argument("--out", default="data/published")
    a = ap.parse_args(argv)
    run = build_projections(a.salaries, load_source_specs(a.sources), a.sport, a.odds, a.injuries, a.overrides,
                            a.history, a.actuals, a.seed, props=a.props, weather=a.weather,
                            dst_inputs=a.dst_inputs, simulate_outcomes=not a.no_sims, n_sims=a.n_sims)
    paths = publish(run, a.out)
    for w in run.warnings:
        print("WARN", w)
    print(f"published {run.log['players']} players ({run.log['weight_method']} weights) -> {paths['csv']}")


if __name__ == "__main__":
    main()
