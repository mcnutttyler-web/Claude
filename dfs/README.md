# DraftKings DFS Lineup Generator

A local lineup generator built as a **sport-agnostic core** plus **sport plugins**. The NFL plugin ships now;
the NBA plugin is a stub until Phase 6. It works from CSVs you supply, never scrapes, and **never submits to DK** —
you upload the CSV yourself.

## Quick start
```bash
cd dfs
pip install -r requirements.txt
python -m pytest                # full Phase 1 suite, ~20 s
streamlit run app.py            # UI; tick "Use sample ..." on each tab to try the bundled fictional slate
```
To regenerate the sample data and contest templates:
`python -c "from core.sample import write_sample_data; write_sample_data('data/sample')"` and
`python scripts/make_templates.py`.

## Layout
```
app.py                Streamlit UI (Slate, Projections, Cash, GPP, Sims, Showdown, Late Swap, Export, Tracking)
core/
  ingest.py           DKSalaries parse (Game Info -> away@home, lock time ET, lock window), projections mapping
  names.py            name normalization, DST-by-team, aliases, fuzzy match, unmatched blocking table
  lineup.py           Lineup, DK validity checks, budget-aware random sampler, late-swap slot ordering
  optimizer.py        ILP builder (PuLP+CBC); slots/eligibility/cap/team/game rules come from SportConfig
  cash.py             Objective A (highest-median team under cash hard rules)
  cash_sim.py         sim cash engine: candidates, cash line, P(beat line), regime, fade risk, free squares
  distributions.py    shifted-lognormal / gamma marginals fitted to median + ceiling (or CV), bust mixture
  correlation.py      role-pair prior + game factor -> correlation matrix, Higham nearest-PSD repair
  slate_sim.py        Gaussian-copula slate sims (float32, seeded, run log) + player metrics
  field.py            GPP and cash field models: Dirichlet + stackers + consensus mixture, raked weights
  contest.py          contest.yaml/csv, payout tables, prize pool, rake, break-even rates
  export.py           DK upload CSV; DKEntries.csv byte-exact round-trip
  sample.py           synthetic (fictional) slate generator for the demo and tests
sports/
  base.py             SportConfig / ModeSpec interface + plugin loader
  nfl/                config.yaml, scoring.py, roles.py, rules.py, correlations.yaml, presets.yaml
  nba/                Phase 6 stub (config.yaml, scoring.py, TODO.md)
config/               app.yaml, contests/*.yaml, payouts/*.csv (templates — calibrate)
tests/                acceptance tests; fixtures/toysport is a 6-slot, $30k test sport
```

## Projection engine (`core/projections/`)
This builds the `projections.csv` that the lineup generator reads. It is top-down and market-anchored, and
every tunable lives in `config/projections.yaml` as `{value, calibrated, source}`.
Expect modest gains: the best public weekly sources differ by hundredths of a point of MAE.

```bash
# publish projections for a slate (sample inputs are fictional)
python -m core.projections.publish --salaries data/sample/DKSalaries.csv \
  --sources data/sample/proj_sources/sources.yaml --odds data/sample/proj_sources/odds.csv \
  --injuries data/sample/proj_sources/injuries.csv --overrides data/sample/proj_sources/overrides.csv \
  --history data/sample/proj_sources/history.csv --actuals data/sample/proj_sources/actuals.csv \
  --out data/published
# walk-forward backtest, FFA protocol (top-20 QB/TE, top-40 RB/WR, inactive excluded)
python -m core.projections.backtest --history data/sample/proj_sources/history.csv \
  --actuals data/sample/proj_sources/actuals.csv --out data/backtest
```
Outputs: `projections.parquet` holds the full §1 schema. Columns that later phases fill are present but empty.
`projections.csv` is in the lineup-generator format. `run_log.json` records the seed, input hash, weights and the
uncalibrated parameters. `team_check.csv` compares each team's projected offensive points with its implied total.

| File | Role |
|---|---|
| `vegas.py` | consensus spread/total across books (Pinnacle/Circa weighted 2x), implied team total = total/2 − spread/2 |
| `sources.py` | importers: points sources, stat-line sources (scored with DK rules), injuries → p_play, overrides, history |
| `blend.py` | source weights within a component, then model/market/consensus component weights; confidence |
| `backtest.py` | FFA-protocol pool, MAE/RMSE/bias/weekly-MAE CV/Spearman/calibration slope, walk-forward inverse-MAE |
| `market.py` | props: power de-vig (multiplicative fallback), line→median→mean, alt-line CDFs (PCHIP + Normal tails), TD/INT λ (catches "over 1.5" TD lines) |
| `dst.py` | DST model: points allowed ~ Normal(opp implied, 9) over DK tiers + shrunk sack/INT rates |
| `weather.py` | wind/rain multipliers for outdoor games |
| `distributions.py` | 10k-sim Monte Carlo with game, team-pass, target-share (zero-sum) and team-rush shocks; Questionable mixtures with teammate redistribution; coverage + dispersion calibration |
| `ownership.py` | v1 softmax ownership (GPP, cash, Showdown CPT/FLEX) normalized to 900% / 100%+500% |
| `publish.py` | orchestration and outputs (`sims.npz` holds the simulated outcome matrix) |

Stat-line sources are scored with `expected_score`, which prices the 300/100/100 bonuses and the DST
points-allowed tiers by probability. Scoring a mean stat line directly would mis-price those nonlinear pieces.

Projection phases:
- [x] **P1:** CSV importers, implied totals, consensus blend (inverse-MAE), overrides, publish, backtest harness.
- [x] **P2:** props model (power de-vig, alt-line CDFs, TD λ), Questionable mixtures, weather, DST, Monte Carlo
  distributions with calibration, ownership v1. Add `--props`, `--weather`, `--dst-inputs`, `--n-sims` to publish.
- [ ] P3: bottom-up nflverse model, learned vacated-usage table, learned/stacked blend weights, recalibration.
- [ ] P4: ownership v2, kickers/Showdown, NBA adapter.

## Plugin contract
Core reads sport specifics only through `SportConfig` (`sports/base.py`): `roster_slots` (with multi-eligibility,
e.g. FLEX = RB/WR/TE), `salary_cap`, `min_teams`, `min_games`, `max_per_team`, `showdown` (captain multipliers,
FLEX count, ≥1 per team), `score()`, `roles()`, `correlation_prior`, `distribution_defaults`, `lock_rule`,
`stack_rules` (`rules.build_constraints(ctx, options)` + `rules.objective_terms`), `presets`, and `export_header`.
Load a plugin by name (`load_sport("nfl")`) or by directory (`load_sport("tests/fixtures/toysport")`).

## Calibration
Every heuristic default (correlations, CVs, presets, field-model parameters, min salary, payout templates) is a
starting value, not a law. The UI marks each one **default — calibrate**. Calibration and backtest utilities arrive
in Phase 5. Simulated ROI and real tracked results decide which lineups to play. Winning-lineup anecdotes do not.

## Things to verify each season
- `sports/nfl/config.yaml` scoring, especially the **DST event values, which are marked unverified**.
- Entry limits: DK caps Salary Cap contests under $5 at 20 entries per customer, except mini-MAX (150).
  Exports validate against each contest's `max_entries`.

## Build phases
- [x] **Phase 1:** SportConfig + NFL plugin, ingest and name matching, cash Objective A, export and DKEntries
  round-trip. Tests 1–3, 14 and 16.
- [x] **Phase 2:** distributions, correlation, slate sims, cash field, full cash module. Tests 4–6 and 9–11.
- [ ] Phase 3: GPP generator, GPP field, payouts, portfolio, player metrics. Tests 8, 12, 13 and 17.
- [ ] Phase 4: late swap and Showdown rules. Tests 7 and 15.
- [ ] Phase 5: tracking, calibration and flashback.
- [ ] Phase 6: NBA plugin.
