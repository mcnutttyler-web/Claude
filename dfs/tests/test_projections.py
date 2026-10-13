"""Projection engine P1: implied totals, consensus blend (inverse-MAE), overrides, publish, backtest harness."""
import io
import json

import numpy as np
import pandas as pd
import pytest

from core.ingest import load_slate
from core.projections import backtest
from core.projections.params import Params
from core.projections.publish import SCHEMA_IDENTITY, SCHEMA_META, SCHEMA_POINTS, build_projections, publish
from core.projections.sources import load_source_specs, p_play
from core.projections.synthetic import backtest_data, live_inputs
from core.projections.vegas import consensus_lines, implied_totals, read_odds, team_environment

P = Params("nfl")


# ------------------------------------------------------------------ vegas
def test_implied_totals_example_and_sum():
    away, home = implied_totals(48, -6)          # home favored by 6
    assert (home, away) == (27, 21)
    rng = np.random.default_rng(0)
    for _ in range(200):
        t, s = rng.uniform(35, 56), rng.uniform(-14, 14)
        a, h = implied_totals(t, s)
        assert a + h == pytest.approx(t)


def test_consensus_lines_book_weights_and_latest():
    csv = io.StringIO(
        "book,away,home,spread_home,total,timestamp\n"
        "pinnacle,PHI,DAL,-3,48,2026-10-18T10:00:00Z\n"
        "pinnacle,PHI,DAL,-4,47,2026-10-18T12:00:00Z\n"   # latest pinnacle line wins
        "draftkings,PHI,DAL,-1,50,2026-10-18T12:00:00Z\n"
        "fanduel,JAC,HOU,2,44,2026-10-18T12:00:00Z\n")
    lines = consensus_lines(read_odds(csv, {"JAC": "JAX"}), P.get("vegas.book_weights"))
    g = lines.set_index("game_id")
    # pinnacle weight 2, draftkings 1
    assert g.loc["PHI@DAL", "spread_home"] == pytest.approx((2 * -4 + -1) / 3)
    assert g.loc["PHI@DAL", "total"] == pytest.approx((2 * 47 + 50) / 3)
    assert "JAX@HOU" in g.index                   # alias applied
    env = team_environment(lines)
    for gid, grp in env.groupby("game_id"):
        assert grp["team_total"].sum() == pytest.approx(grp["game_total"].iloc[0])
        assert grp["spread"].sum() == pytest.approx(0)


# ----------------------------------------------------------------- injuries
def test_p_play_defaults():
    assert p_play("Q", "", P) == 0.71
    assert p_play("Q", "LIMITED", P) == 0.70 and p_play("Q", "DNP", P) == 0.40 and p_play("Q", "FULL", P) == 0.90
    assert p_play("D", "", P) == 0.06 and p_play("OUT", "", P) == 0.0 and p_play("", "", P) == 0.98


def test_stat_source_uses_expected_bonus(nfl):
    # Bonuses are priced by probability: a 290-yard mean still earns part of the 300-yard bonus.
    disp = {"cv": P.get("stat_conversion.bonus_cv")}
    lin = 290 * 0.04
    e = nfl.expected_score({"pass_yds": 290}, disp)
    assert lin + 0.5 < e < lin + 3
    from scipy.stats import norm
    p300 = norm.sf(299.5, 400, 0.30 * 400)
    assert nfl.expected_score({"pass_yds": 400}, disp) == pytest.approx(16 + 3 * p300, abs=0.01)
    from sports.nfl import scoring
    probs = scoring.pa_tier_probs(21.0, 9.0, nfl.scoring_cfg["dst_points_allowed"])
    assert len(probs) == 7 and sum(probs) == pytest.approx(1.0)


# ------------------------------------------------------------ backtest
@pytest.fixture(scope="module")
def bt():
    return backtest_data(seasons=(2023, 2024, 2025), weeks=8, seed=1)


def test_evaluation_pool_ffa_protocol(bt):
    h, a = bt
    pool = backtest.evaluation_pool(h, a, P.get("validation.pool_size"))
    sizes = pool.groupby(["season", "week", "position"]).size().unstack()
    active_qb = a[a["active"] & (a["position"] == "QB")].groupby(["season", "week"]).size()
    assert (sizes["QB"] == active_qb).all()      # 16 QBs < 20: every active one is in, inactive ones are not
    assert (sizes["RB"] <= 40).all() and (sizes["WR"] == 40).all() and (sizes["TE"] == 20).all()
    inactive = a[~a["active"]].set_index(["season", "week", "player"]).index
    assert not pool.set_index(["season", "week", "player"]).index.isin(inactive).any()


def test_inverse_mae_weights_rank_sources(bt):
    h, a = bt
    w = backtest.inverse_mae_weights(h[h.season == 2023], a[a.season == 2023], P.get("validation.pool_size"),
                                     ["sharp", "mid", "noisy"], ["QB", "RB", "WR", "TE"])
    for pos, ws in w.items():
        assert sum(ws.values()) == pytest.approx(1.0)
        assert ws["sharp"] > ws["mid"] > ws["noisy"]
    # no history -> equal weights
    eq = backtest.inverse_mae_weights(h.iloc[:0], a.iloc[:0], P.get("validation.pool_size"), ["x", "y"], ["QB"])
    assert eq == {"QB": {"x": 0.5, "y": 0.5}}


def test_walk_forward_blend_beats_sources_and_reports(bt):
    h, a = bt
    res = backtest.run_backtest(h, a, P)
    # Score only seasons that had prior-season history to learn weights from.
    assert res["eval_seasons"] == [2024, 2025]
    m = res["metrics"].set_index(["source", "position"])
    for pos in ["QB", "RB", "WR", "TE"]:
        # Inverse-MAE beats the simple average when sources differ in quality (FFA: marginally) ...
        assert m.loc[("blend", pos), "mae"] < m.loc[("consensus_avg", pos), "mae"]
        assert m.loc[("blend", pos), "mae"] < m.loc[("noisy", pos), "mae"]
        # ... but it is NOT guaranteed to beat the single best source: outcome noise dominates MAE, so the
        # weights stay close to equal. (NNLS stacking is the P3 upgrade.)
    w = res["weights"]
    assert (w[w.season == 2023]["weight"].round(6) == round(1 / 3, 6)).all()   # first season: no history
    rep = res["report"]
    assert set(rep.columns) >= {"blend_mae", "bar", "meets_bar", "consensus_mae", "beats_consensus_1pct"}
    assert {"mae", "rmse", "bias", "weekly_mae_cv", "spearman", "calibration_slope"} <= set(res["metrics"].columns)


def test_no_leakage_from_future_weeks(bt):
    h, a = bt
    base = backtest.walk_forward(h, a, P)
    target = base[(base.source == "blend") & (base.season == 2024) & (base.week == 3)].sort_values("player")
    # Scramble everything after 2024 week 3: future projections AND future actuals.
    h2, a2 = h.copy(), a.copy()
    fut_h = (h2.season > 2024) | ((h2.season == 2024) & (h2.week > 3))
    fut_a = (a2.season > 2024) | ((a2.season == 2024) & (a2.week > 3))
    rng = np.random.default_rng(9)
    h2.loc[fut_h, "points"] = rng.permutation(h2.loc[fut_h, "points"].to_numpy())
    a2.loc[fut_a, "dk_points"] = rng.permutation(a2.loc[fut_a, "dk_points"].to_numpy())
    again = backtest.walk_forward(h2, a2, P)
    t2 = again[(again.source == "blend") & (again.season == 2024) & (again.week == 3)].sort_values("player")
    np.testing.assert_array_equal(target["points"].to_numpy(), t2["points"].to_numpy())


def test_biggest_misses_attribution(bt):
    h, a = bt
    errs = backtest.source_errors(h, a, P.get("validation.pool_size"))
    key = errs[(errs.source == "sharp") & (errs.season == 2024) & (errs.week == 2)][["season", "week", "player"]]
    sa = key.assign(rec=5.0, rec_yds=80.0, rec_td=1.0)
    sp = key.assign(rec=4.0, rec_yds=60.0, rec_td=0.2)
    miss = backtest.biggest_misses(errs, "sharp", 2024, 2, stat_actuals=sa, stat_proj=sp)
    assert len(miss) == 10 and (miss["abs_err"].diff().dropna() <= 0).all()
    assert set(miss["attribution"]) == {"td"}           # 4.8 pts TD diff > 2.0 yards > 1.0 volume


# --------------------------------------------------------------- publish
@pytest.fixture(scope="module")
def live(tmp_path_factory):
    d = tmp_path_factory.mktemp("proj")
    from core.sample import dk_salaries_csv, make_players
    (d / "DKSalaries.csv").write_text(dk_salaries_csv(make_players(seed=7)), newline="")
    spec = live_inputs(d)
    h, a = backtest_data(seasons=(2024, 2025), weeks=4, seed=3, noise={"ffa_avg": 0.2, "dff": 0.4, "sleeper": 0.8})
    h.to_csv(d / "history.csv", index=False)
    a.to_csv(d / "actuals.csv", index=False)
    return d, spec


def _run(d, spec, **kw):
    return build_projections(d / "DKSalaries.csv", load_source_specs(spec), "nfl", odds=d / "odds.csv",
                             injuries=d / "injuries.csv", overrides=d / "overrides.csv", **kw)


def test_publish_end_to_end_feeds_lineup_generator(nfl, live, tmp_path):
    d, spec = live
    run = _run(d, spec, history=d / "history.csv", actuals=d / "actuals.csv")
    t = run.table
    for c in SCHEMA_IDENTITY + SCHEMA_POINTS + SCHEMA_META:
        assert c in t.columns
    assert run.log["weight_method"] == "inverse_mae"
    assert t["mean"].notna().all()
    dst = t[t["position"] == "DST"]
    assert (dst["n_sources"] == 2).all()                 # dff skips DST; ffa + sleeper stats cover it
    # overrides applied and flagged
    ov = pd.read_csv(d / "overrides.csv", dtype=str)
    row = t[t["dk_id"] == ov.loc[0, "id"]].iloc[0]
    assert row["mean"] == 25.0 and row["median"] == 25.0 and row["override_flag"]
    assert t["override_flag"].sum() == 1
    # injuries
    inj = pd.read_csv(d / "injuries.csv")
    out_row = t[t["name"] == inj.loc[1, "name"]].iloc[0]
    q_row = t[t["name"] == inj.loc[0, "name"]].iloc[0]
    assert out_row["p_play"] == 0.0 and q_row["p_play"] == 0.70
    # implied totals present and consistent
    for _, g in t.groupby("game_id"):
        assert g.groupby("team")["team_total"].first().sum() == pytest.approx(g["game_total"].iloc[0])
    paths = publish(run, tmp_path)
    assert pd.read_parquet(paths["parquet"]).shape[0] == len(t)
    json.loads(paths["log"].read_text())
    # the lineup generator ingests the published CSV with zero unmatched players
    b = load_slate(d / "DKSalaries.csv", paths["csv"], nfl)
    assert b.ready
    assert inj.loc[1, "name"] not in set(b.slate["name"]) or \
        b.slate.loc[b.slate["name"] == inj.loc[1, "name"], "status"].iloc[0] == "O"


def test_publish_reproducible(live):
    d, spec = live
    a = _run(d, spec).table.drop(columns=["updated_at"])
    b = _run(d, spec).table.drop(columns=["updated_at"])
    pd.testing.assert_frame_equal(a, b)
    assert a["input_hash"].nunique() == 1


def test_params_flags():
    assert "blend.component_weights.with_props" in P.uncalibrated()
    assert P.calibrated("validation.mae_bar")
    assert P.get("validation.mae_bar") == {"QB": 6.2, "RB": 5.2, "WR": 4.95, "TE": 3.9}
