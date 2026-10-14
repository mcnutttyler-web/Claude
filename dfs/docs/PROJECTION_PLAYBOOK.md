# Projection model and game-theory playbook (user-supplied reference)

This is a condensed copy of the user's playbook: "DraftKings NFL Classic: Projection Model and Game-Theory Playbook
for a $50/Week, 1–2 Hour Player" (October 2026). Section numbers match the original. Code cites them as
`playbook §x`.

The status column says what is implemented in this repo:
- **built:** in the code.
- **param:** a config value.
- **later:** not built yet.

Evidence grades from the original are kept: PROVEN / CONSENSUS / ESTIMATE / FOLKLORE.

## §2 Build vs. blend: BLEND, with thin custom layers
- FFA's 11-season study (2015–2025) found:
  - A simple average of sources beat individual sources in 63% of head-to-head comparisons.
  - Weighted and equal averages were "functionally interchangeable".
  - Weekly R² was about 3–23%.
  - Recent MAE (DK points): QB 6.1–6.2, RB 5.06, WR 4.84–4.86, TE 3.71–3.76. **built** as `validation.mae_bar`.
- The own model is one view among the sources. With no props, its weight is 0.5 and the consensus's is 0.5
  (`blend.component_weights`). **param**
- Custom layers, ranked by edge per hour:
  1. Late-news re-projection: **built**, the Out-player redistribution in `core/projections/bottomup.py`.
  2. Contest log: **built** (Tracking).
  3. Correlated sims: **built**.
  4. Ownership model: v1 heuristic **built**; regression **later**.
  5. Vegas sanity check: **built** (`bottomup.sanity_max_over`).

## §3 Projection model (`core/projections/bottomup.py`, `config/projections.yaml → bottomup`)

| Item | Rule | Status |
|---|---|---|
| Implied team total | ITT = T/2 − S/2 | built (`vegas.py`) |
| Team plays | league_plays × pace × (1 + 0.004 (ITT − league ITT)); league plays and pace measured from nflverse | built |
| Pass rate | league dropback rate + team PROE − 0.006 × favorite margin; PROE from a rolling, recency-weighted mean (pass − xpass) | built |
| Early season | current-season weight 25% after wk1, 50% after wk3, 75% after wk5 | built (`current_season_weight`) |
| Offense TDs | 0.105 × ITT, split pass/rush ≈ 62/38 (team split shrunk toward the league) | built |
| Efficiency | 50/50 with position average after 8 games: w = g/(g+8) | built |
| TDs by player | 80% from red-zone / goal-line share, 20% own TD share | built |
| Bonuses | P(yards ≥ threshold) from a Normal; SD 0.45 × mean receivers, 0.25 × mean QBs | built (`stat_conversion.bonus_cv`) |
| Wind | ≥15 mph: pass volume −5% and efficiency −5%; ≥20 mph: −10% each, rush +5%; don't double-count a moved total | param (`weather.*`) |
| DvP | FOLKLORE as a standalone input; at most ±3% | not used |
| Rest, travel, altitude | already priced in the lines | not used |
| Injuries | Out player's targets 60% to same-position teammates, 40% across all catchers; carries 70% to next RB, 30% to the rest; team dropbacks −2–4% if QB1/WR1 is out | built |
| Coordinator changes | reset PROE prior toward league | later (manual override) |
| Distributions | lognormal with position CVs: QB 0.42, RB 0.60/0.70, WR 0.60/0.70, TE 0.75, DST 0.80 | param (`distributions.points_cv`) |
| Top-end shrink | actual/engine 0.88 for QB 28+, 0.92 for RB 26+, 0.93 for TE 17+, 0.81 for DST 13+; ramped in linearly | built for QB/RB/TE; DST later |
| Team sanity | blended team points > 10% above the Vegas-anchored model → scale down | built |
| DST | f(opponent ITT, sack rate, turnover rate); rates from play-by-play | built (`dst.py` + pbp inputs) |

## §4 Correlations (`sports/nfl/correlations.yaml`)
Pooled nflverse 2014–2025 raw r:

| Pair | r |
|---|---|
| QB–WR1 | +0.37 |
| QB–WR2 | +0.30 |
| QB–TE1 | +0.31 |
| QB–RB1 | +0.07 |
| QB–opp QB | +0.21 |
| QB–opp WR1 | +0.15 |
| QB–opp DST | −0.41 |
| RB1–opp DST | −0.30 |
| RB1–own DST | +0.10 |
| RB1–opp RB1 | +0.10 |
| WR1–WR2 | 0.00 |
| Cross-game | 0 |

- Conditioning on game total is noise.
- Use sims to rank lineups, not to trust absolute win probabilities.
- Status: **built**.

## §5 Salary and value
- Cash rosters need about 2.8–3.0x value (≈140–150 points); GPP winners about 4.5–5x.
- Salary floor: GPP $49,000–50,000; cash $49,700+.
- Status: **param** (presets).

## §6 Ownership model (**later**)
- Fit on 6+ weeks of the user's own DK standings CSVs (%Drafted). Regress log(own% + 0.5) per position on:
  - value
  - value rank within position
  - salary
  - ITT
  - a promoted-backup flag
  - a "top plays" flag
- Normalize to roster totals.
- Blend 50/50 with a public projection, then shrink 20% toward the position average.
- No independent ownership MAE has been published. Assume ±30–50% relative error on mid-owned players.

## §7–8 Cash and GPP checklists
- **Cash:** one lineup; median-maximizing; post your own $1–$5 H2Hs; block sharp opponents.
- **GPP:** single-entry and 3-max contests in fields under 10K, not the $5 Milly.
- **Stacks:** QB + ≥1 pass-catcher; about 40% double stacks; about 50% bring-backs.
- **Duplication (10K+ fields):** product of ownerships < 1e-9; at least 2 players under 10%.
- **Exposure caps by portfolio size:**

| Lineups | Max non-QB | Max chalk | Min uniques |
|---|---|---|---|
| 2 | 100% | 50% | 3 |
| 5 | 60% | 40% | 3 |
| 10 | 50% | 30% | 3 |
| 20 | 40% | 25% | 2–3 |

- The lineup generator already has these controls (presets).

## §11 Weekly runbook (about 90 minutes)

| When | What |
|---|---|
| Tue | nflverse refresh; flag role changes (route share ±15 pts, carry share ±20 pts) |
| Wed | Opening lines plus consensus |
| Thu | Practice report |
| Fri | Final projections, build lineups, enter contests, post H2Hs |
| Sat | Line moves ≥1.5 |
| Sun 11:35 ET | Inactives → late swap |
| Sun ~3:00 ET | Late window |

**Guards:**
- Every news item needs a timestamp and URL.
- Join on DK ID.
- Targets must be ≈ pass attempts ±10%.
- Team totals must be within 10% of the ITT.
- Spot-check 3 values each week.

## §12 Tracking KPIs
| KPI | Target |
|---|---|
| H2H win rate | ≥ 55.6% |
| Double-up cash rate | ≥ 50% |
| GPP mean percentile | ≥ 55 |
| Projection MAE vs. FFA consensus | within 0.1 per position |
| Players above own p85 | 12–18% |

## §14–15 Expectations
- Only 13% of DK users were net winners over the last 30 days.
- Cash ROI realistically runs −10% to +5%; GPP −30% to +20%.
- Skill is not provable at this volume (≈135+ weeks needed to detect a 5-point percentile edge).
- Judge yourself on process KPIs.
- Rake is the main enemy.
