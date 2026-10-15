"""Phase 0 exit gate for score_stat_line().

Check A (independent cross-check, every 2024 player-week): nflverse publishes its own fantasy_points_ppr. DK differs
from it only by INT -1 (nflverse -2), fumbles lost -1 (nflverse -2) and the 300/100/100 yardage bonuses, so
    DK = fantasy_points_ppr + interceptions + fumbles_lost + bonuses
must equal score_stat_line(stat line) for every row. One more documented difference: nflverse's fantasy points leave
out offensive fumble-recovery TDs, which DK scores at +6, so those are added to the reference and listed.

Check B (real DK box scores): tests/fixtures/dk_real_box_scores.csv, holding DK's own FPTS as shown in DraftKings
contest results (columns: season, week, player_name, team, dk_fpts, source). It needs at least 10 rows. Nothing
is fabricated: if the file is missing, check B prints PENDING.

    python scripts/phase0_gate.py [--season 2024]
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / "src")]
from dfs.scoring import load_scoring, score_stat_line  # noqa: E402

REAL = ROOT / "tests" / "fixtures" / "dk_real_box_scores.csv"


def nflverse_stat_line(r) -> dict:
    g = lambda c: float(r[c]) if c in r and pd.notna(r[c]) else 0.0  # noqa: E731
    return {"pass_yds": g("passing_yards"), "pass_td": g("passing_tds"), "int": g("passing_interceptions"),
            "rush_yds": g("rushing_yards"), "rush_td": g("rushing_tds"), "rec": g("receptions"),
            "rec_yds": g("receiving_yards"), "rec_td": g("receiving_tds"),
            "fumble_lost": g("rushing_fumbles_lost") + g("receiving_fumbles_lost") + g("sack_fumbles_lost"),
            "two_pt": g("passing_2pt_conversions") + g("rushing_2pt_conversions") + g("receiving_2pt_conversions"),
            "ret_td": g("special_teams_tds"), "fum_rec_td": g("fumble_recovery_tds")}


def check_a(season: int) -> dict:
    path = ROOT / "data" / "nflverse" / f"stats_player_week_{season}.parquet"
    df = pd.read_parquet(path)
    df = df[df.position.isin(["QB", "RB", "WR", "TE"])].reset_index(drop=True)
    bon = load_scoring()["bonuses"]
    mine, ref = [], []
    for _, r in df.iterrows():
        s = nflverse_stat_line(r)
        mine.append(score_stat_line(s))
        bonus = sum(p for k, (t, p) in bon.items() if s[k] >= t)
        ref.append(round(float(r.fantasy_points_ppr) + s["int"] + s["fumble_lost"] + bonus + 6 * s["fum_rec_td"], 2))
    df["dk_mine"], df["dk_ref"] = mine, ref
    df["diff"] = (df.dk_mine - df.dk_ref).round(2)
    bad = df[df["diff"].abs() > 0.011]
    frtd = df[df.fumble_recovery_tds.fillna(0) > 0][["player_display_name", "week", "dk_mine"]]
    return {"fum_rec_td_rows": frtd, "rows": len(df), "exact": int(len(df) - len(bad)), "max_abs_diff": float(df["diff"].abs().max()),
            "mismatches": bad[["player_display_name", "week", "dk_mine", "dk_ref", "diff"]].head(10)}


def check_b(season_hint: int) -> dict | None:
    if not REAL.exists():
        return None
    real = pd.read_csv(REAL)
    rows = []
    for season, grp in real.groupby("season"):
        stats = pd.read_parquet(ROOT / "data" / "nflverse" / f"stats_player_week_{season}.parquet")
        for _, r in grp.iterrows():
            hit = stats[(stats.week == r.week) & (stats.player_display_name == r.player_name)]
            if "team" in r and pd.notna(r.team):
                hit = hit[hit.team == r.team]
            mine = score_stat_line(nflverse_stat_line(hit.iloc[0])) if len(hit) == 1 else float("nan")
            rows.append({"season": season, "week": r.week, "player": r.player_name, "dk_fpts": r.dk_fpts,
                         "mine": mine, "match": abs(mine - r.dk_fpts) < 0.011})
    return {"table": pd.DataFrame(rows)}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, default=2024)
    a = ap.parse_args()
    A = check_a(a.season)
    print(f"Check A — nflverse cross-check, {a.season} REG+POST, QB/RB/WR/TE")
    print(f"| rows | exact match | max abs diff |\n|---|---|---|\n| {A['rows']} | {A['exact']} | {A['max_abs_diff']:.2f} |")
    if len(A["fum_rec_td_rows"]):
        print("Fumble-recovery TD rows (+6 added to the nflverse reference):")
        print(A["fum_rec_td_rows"].to_string(index=False))
    if len(A["mismatches"]):
        print(A["mismatches"].to_string(index=False))
    B = check_b(a.season)
    print("\nCheck B — real DK box scores")
    if B is None:
        print(f"PENDING: {REAL.relative_to(ROOT)} not found (needs >= 10 rows of DK-reported FPTS).")
        ok_b = None
    else:
        t = B["table"]
        print(t.to_string(index=False))
        ok_b = len(t) >= 10 and bool(t["match"].all())
        print(f"{int(t['match'].sum())}/{len(t)} match")
    ok_a = A["exact"] == A["rows"]
    print(f"\nGATE: check A {'PASS' if ok_a else 'FAIL'}; check B "
          f"{'PENDING' if ok_b is None else 'PASS' if ok_b else 'FAIL'}")
    return 0 if ok_a and ok_b is not False else 1


if __name__ == "__main__":
    sys.exit(main())
