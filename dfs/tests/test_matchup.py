"""Matchup layer: no leakage, shrinkage, blending/reset rules, cap, default OFF, live doc append."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from core.matchup import archetypes as A
from core.matchup import defense as D
from core.matchup import effect as E
from core.matchup import live
from core.matchup.backtest import load_config

TEAMS = [f"T{i:02d}" for i in range(16)]


def _dg(seasons=(2024, 2025), weeks=8, seed=0, bad_pass_d=("T00",)):
    rng = np.random.default_rng(seed)
    rows = []
    for s in seasons:
        for w in range(1, weeks + 1):
            order = rng.permutation(TEAMS)
            for a, b in zip(order[::2], order[1::2]):
                for d, o in ((a, b), (b, a)):
                    pe = rng.normal(0.0, 0.15) + (0.25 if d in bad_pass_d else 0.0)
                    rows.append({"game_id": f"{s}_{w}_{a}_{b}", "team": d, "opp": o, "season": s, "week": w,
                                 "pass_epa": pe, "rush_epa": rng.normal(-0.05, 0.1),
                                 "explosive_rate": rng.uniform(0.05, 0.12), "pressure_rate": rng.uniform(0.2, 0.4),
                                 "mid_share": rng.uniform(0.15, 0.3), "man_rate": rng.uniform(0.2, 0.4),
                                 "blitz_rate": np.nan, "dropbacks": 35, "charted": 0})
    return pd.DataFrame(rows)


def test_defense_profiles_use_only_past_games():
    dg = _dg()
    base = D.generic_profiles(dg, 5, 0.3)
    future = dg.copy()
    future.loc[(future["season"] == 2025) & (future["week"] >= 5) & (future["team"] == "T03"), "pass_epa"] += 5.0
    after = D.generic_profiles(future, 5, 0.3)
    key = ["season", "week", "team"]
    b = base[(base["season"] == 2025) & (base["week"] <= 5)].set_index(key)["pass_epa_adj"]
    a = after[(after["season"] == 2025) & (after["week"] <= 5)].set_index(key)["pass_epa_adj"]
    pd.testing.assert_series_equal(b, a)                                 # weeks <= 5 unaffected
    b6 = base[(base["season"] == 2025) & (base["week"] == 6)].set_index("team")["pass_epa_adj"]
    a6 = after[(after["season"] == 2025) & (after["week"] == 6)].set_index("team")["pass_epa_adj"]
    assert a6["T03"] > b6["T03"] + 0.3                                   # ...and visible once it is the past


def test_defense_blend_and_prior_shrink():
    dg = _dg(bad_pass_d=("T00",))
    gp = D.generic_profiles(dg, 5, 0.3).set_index(["season", "week", "team"])
    # week 1 of 2025 = last season's final value shrunk 30% toward 0
    fin = D.schedule_adjust(dg[dg["season"] == 2024], D.ADJUSTED).groupby("team")["pass_epa_adj"].mean()
    assert gp.loc[(2025, 1, "T00"), "pass_epa_adj"] == pytest.approx(0.7 * fin["T00"])
    assert gp.loc[(2025, 9, "T00"), "pass_epa_adj"] > 0.1                 # the bad pass defense is found
    # bigger k leans longer on the prior
    g3 = D.generic_profiles(dg, 3, 0.3).set_index(["season", "week", "team"])
    g8 = D.generic_profiles(dg, 8, 0.3).set_index(["season", "week", "team"])
    cur = D.schedule_adjust(dg[(dg["season"] == 2025) & (dg["week"] < 4)], D.ADJUSTED).groupby("team")["pass_epa_adj"].mean()
    w3, w8 = 3 / (3 + 3), 3 / (3 + 8)
    assert g3.loc[(2025, 4, "T05"), "pass_epa_adj"] == pytest.approx(w3 * cur["T05"] + (1 - w3) * 0.7 * fin["T05"])
    assert g8.loc[(2025, 4, "T05"), "pass_epa_adj"] == pytest.approx(w8 * cur["T05"] + (1 - w8) * 0.7 * fin["T05"])


def test_coverage_feature_switched_off():
    dg = _dg()
    gp = D.generic_profiles(dg, 5, 0.3, {2025: {"man_rate"}})
    assert gp.loc[gp["season"] == 2025, "man_rate"].nunique() == 1          # league average only
    assert gp.loc[gp["season"] == 2024, "man_rate"].nunique() > 1
    st = D.coverage_status(dg, 2025)
    assert st["man_rate"] and not st["blitz_rate"]


def _pg(n_players=6, weeks=8, seasons=(2024, 2025)):
    rows = []
    for s in seasons:
        for p in range(n_players):
            team = "AAA" if (p < 3 or s == 2024) else "BBB"          # players 3-5 change team in 2025
            for w in range(1, weeks + 1):
                rows.append({"player_id": f"P{p}", "season": s, "week": w, "game_id": f"{s}_{w}_{team}",
                             "team": team, "opp": "ZZZ", "position": "WR", "targets": 5 + p, "team_targets": 35,
                             "air_yards": 10.0 * (5 + p), "mid_targets": 1, "snap_share": 0.5 + 0.05 * p, "yac": 10,
                             "rec": 3, "rz_targets": 1, "team_rz_targets": 6, "carries": 0, "team_designed": 25,
                             "gl_carries": 0, "team_gl_carries": 3, "dropbacks": 0, "scrambles": 0, "pass_air": 0,
                             "att": 0})
    return pd.DataFrame(rows)


def test_rolling_profile_excludes_current_game():
    pg = _pg()
    pg.loc[(pg["player_id"] == "P0") & (pg["season"] == 2025) & (pg["week"] == 4), "targets"] = 30
    r = A.rolling_profiles(pg, window=6).set_index(["player_id", "season", "week"])
    assert r.loc[("P0", 2025, 4), "tgt_share"] == pytest.approx(5 / 35)    # the 30-target game isn't seen yet
    assert r.loc[("P0", 2025, 5), "tgt_share"] > 5 / 35
    assert np.isnan(r.loc[("P0", 2025, 1), "tgt_share"]) and r.loc[("P0", 2025, 1), "g_cur"] == 0


def test_prior_blend_before_week4_and_resets():
    pg = _pg()
    pg.loc[pg["season"] == 2025, "snap_share"] += np.where(pg.loc[pg["season"] == 2025, "player_id"] == "P1", 0.3, 0)
    prof = A.in_season_profiles(pg, window=6, blend_k=3, blend_before_week=4).set_index(["player_id", "season", "week"])
    assert prof.loc[("P0", 2025, 1), "weight_current"] == 0.0           # no games yet -> prior only
    assert prof.loc[("P0", 2025, 3), "weight_current"] == pytest.approx(2 / 5)
    assert prof.loc[("P0", 2025, 5), "weight_current"] == 1.0
    assert prof.loc[("P4", 2025, 3), "flag_team_change"] and prof.loc[("P4", 2025, 3), "weight_current"] == 1.0
    assert prof.loc[("P1", 2025, 3), "flag_role_change"] and prof.loc[("P1", 2025, 3), "weight_current"] == 1.0
    oc = A.in_season_profiles(pg, oc_changes={(2025, "AAA")}).set_index(["player_id", "season", "week"])
    assert oc.loc[("P0", 2025, 3), "flag_coach_change"] and oc.loc[("P0", 2025, 3), "weight_current"] == 1.0


def test_eb_shrinks_noise_to_zero_and_keeps_signal():
    rng = np.random.default_rng(1)
    rows = []
    true = {d: rng.normal(0, 2.0) for d in TEAMS}                       # real defense effects, sd 2 pts
    for s in (2024, 2025):
        for d in TEAMS:
            for i in range(60):
                rows.append({"season": s, "opp": d, "noise": rng.normal(0, 6),
                             "signal": rng.normal(0, 6) + true[d]})
    r = pd.DataFrame(rows)
    k_noise = E.eb_k(r, "noise", ["season", "opp"])
    k = E.eb_k(r, "signal", ["season", "opp"])
    assert 60 / (60 + k_noise) < 0.35                                   # 60 games of pure noise keep < 35%
    assert k < k_noise / 3 and 60 / (60 + k) > 0.5


def test_multiplier_cap():
    m = E.multiplier(np.array([5.0, -5.0, 0.2]), np.array([10.0, 10.0, 10.0]), 0.08)
    assert m.tolist() == pytest.approx([1.08, 0.92, 1.02])
    assert E.multiplier(1.0, 1.0, 0.08, 5.0) == pytest.approx(1.08)      # min projection 5 -> 1/5 = 20% -> capped


def test_config_default_off():
    cfg = load_config()
    assert cfg["enabled"] is False and cfg["cap"] == 0.08


def test_slate_multipliers_off_returns_ones():
    from core.matchup.apply import slate_multipliers
    slate = pd.DataFrame({"position": ["WR"], "name": ["x"], "team": ["AAA"]})
    out, notes = slate_multipliers(slate, pd.Series([10.0]), None, {"enabled": False, "positions": {"WR": True}})
    assert out.tolist() == [1.0] and notes == []


def test_live_doc_appends_new_weeks_only(tmp_path):
    rng = np.random.default_rng(0)
    rows = []
    for w in (1, 2):
        for i in range(40):
            a = rng.uniform(5, 20)
            rows.append({"season": 2026, "week": w, "position": "WR", "proj_A": a, "proj_B": a * 1.01,
                         "mult_B": 1.01, "actual": a + rng.normal(0, 5)})
    p = pd.DataFrame(rows)
    doc = tmp_path / "live.md"
    assert live.update(p[p["week"] == 1], doc) == [1]
    assert live.update(p, doc) == [2]
    assert live.update(p, doc) == []
    text = doc.read_text()
    assert text.count("| 2026 wk1 | WR |") == 1 and text.count("| 2026 wk2 | WR |") == 1
    assert "## Season to date" in text and text.count("## Season to date") == 1
