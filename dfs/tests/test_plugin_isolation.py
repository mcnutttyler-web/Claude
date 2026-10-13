"""Acceptance test 16: a toy sport (6 slots, $30k cap) runs end to end with no core code changes."""
import csv
import io

import numpy as np
import pandas as pd

from core.cash import objective_a
from core.export import upload_csv
from core.ingest import build_slate, read_dk_salaries, read_projections
from core.lineup import random_lineups, validate_lineup
from sports.base import load_sport
from tests.conftest import FIXTURES


def toy_files(seed=0):
    rng = np.random.default_rng(seed)
    games = [("AAA", "BBB", "07:00PM"), ("CCC", "DDD", "07:30PM"), ("EEE", "FFF", "10:00PM")]
    sal_rows, proj_rows, pid = [], [], 900
    for away, home, t in games:
        for team in (away, home):
            for pos, n in (("A", 4), ("B", 3), ("C", 3)):
                for k in range(n):
                    sal = int(rng.integers(30, 80)) * 100
                    name = f"{team} {pos}{k}"
                    sal_rows.append([pos, f"{name} ({pid})", name, pid, pos, sal,
                                     f"{away}@{home} 01/15/2027 {t} ET", team, 0])
                    proj_rows.append([name, team, pos, round(sal / 1000 * rng.uniform(2, 4), 2)])
                    pid += 1
    s = io.StringIO()
    csv.writer(s).writerows([["Position", "Name + ID", "Name", "ID", "Roster Position", "Salary", "Game Info",
                              "TeamAbbrev", "AvgPointsPerGame"]] + sal_rows)
    p = pd.DataFrame(proj_rows, columns=["name", "team", "position", "median"]).to_csv(index=False)
    return io.StringIO(s.getvalue()), io.StringIO(p)


def test_toy_sport_end_to_end():
    sport = load_sport(FIXTURES / "toysport")
    assert sport.name == "toyball" and sport.salary_cap == 30000 and len(sport.roster_slots) == 6
    assert sport.score({"goal": 1, "assist": 1, "shot": 2}) == 6.0
    sal_buf, proj_buf = toy_files()
    sal, mode = read_dk_salaries(sal_buf, sport)
    b = build_slate(sal, mode, read_projections(proj_buf), sport)
    assert b.ready
    spec = sport.mode("classic")
    res = objective_a(sport, b.slate, k=5)
    assert len(res.lineups) == 5
    for lu in res.lineups:
        assert validate_lineup(lu, b.slate, spec) == []
        assert res.settings["min_salary"] == 27000
    rows = list(csv.reader(io.StringIO(upload_csv(res.lineups, b.slate, spec))))
    assert rows[0] == ["A", "A", "B", "C", "AB", "UTIL"]
    rnd = random_lineups(b.slate, spec, 200, np.random.default_rng(0))
    assert len(rnd) == 200 and all(not validate_lineup(lu, b.slate, spec) for lu in rnd)
    # max_per_team (DK hard rule in this sport) is respected
    for lu in res.lineups + rnd:
        assert b.slate.loc[list(lu.players), "team"].value_counts().max() <= 4
