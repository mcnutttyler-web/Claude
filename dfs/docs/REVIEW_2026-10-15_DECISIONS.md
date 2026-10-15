# External review (Oct 15, 2026): what was done with each recommendation

The full review text is in the conversation history. Its bottom line: the projections are already at public-source
quality. Fix the calibration order, measure every week, and stop tuning small levers.

## Done

| # | Recommendation | What changed | Where |
|---|---|---|---|
| 1a | Calibrate the model, then blend | `apply_to: model` is the default: `proj_model → proj_model_cal → blend with consensus`. Consensus-only rows (rookies) are no longer calibrated. `apply_to: blend` restores the old order. | `core/projections/publish.py: final_calibration`, `config/projections.yaml bottomup.calibration` |
| 1b | Keep 50/50 and equal source weights | Unchanged on purpose. Refit only after about 8 archived weeks, with a prior at 0.5. | — |
| 1c | Lean on consensus after late Outs | A team with a key Out (QB1, ≥10% target share or ≥25% carry share, recently active) blends 25/75 model/consensus and is labelled `blend_late_news`. | `bottomup.py news_teams`, `blend.late_news_model_weight` |
| 1f | Remove the one-way Vegas down-scaling | `sanity_max_over: null` (off). Set 0.10 to re-enable. | `config/projections.yaml` |
| 2a | 2-parameter per-position correction of OWS ownership instead of the ridge | `fit_bias`: logit(actual) = a + b·logit(OWS), ridge toward (0, 1), weighted by contest size. CV reports raw OWS vs corrected. `--fit-bias` saves `data/ownership_bias.json`, and the GPP toggle uses it. | `core/projections/ownership_fit.py` |
| 2a | Weight %Drafted by contest size | Standings averaged with entries as weights. | `ownership_fit.parse_standings / load_slate`, `core/scorecard.py` |
| 3a | Shadow cash lineup | The Cash tab shows the sim pick's overlap with plain max-median, and "Save sim + shadow" writes `cash_lineups.csv`. The scorecard scores both. | `app.py` Cash tab |
| 3a/3e | Simple-default GPP shadow portfolio | New `simple_default` preset (QB+1, no ownership logic). | `sports/nfl/presets.yaml` |
| 3d | No unconfirmed Questionable early-game players in cash | A checkbox, on by default, excludes Q players in the early window. | `app.py` Cash tab |
| 3e | Small-field GPP: low leverage; drop the band, product cap and salary floor | `single_entry`: λ 0.5 → 0.3, ownership band off, min salary 49,000 → 48,000. | `sports/nfl/presets.yaml` |
| 4.2 | Confidence intervals on the calibration gains | 95% block bootstrap (by week) for the RMSE and abs-bias changes. | `core/projections/recalibrate.py` |
| 4.3 | Top-decile check for compression | `top_decile()` is printed with the walk-forward. | same |
| 4.6 | Stop the weekly matchup live validation | The Tuesday scheduled task is now a scorecard reminder. | scheduled task |
| Q8 | Weekly scorecard | Covers: projection MAE, bias and relative MAE for model / calibrated model / DFF / OWS / consensus / final on one pool; p10/p85/p90 coverage; ownership MAE and the chalk check; cash Brier score and sim-vs-shadow; the Saturday → Sunday news check. Plus a history CSV. | `core/scorecard.py`, Tracking tab button, `scripts/weekly_scorecard.py` |
| Q8 | Time-stamped Saturday and Sunday files | Every archive call also saves `snapshots/<YYYYMMDD-HHMM>/`. | `core/archive.py` |

## What the new checks show (walk-forward 2019–2026, 15,480 player-weeks)

**Calibration gains:**

| Pos | RMSE change [95% CI] | Abs-bias change [95% CI] |
|---|---|---|
| QB | −0.021 [−0.045, +0.004] | −0.36 to −0.20 |
| RB | −0.020 [−0.041, +0.001] | −0.58 to −0.19 |
| WR | −0.063 [−0.092, −0.034] | −0.66 to −0.35 |
| TE | −0.015 [−0.034, +0.004] | −0.43 to −0.08 |

The review was right: only WR's RMSE gain is outside the noise. The bias reductions are real at every position,
and they are what the optimizer needs.

**Top decile:**

| Pos | Actual − projected (raw) | After calibration |
|---|---|---|
| QB | +1.6 | +0.6 |
| RB | −1.0 | −0.0 |
| WR | −1.0 | −0.2 |
| TE | +0.6 | +0.4 |

The top QBs are compressed. **Next experiment:** relax the QB top-end shrink (0.88 at 28+), re-run the walk-forward,
and refit the calibration.

## Not done, on purpose

| Recommendation | Why |
|---|---|
| Learn the blend weight now (1b) | Not enough data, and the forecast combination literature says to keep it equal. Revisit after about 8 weeks. |
| Props (1d) | Medium–large effort for a small gain over DFF/OWS. Revisit if a free feed can be fully automated. |
| xFP / `load_ff_opportunity` shares (1e) | Medium effort. A candidate for the next model experiment. |
| OWS Team Ownership → field stack rates (2c) | Medium effort. Validate first with real stack rates from the standings (the scorecard can add this). |
| Opponent-quality logging (3c) | Needs your DK username in the standings files; the cash lines are recorded through the archive. |
| Vacated-volume split backtest (1c optional) | Medium effort. A candidate after the QB top-end experiment. |

## Frozen (works, but stop tuning it)

Cash candidate variants, cash ownership sharpening, duplication splitting, product-of-ownership caps (still used by
the larger-field presets), and Showdown.
