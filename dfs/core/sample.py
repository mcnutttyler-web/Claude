"""Synthetic NFL slate generator for the demo and tests.

All players are FICTIONAL. Files mimic DK's formats (DKSalaries.csv, DKEntries.csv) and a typical
projection-site export with non-canonical headers, so the column-mapping and name-matching paths
get exercised.
"""
from __future__ import annotations

import csv
import io
from pathlib import Path

import numpy as np
import pandas as pd

FIRST = ["Alex", "Blake", "Cam", "Dante", "Eli", "Felix", "Gus", "Hank", "Isaac", "Jalen", "Kobe", "Leo",
         "Marcus", "Nico", "Omar", "Pierce", "Quinn", "Reggie", "Sol", "Trey", "Uriah", "Vince", "Wade",
         "Xavier", "Yusuf", "Zeke", "Andre", "Bo", "Cyrus", "Deon"]
LAST = ["Abbott", "Barlow", "Castro", "Dunn", "Ellery", "Fontaine", "Garrity", "Holloway", "Ingram", "Jessup",
        "Kowalski", "Lambert", "Moreau", "Nakamura", "Oduya", "Pruitt", "Quarles", "Rourke", "Sandoval",
        "Tillman", "Underwood", "Vasquez", "Whitfield", "Yates", "Zeller", "Archer", "Brennan", "Coyle"]
MASCOT = {"PHI": "Eagles", "DAL": "Cowboys", "KC": "Chiefs", "BUF": "Bills", "SF": "49ers", "SEA": "Seahawks",
          "MIA": "Dolphins", "WAS": "Commanders", "DET": "Lions", "GB": "Packers", "CIN": "Bengals",
          "BAL": "Ravens"}
CITY = {"PHI": "Philadelphia", "DAL": "Dallas", "KC": "Kansas City", "BUF": "Buffalo", "SF": "San Francisco",
        "SEA": "Seattle", "MIA": "Miami", "WAS": "Washington", "DET": "Detroit", "GB": "Green Bay",
        "CIN": "Cincinnati", "BAL": "Baltimore"}
GAMES = [("PHI", "DAL", "01:00PM"), ("KC", "BUF", "01:00PM"), ("SF", "SEA", "01:00PM"),
         ("MIA", "WAS", "01:00PM"), ("DET", "GB", "04:25PM"), ("CIN", "BAL", "08:20PM")]
DATE = "10/18/2026"

# position: (count, salary range, points-per-$1k range)
TEMPLATE = {
    "QB": [((5600, 8200), (2.4, 3.0)), ((4000, 4400), (0.6, 1.0))],
    "RB": [((6000, 9200), (2.2, 2.7)), ((4400, 5600), (1.8, 2.3)), ((4000, 4500), (1.0, 1.6))],
    "WR": [((6200, 9000), (2.1, 2.5)), ((4800, 6400), (1.9, 2.4)), ((3400, 4800), (1.8, 2.4)),
           ((3000, 3400), (1.2, 1.8))],
    "TE": [((3600, 7200), (1.9, 2.4)), ((2500, 3000), (1.0, 1.6))],
    "DST": [((2400, 3800), (2.0, 2.6))],
    "K": [((4000, 5000), (1.6, 1.9))],
}
CV = {"QB": 0.35, "RB": 0.50, "WR": 0.60, "TE": 0.65, "DST": 0.80, "K": 0.55}


def make_players(seed: int = 7, games=GAMES, include_k: bool = False) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    rows, pid, name_k = [], 40100000, 0
    for away, home, t in games:
        total = float(rng.choice([41.5, 44.5, 46.5, 48.5, 51.5]))
        spread = float(rng.choice([-6.5, -3.5, -2.5, 1.5, 3.0]))
        for team, opp, sgn in ((away, home, 1), (home, away, -1)):
            tt = round(total / 2 - sgn * spread / 2, 2)
            for pos, tiers in TEMPLATE.items():
                if pos == "K" and not include_k:
                    continue
                for rank, ((slo, shi), (vlo, vhi)) in enumerate(tiers, start=1):
                    sal = int(rng.integers(slo // 100, shi // 100 + 1) * 100)
                    med = round(sal / 1000 * rng.uniform(vlo, vhi) * (tt / 23.0) ** 0.5, 2)
                    if pos == "DST":
                        name = MASCOT[team] + " "
                    else:
                        name = f"{FIRST[name_k % len(FIRST)]} {LAST[(name_k * 11 + name_k // len(LAST)) % len(LAST)]}"
                        name_k += 1
                    rows.append(dict(id=str(pid), name=name, position=pos, salary=sal, team=team, opp=opp,
                                     away=away, home=home, time=t, median=med, rank=rank,
                                     team_total=tt, game_total=total, spread=sgn * spread))
                    pid += 1
    df = pd.DataFrame(rows)
    df["floor"] = (df["median"] * (1 - 1.1 * df["position"].map(CV))).clip(lower=0).round(2)
    df["ceiling"] = (df["median"] * (1 + 1.3 * df["position"].map(CV))).round(2)
    value = df["median"] / (df["salary"] / 1000)
    raw = np.exp(2.2 * (value - value.mean()) / value.std() + 0.8 * (df["median"] - df["median"].mean())
                 / df["median"].std())
    df["ownership"] = 0.0
    slots = {"QB": 1, "RB": 2.4, "WR": 3.4, "TE": 1.2, "DST": 1, "K": 1}
    for pos, grp in df.groupby("position"):
        df.loc[grp.index, "ownership"] = (raw[grp.index] / raw[grp.index].sum() * slots[pos]).clip(upper=0.85)
    df["ownership"] = df["ownership"].round(4)
    df["status"] = ""
    return df


def roster_position(pos: str) -> str:
    return f"{pos}/FLEX" if pos in ("RB", "WR", "TE") else pos


def dk_salaries_csv(players: pd.DataFrame, showdown: bool = False) -> str:
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\r\n")
    w.writerow(["Position", "Name + ID", "Name", "ID", "Roster Position", "Salary", "Game Info", "TeamAbbrev",
                "AvgPointsPerGame"])
    for r in players.itertuples():
        gi = f"{r.away}@{r.home} {DATE} {r.time} ET"
        avg = round(r.median * 0.95, 2)
        if showdown:
            cpt_id = str(int(r.id) + 500000)
            w.writerow([r.position, f"{r.name} ({cpt_id})", r.name, cpt_id, "CPT", int(r.salary * 1.5), gi,
                        r.team, avg])
            w.writerow([r.position, f"{r.name} ({r.id})", r.name, r.id, "FLEX", r.salary, gi, r.team, avg])
        else:
            w.writerow([r.position, f"{r.name} ({r.id})", r.name, r.id, roster_position(r.position), r.salary,
                        gi, r.team, avg])
    return buf.getvalue()


def projections_csv(players: pd.DataFrame, messy: bool = True) -> str:
    """Projection-site style export: different headers, DST by city+mascot, WSH alias, a 'Jr.' suffix."""
    p = players.copy()
    if messy:
        dst = p["position"] == "DST"
        p.loc[dst, "name"] = p.loc[dst, "team"].map(lambda t: f"{CITY[t]} {MASCOT[t]}")
        p.loc[dst, "position"] = "DEF"
        nondst = p.index[~dst]
        p.loc[nondst[3], "name"] = p.loc[nondst[3], "name"] + " Jr."
        p.loc[nondst[10], "name"] = p.loc[nondst[10], "name"].upper()
        p["team"] = p["team"].replace({"WAS": "WSH"})
    out = pd.DataFrame({
        "Player": p["name"].str.strip(), "Team": p["team"], "Pos": p["position"], "Proj": p["median"],
        "Floor": p["floor"], "Ceiling": p["ceiling"], "Own%": (p["ownership"] * 100).round(2),
        "Implied": p["team_total"], "O/U": p["game_total"], "Status": p["status"],
    })
    return out.to_csv(index=False)


def dk_entries_csv(contests: list[tuple[str, str, str, int]], slot_header: list[str],
                   players: pd.DataFrame) -> str:
    """contests: (contest_name, contest_id, entry_fee_str, n_entries). Mimics DK's layout incl. the
    instructions block and the player list to the right of the entries."""
    n_slots = len(slot_header)
    header = ["Entry ID", "Contest Name", "Contest ID", "Entry Fee"] + slot_header + ["", "Instructions"]
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\r\n")
    w.writerow(header)
    eid = 4400000001
    instr = ["1. Locate the player you want to select in the list below",
             "2. Copy the ID of your player (you can use the Name + ID column or the ID column)",
             "3. Paste the ID into the roster position desired",
             "4. You must include an ID for each player; you cannot use just the player's name",
             "5. You can create up to 500 entries; contests with fewer entries are fine"]
    rows = []
    for name, cid, fee, n in contests:
        for _ in range(n):
            rows.append([str(eid), name, cid, fee] + [""] * n_slots)
            eid += 1
    k = 0
    for r in rows:
        w.writerow(r + ["", instr[k] if k < len(instr) else ""])
        k += 1
    blank = [""] * (4 + n_slots + 1)
    w.writerow(blank + [""])
    w.writerow(blank + ["Position", "Name + ID", "Name", "ID", "Roster Position", "Salary", "Game Info",
                        "TeamAbbrev", "AvgPointsPerGame"])
    for r in players.head(25).itertuples():
        w.writerow(blank + [r.position, f"{r.name} ({r.id})", r.name, r.id, roster_position(r.position), r.salary,
                            f"{r.away}@{r.home} {DATE} {r.time} ET", r.team, round(r.median * 0.95, 2)])
    return buf.getvalue()


def write_sample_data(out_dir: str | Path) -> None:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    players = make_players()
    players.loc[players.index[5], "status"] = "Q"
    players.loc[players.index[20], "status"] = "O"
    (out / "DKSalaries.csv").write_text(dk_salaries_csv(players), newline="")
    (out / "projections.csv").write_text(projections_csv(players))
    sd = make_players(seed=11, games=[GAMES[-1]], include_k=True)
    (out / "DKSalaries_showdown.csv").write_text(dk_salaries_csv(sd, showdown=True), newline="")
    sd_proj = projections_csv(sd, messy=False)
    (out / "projections_showdown.csv").write_text(sd_proj)
    header = ["QB", "RB", "RB", "WR", "WR", "WR", "TE", "FLEX", "DST"]
    (out / "DKEntries.csv").write_text(dk_entries_csv(
        [("NFL $10 Double Up, Sunday Main", "180000001", "$10", 3),
         ("NFL $20 20-Max GPP [Mid-Field]", "180000002", "$20", 5)], header, players), newline="")
