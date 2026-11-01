"""Week 8 2026 (Sun Nov 1) Sunday NEWS update over claude_projections_2026-10-31_FULL.csv.

Web search only (page fetches blocked). Re-runs the Saturday pipeline (scripts/wk8_2026_full.py) with the 11:30 ET
inactives. Only games whose spread or total moved by 1.5 points or more take the new nflverse line; every other game
keeps Saturday's line. Writes only rows whose median, status or p_play changed, with a `change` column.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import wk8_2026_full as full  # noqa: E402

base = full.base
DATE = "2026-11-01"
SAT = base.OUT / "claude_projections_2026-10-31_FULL.csv"
SAT_TEAMS = base.OUT / "claude_teams_2026-10-31_FULL.csv"

full.STATUS.update({
    ("A.J. Brown", "NE"): ("O", 0.0, "OUT - ESPN Week 8 inactives"),
    ("TreVeyon Henderson", "NE"): ("O", 0.0, "OUT - ESPN Week 8 inactives"),
    ("Breece Hall", "NYJ"): ("O", 0.0, "OUT (quad) - CBS inactives tracker"),
    ("Tyjae Spears", "TEN"): ("O", 0.0, "OUT - CBS inactives tracker"),
    ("Carnell Tate", "TEN"): ("O", 0.0, "OUT - CBS inactives tracker"),
    ("Ben Skowronek", "PIT"): ("O", 0.0, "INACTIVE (calf) - Steelers Depot"),
})
full.STATUS.pop(("George Pickens", "DAL"))         # ACTIVE (CBS tracker)
REASON = {"A.J. Brown": "OUT", "TreVeyon Henderson": "OUT", "Breece Hall": "OUT", "Tyjae Spears": "OUT",
          "Carnell Tate": "OUT", "Ben Skowronek": "INACTIVE", "George Pickens": "ACTIVE (was Q)"}

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
        if old == 0 and r["median"] == 0 and r["name"] not in REASON:
            continue                                   # backups whose "NA" status reads back as blank
        why = REASON.get(r["name"]) or ("A.J. Brown and Henderson out; NE-MIA total down 2" if r["team"] == "NE" else
                                         "line move" if r["team"] in moved_teams else "teammate of an absence")
        out.append({**r.to_dict(), "change": f"{'new' if old is None else f'{old:.1f}'} -> {r['median']:.1f}: {why}"})
    out = pd.DataFrame(out).sort_values("median", ascending=False)
    out.to_csv(base.OUT / f"claude_projections_{DATE}_NEWS.csv", index=False)
    if MOVED:
        t.to_csv(base.OUT / f"claude_teams_{DATE}_NEWS.csv", index=False)
    print(out[["name", "team", "pos", "median", "p_play", "change"]].to_string(index=False))
