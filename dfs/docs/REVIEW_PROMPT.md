# Review prompt: DraftKings NFL projections and lineup builder (updated Oct 15, 2026)

Paste everything below the line into a new AI session, or give it to a knowledgeable reviewer.

---

You are an expert in NFL analytics, daily fantasy sports (DraftKings), and sports modeling and optimization. Please
review the system described below. Then tell me, in priority order:

1. **Projections:** what would make my projections and player information more accurate.
2. **Ownership:** what would make my ownership estimates more accurate.
3. **Lineups:** what would make lineup building more accurate and more profitable, for cash and GPP.
4. **Mistakes:** anything that looks wrong, risky, statistically unsound, or over-engineered for my situation.

For each idea, give:
- the expected impact, with evidence if you have any
- the effort: small, medium or large
- the data it needs, which must be free (or the paid file I already have; see below)
- how I would measure whether it worked (what to backtest or track)

Label each idea as proven, consensus practice, or speculation. Say so plainly when something can't be improved
meaningfully at my stakes.

## About me
- **Stakes:** about $50 a week on DraftKings NFL Classic, Main slate.
  - Cash: $1–$5 head-to-heads, which I post myself.
  - GPPs: 2–20 lineups in small-field, single-entry and 3-max contests.
- **Time:** 1–2 hours a week. I use a MacBook Air (Python virtualenv, local Streamlit app). I'm not a programmer.
- **Data:**
  - Free: DailyFantasyFuel (DFF) cheat sheets, nflverse.
  - Paid: the One Week Season (OWS) projections + ownership CSV, used personally and kept local.
- **Rules:**
  - No scraping against a site's terms.
  - Nothing ever logs into DraftKings or submits lineups. I upload CSVs by hand.
- **Expectations:** I can't prove an edge statistically in one season, so I care about process quality and
  calibration.

## The system today
About 180 automated tests, all passing.

### 1. Weekly workflow (what I actually do)
1. Download the DK salary CSV, the DFF cheat sheet and the OWS projections CSV.
2. In the app, Projections tab → "Build my own from public data".
   - Upload DFF + OWS together.
   - The app auto-downloads nflverse data. It uses certifi, with a fallback to system curl, because python.org
     Python on macOS lacks certificates.
3. Cash tab:
   - The simulated cash engine picks the lineup with the highest P(beat the cash line). About 1 minute.
4. GPP tab: a sim-ROI portfolio (2–20 lineups).
5. Export the DK upload CSV and upload it to DK by hand.
6. Sunday after inactives: rebuild, then late-swap.
7. Sidebar "Archive this week": saves salaries, DFF, OWS, the pool export and, after the games, my DK contest
   standings.
8. Tracking tab: settle from DK contest history.

### 2. Projection pipeline (order of operations)
1. **Own bottom-up model (nflverse play-by-play + Vegas)**
   - **Team volume:**
     - Plays = league average × pace × (1 + 0.004 × (implied total − average)).
     - Pass rate = league average + team PROE − 0.006 × favorite margin.
     - Offensive TDs = 0.105 × implied total, split by team history.
   - **Player shares:** recency-weighted target, carry, red-zone and goal-line shares.
     - Blended with last season early in the year (25/50/75%).
     - Efficiency is shrunk toward the position average, weight g/(g+8).
     - TDs come 80% from red-zone share.
     - Receiving lines are reconciled to the QB's passing line.
   - **Injuries:**
     - An Out player's targets go 60% to same-position teammates and 40% to all catchers.
     - His carries go 70% to the next RB.
     - Weighted by how much of the team's recent games he actually played (stops double counting).
     - Dropbacks drop 3% when the QB1 or WR1 is out.
   - **Other pieces:** top-end shrink; DST from opponent implied total plus play-by-play sack/turnover rates.
   - **Vegas lines:** from an odds file, else the projection source's spread/total (DFF), else the nflverse
     schedule.
2. **Consensus:** every uploaded source (DFF, OWS) is averaged with equal weight.
3. **50/50 blend** of the own model and the consensus (`blend_with_fallback`). Players without model history, such
   as rookies, use 100% consensus.
4. **Per-position calibration:** actual ≈ a + b·projection, fit on the walk-forward backtest, shrunk toward
   identity, and applied only inside the fitted projection range. Its output, `proj_cal`, is what the optimizer
   uses.
   - **Caveat:** the calibration was fit on the own model alone but is applied to the blend.
5. **Vegas sanity check:** a team whose blended points run more than 10% above the Vegas-anchored model is scaled
   down. This week that scaled BUF, CLE and TB by 1–2%.
6. **Outcome distributions:** a 10,000-sim Monte Carlo.
   - Shocks for the game, team passing, zero-sum target share and team rushing.
   - Questionable players are modeled as a mix of plays and sits, with teammate redistribution when they sit.
   - Correlations follow pooled nflverse values: QB–WR1 +0.37, QB–TE1 +0.31, QB–opposing DST −0.41, WR1–WR2 ≈ 0.

### 3. Accuracy so far (walk-forward, real games)
**Own model alone**, 2019–2026, 15,480 player-weeks. Pool: top 20 QB/TE and top 40 RB/WR by projection, chosen
before the games among players who played. Inactives were known, as they are after Sunday's inactive lists.

| Pos | MAE | Naive season-average MAE | R² |
|---|---|---|---|
| QB | 6.60 | 7.50 | 0.10 |
| RB | 6.43 | 6.79 | 0.26 |
| WR | 7.14 | 7.43 | 0.14 |
| TE | 5.37 | 6.17 | 0.12 |

**Calibration walk-forward:**

| Pos | Bias before → after | MAE change | RMSE change |
|---|---|---|---|
| QB | −0.62 → −0.31 | −0.009 | −0.021 |
| RB | +0.61 → +0.05 | −0.083 | −0.020 |
| WR | −0.75 → −0.13 | +0.036 | −0.063 |
| TE | −0.57 → −0.15 | +0.042 | −0.015 |

I shipped all four positions, because the optimizer cares about the mean, not the median.

**Agreement on Week 6:** my model correlates 0.95–0.97 with DFF and OWS.

**Not tested:** the blended or consensus projections, because no historical DFF/OWS archive exists yet. It starts
this week.

### 4. Ownership
- **GPP:** OWS's published ownership comes first.
  - Players it doesn't cover get min(heuristic, 1%).
  - Totals are rescaled to QB 100%, DST 100%, RB+WR+TE 700%.
  - Ownership is tilted under the salary cap if needed.
- **Cash:** OWS ownership sharpened (own^1.6 within each position, totals kept, capped at 85%, kept salary-feasible
  at about $49,800).
- **Fallback heuristic (v1 softmax):** now salary-feasible. It used to imply a $56,900 "average lineup", which made
  the field fit fail.
- **Ownership model (ridge regression on logit(%Drafted)),** fit on my archived DK standings.
  - It's compared by leave-one-slate-out CV against the heuristic and against OWS.
  - It needs 3 or more slates first, so there's no data yet.
  - There's a GPP-tab toggle to use it.

### 5. Lineup engines
- **Optimizer:** integer program (PuLP/CBC), DK rules, stacking and bring-back rules, uniqueness and exposure caps.
- **Cash:**
  - About 140 candidate lineups: the top 60 by median, plus median/floor blends, fade pivots and consensus
    neighbors.
  - Each is scored against a simulated cash field (Dirichlet ownership, stacking behavior, salary floor $49,700,
    reweighted to match target ownership within about 1 point).
  - The cash line is the k-th best opponent score. The engine picks max P(win).
  - Reducing 300 candidates to 60 picked the identical lineup.
  - Typical P(win) is about 0.64 in H2H and double-ups against this field.
- **GPP:**
  - Sim-sampled candidates with log-ownership leverage, ownership bands and product-of-ownership caps.
  - Exact prize splitting for duplicates against a simulated field.
  - Greedy portfolio by marginal expected payout.
- **Also:** Showdown, late swap (sims conditioned on scores already in) and tracking (reliability, ROI,
  overconfidence flag, flashback).

### 6. Tested and rejected: matchup layer (off)
- **What it tried:** player archetypes (k-means: "alpha WR", "slot PPR WR", "workhorse RB", "rushing QB"...) ×
  schedule-adjusted defense profiles (EPA allowed, explosive rate, pressure, man/zone, blitz, residual allowed by
  position and archetype).
- **Model:** empirical-Bayes plus ridge with cross-validation, ±8% cap.
- **Result:** walk-forward 2019–2025, holdout 2022–2025. No position beat the opportunity/Vegas baseline with a
  confidence interval excluding zero; QB came closest at −0.02 MAE.
- **Straw man:** raw DvP made projections worse at every position (+0.2 to +0.5 MAE).
- **Ongoing:** 2026 live validation is logged weekly.

### 7. Known gaps and open issues
1. **Calibration target:** calibration was fit on model-only projections but is applied to the model+consensus
   blend. It will be refit once about 6 weeks of DFF/OWS files are archived.
2. **Untested blend weight:** the 50/50 model/consensus weight is a default, not learned.
3. **Remaining biases:** the raw model under-projects WR/TE/QB by about 0.6–0.75 and over-projects RBs; calibration
   corrects this.
4. **Missing model inputs:**
   - Rookies and new signings without history get no model projection (136 DK-listed players this week, mostly
     backups).
   - No offensive-coordinator data (manual YAML).
   - Route participation uses snap share as a proxy.
   - No kicker model.
5. **Late news:** a Sunday rebuild needs a fresh DFF/OWS download by hand. Status comes from the source files or an
   injuries CSV.
6. **Cash field realism:** the simulated cash field fits ownership, but its stacking and salary behavior aren't
   calibrated to real H2H opponents yet. I need to log real cash lines.
7. **Unused data:** OWS "Team Ownership" (stack ownership) isn't used yet. It could calibrate the GPP field's
   stacking rate.
8. **No data of my own yet:** no tracked results, so every field/correlation/variance setting is "default —
   calibrate".

## Specific questions
1. **Projections:** where is the biggest remaining accuracy gain? Options include:
   - learning the model/consensus weight
   - weighting the two consensus sources differently
   - better injury/vacated-volume rules
   - player props
   - route data
   - something else
2. **Calibration:** is my calibration approach sound (ridge toward identity, range-limited, judged on RMSE and
   bias rather than MAE)? How should I refit it on blended projections once I have the archive?
3. **Ownership:** given OWS ownership, what's the best use of my own DK standings? Bias-correct OWS by position or
   price tier? Model the gap between GPP and cash ownership? How many slates until it's worth it?
4. **Cash engine:** is P(beat the cash line) against a simulated field meaningfully better than "maximize median
   with chalk" for $1–$5 head-to-heads? What field assumptions matter most, and how should I calibrate them from
   real cash lines?
5. **GPP:** for 2–20 lineups in single-entry and small-field contests, which settings matter (stacking shell,
   leverage, duplication, salary left over, exposure caps), and which are noise? How should OWS team ownership
   feed the field model?
6. **Variance:** are my outcome distributions realistic (CVs by position, correlations, TD variance)? What's the
   right weekly calibration check (players above their 85th/90th percentile)?
7. **Matchup layer:** was rejecting it right? Is there a better formulation, such as opportunity changes instead of
   efficiency, or pace/PROE interactions?
8. **Tracking:** what should I track weekly to know within a season whether the system helps, given that ROI is
   too noisy?
9. **Simplify:** what would you remove or simplify?
10. **Next three things:** if you could change only three things before next Sunday, what would they be?
