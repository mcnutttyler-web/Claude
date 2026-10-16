"""Drive-level game simulator: box scores reconcile, means hold, correlations have the right sign."""
import numpy as np
import pandas as pd
import pytest

from dfs.scoring import score_arrays, score_stat_line
from dfs.sim.game import load_params, player_summary, simulate_games


def _team(t, itt, spread):
    return {"team": t, "itt": itt, "spread": spread, "plays": 63.0, "pass_rate": 0.60, "dropbacks": 37.8,
            "pass_att": 34.5, "designed_rush": 25.2, "pass_td": 0.105 * itt * 0.62, "rush_td": 0.105 * itt * 0.38,
            "listed_target_share": 0.90}


def _players(t, itt, k0):
    td = 0.105 * itt
    ptd, rtd = td * 0.62, td * 0.38
    tg = 34.5 * 0.88
    rows = [
        (k0 + 0, f"{t} QB", t, "QB", dict(pass_att=34.5, pass_yds=245, pass_td=ptd, int=0.8, rush_att=4, rush_yds=18,
                                         rush_td=rtd * 0.12, fumble_lost=0.2)),
        (k0 + 1, f"{t} WR1", t, "WR", dict(targets=tg * 0.26, rec=tg * 0.26 * 0.65, rec_yds=tg * 0.26 * 8.4,
                                          rec_td=ptd * 0.30, fumble_lost=0.05)),
        (k0 + 2, f"{t} WR2", t, "WR", dict(targets=tg * 0.19, rec=tg * 0.19 * 0.63, rec_yds=tg * 0.19 * 7.6,
                                          rec_td=ptd * 0.20, fumble_lost=0.04)),
        (k0 + 3, f"{t} TE1", t, "TE", dict(targets=tg * 0.16, rec=tg * 0.16 * 0.70, rec_yds=tg * 0.16 * 7.0,
                                          rec_td=ptd * 0.18, fumble_lost=0.03)),
        (k0 + 4, f"{t} RB1", t, "RB", dict(rush_att=15, rush_yds=64, rush_td=rtd * 0.55, targets=tg * 0.12,
                                          rec=tg * 0.12 * 0.78, rec_yds=tg * 0.12 * 6.0, rec_td=ptd * 0.06,
                                          fumble_lost=0.08)),
        (k0 + 5, f"{t} RB2", t, "RB", dict(rush_att=7, rush_yds=29, rush_td=rtd * 0.22, targets=tg * 0.06,
                                          rec=tg * 0.06 * 0.78, rec_yds=tg * 0.06 * 6.0, rec_td=ptd * 0.03,
                                          fumble_lost=0.04)),
    ]
    out = []
    for k, name, team, pos, s in rows:
        pts = score_stat_line({kk: v for kk, v in s.items() if kk not in ("targets", "pass_att", "rush_att")})
        out.append({"dk_index": k, "name": name, "team": team, "position": pos, "points": pts, **s})
    return out


@pytest.fixture(scope="module")
def slate():
    teams = pd.DataFrame([_team("AAA", 27.0, -6.0), _team("BBB", 21.0, 6.0)])
    rows = pd.DataFrame(_players("AAA", 27.0, 0) + _players("BBB", 21.0, 10)).set_index("dk_index")
    env = pd.DataFrame([{"team": "AAA", "opp": "BBB", "game_id": "G1"}, {"team": "BBB", "opp": "AAA", "game_id": "G1"}])
    return rows, teams, env


@pytest.fixture(scope="module")
def sims(slate):
    rows, teams, env = slate
    return simulate_games(rows, teams, env, n_sims=20000, seed=3, early_exit=False, keep_stats=True)


def test_vectorized_scoring_matches_score_stat_line():
    rng = np.random.default_rng(0)
    lines = [dict(pass_yds=300, pass_td=2, int=1), dict(pass_yds=299), dict(rush_yds=99, rec=3, rec_yds=100),
             dict(rush_yds=100, rush_td=1), dict(sacks=3, def_int=1, pts_allowed=0), dict(pts_allowed=35, safety=1)]
    for _ in range(200):
        lines.append({k: float(rng.integers(0, 400 if "yds" in k else 4)) for k in ("pass_yds", "rush_yds", "rec_yds",
                                                                                   "rec", "rec_td", "int")})
    keys = sorted({k for l in lines for k in l})
    arr = {k: np.array([l.get(k, 0.0) for l in lines]) for k in keys}
    if "pts_allowed" in arr:  # lines without pts_allowed must not get a tier: score them separately
        has = np.array(["pts_allowed" in l for l in lines])
        a1 = score_arrays({k: v[has] for k, v in arr.items()}, n=int(has.sum()))
        a2 = score_arrays({k: v[~has] for k, v in arr.items() if k != "pts_allowed"}, n=int((~has).sum()))
        got = np.empty(len(lines)); got[has], got[~has] = a1, a2
    want = [score_stat_line(l) for l in lines]
    assert np.allclose(got, want)


def test_passing_reconciles_to_receiving(sims):
    for team, qb in (("AAA", 0), ("BBB", 10)):
        s = sims.stats[qb]
        assert np.allclose(s["pass_yds"], sims.team[team]["pass_yds"])            # QB = all receivers (incl. other)
        listed = sum(sims.stats[k]["rec_yds"] for k in range(qb + 1, qb + 6))
        assert np.allclose(s["pass_yds"], listed + sims.team[team]["other_rec_yds"])
        rec_td = sum(sims.stats[k].get("rec_td", 0) for k in range(qb + 1, qb + 6))
        assert (s["pass_td"] >= rec_td).all()                                     # excess TDs go to "other"


def test_team_means_match_inputs(slate, sims):
    _, teams, _ = slate
    for t in ("AAA", "BBB"):
        tr = teams.set_index("team").loc[t]
        assert sims.team[t]["pts"].mean() == pytest.approx(tr["itt"], abs=0.6)
        assert sims.team[t]["td"].mean() == pytest.approx(tr["pass_td"] + tr["rush_td"], abs=0.08)
        assert sims.team[t]["plays"].mean() == pytest.approx(tr["plays"], rel=0.02)


def test_player_means_close_to_model(slate, sims):
    rows, _, _ = slate
    m = pd.Series(sims.points.mean(0), index=sims.keys)
    for k in rows.index:
        assert m[k] == pytest.approx(rows.at[k, "points"], rel=0.12, abs=1.0), rows.at[k, "name"]


def test_correlation_signs(sims):
    x = pd.DataFrame(sims.points, columns=sims.keys)
    c = lambda a, b: np.corrcoef(x[a], x[b])[0, 1]  # noqa: E731
    assert c(0, 1) > 0.15                      # QB - WR1 stack
    assert c(4, 5) < 0                         # RB1 - RB2 compete for carries
    t1, t2 = sims.stats[1]["targets"], sims.stats[2]["targets"]
    assert np.corrcoef(t1, t2)[0, 1] < 0.1     # WR teammates split targets (team volume pushes up, shares down)
    assert c("DST:AAA", 10) < -0.1             # DST vs opposing QB
    assert c(0, 10) > -0.2                     # opposing QBs are not strongly negative (shared game)


def test_deterministic_and_recentered(slate):
    rows, teams, env = slate
    a = simulate_games(rows, teams, env, n_sims=2000, seed=11)
    b = simulate_games(rows, teams, env, n_sims=2000, seed=11)
    assert np.array_equal(a.points, b.points)
    center = rows["points"] * 1.1
    c = simulate_games(rows, teams, env, n_sims=2000, seed=11, center=center)
    m = pd.Series(c.points.mean(0), index=c.keys)
    assert np.allclose(m[rows.index], center, atol=1e-3)


def test_questionable_player_redistributes(slate):
    rows, teams, env = slate
    r = rows.copy()
    r["p_play"] = 1.0
    r.loc[1, "p_play"] = 0.5
    s = simulate_games(r, teams, env, n_sims=6000, seed=5, early_exit=False, keep_stats=True)
    wr1_out = s.stats[1]["targets"] == 0
    assert 0.45 < (s.points[:, s.keys.index(1)] == 0).mean() < 0.58
    wr2 = s.stats[2]["targets"]
    assert wr2[wr1_out].mean() > wr2[~wr1_out].mean() + 0.8                   # vacated targets flow to teammates


def test_summary_columns(sims):
    s = player_summary(sims)
    for c in ("mean", "p10", "p50", "p90", "p95", "P20+", "P30+"):
        assert c in s
    assert (s["p10"] <= s["p50"]).all() and (s["p50"] <= s["p90"]).all()


def test_params_trained_before_test_and_holdout():
    prm = load_params()
    assert max(prm["trained_on"]) <= 2022


def test_publish_merges_game_sims_into_factor_sims(slate):
    """run_game_sim swaps in the game-sim columns for modeled players and DSTs, re-centered to the final mean."""
    from types import SimpleNamespace

    from core.projections.distributions import simulate
    from core.projections.params import Params
    from core.projections.publish import run_game_sim
    from sports.base import load_sport

    rows, teams, env = slate
    sport, params = load_sport("nfl"), Params()
    t = rows[["name", "team", "position"]].copy()
    t["opp"] = t["team"].map({"AAA": "BBB", "BBB": "AAA"})
    t["game_id"] = "G1"
    t["mean"] = rows["points"] * 0.95                     # final projection differs from the model
    t["p_play"] = 1.0
    for c in ("pass_yds", "rush_yds", "rec_yds", "rec", "pass_td", "rush_td", "rec_td", "int"):
        t[c] = rows.get(c)
    t.loc[100] = {"name": "AAA", "team": "AAA", "position": "DST", "opp": "BBB", "game_id": "G1", "mean": 7.0,
                  "p_play": 1.0}
    t.loc[101] = {"name": "Free agent", "team": "AAA", "position": "WR", "opp": "BBB", "game_id": "G1",
                  "mean": 4.0, "p_play": 1.0}
    sim = simulate(t.assign(dk_index=t.index), params, sport.scoring_cfg, 3000, 1)
    before = sim.sims[:, list(sim.index).index(101)].copy()
    model = SimpleNamespace(rows=rows.reset_index(), teams=teams, dst_inputs=None)
    gs, notes = run_game_sim(t, model, sim, 3000, 1)
    col = {k: j for j, k in enumerate(sim.index)}
    for k in list(rows.index) + [100]:
        assert sim.sims[:, col[k]].mean() == pytest.approx(t.at[k, "mean"], abs=0.02)
    assert np.array_equal(sim.sims[:, col[101]], before)              # unmodeled player keeps the factor sim
    qb, wr1 = sim.sims[:, col[0]], sim.sims[:, col[1]]
    assert np.corrcoef(qb, wr1)[0, 1] > 0.15
    assert "13 players/DSTs from the drive-level sim" in notes[0]
