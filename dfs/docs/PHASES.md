# Phased rebuild (spec: "NFL DraftKings Projection, Simulation & Lineup System")

The new package lives in `src/dfs/`, next to the working Streamlit app (`app.py`, `core/`, `sports/`). The app is
not changed until a phase beats what it replaces out of sample.

## Phase 0: scoring (done, awaiting review)

- `config/dk_nfl_scoring.yaml` is the scoring config. `tests/test_dk_scoring.py::test_matches_app_scoring_config` keeps
  it identical to `sports/nfl/config.yaml`.
- `src/dfs/scoring.py`: `score_stat_line(stats)` and `score_breakdown(stats)`. Unknown stat names raise an error.
- `tests/test_dk_scoring.py`: 17 hand-calculated lines (300 vs 299 pass yds, 99 vs 100 rush and rec yds, negatives,
  return and fumble-recovery TDs, DST) plus every points-allowed tier edge.
- Exit gate: `python scripts/phase0_gate.py`.
  - A: matches nflverse's own fantasy points on all 6,141 QB/RB/WR/TE player-weeks of 2024, after the documented DK
    differences.
  - B: matches DK-reported FPTS in `tests/fixtures/dk_real_box_scores.csv`. Copy the template, then fill in 10 or more
    rows from DraftKings contest results (player FPTS).

## Phase 4 (simulator): delivered early, at your request

- The drive-level game simulator is in `src/dfs/sim/` and documented in `docs/GAME_SIM.md`.
- It uses the existing bottom-up model (`core/projections/bottomup.py`) as its component engine, so Phases 1–3 are
  not rebuilt yet.
- It beat both existing simulators out of sample (2023–2025) and is on by default (`distributions.game_sim`).
