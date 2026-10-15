# Research prompt: how DFS professionals build projections and simulators

Paste everything below the line into a deep-research tool (ChatGPT Deep Research, Claude Research, or similar).
It is research only. The output is a report and a design that plugs into the phased build in `docs/PHASES.md`.
The building happens later, phase by phase.

---

## Your role

You are a research team: a quantitative sports analyst, a professional NFL DFS player, a statistician who works on
probabilistic forecasting, and a software engineer. Find out how serious NFL DFS players and commercial tools build
**(1) weekly player projections** and **(2) Monte Carlo simulators**. Then recommend the most defensible design for
one person's system, backed by evidence.

## Who this is for (read before researching)

- **Player:** one hobbyist on DraftKings NFL Classic. About $50 a week across $1–$5 head-to-head cash games and 2–20 GPP
  lineups, usually in small fields. Not mass multi-entry.
- **Machine:** a MacBook Air, running a Python and Streamlit app. The whole weekly workflow must run in about 10 minutes
  or less.
- **Data:** free and legal sources only.
  - nflverse: play-by-play, snap counts, participation through 2025, FTN charting, weekly stats and schedule lines.
  - User-supplied CSVs: DK salaries, DK contest standings with actual %Drafted and FPTS, and paid projection and
    ownership files that stay local and are never redistributed.
  - No scraping against a site's terms of service, and no copying paid projection tables.
- **Already built and backtested** (so the research should build on this, not restart):
  - DK scoring is verified (6,141 of 6,141 player-weeks match).
  - The bottom-up model works as follows:
    - Plays come from pace and the implied team total.
    - Pass rate comes from pass rate over expectation (PROE) and the spread.
    - Recency-weighted target and carry shares.
    - Efficiency is shrunk with g/(g+8).
    - TDs come from team scoring, 80% assigned by red-zone share.
    - Receiving totals are reconciled to the QB.
    - Volume from players ruled Out is redistributed.
  - Calibration is per position, then the model is blended 50/50 with consensus.
  - **Findings so far:**
    - The model beats naive baselines at every position.
    - Calibration fixes bias at every position. It reduces RMSE beyond noise only for WR.
    - Top-decile QBs are under-projected (compressed).
    - A defense-archetype matchup layer was tested and **rejected**: raw defense-vs-position (DvP) hurt accuracy.
  - The current simulator draws player outcomes from fitted distributions with fixed correlation settings for
    QB-stack, bring-back and RB-vs-own-QB. It is not a possession-level simulator.
- **Rules for the system:**
  - Every model must beat simple baselines out of sample.
  - No look-ahead leakage.
  - The 2026 season is a holdout, so it is never used for tuning.
  - ROI is reported last and never used to tune models.

## Evidence labels (required on every claim)

Tag each finding with one of these labels:

- **[Documented]**: the company or author publicly states it. Link the page.
- **[Open source]**: visible in public code. Link the repo and file.
- **[Academic]**: peer-reviewed or a conference paper, such as the MIT Sloan conference, JQAS or arXiv.
- **[Practitioner]**: a named expert's public writing, podcast or talk. Give the date.
- **[Inferred]**: deduced from a tool's observable behavior. Say how.
- **[Proposed]**: your own recommendation.

Do not present inference as fact. Commercial tools do not publish their algorithms, so say so when you hit a wall. If
two sources disagree, show both. Prefer sources from 2020 on, and flag anything older than 2018. Every URL must be
real and must actually support the claim it is cited for.

## Part A: How professional projections are made

Answer each question with how pros do it, the evidence, and the strongest method for this system.

1. **Team volume.**
   - How are plays, possessions, pass/rush split and pace projected?
   - How much weight do Vegas totals and spreads get, compared with team tendencies?
   - How is game script built in: is it a point forecast, or a distribution of scripts?
2. **Opportunity allocation.**
   - How are targets, carries, routes and red-zone and goal-line work assigned?
   - Shares or counts? How are they made to add up to team totals (normalization, Dirichlet or multinomial models)?
3. **Role change.**
   - How fast do pros react to new snap, route or target data, compared with prior seasons? What half-lives or
     windows are used?
   - How are injuries, depth-chart changes, coaching or OC changes, and returning players handled?
   - How is vacated volume split among teammates, and is there evidence on which split rule is most accurate?
4. **Efficiency.**
   - How much shrinkage is applied to yards per carry, yards per target, catch rate and TD rate, and what is the
     evidence on their stability (split-half or year-to-year correlations)?
   - Do expected-fantasy-points (xFP) models beat raw recent points?
5. **Touchdowns.**
   - Team TDs from implied totals, then assignment to players? Poisson, negative binomial, or something else?
   - How are rushing QBs and goal-line backs handled?
6. **QB ceiling and top-end compression.**
   - Why do projections under-project top QB weeks?
   - How do pros keep elite QB ceilings without inflating everyone?
7. **Matchups.**
   - What evidence shows opponent adjustments help? Which ones: pass defense EPA, coverage scheme (man or zone), pressure
     rate, opponent-adjusted efficiency?
   - Why does raw DvP fail, and what replaces it?
8. **Market inputs.**
   - How do pros use player props, the "wisdom of crowds", and consensus projections?
   - What is the evidence for blending, and for weighting the sources equally versus learning the weights?
9. **Mean, median and percentiles.** What does each major site's projection represent? Which one should feed a cash
   optimizer, and which a simulator?
10. **Validation.**
    - How do pros measure accuracy: MAE, RMSE, calibration by projection bucket, interval coverage, CRPS?
    - What accuracy is realistic by position? Cite public accuracy studies, such as FantasyPros' accuracy studies or
      academic papers.
    - Which baselines must a model beat?

## Part B: How professional simulators are built

1. **Architectures.** Compare, with evidence and costs:
   - (a) Each player's own outcome distribution plus a correlation matrix or Gaussian copula, as in the open-source
     tools such as `chanzer0/NFL-DFS-Tools`.
   - (b) Shared game-level factors (total, pace, pass rate, game script) that drive player outcomes.
   - (c) Drive- or possession-level simulation.
   - (d) Play-by-play simulation, which SaberSim says it uses.

   For each one, state:
   - What it gets right and wrong: whether the box scores add up, negative correlation between teammates on volume,
     TD clustering, and fat right tails.
   - Runtime for 10,000 sims on a laptop.
   - Which one is justified for a small-stakes player.
2. **Correlation.**
   - How are QB–pass-catcher, teammate competition for targets, RB versus game script, bring-back and
     DST-versus-opposing-offense correlations estimated and validated?
   - Fixed numbers, or estimated from data?
   - Give published empirical correlation values from historical DK scoring, with sources.
3. **Distribution shape.**
   - How are floors, ceilings, boom and bust, and in-game injury or early exit modeled?
   - How do discrete TDs and explosive plays create the right tail?
4. **Calibration of a simulator.**
   - How do you test that simulated distributions match reality? Cover PIT histograms, coverage at p10, p50 and p90,
     CRPS, recovery of real teammate correlations, and the distribution of the slate's best possible lineup score.
   - How many sims are needed for stable lineup rankings (convergence)?
5. **Consistency with projections.**
   - How do pros keep the simulated mean equal to the projection while adding correlation?
   - Re-centering, quantile mapping, or something else?

## Part C: How the best players gain an edge with simulators

1. **Opponent and field simulation.**
   - How are opponent lineups generated to match projected ownership and real stacking and salary-usage rates?
   - How is duplication estimated?
2. **Lineup selection.**
   - What is the evidence that picking lineups by simulated ROI or top-1% rate beats a simple
     projection-plus-correlation optimizer?
   - What is known about overfitting to "sim ROI"?
3. **Contest type.**
   - What changes between H2H and 50/50 cash games, small-field GPPs, single-entry and 3-max contests, and large-field
     GPPs?
   - How much of a GPP edge comes from leverage and ownership, compared with simply having better projections?
   - Cite public analysis, for example the work on "optimal lineup" ownership, or published contest-results studies.
4. **Ownership modeling.**
   - Which features predict DK ownership?
   - What error is achievable?
   - How should a paid ownership file be corrected with a simple model (bias by position and salary) instead of
     replaced?
5. **What actually drives results at small stakes.** Rank by evidence: projection quality, ownership accuracy, late
   swap and news, contest selection, correlation, and variance management. Say plainly which edges are small or
   unproven.

## What to deliver

1. **Executive summary** (1 page): the strongest practical methods for projections and simulation for this player, and
   what is not worth building.
2. **Findings** for Parts A–C, with evidence labels and links.
3. **A comparison table of simulator architectures:** accuracy, consistency, runtime, effort to build, and how to
   validate it.
4. **Recommended design:**
   - Fill in the next phases of `docs/PHASES.md`: Phase 2 baselines, Phase 3 component engine, Phase 4 simulator,
     Phase 5 cash optimizer, Phase 6 GPP portfolio.
   - For each phase, give the method, the maths (formulas, not prose), the data it needs (free sources only, naming the
     nflverse table), the baseline it must beat, the metric and pass threshold, and an estimated runtime.
5. **A ranked list of experiments**, ordered by expected gain per hour of work. Include:
   - Relaxing the QB top-end shrink.
   - Opportunity shares from xFP / `load_ff_opportunity`.
   - Props, if a free and legal feed exists.
   - Vacated-volume split rules.
   - Learning correlations from data instead of fixed settings.
6. **Pitfalls and red flags:** leakage traps such as final injury reports, closing lines and post-game snap data;
   misleading metrics; and "sophistication that loses to a baseline".
7. **Sources:** a full list with URL, date and evidence label.

## Rules

- Do not invent sources, numbers, test results or accuracy figures. If something is unknown, say "unknown".
- Do not recommend paid data, scraping against terms of service, auto-submitting lineups, or bet sizes.
- Prefer simple models when the evidence does not favor complex ones, and say when that is the case.
- Keep recommendations within a MacBook Air and a weekly runtime of about 10 minutes.
