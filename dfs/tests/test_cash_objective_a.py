"""Acceptance test 3: cash Objective A (max median under cash hard rules) == brute force on a 30-player slate."""
import io
from itertools import combinations

import numpy as np
import pytest

from core.cash import objective_a
from core.ingest import build_slate, read_dk_salaries, read_projections
from core.lineup import lineup_points, validate_lineup
from core.sample import GAMES, dk_salaries_csv, make_players, projections_csv


def toy30(seed):
    p = make_players(seed=seed, games=GAMES[:2])
    keep = {"QB": 4, "RB": 7, "WR": 10, "TE": 5, "DST": 4}
    parts = []
    for pos, n in keep.items():
        g = p[p["position"] == pos].sort_values(["rank", "team"])
        parts.append(g.head(n))
    import pandas as pd
    return pd.concat(parts).reset_index(drop=True)


def brute_force(s, cap=50000, min_salary=0):
    pos = s["position"].to_numpy()
    sal = s["salary"].to_numpy()
    med = s["median"].to_numpy()
    teams = {t: k for k, t in enumerate(sorted(s["team"].unique()))}
    games = {g: k for k, g in enumerate(sorted(s["game_id"].unique()))}
    tbit = np.array([1 << teams[t] for t in s["team"]])
    gbit = np.array([1 << games[g] for g in s["game_id"]])
    flex = np.flatnonzero(np.isin(pos, ["RB", "WR", "TE"]))
    combos = np.array(list(combinations(flex, 7)))
    cp = pos[combos]
    ok = ((cp == "RB").sum(1) >= 2) & ((cp == "WR").sum(1) >= 3) & ((cp == "TE").sum(1) >= 1)
    combos = combos[ok]
    csal = sal[combos].sum(1)
    cmed = med[combos].sum(1)
    ctb = np.bitwise_or.reduce(tbit[combos], axis=1)
    cgb = np.bitwise_or.reduce(gbit[combos], axis=1)
    popcount = np.vectorize(lambda v: bin(int(v)).count("1"))
    best = -1.0
    for q in np.flatnonzero(pos == "QB"):
        for d in np.flatnonzero(pos == "DST"):
            if s.at[d, "opp"] == s.at[q, "team"]:      # cash hard rule: QB vs opposing DST
                continue
            tot_sal = csal + sal[q] + sal[d]
            m = (tot_sal <= cap) & (tot_sal >= min_salary)
            m &= popcount(ctb | tbit[q] | tbit[d]) >= 2
            m &= popcount(cgb | gbit[q] | gbit[d]) >= 2
            if m.any():
                best = max(best, float((cmed[m] + med[q] + med[d]).max()))
    return best


@pytest.mark.parametrize("seed,min_salary", [(3, 0), (5, 49500), (9, 0)])
def test_objective_a_matches_brute_force(nfl, seed, min_salary):
    p = toy30(seed)
    assert len(p) == 30
    sal, mode = read_dk_salaries(io.StringIO(dk_salaries_csv(p)), nfl)
    b = build_slate(sal, mode, read_projections(io.StringIO(projections_csv(p))), nfl)
    s = b.slate
    assert b.ready and len(s) == 30
    res = objective_a(nfl, s, min_salary=min_salary)
    lu = res.lineups[0]
    spec = nfl.mode("classic")
    assert validate_lineup(lu, s, spec) == []
    got = lineup_points(lu, s["median"].to_numpy(), spec)
    assert got == pytest.approx(brute_force(s, min_salary=min_salary), abs=1e-6)


def test_qb_vs_opposing_dst_blocked(nfl, classic_slate):
    s = classic_slate.copy()
    # Make a DST irresistible; its opposing QB too. The block must keep them apart.
    d = s.index[s["position"] == "DST"][0]
    q = s.index[(s["position"] == "QB") & (s["team"] == s.at[d, "opp"])][0]
    s.loc[[d, q], "median"] = 80.0
    lu = objective_a(nfl, s).lineups[0]
    assert not ({d, q} <= set(lu.players))


def test_status_out_excluded(nfl, classic_slate):
    s = classic_slate.copy()
    top = objective_a(nfl, s).lineups[0]
    star = top.players[0]
    s.loc[star, "status"] = "O"
    assert star not in objective_a(nfl, s).lineups[0].players
