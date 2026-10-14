# Matchup layer backtest (EXPERIMENTAL)

Generated 2026-10-14 by `scripts/matchup_backtest.py`. Data comes from nflverse (free).

## Plain-English result
**No position cleared the bar, so the matchup layer stays OFF.**

The rule: in the 2022–2025 holdout seasons, the matchup-adjusted projection (B) has to lower the average
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
- **QB:** high-volume pocket QB, aggressive deep-ball QB, conservative game-manager QB, rushing QB
- **RB:** committee / change-of-pace RB, three-down RB, pass-catching RB, goal-line / early-down RB
- **WR:** slot PPR WR, alpha target-hog WR, YAC / gadget WR, rotational depth WR, deep outside WR
- **TE:** dump-off YAC TE, move / receiving TE, blocking / depth TE, red-zone TE
   - Proxies: the route-participation input is offensive snap share, and the slot-rate input is the share of
     targets thrown to the middle of the field. Free data has no alignment or route charting.
3. **Defense profiles.** Each defense profile is built only from games before the week. Each result is compared
   with that offense's average in its other games (the schedule adjustment). Profiles include:
   - EPA per play allowed on passes and runs, and the gap between them (funnel)
   - explosive pass rate, pressure rate (sacks plus QB hits), and middle-target share
   - man rate (2018–2025 participation data) and blitz rate (FTN charting, 2022+)
   - the residual allowed to the position and to the archetype

   Last season is shrunk 30% toward the league average, then blended in with weight games/(games + k).
   k = 8 was chosen on 2019–2021. Coverage features are set to league average (switched off) when the
   season's charting is missing: 2016: ['blitz_rate', 'man_rate'], 2017: ['blitz_rate', 'man_rate'], 2018: ['blitz_rate'], 2019: ['blitz_rate'], 2020: ['blitz_rate'], 2021: ['blitz_rate'], 2026: ['man_rate'].
4. **Target.** The target is actual DK points minus the points expected from opportunity alone. That expectation
   comes from a per-position OLS on targets and carries (QB: attempts, designed carries, scrambles). Then the
   player's own usual residual is subtracted (last 16 games, shrunk n/(n+8)). That leaves "how he did vs his norm,
   given his volume".
5. **Effect model.** This is a ridge regression per position on the defense features plus defense × archetype
   interactions. The archetype terms get double the penalty.
   - Shrinkage is heavy. The "allowed" inputs are empirical-Bayes shrunk with n/(n + σ²/τ²), and the ridge penalty
     is picked by leave-one-season-out CV with the one-standard-error rule, which means more shrinkage.
   - The model is refit once per offseason on every earlier season.
   - Ridge penalties chosen by season: {np.int64(2019): {'QB': 3162.2776601683795, 'RB': 31622.776601683792, 'WR': 31622.776601683792, 'TE': 31622.776601683792}, np.int64(2020): {'QB': 10000.0, 'RB': 100000.0, 'WR': 31622.776601683792, 'TE': 10000000.0}, np.int64(2021): {'QB': 3162.2776601683795, 'RB': 31622.776601683792, 'WR': 10000.0, 'TE': 10000000.0}, np.int64(2022): {'QB': 10000.0, 'RB': 31622.776601683792, 'WR': 31622.776601683792, 'TE': 10000000.0}, np.int64(2023): {'QB': 10000.0, 'RB': 31622.776601683792, 'WR': 31622.776601683792, 'TE': 31622.776601683792}, np.int64(2024): {'QB': 10000.0, 'RB': 31622.776601683792, 'WR': 100000.0, 'TE': 316227.7660168379}, np.int64(2025): {'QB': 10000.0, 'RB': 31622.776601683792, 'WR': 100000.0, 'TE': 31622.776601683792}, np.int64(2026): {'QB': 10000.0, 'RB': 31622.776601683792, 'WR': 100000.0, 'TE': 31622.776601683792}}
6. **Multiplier.** The multiplier is 1 + effect / max(projection, 5), capped at ±8%.
7. **Straw man.** Raw DvP is the defense's DK points allowed per game to the position this season, divided by the
   league average, applied unshrunk and uncapped. A ±8%-capped version is also shown.

The pool is the FFA protocol: the top 20 QB/TE and top 40 RB/WR by A each week, among players who played.
Calibration slope is the slope of actual on projection, where 1.0 is ideal. Bias is projection minus actual.

## Holdout 2022–2025 (decides use)
| pos | n | MAE A | MAE B | ΔMAE B−A [95% CI] | MAE DvP raw | MAE DvP ±8% | ρ A | ρ B | Δρ [95% CI] | calib slope A / B | bias A / B |
|---|---|---|---|---|---|---|---|---|---|---|---|
| QB | 1440 | 6.440 | 6.420 | -0.020 [-0.044, +0.006] | 6.873 | 6.426 | 0.230 | 0.242 | +0.012 [-0.006, +0.029] | 1.06 / 1.06 | -0.71 / -0.70 |
| RB | 2880 | 6.311 | 6.311 | -0.001 [-0.005, +0.004] | 6.573 | 6.303 | 0.434 | 0.432 | -0.002 [-0.005, +0.001] | 0.95 / 0.95 | +0.60 / +0.60 |
| WR | 2880 | 7.012 | 7.012 | -0.000 [-0.005, +0.005] | 7.238 | 7.025 | 0.241 | 0.239 | -0.002 [-0.005, +0.001] | 0.78 / 0.79 | -0.93 / -0.94 |
| TE | 1440 | 5.267 | 5.263 | -0.004 [-0.009, +0.001] | 5.737 | 5.294 | 0.292 | 0.296 | +0.004 [-0.001, +0.009] | 0.90 / 0.90 | -0.62 / -0.62 |

## All backtest seasons 2019–2025
| pos | n | MAE A | MAE B | ΔMAE B−A [95% CI] | MAE DvP raw | MAE DvP ±8% | ρ A | ρ B | Δρ [95% CI] | calib slope A / B | bias A / B |
|---|---|---|---|---|---|---|---|---|---|---|---|
| QB | 2480 | 6.598 | 6.581 | -0.017 [-0.039, +0.005] | 7.108 | 6.632 | 0.258 | 0.268 | +0.010 [-0.004, +0.025] | 1.12 / 1.09 | -0.56 / -0.55 |
| RB | 4960 | 6.427 | 6.426 | -0.001 [-0.004, +0.002] | 6.684 | 6.414 | 0.423 | 0.422 | -0.001 [-0.003, +0.001] | 0.94 / 0.93 | +0.61 / +0.61 |
| WR | 4960 | 7.153 | 7.150 | -0.003 [-0.008, +0.004] | 7.366 | 7.164 | 0.231 | 0.231 | -0.001 [-0.004, +0.002] | 0.70 / 0.70 | -0.71 / -0.71 |
| TE | 2480 | 5.353 | 5.350 | -0.003 [-0.006, +0.000] | 5.725 | 5.361 | 0.301 | 0.304 | +0.003 [-0.000, +0.006] | 0.93 / 0.93 | -0.56 / -0.56 |

## k tuning
Each row shows the MAE of B on 2019–2021, then the holdout ΔMAE by position (QB, RB, WR, TE).

| k | tune MAE B | ΔMAE QB | ΔMAE RB | ΔMAE WR | ΔMAE TE |
|---|---|---|---|---|---|
| 3 | 6.6897 | -0.0191 | -0.0015 | -0.0001 | -0.0023 |
| 5 | 6.6881 | -0.0199 | -0.0012 | -0.0001 | -0.0029 |
| 8 | 6.6878 | -0.0201 | -0.0007 | -0.0004 | -0.0041 |

## How big the adjustments are (holdout)
- Mean |multiplier − 1|: QB 2.10%, RB 0.98%, TE 0.48%, WR 0.78%
- Share of players at the ±8% cap: QB 0.5%, RB 0.0%, TE 0.0%, WR 0.0%

## Reading this
- **ΔMAE** is how much the matchup multiplier changed the average absolute error, in DK points per player.
  Negative is better. The bracket is the 95% range from resampling weeks.
- **DvP raw** is the "this defense gives up the most points to WRs" idea, taken literally. If it does worse than
  A, unshrunk DvP is noise that hurts projections, as the playbook's §3 says.
- Historical consensus projections (e.g. FFA archives) aren't freely downloadable as files, so A stands in for the
  consensus here. A tracks a DFF cheat sheet at about 0.97 correlation.
