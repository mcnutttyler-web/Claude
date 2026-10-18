"""Week 6 2026 (Sun Oct 18) LATE update (4:05 / 4:25 ET games: LAR-ARI, BUF-LV, KC-LAC) over the NEWS state.

Web search only (page fetches blocked). Starts from scripts/wk6_2026_news.py (Saturday FULL + Sunday NEWS, same
Saturday team factors), applies the late inactives, and writes only the rows that changed versus that state.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import wk6_2026_news as news  # noqa: E402

base = news.base
DATE = "2026-10-18"
LATE_TEAMS = {"LAR", "ARI", "BUF", "LV", "KC", "LAC"}

before, _ = base.build()                       # NEWS state

# name -> (median, source, conf, status, p_play, late_swap, reason); medians are pre-team-factor for ARI/LAC/LAR
LATE = {
    "DJ Moore": (0.0, "Raiders.com;Yahoo live", 0.95, "O", 0.0, "Y", "INACTIVE (shoulder): swap out if rostered"),
    "Khalil Shakir": (13.5, "est", 0.4, "", 0.98, "Y", "Moore inactive: WR1 targets"),
    "Dalton Kincaid": (10.0, "est", 0.3, "", 0.98, "N", "Moore inactive"),
    "Justin Herbert": (12.5, "Chargers.com", 0.4, "", 0.98, "N", "LT Joe Alt inactive"),
    "Chiefs": (10.0, "Chargers.com", 0.55, "", 1.0, "N", "LAC without LT Joe Alt"),
    "Xavier Worthy": (12.5, "Arrowhead Pride", 0.3, "", 0.98, "N", "Rice and Thornton out"),
    "Jeremiyah Love": (9.0, "Bleacher Report", 0.35, "D", 0.15, "Y",
                       "Reported to miss the game (one source, unconfirmed by team list); ARI backup RB not projected"),
    "Trey McBride": (16.5, "est", 0.6, "", 0.98, "N", "More targets if Love sits"),
    "Michael Wilson": (13.0, "est", 0.4, "", 0.98, "N", "More targets if Love sits"),
}
rows, seen = [], set()
for r in base.P:
    if r[0] in LATE:
        med, src, conf, status, pp, ls, why = LATE[r[0]]
        f = 1.0
        if "team-reconciled x" in r[9]:
            f = float(r[9].split("team-reconciled x")[1][:4])
        rows.append((r[0], r[1], r[2], round(med * f, 1) if r[2] != "DST" else med, r[4] + ";" + src, conf, status,
                     pp, ls, why + (f"; team-reconciled x{f:.2f}" if f != 1.0 else "")))
        seen.add(r[0])
    else:
        rows.append(r)
assert seen == set(LATE), set(LATE) - seen
base.P = rows

if __name__ == "__main__":
    df, t = base.build()
    for line in base.checks(df, t):
        if line.startswith(("TEAM FLAG", "own_")):
            print(line)
    old = before.set_index(["name", "team"])
    out = []
    for key, r in df.set_index(["name", "team"]).iterrows():
        o = old.loc[key]
        if abs(r["median"] - o["median"]) >= 0.05 or str(r["status"]) != str(o["status"]) or r["p_play"] != o["p_play"]:
            why = LATE.get(key[0], (None,) * 7)[6]
            assert why, key                       # only intended rows may change
            out.append({**r.to_dict(), "name": key[0], "team": key[1],
                        "late_swap_flag": "LATE SWAP" if key[1] in LATE_TEAMS and r["late_swap_risk"] == "Y" else "",
                        "change": f"{o['median']:.1f} -> {r['median']:.1f}: {why}"})
    out = pd.DataFrame(out)
    out = out[["name", "team"] + [c for c in df.columns if c not in ("name", "team")] + ["late_swap_flag", "change"]]
    out.to_csv(base.OUT / f"claude_projections_{DATE}_LATE.csv", index=False)
    print(out[["name", "pos", "median", "p_play", "own_gpp", "late_swap_flag", "change"]].to_string(index=False))
