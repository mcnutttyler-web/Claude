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
  payouts.py          exact tie-splitting settlement; fractional-rank payouts vs a weighted field
  gpp.py              presets, GPP ILP (log-own objective, own band, product cap), rules generator,
                      parallel sim-sampled candidate pool, optimal% / leverage, chunked candidate scoring
  portfolio.py        greedy portfolio by exact marginal payout (own entries compete), report
  lateswap.py         DKEntries late swap: lock started games, condition on actual scores, re-solve open slots
  standings.py        DK contest-standings export parser (real field lineups, %Drafted, FPTS)
  tracking.py         entry log (CSV), settle from DK contest history, reliability, ROI, overconfidence flag
  calibration.py      refit CVs, role-pair correlations, ownership accuracy and field behaviour (shrunk to prior)
  reports.py          flashback (sim ROI vs the real field; field average = -rake) and bankroll warnings
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

### Own projections from public data (P3)
`bottomup.py` builds projections from free public data, following `docs/PROJECTION_PLAYBOOK.md` §3:
1. Vegas lines set team plays, pass rate and TDs.
2. nflverse play-by-play sets each player's target share, carry share, red-zone share and efficiency
   (recency-weighted, blended with last season early in the year, shrunk toward the position average).
3. Shares become stat lines, then DK points.
4. Out players' volume is redistributed (targets 60/40, carries 70/30), weighted by how much of the team's recent
   games they actually played.

On top of that:
- Receiving lines are reconciled to the QB's passing line.
- The very top projections are shrunk slightly.
- DST rates come from the same play-by-play.

Vegas lines come from the first of these that exists: `--odds`, then a source's spread/total columns (for example
DFF), then the nflverse schedule's lines. A free consensus CSV is optional. When you give one, it is blended 50/50
with the own model, and a team whose blended points run more than 10% above the model is scaled back.

```bash
python -m core.projections.nflverse --season 2026          # download/refresh nflverse data (about 50 MB)
python -m core.projections.publish --salaries DKSalaries.csv --out data/published            # own model only
python -m core.projections.publish --salaries DKSalaries.csv --sources sources.yaml --fetch \
  --out data/published                                       # own model + consensus, refresh data first
python scripts/backtest_own_model.py --weeks 2025:2-18 2026:2-5   # walk-forward accuracy on real games
```
In the app: **Projections → "Build my own from public data"**.

Data credit: nflverse (data CC-BY 4.0).

### Calibration, weekly archive and ownership model
These came from the user-supplied `recalibrate.py`, `archive_week.py` and `ownership_fit.py`, now integrated:
`core/projections/recalibrate.py`, `core/archive.py` and `core/projections/ownership_fit.py`, with CLI wrappers
in `scripts/`.

The projection order is:
1. Own model and consensus are blended 50/50 (`blend_with_fallback`). A player with no model projection, such as
   a rookie, uses 100% consensus instead of being dropped.
2. Per-position calibration is applied from `config/calibration.json` (`apply_calibration`), giving `proj_cal`.
3. `proj_cal` is the projection the optimizer uses.

Calibration details:
- It is fit only inside the projection range the backtest saw, so low projections aren't extrapolated.
- If the file is missing, the app warns and uses the raw blend.

The weekly loop:
```bash
python scripts/export_backtest.py                 # data/backtest.csv: season, week, pos, proj, actual (pool = pre-game, by projection)
python scripts/recalibrate.py data/backtest.csv --walk-forward              # does calibration help out of sample?
python scripts/recalibrate.py data/backtest.csv --out config/calibration.json
python scripts/archive_week.py 2026 6 --salaries DKSalaries.csv --dff dff.csv --pool data/weekly/my_projections.csv
python scripts/ownership_fit.py data/archive --cv   # once >= 3 slates are archived with standings
python scripts/ownership_fit.py data/archive --fit  # -> data/ownership_model.json (GPP tab toggle uses it)
```
Projection sources and ownership:
- **Sources:** the build panel accepts several consensus files at once (e.g. DFF and OWS). They are averaged
  equally into the consensus, then blended 50/50 with the own model. In `my_projections.csv`, `proj_dff` holds
  that consensus average.
- **GPP ownership:** a source's published ownership comes first.
  - Players it doesn't cover get min(heuristic, 1%).
  - Totals are rescaled to QB 100%, DST 100%, RB+WR+TE 700%.
  - It is tilted under the salary cap if needed.
- **Cash ownership:** derived from the source's GPP ownership by sharpening (cash fields concentrate harder).
- **Fallback:** the v1 heuristic is used only when no source provides ownership.
- **Archive:** extra sources are saved as `source_<name>.csv`, and the pool export carries `own_source`. That lets
  `ownership_fit --cv` compare the fitted model against the published ownership, not just the heuristic.

In the app:
- **Build projections** writes `data/weekly/my_projections.csv`, with name, pos, salary, proj (calibrated),
  team_total and own_heuristic (%).
- The sidebar **Archive this week** saves the salaries, DFF and pool files, plus any DK standings you upload, to
  `data/archive/<season>/w<NN>/`.
- The GPP tab has a toggle for the fitted ownership model.

### Matchup layer (EXPERIMENTAL, off by default) — `core/matchup/`
The layer asks: do players of a certain type do better or worse than their volume predicts against certain
kinds of defenses? If so, it nudges projections by at most ±8%. It is only allowed to touch a position after
beating the plain projection in a walk-forward backtest.

Steps:
1. **Archetypes.** Players are clustered by usage, with k-means on regular contributors from prior seasons.
   Examples: "alpha target-hog WR", "slot PPR WR", "workhorse RB", "rushing QB".
   - Profiles use the player's last 6 games.
   - Before week 4 they're blended with last season, weight g/(g+3).
   - The blend resets on a team change, a coach/OC change (`config/coordinator_changes.yaml`), or a snap share
     move of more than 20 points.
2. **Defense profiles.** These use only games before the week, judged against each opponent's own average
   (schedule-adjusted). They cover:
   - pass/run EPA allowed and the funnel between them
   - explosive pass rate, pressure rate and middle-target share
   - man rate and blitz rate
   - what the defense allowed to the position and the archetype

   Last season is shrunk 30% toward the league average, then blended in with weight games/(games + k).
3. **Effect.** The target is actual DK points minus the points expected from targets and carries alone, minus the
   player's own usual surplus. A ridge regression per position (defense features × archetype) is fit on that,
   with heavy shrinkage:
   - empirical-Bayes on small samples
   - CV-chosen penalties with the one-standard-error rule

   It is refit once per offseason.
4. **Backtest.** 2019–2025, week by week. A = the opportunity/Vegas projection; B = A × the multiplier; raw DvP is
   shown as a straw man. k is tuned on 2019–2021, and the decision is made on the 2022–2025 holdout (bootstrap
   CI). See `docs/matchup_backtest.md`.

```bash
python scripts/matchup_baseline.py --seasons 2019-2026   # baseline projections (slow, resumable)
python scripts/matchup_backtest.py                       # backtest + decision + 2026 model (trained 2016-2025)
python scripts/matchup_weekly.py                         # Tuesday evening: refresh 2026 data, flags, live results
```
`config/matchup.yaml` holds `enabled: false` plus per-position switches that the backtest sets. In-season, the
features update weekly but the coefficients stay frozen. Results for each 2026 week are appended to
`docs/live_2026_results.md`. When a season's coverage charting is missing (2026 has no man/zone participation
file), that feature is switched off automatically.

Projection phases:
- [x] **P1:** CSV importers, implied totals, consensus blend (inverse-MAE), overrides, publish, backtest harness.
- [x] **P2:** props model (power de-vig, alt-line CDFs, TD λ), Questionable mixtures, weather, DST, Monte Carlo
  distributions with calibration, ownership v1. Add `--props`, `--weather`, `--dst-inputs`, `--n-sims` to publish.
- [x] **P3:** own bottom-up model from public data (nflverse + Vegas), injury redistribution, Vegas sanity check,
  playbook correlations/CVs, nflverse schedule lines as a free odds fallback, real-data walk-forward backtest.
  Still open: learned vacated-usage table, learned blend weights.
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

## Weekly loop (after Phase 5)
1. Build lineups → Export → DKEntries round-trip → **Log these entries for tracking**.
2. After the slate: download DK contest history (My Contests) → Tracking tab → **Settle results**.
3. Download a contest's standings → **Flashback**: sim ROI of your lineups vs the real field, ownership accuracy,
   real field behaviour (stack rate, salary use) for the field model.
4. Every few weeks: player history → **Calibration** → review the suggested YAML and paste it into the plugin.
   Watch the overconfidence flag (realized − predicted cash rate < −5 pp over 50+ entries).

## Things to verify each season
- `sports/nfl/config.yaml` scoring, especially the **DST event values, which are marked unverified**.
- Entry limits: DK caps Salary Cap contests under $5 at 20 entries per customer, except mini-MAX (150).
  Exports validate against each contest's `max_entries`.

## Build phases
- [x] **Phase 1:** SportConfig + NFL plugin, ingest and name matching, cash Objective A, export and DKEntries
  round-trip. Tests 1–3, 14 and 16.
- [x] **Phase 2:** distributions, correlation, slate sims, cash field, full cash module. Tests 4–6 and 9–11.
- [x] **Phase 3:** GPP generator, GPP field, payouts, portfolio, player metrics. Tests 8, 12, 13 and 17.
- [x] **Phase 4:** late swap and Showdown rules (K+DST <= 2, CPT QB needs a catcher, CPT bring-back, soft K/DST
  captain and WR/TE-captain-without-QB penalties, CPT ownership in the objective and the field). Tests 7 and 15.
- [x] **Phase 5:** tracking, calibration and flashback.
- [ ] Phase 6: NBA plugin.
