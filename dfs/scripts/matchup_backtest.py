"""Walk-forward backtest of the EXPERIMENTAL matchup layer and the use/no-use decision.

    python scripts/matchup_baseline.py --seasons 2019-2026     # baseline A (slow; resumable)
    python scripts/matchup_backtest.py                         # B vs A, DvP straw man, k tuning, decision

Writes docs/matchup_backtest.md, docs/live_2026_results.md, config/matchup.yaml (positions + k) and the 2026 model
(trained on 2016-2025) to config/matchup_model_2026.json.
"""
from __future__ import annotations

import re
import sys
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from core.matchup import backtest as BT  # noqa: E402
from core.matchup import effect as E  # noqa: E402
from core.matchup import live  # noqa: E402
from core.matchup.data import load  # noqa: E402
from sports.base import load_sport  # noqa: E402

BASE = ROOT / "data" / "matchup" / "baseline"
MODEL = ROOT / "config" / "matchup_model_2026.json"
LIVE_SEASON = 2026


def run_k(k, pg, dg, games, base, dvp, cfg, al, cov, oc, seasons, log=print):
    frames, models = [], {}
    c = BT.config_obj(cfg, k)
    for s in seasons:
        m, ft = E.fit(pg, dg, games, s, c, al, cov, oc)
        fs = ft[ft["season"] == s].copy()
        fs["effect"] = E.predict(m, fs)
        frames.append(BT.attach(base[base["season"] == s], fs, dvp, c.cap, c.min_proj))
        models[s] = m
        log(f"k={k} season {s}: fit, lambda={ {p: f'{v:.0e}' for p, v in m.lam.items()} }")
    return BT.pool(pd.concat(frames, ignore_index=True)), models


def fmt_table(t: pd.DataFrame) -> str:
    lines = ["| pos | n | MAE A | MAE B | ΔMAE B−A [95% CI] | MAE DvP raw | MAE DvP ±8% | ρ A | ρ B | Δρ [95% CI] | "
             "calib slope A / B | bias A / B |", "|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for r in t.itertuples(index=False):
        d = r._asdict()
        lines.append(
            f"| {d['position']} | {d['n']} | {d['A_MAE']:.3f} | {d['B_MAE']:.3f} | {d['BmA_dMAE']:+.3f} "
            f"[{d['BmA_dMAE_lo']:+.3f}, {d['BmA_dMAE_hi']:+.3f}] | {d['DvP_raw_MAE']:.3f} | {d['DvP_capped_MAE']:.3f} | "
            f"{d['A_spearman']:.3f} | {d['B_spearman']:.3f} | {d['BmA_dRho']:+.3f} [{d['BmA_dRho_lo']:+.3f}, "
            f"{d['BmA_dRho_hi']:+.3f}] | {d['A_calib_slope']:.2f} / {d['B_calib_slope']:.2f} | "
            f"{d['A_bias']:+.2f} / {d['B_bias']:+.2f} |")
    return "\n".join(lines)


def _clean(t: pd.DataFrame) -> pd.DataFrame:
    t = t.copy()
    t.columns = [re.sub(r"[^A-Za-z0-9]+", "_", c).strip("_").replace("B_A", "BmA").replace("DvP_A", "DvPmA")
                 for c in t.columns]
    return t


def set_config(path: Path, k: float, decisions: dict[str, bool]) -> None:
    txt = path.read_text()
    txt = re.sub(r"(\n  k: )[0-9.]+", rf"\g<1>{k:g}", txt, count=1)
    for pos, ok in decisions.items():
        txt = re.sub(rf"(\n  {pos}: )(true|false)", rf"\g<1>{'true' if ok else 'false'}", txt, count=1)
    path.write_text(txt)


def main():
    sport = load_sport("nfl")
    al = sport.team_aliases
    cfg = BT.load_config()
    d = load(list(range(2016, LIVE_SEASON + 1)), al)
    pg, dg = d["player_games"], d["defense_games"]
    games = pd.read_csv(ROOT / "data" / "nflverse" / "games.csv")
    base = pd.concat([pd.read_parquet(p) for p in sorted(BASE.glob("baseline_*.parquet"))], ignore_index=True)
    dvp = BT.raw_dvp(pg)
    cov, oc = BT.coverage_off(dg), BT.oc_changes()
    t_lo, t_hi = cfg["decision"]["tune_seasons"]
    h_lo, h_hi = cfg["decision"]["holdout_seasons"]
    seasons = sorted(s for s in base["season"].unique() if s <= LIVE_SEASON)
    nb = int(cfg["decision"]["bootstrap"])

    pools, models = {}, {}
    for k in cfg["defense"]["k_grid"]:
        pools[k], models[k] = run_k(k, pg, dg, games, base, dvp, cfg, al, cov, oc, seasons)
    tune = {k: float((p.loc[p["season"].between(t_lo, t_hi), "proj_B"] -
                      p.loc[p["season"].between(t_lo, t_hi), "actual"]).abs().mean()) for k, p in pools.items()}
    k_best = min(tune, key=tune.get)
    p = pools[k_best]
    hold = _clean(BT.table(p[p["season"].between(h_lo, h_hi)], nb))
    full = _clean(BT.table(p[p["season"].between(2019, LIVE_SEASON - 1)], nb))
    per_k = {k: _clean(BT.table(pp[pp["season"].between(h_lo, h_hi)], 200)) for k, pp in pools.items()}
    rel = float(cfg["decision"]["min_rel_improvement"])
    decisions = {}
    for r in hold.itertuples(index=False):
        dd = r._asdict()
        decisions[dd["position"]] = bool(dd["BmA_dMAE_hi"] < 0 and -dd["BmA_dMAE"] >= rel * dd["A_MAE"])
    set_config(BT.CFG_PATH, k_best, decisions)

    m26 = models[k_best].get(LIVE_SEASON)
    if m26 is not None:
        m26.save(MODEL)
    live_pool = p[p["season"] == LIVE_SEASON]
    if len(live_pool):
        live.update(live_pool)

    arch = models[k_best][max(s for s in seasons if s <= LIVE_SEASON)].arche
    mults = p[p["season"].between(h_lo, h_hi)]
    write_doc(hold, full, per_k, tune, k_best, decisions, arch, mults, models[k_best], cov, h_lo, h_hi, t_lo, t_hi)
    print("k tuning (tune-season MAE of B):", tune, "-> k =", k_best)
    print("decisions:", decisions)


def write_doc(hold, full, per_k, tune, k_best, decisions, arch, mults, models, cov, h_lo, h_hi, t_lo, t_hi):
    lam = {s: m.lam for s, m in models.items()}
    names = "\n".join(f"- **{pos}:** " + ", ".join(arch.names[pos]) for pos in ("QB", "RB", "WR", "TE"))
    mabs = mults.groupby("position")["mult_B"].apply(lambda x: (x - 1).abs().mean())
    hit_cap = mults.groupby("position")["mult_B"].apply(lambda x: ((x - 1).abs() >= 0.0799).mean())
    on = [p for p, v in decisions.items() if v]
    verdict = ("**No position cleared the bar, so the matchup layer stays OFF.**" if not on else
               f"**Positions that cleared the bar: {', '.join(on)}.** They are marked `true` in `config/matchup.yaml`, "
               "but the master switch `enabled` stays `false` until you turn it on.")
    kt = "\n".join(f"| {k} | {v:.4f} | " + " | ".join(f"{r['BmA_dMAE']:+.4f}" for _, r in per_k[k].iterrows()) + " |"
                   for k, v in tune.items())
    doc = f"""# Matchup layer backtest (EXPERIMENTAL)

Generated {date.today().isoformat()} by `scripts/matchup_backtest.py`. Data comes from nflverse (free).

## Plain-English result
{verdict}

The rule: in the {h_lo}–{h_hi} holdout seasons, the matchup-adjusted projection (B) has to lower the average
error (MAE) of the plain opportunity/Vegas projection (A). The 95% bootstrap confidence interval for that drop must
exclude zero, and the drop must be at least 0.5%. Positions that don't clear the bar get no adjustment.

## Method
Every number uses only information available before that week's kickoff.

1. **Baseline A.** This is the own opportunity/Vegas model (`core/projections/bottomup.py`). Vegas lines set team
   volume. Each player's recent shares of that volume and their shrunk efficiency set their projection.
2. **Player archetypes.** These are k-means clusters fit on regular contributors from prior seasons. Each player is
   assigned from his last 6 games this season. Before week 4 that is blended with last season (weight g/(g+3)).
   The blend resets when he changed team, his team changed head coach or OC, or his snap share moved more than
   20 points. Clusters, as named from their centroids:
{names}
   - Proxies: the route-participation input is offensive snap share, and the slot-rate input is the share of
     targets thrown to the middle of the field. Free data has no alignment or route charting.
3. **Defense profiles.** Each defense profile is built only from games before the week. Each result is compared
   with that offense's average in its other games (the schedule adjustment). Profiles include:
   - EPA per play allowed on passes and runs, and the gap between them (funnel)
   - explosive pass rate, pressure rate (sacks plus QB hits), and middle-target share
   - man rate (2018–2025 participation data) and blitz rate (FTN charting, 2022+)
   - the residual allowed to the position and to the archetype

   Last season is shrunk 30% toward the league average, then blended in with weight games/(games + k).
   k = {k_best} was chosen on {t_lo}–{t_hi}. Coverage features are set to league average (switched off) when the
   season's charting is missing: {', '.join(f"{s}: {sorted(v)}" for s, v in cov.items() if v) or 'none'}.
4. **Target.** The target is actual DK points minus the points expected from opportunity alone. That expectation
   comes from a per-position OLS on targets and carries (QB: attempts, designed carries, scrambles). Then the
   player's own usual residual is subtracted (last 16 games, shrunk n/(n+8)). That leaves "how he did vs his norm,
   given his volume".
5. **Effect model.** This is a ridge regression per position on the defense features plus defense × archetype
   interactions. The archetype terms get double the penalty.
   - Shrinkage is heavy. The "allowed" inputs are empirical-Bayes shrunk with n/(n + σ²/τ²), and the ridge penalty
     is picked by leave-one-season-out CV with the one-standard-error rule, which means more shrinkage.
   - The model is refit once per offseason on every earlier season.
   - Ridge penalties chosen by season: {lam}
6. **Multiplier.** The multiplier is 1 + effect / max(projection, 5), capped at ±8%.
7. **Straw man.** Raw DvP is the defense's DK points allowed per game to the position this season, divided by the
   league average, applied unshrunk and uncapped. A ±8%-capped version is also shown.

The pool is the FFA protocol: the top 20 QB/TE and top 40 RB/WR by A each week, among players who played.
Calibration slope is the slope of actual on projection, where 1.0 is ideal. Bias is projection minus actual.

## Holdout {h_lo}–{h_hi} (decides use)
{fmt_table(hold)}

## All backtest seasons 2019–2025
{fmt_table(full)}

## k tuning
Each row shows the MAE of B on {t_lo}–{t_hi}, then the holdout ΔMAE by position (QB, RB, WR, TE).

| k | tune MAE B | ΔMAE QB | ΔMAE RB | ΔMAE WR | ΔMAE TE |
|---|---|---|---|---|---|
{kt}

## How big the adjustments are (holdout)
- Mean |multiplier − 1|: {", ".join(f"{p} {v:.2%}" for p, v in mabs.items())}
- Share of players at the ±8% cap: {", ".join(f"{p} {v:.1%}" for p, v in hit_cap.items())}

## Reading this
- **ΔMAE** is how much the matchup multiplier changed the average absolute error, in DK points per player.
  Negative is better. The bracket is the 95% range from resampling weeks.
- **DvP raw** is the "this defense gives up the most points to WRs" idea, taken literally. If it does worse than
  A, unshrunk DvP is noise that hurts projections, as the playbook's §3 says.
- Historical consensus projections (e.g. FFA archives) aren't freely downloadable as files, so A stands in for the
  consensus here. A tracks a DFF cheat sheet at about 0.97 correlation.
"""
    (ROOT / "docs" / "matchup_backtest.md").write_text(doc)


if __name__ == "__main__":
    main()
