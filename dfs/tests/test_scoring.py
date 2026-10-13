"""Acceptance test 2: every NFL scoring rule, including bonus and DST-tier boundaries."""
import pytest


@pytest.mark.parametrize("stats, pts", [
    ({"pass_yds": 100}, 4.0),
    ({"pass_td": 1}, 4.0),
    ({"int": 1}, -1.0),
    ({"rush_yds": 10}, 1.0),
    ({"rush_td": 1}, 6.0),
    ({"rec": 1}, 1.0),
    ({"rec_yds": 10}, 1.0),
    ({"rec_td": 1}, 6.0),
    ({"fumble_lost": 1}, -1.0),
    ({"two_pt": 1}, 2.0),
    ({"ret_td": 1}, 6.0),
    ({"fum_rec_td": 1}, 6.0),
    # bonus boundaries
    ({"pass_yds": 299}, 11.96),
    ({"pass_yds": 300}, 15.0),
    ({"rush_yds": 99}, 9.9),
    ({"rush_yds": 100}, 13.0),
    ({"rec_yds": 99}, 9.9),
    ({"rec_yds": 100}, 13.0),
    # DST events (values flagged unverified in config.yaml)
    ({"sacks": 1, "pts_allowed": 24}, 1.0),
    ({"def_int": 1, "pts_allowed": 24}, 2.0),
    ({"fum_rec": 1, "pts_allowed": 24}, 2.0),
    ({"safety": 1, "pts_allowed": 24}, 2.0),
    ({"blocked_kick": 1, "pts_allowed": 24}, 2.0),
    ({"def_td": 1, "pts_allowed": 24}, 6.0),
])
def test_rule(nfl, stats, pts):
    assert nfl.score(stats) == pytest.approx(pts)


@pytest.mark.parametrize("pa, pts", [
    (0, 10), (1, 7), (6, 7), (7, 4), (13, 4), (14, 1), (20, 1), (21, 0), (27, 0), (28, -1), (34, -1),
    (35, -4), (55, -4),
])
def test_dst_points_allowed_tiers(nfl, pa, pts):
    assert nfl.score({"pts_allowed": pa}) == pts


def test_full_qb_line(nfl):
    line = {"pass_yds": 312, "pass_td": 3, "int": 1, "rush_yds": 21, "rush_td": 0, "fumble_lost": 1}
    assert nfl.score(line) == pytest.approx(12.48 + 12 - 1 + 3 + 2.1 - 1)


def test_receiver_with_both_bonuses(nfl):
    # rushing and receiving bonuses are independent
    line = {"rush_yds": 100, "rec": 5, "rec_yds": 100, "rec_td": 1}
    assert nfl.score(line) == pytest.approx(10 + 3 + 5 + 10 + 3 + 6)
