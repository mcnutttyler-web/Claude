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
- [ ] Phase 2: distributions, correlation, slate sims, cash field, full cash module. Tests 4–6 and 9–11.
- [ ] Phase 3: GPP generator, GPP field, payouts, portfolio, player metrics. Tests 8, 12, 13 and 17.
- [ ] Phase 4: late swap and Showdown rules. Tests 7 and 15.
- [ ] Phase 5: tracking, calibration and flashback.
- [ ] Phase 6: NBA plugin.
