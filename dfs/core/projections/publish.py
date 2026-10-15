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
SCHEMA_OWN = ["own_gpp", "own_cash", "own_cpt", "own_flex", "own_heuristic"]
SCHEMA_CAL = ["proj_model", "proj_dff", "proj_final", "proj_cal", "proj_source"]
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
    public_model: bool = True,
    nflverse_dir: str | Path | None = None,
    fetch_data: bool = False,
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

    from core.projections import nflverse
    nfl_dest = nflverse_dir or nflverse.DEFAULT_DIR
    if public_model and fetch_data and sport.name == "nfl":
        d0 = pd.Timestamp(min(x for x in slate["lock_time"] if x is not None and x == x))
        season = d0.year if d0.month >= 3 else d0.year - 1
        try:
            nflverse.fetch([season - 1, season], dest=nfl_dest, log=lambda m: None)
            nflverse.fetch_games(nfl_dest, log=lambda m: None)
        except Exception as e:
            warnings.append(f"nflverse download failed ({e}); using cached files if any")

    # Vegas environment (needed by the DST model and the bottom-up model).
    env = None
    if odds is not None:
        env = team_environment(consensus_lines(read_odds(odds, sport.team_aliases), params.get("vegas.book_weights")))
    else:
        env = env_from_sources(rows, slate)
        if env is not None:
            warnings.append("Vegas lines taken from the projection source's spread / total columns (no odds file)")
        elif sport.name == "nfl":
            env = nflverse.schedule_env(slate, nfl_dest, sport.team_aliases)
            if env is not None:
                warnings.append("Vegas lines taken from the nflverse schedule (no odds file) — check for late moves")
        if env is None:
            warnings.append("no odds file and no spread/total in the sources: team_total / game_total / spread left empty")
    if env is not None:
        missing = sorted(set(slate["team"]) - set(env["team"]))
        if missing:
            warnings.append(f"no odds for teams {missing}")

    # Bottom-up public model (nflverse play-by-play + Vegas).
    model = None
    status_early = early_status(rows, slate, sport, params, injuries)
    if public_model and env is not None and sport.name == "nfl":
        model, mw = run_public_model(slate, env, sport, params, status_early, nfl_dest)
        warnings.extend(mw)
        if model is not None and len(model.rows):
            rows = pd.concat([rows, model.rows], ignore_index=True)

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
        di = pd.read_csv(dst_inputs) if dst_inputs is not None else (model.dst_inputs if model is not None else None)
        drows, dst_detail = dst_model_rows(slate, env, params, sport.scoring_cfg, di, int_by_team,
                                           model.dropbacks if model is not None else None)
        if len(drows):
            rows = pd.concat([rows, drows], ignore_index=True)

    b = blend(rows, slate, params, weights)
    t = slate.copy()
    t = t.join(b.set_index("dk_index"), how="left")
    # 50/50 model + consensus with fallback, then per-position calibration (core/projections/recalibrate.py)
    t, cal, cw = final_calibration(t, params)
    warnings.extend(cw)
    if model is not None and len(model.rows):
        ref = model.rows
        if cal is not None:
            ref = calibrate_points(model.rows, slate, cal)
        t, sw = vegas_sanity(t, ref, params)
        warnings.extend(sw)
    if sport.name == "nfl":
        from core.matchup.apply import slate_multipliers
        from core.matchup.backtest import load_config
        mcfg = load_config()
        if mcfg.get("enabled"):
            mult, mnotes = slate_multipliers(slate, t["mean"], sport, mcfg)
            t["matchup_mult"] = mult.reindex(t.index).fillna(1.0)
            t["mean"] = t["mean"] * t["matchup_mult"]
            warnings.extend(mnotes)
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
        t["own_heuristic"] = np.nan
        t.loc[pool, "own_heuristic"] = classic_ownership(t[pool], params, "gpp")
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

    cols = SCHEMA_IDENTITY + SCHEMA_STATS + SCHEMA_DST + SCHEMA_K + SCHEMA_POINTS + SCHEMA_OWN + SCHEMA_CAL + SCHEMA_META
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
    if model is not None:
        n_mod = int((model.rows["points"] > 0).sum()) if len(model.rows) else 0
        log["public_model"] = {"teams": int(len(model.teams)), "players": n_mod,
                               "unmodeled": model.unmodeled, "notes": model.notes}
    tc = team_consistency(table)
    if model is not None and len(model.teams):
        tc = tc.merge(model.teams, on="team", how="outer")
    run = ProjectionRun(table, tc, log, warnings)
    run.sims = sim
    return run


def env_from_sources(rows: pd.DataFrame, slate: pd.DataFrame) -> pd.DataFrame | None:
    """Team environment from a projection source's spread / total columns (DailyFantasyFuel carries them)."""
    if not len(rows) or "game_total" not in rows or "spread" not in rows:
        return None
    r = rows.dropna(subset=["game_total", "spread"]).copy()
    if not len(r):
        return None
    r["team"] = slate.loc[r["dk_index"].astype(int), "team"].to_numpy()
    g = r.groupby("team")[["spread", "game_total"]].median()
    out = []
    for team, v in g.iterrows():
        one = slate[slate["team"] == team].iloc[0]
        out.append({"team": team, "opp": one["opp"], "game_id": one["game_id"], "spread": float(v["spread"]),
                    "game_total": float(v["game_total"]),
                    "team_total": float(v["game_total"]) / 2 - float(v["spread"]) / 2})
    return pd.DataFrame(out)


def early_status(rows: pd.DataFrame, slate: pd.DataFrame, sport: SportConfig, params: Params,
                 injuries) -> dict[int, str]:
    """Statuses known before blending (source injury columns, then injuries.csv) — the model needs them for
    redistributing an Out player's volume."""
    st: dict[int, str] = {}
    if len(rows) and "status" in rows.columns:
        x = rows.dropna(subset=["status"]).astype({"status": str})
        x = x[x["status"].str.strip() != ""]
        st.update({int(k): v.strip().upper() for k, v in x.groupby("dk_index")["status"].first().items()})
    if injuries is not None:
        inj = read_injuries(injuries, slate, sport, params)
        st.update({int(r.dk_index): str(r.status) for r in inj.itertuples()})
    return st


def run_public_model(slate, env, sport, params, status, dest):
    """Run the bottom-up model when nflverse files for the slate's season are on disk."""
    from core.projections import bottomup, nflverse
    warnings: list[str] = []
    d0 = pd.Timestamp(min(x for x in slate["lock_time"] if x is not None and x == x))
    season = d0.year if d0.month >= 3 else d0.year - 1
    if not nflverse.available(season, dest):
        warnings.append(f"no nflverse data for {season} in {dest} — own model skipped "
                        f"(run: python -m core.projections.nflverse --season {season})")
        return None, warnings
    cur = nflverse.load_season(season, before=d0.tz_localize(None) if d0.tzinfo else d0, dest=dest,
                               aliases=sport.team_aliases)
    if not len(cur["team_games"]):
        warnings.append(f"no {season} games played before the slate — own model uses last season only")
    prior = nflverse.load_season(season - 1, dest=dest, aliases=sport.team_aliases) \
        if nflverse.available(season - 1, dest) else None
    if not len(cur["team_games"]):
        if prior is None:
            return None, warnings
        cur, prior = prior, None
    model = bottomup.run_model(slate, env, cur, prior, sport, params, status)
    if model.unmodeled:
        warnings.append(f"own model: {len(model.unmodeled)} DK players have no nflverse history "
                        f"(consensus only), e.g. {', '.join(model.unmodeled[:4])}")
    return model, warnings


def vegas_sanity(t: pd.DataFrame, model_rows: pd.DataFrame, params: Params) -> tuple[pd.DataFrame, list[str]]:
    """Playbook §3.4: a team's blended offensive points may not run more than sanity_max_over above the
    Vegas-anchored model's total for the same players; scale that team's non-model share down if so."""
    over = float(params.get("bottomup.sanity_max_over"))
    m = model_rows.set_index("dk_index")["points"]
    notes = []
    off = t.index.isin(m.index) & t["position"].isin(["QB", "RB", "WR", "TE"]) & t["mean"].notna()
    for team, g in t[off].groupby("team"):
        msum, bsum = float(m.loc[g.index].sum()), float(g["mean"].sum())
        if msum > 0 and bsum > (1 + over) * msum:
            f = (1 + over) * msum / bsum
            t.loc[g.index, "mean"] = t.loc[g.index, "mean"] * f
            notes.append(f"{team}: blended points {bsum:.1f} > model {msum:.1f} +{over:.0%} -> scaled x{f:.3f}")
    return t, notes


def calibration_path(params: Params) -> Path:
    from core.projections.params import ROOT
    p = Path(str((params.get("bottomup.calibration") or {}).get("file", "config/calibration.json")))
    return p if p.is_absolute() else ROOT / p


def _component(breakdown: str, comp: str) -> float:
    try:
        v = (json.loads(breakdown).get(comp) or {}).get("value")
        return float(v) if v is not None else np.nan
    except (TypeError, ValueError):
        return np.nan


def final_calibration(t: pd.DataFrame, params: Params):
    """proj_final = blend_with_fallback(model, consensus) (rookies -> 100% consensus), then apply_calibration per
    position -> proj_cal, which becomes `mean` (and the optimizer's projection). Rows with a market (props)
    component keep the 3-way blend as proj_final. Missing calibration file -> warning, proj_cal = proj_final."""
    from core.projections.recalibrate import apply_calibration, blend_with_fallback, load_calibration
    if "source_breakdown" not in t:
        return t, None, []
    t = t.copy()
    has = t["mean"].notna()
    bd = t["source_breakdown"].where(has, None)
    d = pd.DataFrame({"proj_model": [_component(x, "model") if x else np.nan for x in bd],
                      "proj_dff": [_component(x, "consensus") if x else np.nan for x in bd],
                      "market": [_component(x, "market") if x else np.nan for x in bd],
                      "pos": t["position"].to_numpy()}, index=t.index)
    w = params.get("blend.component_weights.without_props")
    w_model = float(w.get("model", 0.5)) / max(float(w.get("model", 0.5)) + float(w.get("consensus", 0.5)), 1e-9)
    d = blend_with_fallback(d, "proj_model", "proj_dff", w_model)
    mkt = d["market"].notna()
    d.loc[mkt | d["proj_final"].isna(), "proj_final"] = t.loc[mkt | d["proj_final"].isna(), "mean"]
    d.loc[mkt, "proj_source"] = "blend_with_market"
    t["proj_model"], t["proj_dff"], t["proj_final"], t["proj_source"] = d["proj_model"], d["proj_dff"], \
        d["proj_final"], d["proj_source"].where(has, "none")
    path = calibration_path(params)
    if not path.exists():
        t["proj_cal"] = t["proj_final"]
        t.loc[has, "mean"] = t.loc[has, "proj_final"]
        return t, None, [f"calibration file {path.name} not found — projections are NOT calibrated "
                         f"(run: python scripts/recalibrate.py data/backtest.csv --out config/calibration.json)"]
    cal = load_calibration(str(path))
    pos_on = set((params.get("bottomup.calibration") or {}).get("positions", list(cal)))
    cal = {p: c for p, c in cal.items() if p in pos_on}
    d = apply_calibration(d.assign(proj_final=t["proj_final"]), cal, proj_col="proj_final", pos_col="pos",
                          out_col="proj_cal")
    t["proj_cal"] = d["proj_cal"]
    t.loc[has, "mean"] = t.loc[has, "proj_cal"]
    n_fb = int((t["proj_source"] == "consensus_fallback").sum())
    return t, cal, [f"calibrated per position ({', '.join(sorted(cal))}) from {path.name}"
                    + (f"; {n_fb} players without a model projection use 100% consensus" if n_fb else "")]


def calibrate_points(mrows: pd.DataFrame, slate: pd.DataFrame, cal: dict) -> pd.DataFrame:
    """Calibrated copy of the own model's rows (the Vegas sanity reference must be on the same scale)."""
    from core.projections.recalibrate import apply_calibration
    if not len(mrows):
        return mrows
    d = mrows.assign(pos=slate.loc[mrows["dk_index"].astype(int), "position"].to_numpy())
    d = apply_calibration(d, cal, proj_col="points", pos_col="pos", out_col="points_cal")
    return mrows.assign(points=d["points_cal"].fillna(mrows["points"]).to_numpy())


def archive_pool(table: pd.DataFrame) -> pd.DataFrame:
    """my_projections.csv for scripts/archive_week.py + ownership_fit.py: name, pos, salary, proj, team, team_total,
    own_heuristic (v1 %, 0-100)."""
    t = table[table["mean"].notna()]
    proj = t["proj_cal"] if "proj_cal" in t else t["mean"]
    out = pd.DataFrame({"name": t["name"], "pos": t["position"], "salary": t["salary"], "proj": proj.round(3),
                        "team_total": t["team_total"]})
    if "own_heuristic" in t:
        out["own_heuristic"] = (100 * t["own_heuristic"]).round(2)
    return out


def lineup_csv(table: pd.DataFrame) -> pd.DataFrame:
    """The lineup generator's projections.csv (DK names so matching is exact)."""
    t = table[table["mean"].notna()]
    out = pd.DataFrame({
        "name": t["name"].str.strip(), "team": t["team"], "position": t["position"],
        "median": (t["proj_cal"] if "proj_cal" in t and t["proj_cal"].notna().any() else t["median"]).round(3),
        "sim_median": t["median"].round(3),
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
    paths["archive_pool"] = out / "my_projections.csv"
    archive_pool(run.table).to_csv(paths["archive_pool"], index=False)
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
    ap.add_argument("--sources", help="sources.yaml (optional: public consensus to blend with the own model)")
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
    ap.add_argument("--no-model", action="store_true", help="skip the own (nflverse bottom-up) model")
    ap.add_argument("--nflverse-dir", help="where nflverse files are cached (default data/nflverse)")
    ap.add_argument("--fetch", action="store_true", help="download/refresh nflverse files first")
    ap.add_argument("--out", default="data/published")
    a = ap.parse_args(argv)
    run = build_projections(a.salaries, load_source_specs(a.sources) if a.sources else [], a.sport, a.odds,
                            a.injuries, a.overrides, a.history, a.actuals, a.seed, props=a.props, weather=a.weather,
                            dst_inputs=a.dst_inputs, simulate_outcomes=not a.no_sims, n_sims=a.n_sims,
                            public_model=not a.no_model, nflverse_dir=a.nflverse_dir, fetch_data=a.fetch)
    paths = publish(run, a.out)
    for w in run.warnings:
        print("WARN", w)
    print(f"published {run.log['players']} players ({run.log['weight_method']} weights) -> {paths['csv']}")


if __name__ == "__main__":
    main()
