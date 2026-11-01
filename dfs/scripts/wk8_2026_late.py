"""Week 8 2026 LATE update (4:05 / 4:25 ET: LAC@LAR, KC@DEN, NE@MIA) over the NEWS state.

Web search only (page fetches blocked). Builds the NEWS state (scripts/wk8_2026_news.py), applies the late
statuses, rebuilds, and writes only changed rows in the late games, with `change` and `late_swap_flag` columns.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import wk8_2026_news as news  # noqa: E402

full, base = news.full, news.base
DATE = "2026-11-01"
LATE_TEAMS = {"LAC", "LAR", "KC", "DEN", "NE", "MIA"}


def build_state():
    sport, env, g, slate, rows, res, pct, missing = full.run()
    full.to_base(env, g, rows, pct)
    df, t = base.build()
    key = {(r["name"], r["team"]): i for i, r in rows.iterrows()}
    for j, r in df.iterrows():
        k = f"DST:{r['team']}" if r["pos"] == "DST" else key.get((r["name"], r["team"]))
        if k in pct and r["median"] > 0:
            df.at[j, "floor"], df.at[j, "ceiling"] = round(max(pct[k][0], 0 if r["pos"] != "DST" else -4), 1), \
                round(pct[k][1], 1)
    df.loc[df["median"] <= 0, ["floor", "ceiling"]] = 0.0
    return df


before = build_state()
LATE = {
    ("Colby Parkinson", "LAR"): ("O", 0.0, "INACTIVE (rib) - Rams.com"),
    ("Davante Adams", "LAR"): ("O", 0.0, "OUT: on IR (ruptured hamstring) since Week 7 - missed in Saturday's and NEWS files"),
    ("Theo Wease Jr.", "LAC"): ("O", 0.0, "INACTIVE - Yahoo / Chargers.com"),
    ("Jaylen Waddle", "DEN"): ("Q", 0.85, "Q (chest), trending to play (Rapoport, Schefter); inactives ~2:55 ET"),
}
full.STATUS.update(LATE)
REASON = {"Davante Adams": "OUT (IR since Week 7; was wrongly active in Saturday/NEWS)", "Colby Parkinson": "INACTIVE", "Theo Wease Jr.": "INACTIVE", "Jaylen Waddle": "Q, trending to play (p 0.85)"}

if __name__ == "__main__":
    after = build_state()
    old = before.set_index(["name", "team"])
    out = []
    for _, r in after[after["team"].isin(LATE_TEAMS)].iterrows():
        k = (r["name"], r["team"])
        o = old.loc[k] if k in old.index else None
        st = lambda v: "" if v != v else str(v)  # noqa: E731
        if o is not None and abs(r["median"] - o["median"]) < 0.25 and st(r["status"]) == st(o["status"]) \
                and abs(r["p_play"] - o["p_play"]) < 1e-9:
            continue
        if o is None and r["median"] < 3:
            continue
        why = REASON.get(r["name"]) or ("teammate of Adams (IR) and Parkinson (inactive)" if r["team"] == "LAR" else
                                         "teammate of Wease (inactive)" if r["team"] == "LAC" else
                                         "teammate status" if r["team"] == "DEN" else "opponent change")
        swap = "LATE SWAP" if r["team"] == "LAR" and r["pos"] in ("WR", "TE") or st(r["status"]) == "Q" or \
            r["name"] in REASON else ""
        out.append({**r.to_dict(), "late_swap_flag": swap,
                    "change": f"{'new' if o is None else f'{o['median']:.1f}'} -> {r['median']:.1f}: {why}"})
    out = pd.DataFrame(out).sort_values("median", ascending=False)
    out.to_csv(base.OUT / f"claude_projections_{DATE}_LATE.csv", index=False)
    print(out[["name", "team", "pos", "median", "status", "p_play", "late_swap_flag", "change"]].to_string(index=False))
