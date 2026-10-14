# Handoff prompt: DraftKings DFS lineup generator and projection engine

Paste everything below into a new session to continue where we left off.

---

You are a senior Python engineer with deep DraftKings (DK) DFS and operations-research knowledge. You are continuing
work on an existing project. Read this whole brief before acting.

## 1. Who the user is and how they play
- They play DK NFL: about $50/week in $1 and $5 head-to-heads (cash), plus 2–20 tournament lineups in small-field,
  single-entry and 3-max contests.
- They use a MacBook Air. The app lives at `~/dfs-app/dfs`, inside a Python virtualenv (`.venv`).
  - Start it: `cd ~/dfs-app/dfs && source .venv/bin/activate && python -m streamlit run app.py`
  - Update it: `git pull` in `~/dfs-app/dfs`.
  - macOS has no `python` command outside the venv; use `python3` there.
- They are not a programmer. Give exact copy-paste Terminal commands, one step at a time.
- Their projections come from DailyFantasyFuel cheat sheets. These have first_name/last_name columns, a
  `ppg_projection` column, an empty `ownership_projection` column, and cover a whole Thu–Mon week. The app now
  handles all of this.

## 2. Repository
- GitHub: `mcnutttyler-web/claude`, branch **`claude/peaceful-albattani-bodmek`**. The project is in `dfs/`; the repo
  root also has an unrelated `kitty-kong.html` game.
- Develop, commit and push on that branch. Do not open a PR unless asked.
- End every commit message with the session's attribution lines, if your session supplies them.
- Tests: `cd dfs && python -m pytest`, about 130 tests in roughly 10 minutes, all passing at handoff.
  - A few are performance tests.
  - The 150-lineup rules-generator test runs in about 50 s against a 60 s limit and could be flaky on a slow
    machine.

## 3. Original build spec (summary)
- **Structure:** a local DK lineup generator with a sport-agnostic core plus sport plugins. NFL is built; NBA is a
  stub that is designed for but not yet built.
- **Cash:** maximize P(beat the cash line) using cash-game theory, not just "highest projection".
  - Mean-variance regime: when favored, reduce Var(score − line) by sharing chalk; when an underdog, add variance.
  - Break-even rates: 1.8x → 55.6%, 2x → 50%, 3x → 33.3%.
- **GPP:** pick 1–150 differentiated lineups by simulated ROI against a simulated field, with prize splitting for
  duplicates.
- **Also:** Showdown, DK CSV export, a byte-exact DKEntries.csv round-trip, and late swap for cash and GPP.
- **Inputs:** user-supplied CSVs only. Never scrape DK or paid sites. Never auto-submit to DK.
- **Defaults:** every tunable is "default — calibrate" and shows a badge. Only simulated ROI and tracked results drive
  decisions, never winning-lineup anecdotes.
- **Stack:** Python 3.11+, pandas, numpy, scipy, PuLP + CBC, Streamlit, PyYAML, pytest, and pyarrow (for the
  projection engine). Ask before adding any other dependency.

## 4. What is built (lineup generator, `dfs/`)
| Phase | Status | Contents |
|---|---|---|
| 1 | done | `sports/base.py` SportConfig/ModeSpec plugin interface; NFL plugin (`config.yaml` rules and scoring incl. 300/100/100 bonuses and DST tiers, `roles.py`, `rules.py`, `correlations.yaml`, `presets.yaml`); ingest + fuzzy name matching (`core/ingest.py`, `core/names.py`); ILP builder (`core/optimizer.py`); cash Objective A (`core/cash.py`); export + DKEntries round-trip (`core/export.py`); contest templates (`config/contests`, `config/payouts`) |
| 2 | done | `core/distributions.py` (shifted lognormal/gamma fitted to median + ceiling or CV; bust mixture fitted exactly); `core/correlation.py` (role-pair prior + game factor, Higham nearest-PSD); `core/slate_sim.py` (Gaussian copula, seeded, run log); `core/field.py` (cash/GPP fields; see §6); `core/cash_sim.py` (sim cash engine) |
| 3 | done | `core/payouts.py` (exact tie-split settlement; fractional-rank payouts vs a weighted field); `core/gpp.py` (presets, log-ownership objective, ownership band, product cap, rules generator, parallel sim-sampled pool, optimal%/leverage, chunked scoring); `core/portfolio.py` (greedy by exact marginal payout; report) |
| 4 | done | Showdown rules in `sports/nfl/rules.py` + presets; CPT ownership in objective and field; `core/lateswap.py` (DKEntries late swap, cash and GPP) |
| 5 | done | `core/standings.py` (DK standings parser); `core/tracking.py` (entry log, settle from DK contest history, reliability, ROI, overconfidence flag); `core/calibration.py`; `core/reports.py` (flashback, bankroll warnings) |
| 6 | **not started** | NBA plugin (spec Section 11): minutes-driven, no forced stacks, news-heavy lock rule, roles, correlations learned from history. Only `sports/nba/config.yaml`, `scoring.py`, `TODO.md` and a `STUB` file exist. |

All 17 acceptance tests from the spec are implemented and pass.

**App (`dfs/app.py`):**
- Tabs: Slate, Projections, Cash, GPP, Sims, Showdown, Late Swap, Export, Tracking.
- Sample data lives in `data/sample/` and uses fictional players.

## 5. What is built (projection engine, `dfs/core/projections/`)
- **Spec:** top-down and market-anchored projections, with all parameters in `config/projections.yaml` as
  `{value, calibrated, source}`.
- **P1 (done):**
  - `vegas.py`: book-weighted consensus lines → implied totals.
  - `sources.py`: points and stat-line importers. Stat lines use `expected_score`, which prices bonuses and DST tiers
    by probability.
  - `blend.py`: inverse-MAE weights.
  - `backtest.py`: FFA protocol, walk-forward, leakage test.
  - `publish.py`: outputs parquet + lineup-generator CSV + run log.
- **P2 (done):**
  - `market.py`: power de-vig, line → median → mean, alt-line CDFs, anytime-TD λ including correct handling of "over
    1.5".
  - `dst.py`, `weather.py`.
  - `distributions.py`: Monte Carlo with game, team-pass, zero-sum target-share and team-rush shocks; Questionable
    mixtures with teammate redistribution; dispersion calibration.
  - `ownership.py`: v1 softmax, 900% classic; CPT 100% / FLEX 500% Showdown.
- **P3/P4 (not started):**
  - Bottom-up nflverse model (PROE, shares with role priors, efficiency shrinkage).
  - Learned vacated-usage table.
  - Learned/stacked blend weights.
  - Ownership v2.
  - Kickers.
  - NBA adapter.
  - P3 needs nflverse data access (network).
- **CLI:**
  ```
  python -m core.projections.publish --salaries DKSalaries.csv --sources sources.yaml \
    [--odds odds.csv --injuries injuries.csv --overrides overrides.csv --props props.csv \
     --weather weather.csv --history h.csv --actuals a.csv] --out <dir>
  ```
  - `sources.yaml` format: `sources: [{name, path, kind: points|stats, component: consensus|model|market}]`.
  - Backtest: `python -m core.projections.backtest --history h.csv --actuals a.csv`.

## 6. Key decisions and gotchas (don't undo these without reason)
- **Solver:**
  - PuLP is pinned to 2.9.0, because PuLP 3+/4 no longer bundle CBC.
  - CBC is the default engine. In-process HiGHS (`engine="highs"`) exists but was not faster.
  - GPP ILPs use a 2% relative gap; cash stays exact.
- **Rules generator:** a diversity penalty plus lazy uniqueness cuts. Plain per-lineup overlap cuts made CBC far too
  slow.
- **NFL rules:** the QB-vs-DST block and the DST soft penalty use pairwise, tight formulations.
- **Field sampler:**
  - Vectorized and budget-aware, with a random fill order per 128-entrant batch. A fixed order always squeezed FLEX
    to min-salary players.
  - Ownership is matched by acceptance weights (raking), within about 0.5 pp.
  - Input ownership must be salary-feasible (Σ own × salary ≤ cap); `fit_field` reports `implied_avg_salary`.
  - Showdown ownership vectors have length 2n, ordered `[FLEX…, CPT…]`, and require CPT + FLEX ≤ 1 per player.
  - Showdown uses its own salary floors.
- **Cash engine:** the cash line is the paid-places-th highest of (field_size − 1) opponents drawn from the cash field.
  Ties count half. It picks max P(win); tie-breaks are median, then SD(D), then latest FLEX lock.
- **Portfolio:**
  - Exact incremental marginals over a shortlist of 25 candidates ranked by an approximation over all sims.
  - `approx_sims` in presets trades payout for speed on 150-max.
  - Expected payout never decreases.
- **Late swap:**
  - Locked players keep their original slot index (`align_to_locks`).
  - Started players that aren't in the lineup are excluded.
  - Rules are relaxed before failing.
- **Ingest:**
  - First/last name columns are combined.
  - Projection rows whose team isn't on the DK slate are tagged `team_not_on_slate` and don't block the run.
  - YAML gotcha: quote "NO" (New Orleans) or it parses as `false`.

## 7. Weekly projection research run (scheduled; the user's own prompt, condensed)
- **Role:** NFL DFS research analyst producing importable projections for the DK Main slate (Sunday 1:00 and
  4:05/4:25 ET; exclude TNF, SNF, MNF and international morning games).
- **Modes:**
  - FULL: Saturday or earlier.
  - NEWS: Sunday before 1 PM. Covers 1:00 inactives (~11:30 ET), status changes, line moves of 1.5+ points, and
    affected teammates.
  - LATE: Sunday after 1 PM, for the 4:05/4:25 games only (inactives ~2:35–2:55 ET).
- **Sources:** free/public only, never paywalled tables, every number sourced (else `est`).
  - Priority: betting markets, then free sites (DFF, ESPN/Yahoo/Sleeper/FantasyPros), then official injury reports,
    weather, and free ownership articles.
- **Pool:** about 100–150 players: QBs, RB1/RB2, WR1–3, TE1 and all DSTs.
- **Method:**
  - Implied total = total/2 − spread/2.
  - Prop line ≈ median; anytime-TD λ = −ln(1 − p); confirm the TD line is 0.5, not 1.5.
  - Blend: 50% market / 50% free-site average with props; 100% free-site average adjusted to the implied total
    without.
  - Floor = p15, ceiling = p85, with default spreads by position.
  - p_play: Q 0.71 (Full practice 0.90, Limited 0.70, DNP 0.40), D 0.06, O 0, no tag 0.98.
  - Redistribute an Out player's volume 45/35/20 (next man up / other options / lost).
  - Weather: wind 15–20 mph → pass yds −10%; 20+ mph → −15%.
  - Ownership: est, about 900% per column.
- **Outputs:**
  - `claude_projections_<date>_<MODE>.csv`: name, team, opp, pos, salary (blank unless a DKSalaries file is
    attached), median, floor, ceiling, own_cash, own_gpp, status, p_play, late_swap_risk, implied_total,
    source_count, sources, confidence, notes.
  - `claude_teams_<date>_<MODE>.csv`.
  - NEWS/LATE runs output only changed rows, plus a `change` column.
  - A ≤15-line summary.
  - Run the 7 quality checks.
  - Send the files with SendUserFile.
- **Example:** `dfs/scripts/wk6_2026_full.py` built the 2026 Week 6 FULL run. Copy its pattern for new weeks.

**Scheduled tasks** (fire into the original session; re-create in a new session if needed; ET; Sep–Jan):
- Saturday 9:52 AM FULL (`trig_01TMuQ7vGY21awMVb85JJRgS`).
- Sunday 11:45 AM NEWS (`trig_01NoP1XtczQevwjibjz8Di9Y`).
- Sunday 3:05 PM LATE (`trig_01HzwergrJjeC7pDYpdqoKSz`).

## 8. Environment limits found so far
- The cloud environment's network policy blocks direct page fetches (curl/WebFetch get a 403 from the proxy); only web
  search works.
- The user was asked to add allowed domains under environment settings → Network access. Suggested list:
  espn.com, fantasypros.com, dimers.com, covers.com, dailyfantasyfuel.com, sportsbookreview.com, nfl.com,
  open-meteo.com, api.weather.gov.
- Until then, research runs are search-only and low-confidence.

## 9. Recent user-facing state
- 2026 Week 6 (Sun Oct 18): FULL projections were sent (search-sourced, low confidence).
- The user then downloaded a DFF cheat sheet (Oct 15). I rebuilt it into
  `projections_week6_main.csv` (Main slate only, ownership estimated, injuries mapped) and sent it.
- The user still needs to upload their **real DKSalaries.csv**. The bundled sample uses fictional players.
- Ownership estimates are heuristic (v1). The DFF ownership column was empty.

## 10. Suggested next steps
1. Help the user get real data flowing:
   - DKSalaries.csv plus DFF projections → app → cash lineup → upload to DK manually.
   - Log entries, settle via the DK contest history export, run flashback on a standings export.
2. After 3–4 weeks of tracked results, calibrate CVs, correlations and field parameters, and watch the
   overconfidence flag.
3. Optional: projection engine P3 once network access allows nflverse; then Phase 6 (NBA).
4. Known rough edges:
   - Cash candidate generation runs at about 0.5 s per ILP solve.
   - A full 150-max GPP takes about 4 minutes.
   - Entries built with plain Objective A are logged without a P(win).

## 11. Guardrails
- Never auto-submit to DK or log into DK. The user uploads CSVs themselves.
- No scraping and no paywalled data.
- Mark heuristic defaults "default — calibrate".
- Report results honestly: say when something is synthetic, estimated or unverified.
- Use they/them for anyone whose pronouns aren't stated.
