"""P3: own projections from public data (nflverse play-by-play + Vegas) — synthetic, offline."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from core.projections import bottomup, nflverse
from core.projections.params import Params
from core.projections.publish import build_projections, env_from_sources, lineup_csv
from sports.base import load_sport

SPORT = load_sport("nfl")
PARAMS = Params()

# two games per week between AAA/BBB and CCC/DDD; each team: QB, RB1, RB2, WR1, WR2, WR3, TE
ROLES = {"QB": 1, "RB": 2, "WR": 3, "TE": 1}
TGT = {"WR1": 0.28, "WR2": 0.20, "WR3": 0.12, "TE1": 0.16, "RB1": 0.10, "RB2": 0.06}     # rest -> others
CAR = {"RB1": 0.62, "RB2": 0.25, "QB1": 0.08}


def _players(team):
    out = []
    for pos, n in ROLES.items():
        for k in range(1, n + 1):
            out.append({"gsis_id": f"{team}-{pos}{k}", "full_name": f"{team.title()} {pos}{k}", "position": pos,
                        "team": team, "pfr_id": f"pfr-{team}-{pos}{k}"})
    return out


def _synthetic_pbp(season: int, weeks: int, rng) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    teams = ["AAA", "BBB", "CCC", "DDD"]
    rows, snaps = [], []
    pid = 0
    for wk in range(1, weeks + 1):
        for home, away in (("AAA", "BBB"), ("CCC", "DDD")):
            gid = f"{season}_{wk:02d}_{away}_{home}"
            for off, de in ((home, away), (away, home)):
                plays = 62
                for _ in range(plays):
                    pid += 1
                    yl = int(rng.integers(1, 99))
                    drop = rng.random() < 0.60
                    r = {"play_id": pid, "game_id": gid, "week": wk, "season_type": "REG",
                         "game_date": f"{season}-09-{min(7 * wk, 28):02d}", "posteam": off, "defteam": de,
                         "two_point_attempt": 0, "yardline_100": yl, "xpass": 0.58, "fumble_lost": 0,
                         "fumbled_1_player_id": None, "passer_player_id": None, "rusher_player_id": None,
                         "receiver_player_id": None, "passing_yards": np.nan, "rushing_yards": np.nan,
                         "receiving_yards": np.nan, "pass_touchdown": 0, "rush_touchdown": 0, "interception": 0,
                         "complete_pass": 0, "sack": 0, "qb_scramble": 0, "pass_attempt": 0, "rush_attempt": 0,
                         "pass": 0}
                    if drop:
                        r.update({"play_type": "pass", "pass": 1, "pass_attempt": 1, "passer_player_id": f"{off}-QB1"})
                        u = rng.random()
                        if u < 0.06:
                            r["sack"] = 1
                        elif u < 0.10:
                            r.update({"play_type": "run", "qb_scramble": 1, "rush_attempt": 1, "pass_attempt": 0,
                                      "rusher_player_id": f"{off}-QB1", "rushing_yards": 6.0})
                        else:
                            roll, acc, who = rng.random(), 0.0, None
                            for role, sh in TGT.items():
                                acc += sh
                                if roll < acc:
                                    who = role
                                    break
                            if who is not None:
                                pos, k = who[:2], who[2]
                                r["receiver_player_id"] = f"{off}-{pos}{k}"
                                if rng.random() < 0.66:
                                    y = float(rng.gamma(2.0, 5.5))
                                    r.update({"complete_pass": 1, "passing_yards": y, "receiving_yards": y})
                                    if yl < 15 and rng.random() < 0.25:
                                        r["pass_touchdown"] = 1
                            if rng.random() < 0.025:
                                r["interception"] = 1
                    else:
                        roll = rng.random()
                        who = "RB1" if roll < CAR["RB1"] else ("RB2" if roll < CAR["RB1"] + CAR["RB2"] else "QB1")
                        pos, k = who[:2], who[2]
                        r.update({"play_type": "run", "rush_attempt": 1, "rusher_player_id": f"{off}-{pos}{k}",
                                  "rushing_yards": float(rng.normal(4.3, 5))})
                        if yl < 6 and rng.random() < 0.3:
                            r["rush_touchdown"] = 1
                    rows.append(r)
                for p in _players(off):
                    snaps.append({"game_id": gid, "pfr_game_id": gid, "season": season, "game_type": "REG",
                                  "week": wk, "player": p["full_name"], "pfr_player_id": p["pfr_id"],
                                  "position": p["position"], "team": off, "opponent": de, "offense_snaps": 40,
                                  "offense_pct": 0.65, "defense_snaps": 0, "defense_pct": 0, "st_snaps": 0,
                                  "st_pct": 0})
    ros = []
    for wk in range(1, weeks + 1):
        for t in teams:
            for p in _players(t):
                ros.append({**p, "season": season, "week": wk, "game_type": "REG"})
    return pd.DataFrame(rows), pd.DataFrame(ros), pd.DataFrame(snaps)


@pytest.fixture(scope="module")
def nfl_dir(tmp_path_factory):
    d = tmp_path_factory.mktemp("nflverse")
    rng = np.random.default_rng(7)
    for season, weeks in ((2025, 8), (2026, 5)):
        pbp, ros, sn = _synthetic_pbp(season, weeks, rng)
        pbp.to_parquet(nflverse.path_for("pbp", season, d))
        ros.to_parquet(nflverse.path_for("rosters", season, d))
        sn.to_parquet(nflverse.path_for("snaps", season, d))
    return d


def _salaries(tmp_path, teams=(("BBB", "AAA"), ("DDD", "CCC"))):
    rows, i = [], 1000
    for away, home in teams:
        for t in (away, home):
            for p in _players(t):
                pos = p["position"]
                rows.append({"Position": pos, "Name + ID": f"{p['full_name']} ({i})", "Name": p["full_name"],
                             "ID": i, "Roster Position": pos if pos == "QB" else f"{pos}/FLEX",
                             "Salary": 5000, "Game Info": f"{away}@{home} 10/18/2026 01:00PM ET", "TeamAbbrev": t,
                             "AvgPointsPerGame": 0})
                i += 1
            rows.append({"Position": "DST", "Name + ID": f"{t} ({i})", "Name": t, "ID": i, "Roster Position": "DST",
                         "Salary": 3000, "Game Info": f"{away}@{home} 10/18/2026 01:00PM ET", "TeamAbbrev": t,
                         "AvgPointsPerGame": 0})
            i += 1
    p = tmp_path / "DKSalaries.csv"
    pd.DataFrame(rows).to_csv(p, index=False)
    return p


def _env(spread_aaa=-7.0, total=48.0):
    a = total / 2 - spread_aaa / 2
    return pd.DataFrame([
        {"team": "AAA", "opp": "BBB", "game_id": "BBB@AAA", "spread": spread_aaa, "game_total": total, "team_total": a},
        {"team": "BBB", "opp": "AAA", "game_id": "BBB@AAA", "spread": -spread_aaa, "game_total": total,
         "team_total": total - a},
        {"team": "CCC", "opp": "DDD", "game_id": "DDD@CCC", "spread": 0.0, "game_total": 44.0, "team_total": 22.0},
        {"team": "DDD", "opp": "CCC", "game_id": "DDD@CCC", "spread": 0.0, "game_total": 44.0, "team_total": 22.0}])


def _load(nfl_dir):
    cur = nflverse.load_season(2026, "2026-10-18", dest=nfl_dir, aliases=SPORT.team_aliases)
    prior = nflverse.load_season(2025, dest=nfl_dir, aliases=SPORT.team_aliases)
    return cur, prior


def _model(nfl_dir, tmp_path, env=None, status=None):
    from core.ingest import read_dk_salaries
    slate, _ = read_dk_salaries(_salaries(tmp_path), SPORT)
    cur, prior = _load(nfl_dir)
    res = bottomup.run_model(slate, env if env is not None else _env(), cur, prior, SPORT, PARAMS, status)
    r = res.rows.merge(slate[["name", "team", "position"]], left_on="dk_index", right_index=True)
    return slate, res, r.set_index("name")


def test_load_season_aggregates(nfl_dir):
    cur, _ = _load(nfl_dir)
    tg = cur["team_games"]
    assert len(tg) == 4 * 5 and (tg["plays"] == 62).all()
    assert (tg["att"] <= tg["dropbacks"]).all() and tg["sacks"].sum() > 0
    pg = cur["player_games"]
    assert pg["offense_snaps"].notna().all() and set(pg["position"].dropna()) <= {"QB", "RB", "WR", "TE"}


def test_model_shares_and_reconciliation(nfl_dir, tmp_path):
    _, res, r = _model(nfl_dir, tmp_path)
    assert not res.unmodeled
    a = r[r["team"] == "AAA"]
    assert a.loc["Aaa WR1", "targets"] > a.loc["Aaa WR2", "targets"] > a.loc["Aaa WR3", "targets"]
    assert a.loc["Aaa RB1", "rush_att"] > 2 * a.loc["Aaa RB2", "rush_att"]
    # receiving yards / TDs cannot exceed the QB's passing line
    catchers = a[a["position"].isin(["RB", "WR", "TE"])]
    assert catchers["rec_yds"].sum() <= a.loc["Aaa QB1", "pass_yds"] + 1e-6
    assert catchers["rec_td"].sum() <= a.loc["Aaa QB1", "pass_td"] + 0.005   # 3-dp rounding
    assert a.loc["Aaa QB1", "points"] > 10 and (r["points"] >= 0).all()


def test_vegas_moves_volume(nfl_dir, tmp_path):
    _, res_fav, r_fav = _model(nfl_dir, tmp_path, _env(spread_aaa=-10.0, total=50.0))
    _, res_dog, r_dog = _model(nfl_dir, tmp_path, _env(spread_aaa=+10.0, total=50.0))
    tf, td = res_fav.teams.set_index("team"), res_dog.teams.set_index("team")
    assert tf.at["AAA", "pass_rate"] < td.at["AAA", "pass_rate"]          # favorites run more
    assert tf.at["AAA", "pass_td"] + tf.at["AAA", "rush_td"] > td.at["AAA", "pass_td"] + td.at["AAA", "rush_td"]
    assert r_fav.loc["Aaa RB1", "rush_att"] > r_dog.loc["Aaa RB1", "rush_att"]
    _, _, hi = _model(nfl_dir, tmp_path, _env(total=56.0))
    _, _, lo = _model(nfl_dir, tmp_path, _env(total=40.0))
    assert hi.loc["Aaa QB1", "points"] > lo.loc["Aaa QB1", "points"]


def test_out_player_redistribution(nfl_dir, tmp_path):
    slate, base, b = _model(nfl_dir, tmp_path)
    wr1 = int(slate.index[slate["name"] == "Aaa WR1"][0])
    rb1 = int(slate.index[slate["name"] == "Aaa RB1"][0])
    _, res, o = _model(nfl_dir, tmp_path, status={wr1: "O", rb1: "O"})
    assert o.loc["Aaa WR1", "points"] == 0.0 and o.loc["Aaa RB1", "points"] == 0.0
    gain_wr2 = o.loc["Aaa WR2", "targets"] - b.loc["Aaa WR2", "targets"]
    gain_te = o.loc["Aaa TE1", "targets"] - b.loc["Aaa TE1", "targets"]
    assert gain_wr2 > gain_te > 0                                       # same position gets the bigger slice
    assert o.loc["Aaa RB2", "rush_att"] > 2 * b.loc["Aaa RB2", "rush_att"]   # next RB inherits ~70%
    assert any("dropbacks" in n for n in res.notes)                     # WR1 out -> fewer dropbacks
    assert res.teams.set_index("team").at["AAA", "dropbacks"] < base.teams.set_index("team").at["AAA", "dropbacks"]


def test_backup_qb_starts_when_qb1_out(tmp_path, nfl_dir):
    from core.ingest import read_dk_salaries
    sal = pd.read_csv(_salaries(tmp_path))
    extra = sal[sal["Name"] == "Aaa QB1"].copy()
    extra["Name"], extra["ID"] = "Aaa QB2", 9999
    sal = pd.concat([sal, extra])
    p = tmp_path / "sal2.csv"
    sal.to_csv(p, index=False)
    slate, _ = read_dk_salaries(p, SPORT)
    cur, prior = _load(nfl_dir)
    qb1 = int(slate.index[slate["name"] == "Aaa QB1"][0])
    res = bottomup.run_model(slate, _env(), cur, prior, SPORT, PARAMS, {qb1: "O"})
    # QB2 has no history -> not modeled (consensus carries him); QB1 is zeroed
    pts = res.rows.set_index("dk_index")["points"]
    assert pts[qb1] == 0.0 and "Aaa QB2 (AAA)" in res.unmodeled


def test_top_end_shrink_is_continuous():
    start, full, ratio = PARAMS.get("bottomup.top_end_shrink")["QB"]
    f = lambda p: p * (1 - (1 - ratio) * float(np.clip((p - start) / (full - start), 0, 1)))
    xs = np.linspace(15, 35, 401)
    ys = np.array([f(x) for x in xs])
    assert np.all(np.diff(ys) > -1e-9) and f(start) == start and abs(f(32) / 32 - ratio) < 1e-9


def test_env_from_sources():
    slate = pd.DataFrame({"team": ["AAA", "BBB"], "opp": ["BBB", "AAA"], "game_id": ["BBB@AAA"] * 2})
    rows = pd.DataFrame({"dk_index": [0, 1], "spread": [-3.5, 3.5], "game_total": [48.0, 48.0]})
    env = env_from_sources(rows, slate).set_index("team")
    assert env.at["AAA", "team_total"] == pytest.approx(25.75) and env.at["BBB", "team_total"] == pytest.approx(22.25)


def test_publish_own_model_only(nfl_dir, tmp_path):
    sal = _salaries(tmp_path)
    odds = tmp_path / "odds.csv"
    pd.DataFrame([{"book": "x", "away": "BBB", "home": "AAA", "spread_home": -7, "total": 48},
                  {"book": "x", "away": "DDD", "home": "CCC", "spread_home": 0, "total": 44}]).to_csv(odds, index=False)
    run = build_projections(sal, [], SPORT, odds=odds, nflverse_dir=nfl_dir, n_sims=2000)
    t = run.table
    assert run.log["public_model"]["teams"] == 4
    assert t.loc[t["position"] == "DST", "mean"].notna().all()            # DST from pbp-derived rates
    sk = t[(t["position"].isin(["QB", "RB", "WR", "TE"]))]
    assert sk["mean"].notna().all() and (sk["median"] > 0).all() and (sk["p90"] > sk["p10"]).all()
    assert {"plays", "pass_rate", "qb1"} <= set(run.team_check.columns)
    csv = lineup_csv(t)
    assert len(csv) == len(t) and csv["median"].notna().all()


def test_publish_sanity_scales_hot_consensus(nfl_dir, tmp_path):
    sal = _salaries(tmp_path)
    odds = tmp_path / "odds.csv"
    pd.DataFrame([{"book": "x", "away": "BBB", "home": "AAA", "spread_home": -7, "total": 48},
                  {"book": "x", "away": "DDD", "home": "CCC", "spread_home": 0, "total": 44}]).to_csv(odds, index=False)
    base = build_projections(sal, [], SPORT, odds=odds, nflverse_dir=nfl_dir, simulate_outcomes=False).table
    hot = base[base["team"] == "AAA"][["name", "team", "position"]].assign(median=base["mean"] * 2.0)
    src = tmp_path / "hot.csv"
    hot.to_csv(src, index=False)
    from core.projections.sources import SourceSpec
    run = build_projections(sal, [SourceSpec("hot", str(src))], SPORT, odds=odds, nflverse_dir=nfl_dir,
                            simulate_outcomes=False, params=Params(overrides={"bottomup.sanity_max_over": 0.10}))
    assert any(w.startswith("AAA: blended points") for w in run.warnings)
    a = run.table[run.table["team"] == "AAA"]
    m = base[base["team"] == "AAA"]
    off = a["position"].isin(["QB", "RB", "WR", "TE"])
    assert a.loc[off, "mean"].sum() == pytest.approx(1.10 * m.loc[off, "mean"].sum(), rel=1e-3)


def test_schedule_lines_fallback(nfl_dir, tmp_path):
    pd.DataFrame([
        {"season": 2026, "game_type": "REG", "week": 6, "gameday": "2026-10-18", "away_team": "BBB", "home_team": "AAA",
         "spread_line": 7.0, "total_line": 48.0},
        {"season": 2026, "game_type": "REG", "week": 6, "gameday": "2026-10-18", "away_team": "DDD", "home_team": "CCC",
         "spread_line": -3.0, "total_line": 44.0}]).to_csv(nfl_dir / "games.csv", index=False)
    run = build_projections(_salaries(tmp_path), [], SPORT, nflverse_dir=nfl_dir, simulate_outcomes=False)
    assert any("nflverse schedule" in w for w in run.warnings)
    t = run.table.drop_duplicates("team").set_index("team")
    assert t.at["AAA", "team_total"] == pytest.approx(27.5) and t.at["DDD", "team_total"] == pytest.approx(23.5)
    (nfl_dir / "games.csv").unlink()


def test_rookie_without_history_uses_consensus_end_to_end(nfl_dir, tmp_path):
    from core.projections.recalibrate import load_calibration
    from core.projections.publish import calibration_path
    from core.projections.sources import SourceSpec
    sal = pd.read_csv(_salaries(tmp_path))
    rook = sal[sal["Name"] == "Aaa WR3"].copy()
    rook["Name"], rook["ID"] = "Aaa Rookie", 8888
    sal = pd.concat([sal, rook])
    sp = tmp_path / "sal_rookie.csv"
    sal.to_csv(sp, index=False)
    cons = pd.DataFrame({"name": ["Aaa Rookie", "Aaa WR1"], "team": ["AAA", "AAA"], "position": ["WR", "WR"],
                         "median": [11.0, 14.0]})
    cp = tmp_path / "cons.csv"
    cons.to_csv(cp, index=False)
    odds = tmp_path / "odds.csv"
    pd.DataFrame([{"book": "x", "away": "BBB", "home": "AAA", "spread_home": -7, "total": 48},
                  {"book": "x", "away": "DDD", "home": "CCC", "spread_home": 0, "total": 44}]).to_csv(odds, index=False)
    run = build_projections(sp, [SourceSpec("dff", str(cp))], SPORT, odds=odds, nflverse_dir=nfl_dir,
                            simulate_outcomes=False)
    t = run.table.set_index("name")
    assert t.at["Aaa Rookie", "proj_source"] == "consensus_fallback"
    assert t.at["Aaa Rookie", "proj_final"] == pytest.approx(11.0)
    cal = load_calibration(str(calibration_path(PARAMS)))["WR"]
    assert t.at["Aaa Rookie", "mean"] == pytest.approx(11.0)    # consensus-only rows are not model-calibrated
    assert t.at["Aaa WR1", "proj_source"] == "blend"
    csv = lineup_csv(run.table).set_index("name")
    assert csv.at["Aaa Rookie", "median"] == pytest.approx(t.at["Aaa Rookie", "proj_cal"], abs=1e-3)
