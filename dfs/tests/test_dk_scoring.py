"""Phase 0: score_stat_line() against hand-calculated DK NFL scores. Arithmetic is written out beside each case."""
import pytest
import yaml

from dfs.scoring import load_scoring, score_breakdown, score_stat_line
from pathlib import Path

SPORTS_ROOT = Path(__file__).resolve().parents[1] / "sports"

CASES = [
    # (label, stat line, expected, hand arithmetic)
    ("qb_exactly_300", dict(pass_yds=300, pass_td=2, int=1, rush_yds=20), 24.00, "12 + 8 - 1 + 2 + 3 bonus"),
    ("qb_299_no_bonus", dict(pass_yds=299, pass_td=2, int=1, rush_yds=20), 20.96, "11.96 + 8 - 1 + 2"),
    ("qb_325", dict(pass_yds=325, pass_td=3, int=0, rush_yds=0), 28.00, "13 + 12 + 3 bonus"),
    ("qb_fractional_yds", dict(pass_yds=287, pass_td=1), 15.48, "11.48 + 4"),
    ("rb_99_no_bonus", dict(rush_yds=99, rush_td=1, rec=3, rec_yds=20), 20.90, "9.9 + 6 + 3 + 2"),
    ("rb_100_bonus", dict(rush_yds=100, rush_td=1, rec=3, rec_yds=20), 24.00, "10 + 6 + 3 + 2 + 3 bonus"),
    ("rb_double_bonus", dict(rush_yds=100, rec=5, rec_yds=100), 31.00, "10 + 3 + 5 + 10 + 3"),
    ("wr_99_rec_no_bonus", dict(rec=7, rec_yds=99), 16.90, "7 + 9.9"),
    ("wr_full_line", dict(rec=8, rec_yds=112, rec_td=1, fumble_lost=1, two_pt=1), 29.20, "8 + 11.2 + 3 + 6 - 1 + 2"),
    ("negative_qb", dict(pass_yds=50, int=3, rush_yds=-3, fumble_lost=1), -2.30, "2 - 3 - 0.3 - 1"),
    ("returner", dict(ret_td=1, rec=2, rec_yds=15), 9.50, "6 + 2 + 1.5"),
    ("fumble_recovery_td", dict(fum_rec_td=1), 6.00, "6"),
    ("zero_line", dict(), 0.00, "0"),
    ("negative_yds_no_bonus", dict(rush_yds=-5), -0.50, "-0.5"),
    ("dst_shutout", dict(sacks=3, def_int=1, fum_rec=1, def_td=1, pts_allowed=0), 23.00, "3 + 2 + 2 + 6 + 10"),
    ("dst_full", dict(sacks=4, def_int=2, safety=1, blocked_kick=1, two_pt_return=1, pts_allowed=17), 15.00,
     "4 + 4 + 2 + 2 + 2 + 1 (14-20)"),
    ("dst_blowout", dict(sacks=1, pts_allowed=41), -3.00, "1 - 4 (35+)"),
]


@pytest.mark.parametrize("label,stats,expected,why", CASES, ids=[c[0] for c in CASES])
def test_hand_calculated(label, stats, expected, why):
    assert score_stat_line(stats) == pytest.approx(expected, abs=1e-9), why


@pytest.mark.parametrize("pa,expected", [(0, 10), (1, 7), (6, 7), (7, 4), (13, 4), (14, 1), (20, 1),
                                         (21, 0), (27, 0), (28, -1), (34, -1), (35, -4), (60, -4)])
def test_points_allowed_tier_edges(pa, expected):
    assert score_stat_line({"pts_allowed": pa}) == expected


def test_bonus_thresholds_inclusive():
    for stat, base in [("pass_yds", 0.04), ("rush_yds", 0.1), ("rec_yds", 0.1)]:
        threshold = load_scoring()["bonuses"][stat][0]
        assert f"{stat}_bonus" in score_breakdown({stat: threshold})
        assert f"{stat}_bonus" not in score_breakdown({stat: threshold - 1})
        assert score_stat_line({stat: threshold}) - score_stat_line({stat: threshold - 1}) == pytest.approx(base + 3)


def test_unknown_stat_raises():
    with pytest.raises(ValueError, match="rec_yd"):
        score_stat_line({"rec_yd": 50})


def test_none_and_nan_count_as_zero():
    assert score_stat_line({"rec": None, "rec_yds": float("nan"), "rush_td": 1}) == 6.0


def test_custom_scoring_dict_overrides_file():
    cfg = load_scoring()
    half_ppr = {**cfg, "offense": {**cfg["offense"], "rec": 0.5}}
    assert score_stat_line({"rec": 4}, half_ppr) == 2.0


def test_matches_app_scoring_config():
    """The app's sports/nfl/config.yaml and config/dk_nfl_scoring.yaml must not drift apart."""
    app = yaml.safe_load(open(SPORTS_ROOT / "nfl" / "config.yaml"))["scoring"]
    new = load_scoring()
    for key in ("offense", "bonuses", "dst", "dst_points_allowed"):
        assert app[key] == new[key], key


REAL = Path(__file__).parent / "fixtures" / "dk_real_box_scores.csv"


@pytest.mark.skipif(not REAL.exists(), reason="no DK-reported box scores yet (see dk_real_box_scores.template.csv)")
def test_real_dk_box_scores():
    import importlib.util
    spec = importlib.util.spec_from_file_location("gate", Path(__file__).parents[1] / "scripts" / "phase0_gate.py")
    gate = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(gate)
    t = gate.check_b(2024)["table"]
    assert len(t) >= 10
    assert t["match"].all(), t[~t["match"]].to_string()
