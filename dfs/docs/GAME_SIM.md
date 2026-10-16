# Drive-level game simulator

The code is in `src/dfs/sim/game.py`. Its parameters are in `config/game_sim_params.json`, fit by
`python -m dfs.sim.fit --seasons 2016-2022`. The backtest is `scripts/sim_backtest.py`, and its results are in
`docs/game_sim_backtest.md`.

## How one simulated game works

1. **Clock and possessions.** There are two 30-minute halves, and the teams alternate possessions.
   - Each drive ends in a TD, a FG or nothing.
   - Its length is drawn by outcome: a TD drive averages 3.5 min, a FG drive 3.9 min, anything else 2.1 min.
   - A drive that would run past the half scores nothing.
   - Scoring drives therefore leave fewer possessions. That is why the drive count isn't an independent number:
     treating it as independent made team scores too spread out (SD 10.2 points vs 9.2 in real games). The clock
     version gets 9.4.
2. **Scoring rates.** Two pilot runs calibrate the TD and FG rate per drive, so that mean TDs equal the bottom-up
   model's team TDs and mean points equal the Vegas implied team total.
3. **Game script.** The dropback rate moves −0.0045 per point of margin beyond the expected margin. That is fitted
   from team-games, after removing each team-season's average.
4. **Volume.**
   - Team targets and carries move with plays and pass rate.
   - Each player's share is drawn from a Dirichlet distribution centred on the model's share. The concentrations
     are fitted from the over-dispersion of weekly counts: WR targets 67, TE 97, RB 68, RB carries 8.6, QB carries 46.
   - A share no listed player takes goes to an "other" bucket.
5. **Yards.**
   - Receptions ~ Binomial(targets, catch rate).
   - Yards are the sum of per-play yards resampled from real 2016–2022 plays by position, scaled to the player's
     yards per catch or per carry. Negative runs and 80-yard catches are both kept.
   - A small team passing-efficiency shock (fitted SD 0.025) is correlated with scoring.
6. **TDs.** The team's TDs split into pass and rush, then go to players in proportion to their TD share times
   their realized volume. A player can't score a receiving TD without a catch.
7. **Box scores reconcile.**
   - QB passing yards and TDs equal the sum of his receivers' (listed players plus "other").
   - The DST is scored from the opponent's simulated points, sacks, INTs and lost fumbles. Return TDs (8.8% of
     turnovers), special-teams TDs, safeties and blocked kicks use fitted rates.
8. **Availability.**
   - Questionable players play with probability p_play.
   - Regulars leave early at fitted rates: QB 3.3%, RB 6.5%, WR 5.6%, TE 4.2%, playing about 28% of the game.
   - The volume they leave flows to teammates automatically.
9. **Points.** `config/dk_nfl_scoring.yaml` scores the stat lines (vectorized, and tested equal to
   `score_stat_line`). Each player is then scaled so the sim mean equals the final projection (`proj_cal`). That
   keeps the sim's shape and correlations.

## Results (2023–2025 weeks 2–18, never used for fitting; 2026 holdout untouched)

These are 6,120 player-weeks from the FFA pool plus 1,536 DST games. Each engine gets the same player means, so only
the shape and correlations differ.

| | new | projection-engine sim | app copula sim | fixed-CV baseline |
|---|---|---|---|---|
| Below p10 (target 10%) | **8.8%** | 13.0% | 20.0% | 10.7% |
| Above p90 (target 10%) | **12.0%** | 13.4% | 13.6% | 15.7% |
| Inside p25–p75 (target 50%) | **49.9%** | 43.9% | 39.0% | 43.4% |
| CRPS (lower is better) | **4.517** | 4.563 | 4.589 | 4.565 |

- **CRPS gain of the new simulator, 95% CI by week:**
  - −0.046 [−0.056, −0.036] vs the projection-engine sim.
  - −0.072 [−0.094, −0.049] vs the app copula.
  - −0.048 [−0.062, −0.033] vs the baseline.
- **By position:**
  - It beats the projection-engine sim at every position.
  - It beats the app copula clearly at RB and WR, and ties at QB and TE.
  - It beats the baseline at QB and RB, and ties at WR and TE.
- **Within-game correlations:** the new simulator is the closest of the three to the real ones. The old factor sim
  makes WR1–WR2 +0.24, RB1–RB2 +0.27 and RB1–WR1 +0.18, against real values of about 0, −0.04 and 0.

## Known gaps (to fix by fitting on 2016–2022, not on the test seasons)

- **QB stacks are a bit weak:** QB–WR1 +0.32 vs +0.39 real, QB–WR2 +0.26 vs +0.35, QB–TE1 +0.23 vs +0.28. The
  team passing-efficiency shock is probably too small.
- **DST vs opposing QB:** −0.19 vs −0.40 real. Sacks and INTs are drawn without a link to the QB's efficiency.
- **Opposing RBs:** +0.01 vs −0.10 real. The game script doesn't yet move carries between the teams enough.
- **Top-end tails:** about 13–15% of real QB, WR and TE scores land above p90 (target 10%). The right tail is a
  little thin.
- **Not modeled:** 2-point conversions per player, and DK's exclusion of points the DST didn't allow (such as a
  pick-six thrown by its own offense).
- **Coverage:** players without nflverse history (for example rookies before Week 1) keep the factor sim.

## Runtime

About 8 s for 10,000 sims of a full-week slate (400 players) on the container. It runs once per projection build.
