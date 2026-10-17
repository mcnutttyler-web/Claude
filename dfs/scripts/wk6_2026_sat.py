"""Week 6 2026 (Sun Oct 18) DK Main slate: Saturday FULL refresh of scripts/wk6_2026_full.py (built Oct 14).

Research via web search only; page fetches were still blocked. No DKSalaries.csv, so salaries are blank. Lines
conflict across books in several games: each line below is the midpoint of the quoted range, noted in `notes`.
Changes since Wednesday: Hurts out (McKee starts), Lamar out (Huntley), Barkley out, Breece Hall out, Penix and
DeVonta Smith cleared, McConkey off the report, A.J. Brown questionable (expected activation), DJ Moore leaning out.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import wk6_2026_full as base  # noqa: E402

base.DATE, base.MODE = "2026-10-17", "FULL"

base.GAMES = [
    ("CHI", "ATL", "1:00 PM", -2.5, 49.5, None, "", "Y", "Range CHI -1.5 to -3.5, total 47.5-51.5; Caleb Q (torn hamstring, full practices)"),
    ("BAL", "CLE", "1:00 PM", -3.5, 40.0, 15, "", "N", "Lamar OUT, Huntley starts; range -3.5 to -5.5, total 39.5-42.5"),
    ("IND", "TEN", "1:00 PM", -7.0, 44.5, None, "", "Y", "Range -6.5 to -7, total 44.5 everywhere"),
    ("NE", "NYJ", "1:00 PM", -7.5, 43.5, 10, "slight chance rain", "N", "-7.5 / 43.5 most books"),
    ("NYG", "NO", "1:00 PM", 0.0, 45.5, 11, "slight chance rain", "N", "Pick'em: books split NYG -1.5 / NO -1.5"),
    ("CAR", "PHI", "1:00 PM", -3.5, 38.5, 10, "rain possible", "N", "Line flipped from PHI -1.5 after Hurts OUT; total 43.5 -> 38.5"),
    ("PIT", "TB", "1:00 PM", -2.5, 39.5, 17, "9% rain", "N", "Tampa: 17 mph wind, gusts 28-31 (FantasyAlarm)"),
    ("LAR", "ARI", "4:05 PM", -12.5, 51.5, None, "", "Y", "-12.5 / 51.5"),
    ("BUF", "LV", "4:25 PM", -5.0, 55.5, None, "", "Y", "Range -4.5 to -5.5; total quoted 53.5 and 57.5 (rising)"),
    ("KC", "LAC", "4:25 PM", -8.0, 42.0, 15, "", "N", "Range -7.5 to -8.5, total 41.5-42.5"),
]
base.FAV_IS_HOME = {"CHI": False, "BAL": False, "IND": True, "NE": True, "NYG": True, "CAR": False, "PIT": False,
                    "LAR": True, "BUF": False, "KC": True}

# name -> (median, sources_append, conf, status, p_play, note); None median = keep Wednesday's
UPDATES = {
    "Caleb Williams": (19.0, "Yahoo;NFL.com", 0.45, "Q", 0.80, "Q; full practices all week; says hamstring is torn"),
    "Tyson Bagent": (12.5, "", 0.25, "", 0.98, "Only if Caleb sits"),
    "Michael Penix Jr.": (18.0, "SportsEncounter;Yahoo", 0.5, "", 0.98, "Cleared: 3 full practices, no designation"),
    "Bijan Robinson": (23.5, "", 0.6, "", 0.98, "Penix cleared; CHI-ATL total up"),
    "Drake London": (17.5, "", 0.5, "", 0.98, "Penix cleared"),
    "Lamar Jackson": (0.0, "NFL.com;Yahoo", 0.9, "O", 0.0, "OUT (ankle)"),
    "Tyler Huntley": (14.5, "NFL.com", 0.45, "", 0.98, "Starting; Lamar out"),
    "Derrick Henry": (16.5, "", 0.45, "", 0.98, "More run-heavy with Huntley"),
    "Zay Flowers": (13.0, "", 0.4, "", 0.98, "Down with Huntley at QB"),
    "Mark Andrews": (7.0, "", 0.25, "", 0.98, "Huntley downgrade"),
    "Browns": (7.0, "", 0.4, "", 1.0, "Lamar out; Huntley starting"),
    "Quinshon Judkins": (12.0, "SI;Yahoo", 0.35, "Q", 0.65, "Ankle; practiced Friday, game-time decision"),
    "Breece Hall": (0.0, "FantasySixPack;Yahoo", 0.7, "O", 0.0, "OUT (quad), third straight game"),
    "Braelon Allen": (12.0, "", 0.45, "", 0.98, "Workhorse with Hall out"),
    "A.J. Brown": (12.0, "SI;Yahoo", 0.4, "Q", 0.60, "Q; expected IR activation after 4-game absence, game-time"),
    "Stefon Diggs": (10.5, "", 0.25, "", 0.98, "Down if A.J. Brown returns"),
    "Jalen Hurts": (0.0, "Eagles;NBC;Newsweek", 0.95, "O", 0.0, "OUT (blood clot)"),
    "Saquon Barkley": (0.0, "NBC;PhillyVoice", 0.95, "O", 0.0, "OUT (hamstring), second straight game"),
    "Dameon Pierce": (11.0, "SI", 0.35, "", 0.98, "Lead back with Barkley out; low-total team"),
    "DeVonta Smith": (11.5, "NBC;Rotoballer", 0.45, "", 0.98, "Off the report (full Friday); McKee at QB"),
    "Dontayvion Wicks": (6.5, "", 0.3, "", 0.98, "Smith back"),
    "Makai Lemon": (5.5, "", 0.25, "", 0.98, "Smith back"),
    "Eagles": (5.5, "", 0.35, "", 1.0, "Low total (38.5)"),
    "Bryce Young": (17.0, "", 0.4, "", 0.98, "Now a 3.5-pt road favorite; total down to 38.5"),
    "Chuba Hubbard": (15.0, "", 0.45, "", 0.98, "Favorite script"),
    "Tetairoa McMillan": (14.5, "", 0.45, "", 0.98, "Lower total"),
    "Panthers": (8.0, "", 0.45, "", 1.0, "Facing Tanner McKee"),
    "Ladd McConkey": (11.0, "FantasySixPack;Chargers.com", 0.4, "", 0.98, "Off the injury report (foot)"),
    "Quentin Johnston": (7.0, "", 0.25, "", 0.98, "McConkey back"),
    "DJ Moore": (12.5, "TheBigLead", 0.35, "Q", 0.35, "Q (shoulder), analysts lean OUT. Late game"),
    "Khalil Shakir": (12.5, "", 0.3, "", 0.98, "Up if Moore sits. Late game"),
    "Josh Allen": (25.0, "", 0.65, "", 0.98, "Total up to 55.5 (53.5-57.5)"),
    "James Cook III": (18.5, "", 0.55, "", 0.98, "Total up"),
    "Dalton Kincaid": (9.5, "", 0.2, "", 0.98, "Total up"),
    "Kirk Cousins": (18.5, "", 0.45, "", 0.98, "Total up"),
    "Ashton Jeanty": (15.5, "", 0.45, "", 0.98, "Total up"),
    "Jakobi Meyers": (11.5, "", 0.25, "", 0.98, "Total up"),
    "Brock Bowers": (16.5, "", 0.65, "", 0.98, "Total up"),
    "Aaron Rodgers": (14.5, "", 0.35, "", 0.98, "Total down to 39.5; 17 mph wind, gusts ~30"),
}
NEW = [
    ("Tanner McKee", "PHI", "QB", 13.0, "Newsweek;WBTV", 0.4, "", 0.98, "N", "Starts for Hurts; 2 career starts"),
]

rows = []
seen = set()
for r in base.P:
    name = r[0]
    if name in UPDATES:
        med, src, conf, status, pp, note = UPDATES[name]
        sources = r[4] + (";" + src if src else "")
        notes = note if note else r[9]
        rows.append((name, r[1], r[2], r[3] if med is None else med, sources, conf, status, pp, r[8], notes))
        seen.add(name)
    else:
        rows.append(r)
missing = set(UPDATES) - seen
assert not missing, missing
rows += NEW
base.P = rows



def reconcile_teams(max_dev: float = 0.15) -> list[str]:
    """Teams whose expected skill points per implied point sit > 15% off the slate norm: scale their skill
    medians halfway back (factor 1/sqrt(1+dev)). Backups who only play if a starter sits are left alone."""
    df, _ = base.build()
    sk = df[df.pos.isin(["QB", "RB", "WR", "TE"]) & ~df["notes"].str.contains("only if|Only if|Starts only")]
    g = (sk.assign(exp=sk["median"] * sk["p_play"]).groupby("team")
         .agg(pts=("exp", "sum"), implied=("implied_total", "first")))
    g["dev"] = (g["pts"] / g["implied"]) / (g["pts"] / g["implied"]).median() - 1
    fix = g[g["dev"].abs() > max_dev]
    notes = []
    for team, r in fix.iterrows():
        f = 1 / (1 + r["dev"]) ** 0.5
        base.P = [(x[0], x[1], x[2], round(x[3] * f, 1), x[4], x[5], x[6], x[7], x[8],
                   (x[9] + f"; team-reconciled x{f:.2f}").lstrip("; "))
                  if x[1] == team and x[2] != "DST" and x[3] > 0 and "nly if" not in x[9] else x for x in base.P]
        notes.append(f"{team}: dev {r['dev']:+.0%} -> skill medians x{f:.2f}")
    return notes


if __name__ == "__main__":
    base.OUT.mkdir(parents=True, exist_ok=True)
    for n in reconcile_teams():
        print("RECONCILE", n)
    df, t = base.build()
    for line in base.checks(df, t):
        print(line)
    df.to_csv(base.OUT / f"claude_projections_{base.DATE}_{base.MODE}.csv", index=False)
    t.to_csv(base.OUT / f"claude_teams_{base.DATE}_{base.MODE}.csv", index=False)
    print(len(df), "players ->", base.OUT)
