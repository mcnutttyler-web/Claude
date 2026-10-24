"""Week 7 2026 (Sun Oct 25) DK Main slate: FULL run, built from the own model rather than hand-entered search numbers.

Page fetches are blocked. Web search was used only for injury designations (Oct 23 final reports, sources below).
There is no DKSalaries.csv, so salary is blank and names are nflverse names.

  Lines        nflverse games.csv snapshot (home-favored = +). Search snippets conflict on CIN-BAL and SF-ATL.
  Players      bottom-up model (core/projections/bottomup.py) on 2026 data through the Oct 22 TNF game plus 2025
               as the prior, then the per-position calibration (config/calibration.json).
  Floor / ceil p10 / p90 of the drive-level game simulator (src/dfs/sim/game.py), re-centered to the calibrated
               projection and conditional on playing.
  DST          game simulator mean (opposing offense's points, sacks, turnovers; fitted return-TD rates).
  Ownership    rough softmax estimate (same as the Week 6 runs). No salaries, so no value term.
Main slate = Sunday 1:00 / 4:05 / 4:25 ET games. Excluded: PIT@NO 9:30 ET, KC@SEA SNF, DAL@PHI MNF, NE@CHI TNF.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / "src"), str(ROOT / "scripts")]

import wk6_2026_full as base  # noqa: E402  (ownership, file format and quality checks)
from core.names import normalize_team  # noqa: E402
from core.projections import bottomup, nflverse  # noqa: E402
from core.projections.params import Params  # noqa: E402
from core.projections.recalibrate import apply_calibration, load_calibration  # noqa: E402
from dfs.sim.game import simulate_games  # noqa: E402
from sports.base import load_sport  # noqa: E402

DATE, MODE, SEASON, WEEK = "2026-10-24", "FULL", 2026, 7
KICKOFF_DAY = "2026-10-25"
MAIN_TIMES = {"13:00", "16:05", "16:25"}

# (name, team): (status, p_play, note) -- Oct 23 final reports via web search
STATUS = {
    ("Mike Evans", "SF"): ("O", 0.0, "OUT (ribs/Achilles) - Yahoo, NBC"),
    ("Deebo Samuel Sr.", "SF"): ("O", 0.0, "OUT (hamstring) - Yahoo 49ers report"),
    ("Brian Robinson", "ATL"): ("O", 0.0, "OUT (hamstring) - CBS"),
    ("Lamar Jackson", "BAL"): ("Q", 0.75, "Q (ankle), limited practice - CBS"),
    ("David Montgomery", "HOU"): ("O", 0.0, "OUT (groin) - Giants.com report"),
    ("Tank Dell", "HOU"): ("Q", 0.70, "Q (knee), full Wed/Thu - Giants.com report"),
    ("Theo Johnson", "NYG"): ("D", 0.15, "D (neck), no practice Friday - Giants.com"),
    ("Baker Mayfield", "TB"): ("Q", 0.70, "Q (right thumb) - CBS"),
    ("Jonathon Brooks", "CAR"): ("O", 0.0, "OUT (groin) - NBC"),
    ("AJ Dillon", "CAR"): ("O", 0.0, "OUT - NBC"),
    ("Breece Hall", "NYJ"): ("D", 0.15, "Q (NFL.com) / D (SBR); non-participant - treated as doubtful"),
    ("Jordan Mason", "MIN"): ("Q", 0.70, "Q - CBS"),
    ("Tyler Warren", "IND"): ("Q", 0.60, "Q (groin), missed Week 6, sidelined early week - NBC"),
    ("Jonah Coleman", "DEN"): ("Q", 0.70, "Q (ankle) - Broncos.com"),
    ("Tyler Badie", "DEN"): ("O", 0.0, "OUT (thumb) - Broncos.com"),
    ("Puka Nacua", "LA"): ("Q", 0.80, "Q (calf) - Rams.com"),
    ("Dont'e Thornton Jr.", "LV"): ("O", 0.0, "OUT (hamstring) - Rams.com report"),
    ("Carter Runyon", "LV"): ("O", 0.0, "OUT (foot) - Rams.com report"),
    ("Mike Washington Jr.", "LV"): ("Q", 0.70, "Q (foot/back) - Rams.com report"),
    ("Bo Melton", "GB"): ("Q", 0.70, "Q (back) - Packers.com"),
}
DST_NAMES = {"SF": "49ers", "ATL": "Falcons", "CIN": "Bengals", "BAL": "Ravens", "TB": "Buccaneers",
             "CAR": "Panthers", "NYG": "Giants", "HOU": "Texans", "IND": "Colts", "MIN": "Vikings", "MIA": "Dolphins",
             "NYJ": "Jets", "CLE": "Browns", "TEN": "Titans", "DEN": "Broncos", "ARI": "Cardinals", "GB": "Packers",
             "DET": "Lions", "LAR": "Rams", "LV": "Raiders"}


def slate_games(sport) -> pd.DataFrame:
    g = pd.read_csv(nflverse.DEFAULT_DIR / "games.csv")
    g = g[(g["season"] == SEASON) & (g["week"] == WEEK) & (g["gameday"] == KICKOFF_DAY)
          & g["gametime"].isin(MAIN_TIMES)].copy()
    al = sport.team_aliases
    g["home"] = g["home_team"].map(lambda t: normalize_team(t, al))
    g["away"] = g["away_team"].map(lambda t: normalize_team(t, al))
    return g


def env_frame(g: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for r in g.itertuples():
        sh = -float(r.spread_line)                        # home team's own spread (favorite negative)
        tot = float(r.total_line)
        gid = f"{r.away}@{r.home}"
        rows += [{"team": r.home, "opp": r.away, "game_id": gid, "spread": sh, "game_total": tot,
                  "team_total": tot / 2 - sh / 2},
                 {"team": r.away, "opp": r.home, "game_id": gid, "spread": -sh, "game_total": tot,
                  "team_total": tot / 2 + sh / 2}]
    return pd.DataFrame(rows)


def run():
    sport, params = load_sport("nfl"), Params()
    g = slate_games(sport)
    assert len(g) == 10, g[["away", "home", "gametime"]]
    env = env_frame(g)
    teams = set(env["team"])
    first = pd.Timestamp(KICKOFF_DAY)
    al = sport.team_aliases
    cur = nflverse.load_season(SEASON, before=first, aliases=al)
    prior = nflverse.load_season(SEASON - 1, aliases=al)
    lg = bottomup.league_baselines([cur, prior], params)
    prof = bottomup.player_profiles(cur, prior, lg, params)
    sl = prof[prof["team"].isin(teams) & prof["position"].isin(["QB", "RB", "WR", "TE"])]
    slate = sl[["player_id", "name", "team", "position"]].drop_duplicates("player_id").reset_index(drop=True)
    slate["id"] = slate["player_id"]
    slate = slate.merge(env[["team", "opp", "game_id"]], on="team", how="left")
    key = {(n, t): i for i, (n, t) in enumerate(zip(slate["name"], slate["team"]))}
    missing = [k for k in STATUS if k not in key and (k[0], normalize_team(k[1], al)) not in key]
    status = {}
    for (n, t), (s, _, _) in STATUS.items():
        i = key.get((n, t), key.get((n, normalize_team(t, al))))
        if i is not None:
            status[i] = s
    res = bottomup.run_model(slate, env, cur, prior, sport, params, status)
    rows = res.rows.merge(slate[["name", "team", "position"]], left_on="dk_index", right_index=True)
    rows = rows.set_index("dk_index")
    cal = load_calibration(str(ROOT / "config" / "calibration.json"))
    rows["proj_cal"] = apply_calibration(rows.assign(pos=rows["position"], proj=rows["points"]), cal,
                                         proj_col="proj", pos_col="pos", out_col="c")["c"].clip(lower=0)
    rows.loc[rows["points"] <= 0, "proj_cal"] = 0.0
    pp = {}
    for (n, t), (s, p, _) in STATUS.items():
        i = key.get((n, t), key.get((n, normalize_team(t, al))))
        if i is not None:
            pp[i] = p
    act = rows[rows["points"] > 0].copy()
    act["p_play"] = [pp.get(i, 1.0) for i in act.index]
    gs = simulate_games(act, res.teams, env, n_sims=10000, seed=20261025, def_inputs=res.dst_inputs,
                        center=act["proj_cal"])
    x = pd.DataFrame(gs.points, columns=gs.keys)
    pct = {}
    for k in gs.keys:
        v = x[k].to_numpy()
        a = v[v != 0] if not str(k).startswith("DST") and (v != 0).mean() > 0.05 else v
        pct[k] = (float(np.percentile(a, 10)), float(np.percentile(a, 90)), float(a.mean()))
    return sport, env, g, slate, rows, res, pct, missing


def to_base(env, g, rows, pct):
    games = []
    fav_home = {}
    for r in g.itertuples():
        home_fav = float(r.spread_line) >= 0
        fav, dog = (r.home, r.away) if home_fav else (r.away, r.home)
        roof = "Y" if str(r.roof) in ("dome", "closed") else "N"
        ko = {"13:00": "1:00 PM", "16:05": "4:05 PM", "16:25": "4:25 PM"}[r.gametime]
        games.append((fav, dog, ko, -abs(float(r.spread_line)), float(r.total_line), None, "", roof,
                      "nflverse games.csv line"))
        fav_home[fav] = home_fav
    base.GAMES, base.FAV_IS_HOME, base.WIDEN = games, fav_home, set()
    P = []
    for i, r in rows.iterrows():
        s = STATUS.get((r["name"], r["team"]))
        if r["proj_cal"] < 3.0 and s is None:
            continue                                   # depth players: keep the file to fantasy-relevant rows
        status, p_play, note = s if s else ("", 0.98, "")
        note = "; ".join(x for x in (note, f"model {r['points']:.1f} -> calibrated {r['proj_cal']:.1f}") if x)
        P.append((r["name"], r["team"], r["position"], round(float(r["proj_cal"]), 1), "OwnModel;nflverse",
                  0.5, status, p_play, "Y" if status == "Q" else "N", note))
    for team in sorted(set(env["team"])):
        k = f"DST:{team}"
        if k in pct:
            P.append((DST_NAMES.get(team, team), team, "DST", round(pct[k][2], 1), "GameSim", 0.4, "", 1.0, "N",
                      "game-sim mean vs opposing offense"))
    base.P = P


if __name__ == "__main__":
    sport, env, g, slate, rows, res, pct, missing = run()
    to_base(env, g, rows, pct)
    df, t = base.build()
    t["kickoff_et"] = t["kickoff_et"].str.replace("2026-10-18", KICKOFF_DAY)
    # simulator floor / ceiling replace the fixed-spread ones (kept for anyone the sim didn't cover)
    key = {(r["name"], r["team"]): i for i, r in rows.iterrows()}
    for j, r in df.iterrows():
        k = f"DST:{r['team']}" if r["pos"] == "DST" else key.get((r["name"], r["team"]))
        if k in pct and r["median"] > 0:
            df.at[j, "floor"], df.at[j, "ceiling"] = round(max(pct[k][0], 0 if r["pos"] != "DST" else -4), 1), \
                round(pct[k][1], 1)
    df.loc[df["median"] <= 0, ["floor", "ceiling"]] = 0.0
    if missing:
        print("STATUS NAMES NOT FOUND IN nflverse:", missing)
    for line in base.checks(df, t):
        print(line)
    base.OUT.mkdir(parents=True, exist_ok=True)
    df.to_csv(base.OUT / f"claude_projections_{DATE}_{MODE}.csv", index=False)
    t.to_csv(base.OUT / f"claude_teams_{DATE}_{MODE}.csv", index=False)
    print("notes:", res.notes[:12])
    print(df.sort_values("median", ascending=False).groupby("pos").head(6)[
        ["name", "team", "pos", "median", "floor", "ceiling", "own_gpp", "status"]].to_string(index=False))
    print(len(df), "players ->", base.OUT)
