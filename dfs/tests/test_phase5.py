"""Phase 5: tracking, calibration, standings parsing and flashback."""
import io

import numpy as np
import pandas as pd
import pytest

from core import tracking
from core.calibration import (coverage_report, field_params_from_standings, fit_correlations, fit_cv,
                              ownership_report, suggestions_yaml)
from core.contest import Contest, load_contest, template_paths
from core.field import generate_field
from core.reports import bankroll_warnings, flashback
from core.sample import dk_contest_history_csv, dk_standings_csv
from core.slate_sim import simulate_slate
from core.standings import actual_ownership, lineups_from_standings, read_standings, split_lineup


# ----------------------------------------------------------------- tracking
def _log_and_settle(tmp_path, n, pred, real_rate, seed=0):
    rng = np.random.default_rng(seed)
    path = tmp_path / "log.csv"
    rows, hist = [], []
    for k in range(n):
        eid = str(9000000 + k)
        rows.append({"entry_id": eid, "contest_type": "double_up", "entry_fee": 5.0, "payout_multiple": 2.0,
                     "pred_p_win": pred, "slate": "wk1"})
        cashed = rng.random() < real_rate
        hist.append({"Entry_Key": eid, "Contest_Key": "1", "Place": 1 if cashed else 200, "Points": 120,
                     "Winnings_Non_Ticket": "$10.00" if cashed else "$0.00", "Winnings_Ticket": "$0.00",
                     "Entry_Fee": "$5.00"})
    tracking.log_entries(rows, path)
    df, settled = tracking.settle(tracking.read_contest_history(io.StringIO(dk_contest_history_csv(hist))), path)
    assert settled == n
    return df


def test_tracking_overconfidence_flag(tmp_path):
    over = _log_and_settle(tmp_path / "a", 80, 0.62, 0.45)
    oc = tracking.overconfidence(over)
    assert oc["n"] == 80 and oc["enough_data"] and oc["overconfident"]
    fine = _log_and_settle(tmp_path / "b", 80, 0.55, 0.57, seed=1)
    assert not tracking.overconfidence(fine)["overconfident"]
    few = _log_and_settle(tmp_path / "c", 20, 0.62, 0.30)
    assert not tracking.overconfidence(few)["overconfident"]          # < 50 entries: not enough data


def test_tracking_reliability_and_roi(tmp_path):
    df = _log_and_settle(tmp_path, 60, 0.55, 0.55, seed=3)
    rel = tracking.reliability(df)
    assert rel["n"].sum() == 60 and rel["predicted"].iloc[0] == pytest.approx(0.55)
    roi = tracking.cumulative_roi(df)
    assert len(roi) == 60 and roi["fees"].iloc[-1] == 300
    assert roi["profit"].iloc[-1] == pytest.approx(roi["winnings"].iloc[-1] - 300)
    # re-logging an unsettled entry replaces it; settled rows are kept
    tracking.log_entries([{"entry_id": "9000000", "contest_type": "double_up", "entry_fee": 5.0,
                           "pred_p_win": 0.9}], tmp_path / "log.csv")
    df2 = tracking.load_log(tmp_path / "log.csv")
    assert (df2["entry_id"] == "9000000").sum() == 2


# ------------------------------------------------------------ calibration
def _history(nfl, n_weeks=60, true_cv=0.45, rho=0.5, seed=0):
    rng = np.random.default_rng(seed)
    rows = []
    for w in range(n_weeks):
        for g in range(8):
            t, o = f"A{g}", f"B{g}"
            gz = rng.standard_normal()
            for team, opp in ((t, o), (o, t)):
                qz = rng.standard_normal()
                for pos, med, role in (("QB", 20, "QB"), ("WR", 14, "WR1"), ("WR", 10, "WR2"), ("RB", 13, "RB1"),
                                       ("TE", 8, "TE1")):
                    z = (np.sqrt(rho) * qz + np.sqrt(1 - rho) * rng.standard_normal()) if pos in ("QB", "WR") \
                        else rng.standard_normal()
                    rows.append({"season": 2025, "week": w, "team": team, "opp": opp, "position": pos,
                                 "role": role, "median": med, "actual": med * (1 + true_cv * z)})
    return pd.DataFrame(rows)


def test_fit_cv_and_correlations_recover_truth(nfl):
    h = _history(nfl)
    cv = fit_cv(h, nfl, k=10).set_index("position")
    assert cv.at["WR", "sample"] == pytest.approx(0.45, abs=0.03)
    assert abs(cv.at["WR", "suggested"] - 0.45) < abs(cv.at["WR", "prior"] - 0.45)   # moves toward truth
    nfl_cv = nfl.cfg["distribution_defaults"]["cv_by_position"]
    old = dict(nfl_cv)
    try:
        nfl_cv.update({"QB": 0.45, "WR": 0.45, "RB": 0.45, "TE": 0.45})
        cor = fit_correlations(h, nfl, k=10).set_index(["kind", "pair"])
    finally:
        nfl_cv.clear(); nfl_cv.update(old)
    assert cor.loc[("same_team", "QB|WR1"), "sample"] == pytest.approx(0.5, abs=0.08)
    assert abs(cor.loc[("same_team", "RB1|TE1"), "sample"]) < 0.1
    y = suggestions_yaml(fit_cv(h, nfl), fit_correlations(h, nfl))
    assert "cv_by_position" in y and "same_team" in y


def test_coverage_report():
    h = pd.DataFrame({"position": ["WR"] * 4, "actual": [1, 5, 9, 30], "floor": [2] * 4, "ceiling": [20] * 4})
    r = coverage_report(h)
    assert r.loc["WR", "below"] == 0.25 and r.loc["WR", "above"] == 0.25


# ------------------------------------------------- standings + flashback
@pytest.fixture(scope="module")
def standings_fixture(nfl, classic_slate):
    s = classic_slate
    spec = nfl.mode("classic")
    field = generate_field(s, nfl, s["ownership"].to_numpy(), 300, "gpp", rng=np.random.default_rng(1))
    sims = simulate_slate(s, nfl, 3000, seed=2).scores
    actual = sims[123].astype(float)
    text = dk_standings_csv(s, field.lineups, actual, spec, entry_ids={0: "MINE0", 1: "MINE1"})
    return s, spec, field, sims, read_standings(io.StringIO(text))


def test_standings_parse_and_ownership(nfl, standings_fixture):
    s, spec, field, sims, st = standings_fixture
    assert len(st.entries) == 300
    assert split_lineup("QB A B RB C D FLEX E F DST G", ["QB", "RB", "FLEX", "DST"]) == \
        [("QB", "A B"), ("RB", "C D"), ("FLEX", "E F"), ("DST", "G")]
    lus = lineups_from_standings(st, s, spec)
    assert all(lu is not None for lu in lus)
    keys = {tuple(sorted(lu.players)) for lu in field.lineups}
    assert all(tuple(sorted(lu.players)) in keys for lu in lus)
    own = actual_ownership(st, s)
    assert own.sum() == pytest.approx(9.0, abs=0.05)
    rep = ownership_report(s["ownership"], own, s["position"])
    assert {"mae_pp", "bias_pp", "spearman"} <= set(rep.columns)
    fp = field_params_from_standings(lus, s, spec, nfl)
    assert 0 <= fp["stacker_q"] <= 1 and fp["avg_salary"] <= 50000 and "suggested" in fp


def test_flashback_field_average_is_minus_rake(nfl, standings_fixture):
    s, spec, field, sims, st = standings_fixture
    pv = np.zeros(300)
    pv[:60] = np.linspace(80, 30, 60)
    pool = pv.sum()
    payouts = pd.DataFrame({"rank_from": np.arange(1, 61), "rank_to": np.arange(1, 61), "prize": pv[:60]})
    c = Contest("toy GPP", "gpp", 300, entry_fee=pool / 300 / 0.85, max_entries=1, payouts=payouts)
    fb = flashback(st, s, sims, c, spec, my_entry_ids=["MINE0", "MINE1"])
    assert fb["method"] == "exact" and fb["n_field_parsed"] == 300
    assert fb["field_mean_sim_roi"] == pytest.approx(fb["rake_breakeven"], abs=1e-6)   # = -rake (-15%)
    assert fb["rake_breakeven"] == pytest.approx(-0.15, abs=1e-6)
    assert len(fb["mine"]) == 2


def test_bankroll_warnings():
    assert bankroll_warnings(1000, 50, 10) == []
    w = bankroll_warnings(400, 50, 20)
    assert len(w) == 2
