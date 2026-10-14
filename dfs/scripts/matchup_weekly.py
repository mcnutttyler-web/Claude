"""Tuesday-evening refresh for the matchup layer (current season).

    python scripts/matchup_weekly.py            # season inferred from today's date

1. downloads this season's play-by-play, rosters, snap counts, FTN charting, participation (if published),
   weekly player stats and the schedule; logs the latest game date and warns if Monday's game is missing
2. checks coverage data: man/zone (participation) and blitz (FTN >= 90% of dropbacks) -> switched off if missing
3. cross-checks DK points computed from play-by-play against nflverse weekly player stats
4. archetypes as of next week, with reset flags (team change / coach or OC change / snap share moved > 20 pts)
5. live validation: baseline A + frozen-model multiplier for every completed week; new weeks appended to
   docs/live_2026_results.md
Report: data/matchup/reports/weekly_<date>.md (also printed).
"""
from __future__ import annotations

import sys
from datetime import date, datetime
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

from core.matchup import backtest as BT  # noqa: E402
from core.matchup import data as MD  # noqa: E402
from core.matchup import defense as D  # noqa: E402
from core.matchup import effect as E  # noqa: E402
from core.matchup import live  # noqa: E402
from core.matchup.apply import MODEL, frozen_features  # noqa: E402
from core.projections import nflverse  # noqa: E402
from sports.base import load_sport  # noqa: E402

REPORTS = ROOT / "data" / "matchup" / "reports"


def monday_check(games: pd.DataFrame, pbp_games: set[str], season: int, today: date) -> tuple[list[str], int]:
    g = games[(games["season"] == season) & (games["game_type"] == "REG")].copy()
    g["d"] = pd.to_datetime(g["gameday"]).dt.date
    played = g[g["d"] < today]
    if played.empty:
        return [], 0
    wk = int(played["week"].max())
    w = played[played["week"] == wk]
    notes = []
    missing = w[~w["game_id"].isin(pbp_games)]
    for r in missing.itertuples():
        tag = "MONDAY game" if r.weekday == "Monday" else f"{r.weekday} game"
        notes.append(f"WARNING: {tag} {r.away_team}@{r.home_team} ({r.gameday}) is not in the play-by-play yet — "
                     f"re-run later (nflverse usually updates overnight).")
    return notes, wk


def points_check(pg: pd.DataFrame, season: int) -> str:
    p = MD.extra_path("stats", season)
    if not p.exists():
        return "player-stats cross-check skipped (file missing)"
    st = pd.read_parquet(p)
    st = st[st["season_type"] == "REG"]
    st["dk_ref"] = (st["passing_yards"] * 0.04 + st["passing_tds"] * 4 - st["passing_interceptions"]
                    + st["rushing_yards"] * 0.1 + st["rushing_tds"] * 6 + st["receptions"] + st["receiving_yards"] * 0.1
                    + st["receiving_tds"] * 6
                    - (st["rushing_fumbles_lost"] + st["receiving_fumbles_lost"] + st["sack_fumbles_lost"])
                    + 3 * (st["passing_yards"] >= 300) + 3 * (st["rushing_yards"] >= 100)
                    + 3 * (st["receiving_yards"] >= 100))
    x = pg[pg["season"] == season].merge(st[["player_id", "week", "dk_ref"]], on=["player_id", "week"], how="inner")
    if x.empty:
        return "player-stats cross-check: no overlap"
    diff = (x["dk"] - x["dk_ref"]).abs()
    return (f"DK points vs nflverse player stats: {len(x)} player-games, {np.mean(diff <= 0.5):.1%} within 0.5 pts, "
            f"median diff {diff.median():.2f} (differences come from laterals, 2-pt plays and stat corrections)")


def main(season: int | None = None, today: date | None = None):
    today = today or date.today()
    season = season or (today.year if today.month >= 3 else today.year - 1)
    sport = load_sport("nfl")
    al = sport.team_aliases
    lines = [f"# Matchup layer weekly report — {today.isoformat()} (season {season})", ""]

    # 1. data
    log = []
    nflverse.fetch([season - 1, season], dest=nflverse.DEFAULT_DIR, log=log.append)
    nflverse.fetch_games(log=log.append)
    have = MD.fetch_extra(season, log=log.append)
    games = pd.read_csv(nflverse.DEFAULT_DIR / "games.csv")
    pbp = pd.read_parquet(nflverse.path_for("pbp", season), columns=["game_id", "game_date", "season_type"])
    latest = pd.to_datetime(pbp.loc[pbp["season_type"] == "REG", "game_date"]).max()
    mon, last_week = monday_check(games, set(pbp["game_id"]), season, today)
    lines += ["## Data", f"- Latest game date in play-by-play: **{latest.date() if latest == latest else 'none'}** "
              f"(last completed week: {last_week})"] + [f"- {n}" for n in log] + [f"- {n}" for n in mon]
    if not mon:
        lines.append("- All games of the last completed week are present (incl. Monday).")

    d = MD.load(list(range(2016, season + 1)), al, refresh={season})
    pg, dg = d["player_games"], d["defense_games"]

    # 2. coverage
    cov = D.coverage_status(dg, season)
    off = [f for f in ("man_rate", "blitz_rate") if not cov[f]]
    lines += ["", "## Coverage features",
              f"- man/zone (participation file {'present' if have.get('participation') else 'not published'}): "
              f"{'ON' if cov['man_rate'] else 'OFF — set to league average'}",
              f"- blitz (FTN charted on {cov['ftn_charted_share']:.0%} of dropbacks): "
              f"{'ON' if cov['blitz_rate'] else 'OFF — set to league average (needs >= 90%)'}"]
    # 3. points check
    lines += ["", "## Scoring check", f"- {points_check(pg, season)}"]

    # 4. archetypes + flags (as of next week)
    path = Path(str(MODEL).format(season=season))
    if not path.exists():
        lines += ["", f"Model {path.name} not found — run scripts/matchup_backtest.py (offseason fit)."]
        return _write(lines, today)
    m = E.EffectModel.load(path)
    cur = pg[pg["season"] == season]
    nxt = last_week + 1
    last = cur.sort_values("week").groupby("player_id").tail(1)
    sched = games[(games["season"] == season) & (games["week"] == nxt)]
    opp = {}
    for r in sched.itertuples():
        h, a = al.get(r.home_team, r.home_team), al.get(r.away_team, r.away_team)
        opp[h], opp[a] = a, h
    up = last[last["team"].isin(opp)][["player_id", "name", "position", "team"]].copy()
    up["opp"], up["season"], up["week"] = up["team"].map(opp), season, nxt
    ft = frozen_features(m, pg, dg, games, al, up)
    nx = ft[ft["game_id"].astype(str).str.startswith("UPCOMING_")].merge(
        up[["player_id", "name"]], on="player_id", how="left", suffixes=("", "_up"))
    flagged = nx[nx["flag_team_change"] | nx["flag_coach_change"] | nx["flag_role_change"]]
    lines += ["", f"## Archetypes for week {nxt}",
              "Counts: " + "; ".join(f"{p}: " + ", ".join(f"{k} {v}" for k, v in g["archetype"].value_counts().items())
                                     for p, g in nx.groupby("position")),
              "", f"### Reset flags ({len(flagged)} players use current-season-only profiles)",
              "| player | pos | team | archetype | team change | coach/OC change | role change (snap ±20) |",
              "|---|---|---|---|---|---|---|"]
    for r in flagged.sort_values(["position", "team"]).itertuples():
        lines.append(f"| {r.name} | {r.position} | {r.team} | {r.archetype} | {'yes' if r.flag_team_change else ''} | "
                     f"{'yes' if r.flag_coach_change else ''} | {'yes' if r.flag_role_change else ''} |")
    cfg = BT.load_config()
    on = [p for p, v in cfg["positions"].items() if v]
    big = nx[nx["position"].isin(["QB", "RB", "WR", "TE"])].copy()
    big["mult_at_15"] = E.multiplier(big["effect"], 15.0, m.cfg.cap)
    lines += ["", f"### Largest matchup effects for week {nxt} (experimental; applied only to: {', '.join(on) or 'none'})",
              "| player | pos | vs | archetype | effect (pts) | mult at 15 pts |", "|---|---|---|---|---|---|"]
    for r in big.reindex(big["effect"].abs().sort_values(ascending=False).index).head(12).itertuples():
        lines.append(f"| {r.name} | {r.position} | {r.opp} | {r.archetype} | {r.effect:+.2f} | {r.mult_at_15:.3f} |")

    # 5. live validation
    from matchup_baseline import run as run_baseline
    base = run_baseline([season], log=lambda s: None)
    if len(base):
        fs = ft[~ft["game_id"].astype(str).str.startswith("UPCOMING_") & (ft["season"] == season)]
        p = BT.pool(BT.attach(base, fs, BT.raw_dvp(pg), m.cfg.cap, m.cfg.min_proj))
        added = live.update(p)
        lines += ["", "## Live validation", f"- weeks added to docs/live_2026_results.md: {added or 'none (already logged)'}"]
    return _write(lines, today)


def _write(lines, today):
    REPORTS.mkdir(parents=True, exist_ok=True)
    out = REPORTS / f"weekly_{today.isoformat()}.md"
    out.write_text("\n".join(lines) + "\n")
    print("\n".join(lines))
    print(f"\nreport -> {out}")
    return out


if __name__ == "__main__":
    main()
