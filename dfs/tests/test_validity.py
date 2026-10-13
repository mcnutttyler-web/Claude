"""Acceptance test 1: generated lineups are DK-valid; Showdown CPT is 1.5x salary AND points."""
import numpy as np
import pytest

from core.lineup import Lineup, lineup_points, lineup_salary, random_lineups, validate_lineup
from core.optimizer import LineupILP


def test_1000_random_lineups_valid(nfl, classic_slate):
    spec = nfl.mode("classic")
    rng = np.random.default_rng(1)
    lus = random_lineups(classic_slate, spec, 1000, rng, weights=classic_slate["ownership"].to_numpy())
    assert len(lus) == 1000
    for lu in lus:
        assert validate_lineup(lu, classic_slate, spec) == []
        # independent re-check of the hard rules
        rows = classic_slate.loc[list(lu.players)]
        assert len(set(lu.players)) == 9
        assert rows["salary"].sum() <= 50000
        assert rows["team"].nunique() >= 2 and rows["game_id"].nunique() >= 2
        pos = [classic_slate.at[i, "position"] for i in lu.players]
        assert pos[0] == "QB" and pos[8] == "DST" and pos[6] == "TE"
        assert pos[1:3] == ["RB", "RB"] and pos[3:6] == ["WR", "WR", "WR"]
        assert pos[7] in ("RB", "WR", "TE")


def test_optimizer_lineups_valid_random_objectives(nfl, classic_slate):
    spec = nfl.mode("classic")
    rng = np.random.default_rng(2)
    ilp = LineupILP(nfl, classic_slate, "classic")
    for _ in range(25):
        vals = classic_slate["median"].to_numpy() * rng.lognormal(0, 0.5, len(classic_slate))
        (lu,) = ilp.solve(vals, k=1)
        assert validate_lineup(lu, classic_slate, spec) == []


def test_validator_catches_violations(nfl, classic_slate):
    spec = nfl.mode("classic")
    s = classic_slate
    good = random_lineups(s, spec, 1, np.random.default_rng(3))[0]
    p = list(good.players)
    # duplicate player
    bad = Lineup(tuple(p[:2] + [p[1]] + p[3:]))
    assert validate_lineup(bad, s, spec)
    # DST in FLEX
    dsts = [i for i in s.index if s.at[i, "position"] == "DST" and i != p[8]]
    bad = Lineup(tuple(p[:7] + [dsts[0]] + p[8:]))
    assert any("not eligible" in e for e in validate_lineup(bad, s, spec))
    # over the cap: priciest player in every slot
    names = [sl.name for sl in spec.slots]
    pricey = []
    for sl in spec.slots:
        pool = s[s["roster_tokens"].map(lambda t: sl.name in t) & ~s.index.isin(pricey)]
        pricey.append(int(pool["salary"].idxmax()))
    assert any("cap" in e for e in validate_lineup(Lineup(tuple(pricey)), s, spec))
    # single game
    g = s["game_id"].iloc[0]
    one = s[s["game_id"] == g]
    pick = []
    for sl in spec.slots:
        pool = one[one["roster_tokens"].map(lambda t: sl.name in t) & ~one.index.isin(pick)]
        pick.append(int(pool["salary"].idxmin()))
    assert any("games" in e for e in validate_lineup(Lineup(tuple(pick)), s, spec))


def test_showdown_captain_multiplier(nfl, showdown_slate):
    spec = nfl.mode("showdown")
    s = showdown_slate
    ilp = LineupILP(nfl, s, "showdown")
    (lu,) = ilp.solve(s["median"].to_numpy())
    assert validate_lineup(lu, s, spec) == []
    cpt = lu.players[0]
    flex = lu.players[1:]
    # salary: CPT row salary = 1.5x FLEX salary
    assert s.at[cpt, "cpt_salary"] == pytest.approx(1.5 * s.at[cpt, "salary"])
    expected_sal = 1.5 * s.at[cpt, "salary"] + s.loc[list(flex), "salary"].sum()
    assert lineup_salary(lu, s, spec) == pytest.approx(expected_sal)
    expected_pts = 1.5 * s.at[cpt, "median"] + s.loc[list(flex), "median"].sum()
    assert lineup_points(lu, s["median"].to_numpy(), spec) == pytest.approx(expected_pts)
    assert s.loc[list(lu.players), "team"].nunique() == 2
    # the optimizer's CPT choice must beat moving any FLEX player to CPT
    best = lineup_points(lu, s["median"].to_numpy(), spec)
    for k in range(1, 6):
        swapped = list(lu.players)
        swapped[0], swapped[k] = swapped[k], swapped[0]
        alt = Lineup(tuple(swapped), "showdown")
        if not validate_lineup(alt, s, spec):
            assert lineup_points(alt, s["median"].to_numpy(), spec) <= best + 1e-9


def test_showdown_random_lineups_valid(nfl, showdown_slate):
    spec = nfl.mode("showdown")
    lus = random_lineups(showdown_slate, spec, 300, np.random.default_rng(4))
    assert len(lus) == 300
    assert all(validate_lineup(lu, showdown_slate, spec) == [] for lu in lus)
