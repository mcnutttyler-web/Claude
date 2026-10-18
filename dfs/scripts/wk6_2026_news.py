"""Week 6 2026 (Sun Oct 18) Sunday NEWS update over claude_projections_2026-10-17_FULL.csv (Saturday FULL run).

Web search only (page fetches still blocked). Applies the 1:00 PM ET inactives and late statuses, rebuilds with the
Saturday script (team reconciliation and ownership included), then writes only the rows whose median, status or
p_play changed, with a `change` column. No line moved 1.5+ points in what search returned, so no teams file.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import wk6_2026_sat as sat  # noqa: E402

base = sat.base
DATE = "2026-10-18"

# name -> (median, source, conf, status, p_play, late_swap, reason)
NEWS = {
    "Caleb Williams": (19.0, "Yahoo live;ESPN inactives", 0.6, "", 0.98, "N", "ACTIVE (not on Bears inactives)"),
    "Tyson Bagent": (0.0, "Yahoo live", 0.8, "", 0.98, "N", "Backup: Caleb active"),
    "Rome Odunze": (14.0, "est", 0.35, "", 0.98, "N", "Caleb active"),
    "A.J. Brown": (12.5, "NBC;Yahoo live", 0.5, "", 0.98, "N", "ACTIVE (off IR); snap count unknown"),
    "Hunter Henry": (10.0, "est", 0.35, "", 0.98, "N", "A.J. Brown active"),
    "Quinshon Judkins": (13.0, "Browns.com", 0.35, "Q", 0.65, "N",
                         "Still unconfirmed at 11:45 ET; Dylan Sampson OUT, so more volume if active"),
    "DJ Moore": (12.5, "SI Bills", 0.35, "Q", 0.25, "Y",
                 "4:25 game: inactives ~2:55 ET; beat reporter expects rest before the bye"),
    "Khalil Shakir": (13.0, "est", 0.3, "", 0.98, "Y", "Up if Moore sits (likely)"),
}

RECON = sat.reconcile_teams()          # Saturday's team factors, computed on Saturday's rows (not re-fit on news)
prev = pd.read_csv(base.OUT / "claude_projections_2026-10-17_FULL.csv").set_index(["name", "team"])
rows, seen = [], set()
for r in base.P:
    if r[0] in NEWS:
        med, src, conf, status, pp, ls, why = NEWS[r[0]]
        rows.append((r[0], r[1], r[2], med, r[4] + ";" + src, conf, status, pp, ls, why))
        seen.add(r[0])
    else:
        rows.append(r)
assert seen == set(NEWS), set(NEWS) - seen
base.P = rows

if __name__ == "__main__":
    for n in RECON:
        print("RECONCILE (Saturday factors)", n)
    df, t = base.build()
    for line in base.checks(df, t):
        if line.startswith(("TEAM FLAG", "own_")):
            print(line)
    new = df.set_index(["name", "team"])
    changed = []
    for key, r in new.iterrows():
        p = prev.loc[key] if key in prev.index else None
        if p is None or abs(r["median"] - p["median"]) >= 0.05 or str(r["status"]) != str(p["status"] if p["status"] == p["status"] else "") \
                or abs(r["p_play"] - p["p_play"]) > 1e-9:
            old = "new" if p is None else f"{p['median']:.1f}"
            why = NEWS.get(key[0], (None,) * 7)[6] or "unexpected change"
            changed.append({**r.to_dict(), "name": key[0], "team": key[1],
                            "change": f"{old} -> {r['median']:.1f}: {why}"})
    out = pd.DataFrame(changed)[["name", "team"] + [c for c in df.columns if c not in ("name", "team")] + ["change"]]
    out.to_csv(base.OUT / f"claude_projections_{DATE}_NEWS.csv", index=False)
    print(out[["name", "pos", "median", "p_play", "own_gpp", "change"]].to_string(index=False))
