"""Week 7 2026 (Sun Oct 25) Sunday NEWS update over claude_projections_2026-10-24_FULL.csv.

Web search only (page fetches blocked). Re-runs the Saturday pipeline (scripts/wk7_2026_full.py) with the 11:30 ET
inactives. Only games whose spread or total moved by 1.5 points or more take the new nflverse line; every other game
keeps Saturday's line. Writes only rows whose median, status or p_play changed, with a `change` column.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import wk7_2026_full as full  # noqa: E402

base = full.base
DATE = "2026-10-25"
SAT = base.OUT / "claude_projections_2026-10-24_FULL.csv"
SAT_TEAMS = base.OUT / "claude_teams_2026-10-24_FULL.csv"

full.STATUS.update({
    ("Lamar Jackson", "BAL"): ("O", 0.0, "INACTIVE (ankle) - NBC Ravens inactives, Yahoo live; Huntley starts"),
    ("Tyler Warren", "IND"): ("O", 0.0, "INACTIVE (groin) - Yahoo live inactives"),
    ("Breece Hall", "NYJ"): ("O", 0.0, "OUT (quad) - Yahoo live: not expected to play"),
})
full.STATUS.pop(("Baker Mayfield", "TB"))          # active: set to return (Yahoo live)
# The model picks QB1 by recent dropbacks, so a starter returning from injury loses to the fill-in. Mark the fill-in
# as not starting ("NA" is in the sport's exclude list) so Mayfield's own profile drives TB's passing game.
full.STATUS[("Jalon Daniels", "TB")] = ("NA", 0.0, "Backup: Mayfield active and starting")
REASON = {"Lamar Jackson": "INACTIVE", "Tyler Warren": "INACTIVE", "Breece Hall": "OUT",
          "Baker Mayfield": "ACTIVE (thumb), starts - Saturday file had the backup starting",
          "Jalon Daniels": "Backup: Mayfield starts"}

_orig_games = full.slate_games
sat_t = pd.read_csv(SAT_TEAMS)
MOVED = []


def slate_games_news(sport):
    g = _orig_games(sport)
    for j, r in g.iterrows():
        s = sat_t[sat_t["team"] == r["home"]].iloc[0]
        sat_spread_line = -float(s["spread"])            # back to nflverse convention (home favored = +)
        sat_total = float(s["total"])
        if abs(r["spread_line"] - sat_spread_line) >= 1.5 or abs(r["total_line"] - sat_total) >= 1.5:
            MOVED.append(f"{r['away']}@{r['home']}: spread {sat_spread_line:+.1f} -> {r['spread_line']:+.1f} (home+), "
                         f"total {sat_total} -> {r['total_line']}")
        else:
            g.at[j, "spread_line"], g.at[j, "total_line"] = sat_spread_line, sat_total
    return g


full.slate_games = slate_games_news

if __name__ == "__main__":
    sport, env, g, slate, rows, res, pct, missing = full.run()
    full.to_base(env, g, rows, pct)
    df, t = base.build()
    t["kickoff_et"] = t["kickoff_et"].str.replace("2026-10-18", full.KICKOFF_DAY)
    key = {(r["name"], r["team"]): i for i, r in rows.iterrows()}
    for j, r in df.iterrows():
        k = f"DST:{r['team']}" if r["pos"] == "DST" else key.get((r["name"], r["team"]))
        if k in pct and r["median"] > 0:
            df.at[j, "floor"], df.at[j, "ceiling"] = round(max(pct[k][0], 0 if r["pos"] != "DST" else -4), 1), \
                round(pct[k][1], 1)
    df.loc[df["median"] <= 0, ["floor", "ceiling"]] = 0.0
    for line in MOVED:
        print("LINE MOVE", line)
    prev = pd.read_csv(SAT).set_index(["name", "team"])
    moved_teams = {x.split(":")[0].split("@")[i] for x in MOVED for i in (0, 1)}
    out = []
    for _, r in df.iterrows():
        k = (r["name"], r["team"])
        p = prev.loc[k] if k in prev.index else None
        old = None if p is None else float(p["median"])
        st_old = "" if p is None or p["status"] != p["status"] else str(p["status"])
        st_new = "" if r["status"] != r["status"] else str(r["status"])
        if p is not None and abs(r["median"] - old) < 0.25 and st_old == st_new and abs(r["p_play"] - p["p_play"]) < 1e-9:
            continue
        if p is None and r["median"] < 3:
            continue
        why = REASON.get(r["name"]) or ("line move" if r["team"] in moved_teams else
                                         "QB change (Mayfield)" if r["team"] == "TB" else
                                         "opponent QB change (Mayfield)" if r["team"] == "CAR" else "teammate of an absence")
        out.append({**r.to_dict(), "change": f"{'new' if old is None else f'{old:.1f}'} -> {r['median']:.1f}: {why}"})
    out = pd.DataFrame(out).sort_values("median", ascending=False)
    out.to_csv(base.OUT / f"claude_projections_{DATE}_NEWS.csv", index=False)
    if MOVED:
        t.to_csv(base.OUT / f"claude_teams_{DATE}_NEWS.csv", index=False)
    print(out[["name", "team", "pos", "median", "p_play", "change"]].to_string(index=False))
