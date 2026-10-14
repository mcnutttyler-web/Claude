# Review prompt: DraftKings NFL projections and lineup builder

Paste everything below the line into a new AI session, or give it to a knowledgeable reviewer.

---

You are an expert in NFL analytics, daily fantasy sports (DraftKings), and sports modeling and optimization. Please
review the system described below. Then tell me, in priority order:

1. **Projections:** what would make the projections and player information more accurate.
2. **Lineups:** what would make lineup building more accurate and more profitable.
3. **Mistakes:** anything that looks wrong, risky, or over-engineered for my situation.

Be concrete. For each idea, give:
- the expected impact, with evidence if you have any
- the effort: small, medium or large
- the data it needs, which must be free
- how I would know whether it worked (what to backtest or measure)

Say which ideas are proven, which are consensus practice, and which are speculation. Say so when you think
something can't be improved meaningfully at my stakes.

## About me
- **Stakes:** I play DraftKings NFL Classic for about $50 a week.
  - Cash: $1–$5 head-to-heads, which I post myself.
  - GPPs: 2–20 lineups in small-field, single-entry and 3-max contests.
- **Time:** I have 1–2 hours a week. I use a MacBook Air.
- **Rules I won't break:**
  - Free data only. No paywalled sources (ETR, Stokastic, 4for4).
  - No scraping against a site's terms.
  - Nothing ever logs into DraftKings or submits lineups. I upload CSVs by hand.
- **Expectations:** at this volume I can't statistically prove an edge in one season. I want process quality: no
  unforced errors, sound contest selection, and well-calibrated projections.

## What has been built (Python, local Streamlit app, about 150 automated tests)

### A. Lineup generator (sport-agnostic core, NFL plugin, NBA stub)
- **Inputs:** DraftKings salary CSV plus any projections CSV.
  - Fuzzy name matching, column auto-mapping, and DailyFantasyFuel cheat-sheet support.
  - Players whose team isn't on the slate are ignored.
- **Optimizer:** integer program (PuLP/CBC) with DK roster rules.
  - Stack rules: QB + pass-catchers, bring-back, game stacks, max per team.
  - No offense against your own DST; uniqueness and exposure caps.
- **Cash engine:** maximizes P(beating the cash line), not the highest projection.
  - It simulates the slate 10,000 times with correlated outcomes.
  - It simulates a realistic opposing field (Dirichlet ownership, stacking behavior, salary floors).
  - It reads the cash line from that field and uses mean-variance logic: when favored, share chalk to lower
    variance; when an underdog, add variance.
  - Outputs include fade risk, free squares, alternative lineups, and a one-lineup-vs-split recommendation.
- **GPP engine:**
  - Candidate lineups come from sims, with log-ownership leverage, ownership bands and a cap on the product of
    ownerships.
  - Each candidate is scored by simulated ROI against a simulated field, with exact prize splitting for duplicates.
  - The portfolio is picked greedily by marginal expected payout.
- **Showdown:** captain at 1.5x, with captain ownership modeled separately.
- **DK file handling:** CSV export, a byte-exact DKEntries round-trip, and late swap (cash and GPP) that conditions
  sims on scores already in.
- **Tracking:** settles from DK contest history and DK standings exports.
  - Reports reliability, ROI, an overconfidence flag and calibration suggestions.
  - "Flashback" replays a past contest; bankroll warnings flag over-betting.
- **Defaults:** every tunable starts as "default — calibrate". There is no real tracked history yet, so nothing is
  calibrated to my results.

### B. Projection engine (`core/projections/`)
- **Vegas:** implied team totals from spreads and totals. Lines come from an odds CSV, the projection source, or the
  free nflverse schedule.
- **Consensus blend:** of any free sources, with inverse-MAE or equal weights.
- **Props model:** power de-vig, line → median → mean, alt-line CDFs, anytime-TD λ. It needs a props CSV I'd have
  to enter by hand.
- **DST:** points allowed ~ Normal(opponent implied total, 9) over DK's scoring tiers, plus sack and turnover rates
  from play-by-play.
- **Weather:** wind rules (≥15 mph: −10% pass yards; ≥20 mph: −19% and +5% rushing).
- **Outcome distributions:** Monte Carlo with game, team-pass, zero-sum target-share and rushing shocks.
  - Questionable players are modeled as a mix of plays and sits, with redistribution when they sit.
  - Correlations follow pooled nflverse estimates: QB–WR1 +0.37, QB–TE1 +0.31, QB–opposing DST −0.41, WR1–WR2 ≈ 0.
- **Ownership:** a v1 heuristic softmax over value, points, salary, team total and value rank. It is **directional
  only**. No ownership model has been fit to real data yet.

### C. Own bottom-up model from free data (`core/projections/bottomup.py`, nflverse play-by-play)
- **Team volume:**
  - Plays = league average × pace × (1 + 0.004 × (implied total − league average)).
  - Pass rate = league average + team PROE − 0.006 × favorite margin.
  - Offensive TDs = 0.105 × implied total, split pass/rush by team history.
- **Player shares:** recency-weighted target, carry, red-zone and goal-line shares, blended with last season early
  in the year (25/50/75%).
  - Efficiency is shrunk toward the position average with weight g/(g+8).
  - TDs come 80% from red-zone share.
  - Receiving lines are reconciled to the QB's passing line.
- **Injuries:**
  - An Out player's targets go 60% to same-position teammates and 40% to all catchers.
  - His carries go 70% to the next RB.
  - All of it is weighted by how much he has actually played lately, which avoids double counting.
  - Dropbacks drop 3% when the QB1 or WR1 is out.
- **Blend and sanity check:** blended 50/50 with a free consensus (e.g. DFF). A team whose total runs more than 10%
  above what Vegas supports is scaled down. The very top projections are shrunk slightly.
- **Walk-forward backtest:** 2025 weeks 2–18 plus 2026 weeks 2–5, with inactives known. Pool: top 20 QB/TE and top
  40 RB/WR.

  | Pos | MAE | Season-average baseline | Bias | R² |
  |---|---|---|---|---|
  | QB | 6.58 | 7.50 | −0.7 | 0.10 |
  | RB | 6.30 | 6.79 | +0.4 | 0.26 |
  | WR | 6.86 | 7.43 | −0.8 | 0.14 |
  | TE | 5.72 | 6.17 | −1.1 | 0.12 |

  It beats a naive baseline everywhere. It correlates 0.97 with DFF on the current slate. I can't compare it to
  historical consensus, because free archived consensus projections aren't available as files.
- **Known gaps:**
  - TEs, WRs and QBs are projected about 1 point low; this isn't recalibrated yet.
  - Rookies with no history get no model projection.
  - There is no offensive-coordinator change data.
  - Route participation uses snap share as a proxy.
  - Kickers aren't modeled.

### D. Experimental matchup layer (`core/matchup/`) — tested and rejected, so it is OFF
- **Archetypes:** players are clustered by usage (k-means). Examples: "alpha target-hog WR", "slot PPR WR",
  "three-down RB", "rushing QB".
- **Defense profiles:**
  - Schedule-adjusted against each opponent's own norm: pass/run EPA allowed, explosive pass rate, pressure rate,
    middle-target share, man rate (2018–2025), blitz rate (FTN, 2022+).
  - Also the residual each defense allowed to the position and to the archetype.
  - Last season is blended in with weight g/(g+k), k = 8 after tuning.
- **Model:** a ridge regression of "points beyond what opportunity predicts, relative to the player's norm" on
  defense × archetype features.
  - Shrinkage is heavy: empirical Bayes plus cross-validated penalties with the one-standard-error rule.
  - It is refit once per offseason, and the multiplier is capped at ±8%.
- **Holdout result, 2022–2025:**

  | Pos | Change in MAE [95% CI] |
  |---|---|
  | QB | −0.020 [−0.044, +0.006] |
  | RB | −0.001 [−0.005, +0.004] |
  | WR | −0.000 [−0.005, +0.005] |
  | TE | −0.004 [−0.009, +0.001] |

  - No position cleared the bar, which required a confidence interval excluding zero and at least a 0.5% gain.
  - Raw DvP, the straw man, made every position worse, by 0.2–0.5 MAE.
  - 2026 live, weeks 1–5: QB −0.09 MAE (n = 100); the other positions ≈ 0.
- **2026 live machinery:** a Tuesday refresh script.
  - It downloads data, checks for the Monday game, auto-disables coverage features when data is missing (2026 has
    no man/zone file), and cross-checks DK points (99.5% match).
  - It flags players for reset (team, coach or role change) and appends weekly live results.

### E. Weekly workflow today
1. Download the DK salary CSV and the free DFF cheat sheet.
2. In the app, click "Build my own projections". The nflverse data refreshes automatically.
3. Build the cash lineup and GPP lineups, export the CSV, and upload it to DK by hand.
4. Sunday, after inactives: swap players who are out.
5. Log my entries, then settle them from DK's exports afterward.

## Specific questions
1. **Biggest gain:** where is the largest remaining accuracy gain in projections at my stakes? Candidates:
   - late-news handling
   - better injury/vacated-volume rules, learned from data
   - recalibrating the remaining biases
   - better shares (route participation, two-week role trends)
   - player-prop markets
   - more consensus sources
   - something else
2. **Odds data:** which free, terms-compliant data would most improve things? (Props? Public ownership? Something
   on nflverse I'm not using?) How should I get it without scraping?
3. **Ownership:** how should I build a real ownership model from my own DK contest standings exports, and how many
   weeks do I need before it beats a heuristic?
4. **Distributions:** are my projection distributions realistic? (Coefficient of variation by position, the bust
   mixture, correlations.) How should I check calibration, e.g. players finishing above their 85th percentile?
5. **Cash:** is maximizing P(beat the cash line) with a simulated field better than simply maximizing the median
   for $1–$5 head-to-heads? When does the difference matter?
6. **GPP:** for 2–20 lineups in small-field and single-entry contests, which settings matter most? (Stacking shell,
   ownership leverage, duplication limits, salary left over, exposure caps.) Which are noise?
7. **Matchup layer:** was rejecting it right, or did the test miss something? (Should the effect target opportunity
   instead of efficiency? Different features? A longer sample?) Is QB worth keeping in the live log?
8. **Tracking:** what should I track weekly so I know within a season whether the system helps, given that ROI is
   too noisy at my volume?
9. **Over-engineering:** what would you remove or simplify because it adds complexity without accuracy?
10. **Next three things:** if you could change only three things before next Sunday, what would they be?
