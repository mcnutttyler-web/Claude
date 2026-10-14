"""Walk-forward backtest of the own (bottom-up) model on real nflverse data.

For each week: build profiles from games strictly before that week, take Vegas lines from the nflverse schedule
(games.csv: spread_line is the home margin, total_line the total), project every rostered skill player on the
teams playing, and score against actual DK points computed from play-by-play.

Inactives are known (players with no snaps that week are marked Out) — this mirrors a Sunday-morning projection
after inactive lists. Pool per the FFA protocol: top-20 QB/TE and top-40 RB/WR by projection, among players who
played. Prints MAE / bias / Spearman by position against the playbook's best-source bars.

    python scripts/backtest_own_model.py --weeks 2025:4-18 2026:2-5
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.projections import bottomup, nflverse  # noqa: E402
from core.projections.params import Params  # noqa: E402
from sports.base import load_sport  # noqa: E402

POOL = {"QB": 20, "RB": 40, "WR": 40, "TE": 20}


def dk_points(pg: pd.DataFrame) -> pd.Series:
    return (pg["pass_yds"] * 0.04 + pg["pass_td"] * 4 - pg["ints"] + pg["rush_yds"] * 0.1 + pg["rush_td"] * 6
            + pg["rec"] + pg["rec_yds"] * 0.1 + pg["rec_td"] * 6 - pg["fumbles_lost"]
            + 3 * (pg["pass_yds"] >= 300) + 3 * (pg["rush_yds"] >= 100) + 3 * (pg["rec_yds"] >= 100))


def week_frame(season: int, week: int, games: pd.DataFrame, sport, params, cache: dict) -> pd.DataFrame | None:
    g = games[(games["season"] == season) & (games["week"] == week) & (games["game_type"] == "REG")]
    if g.empty or g["home_score"].isna().all():
        return None
    first = pd.Timestamp(g["gameday"].min())
    al = sport.team_aliases
    cur = nflverse.load_season(season, before=first, aliases=al)
    if season - 1 not in cache and nflverse.available(season - 1):
        cache[season - 1] = nflverse.load_season(season - 1, aliases=al)
    prior = cache.get(season - 1)
    if season not in cache:
        cache[season] = nflverse.load_season(season, aliases=al)
    full = cache[season]
    if not len(cur["team_games"]):                       # week 1: last season is the "current" sample
        if prior is None:
            return None
        cur = prior
        prior = nflverse.load_season(season - 2, aliases=al) if nflverse.available(season - 2) else None
    act = full["player_games"][full["player_games"]["week"] == week].copy()
    act["actual"] = dk_points(act)

    norm = lambda t: al.get(t, t)
    env, slate_rows = [], []
    for r in g.itertuples():
        h, a = norm(r.home_team), norm(r.away_team)
        sh = -float(r.spread_line)                       # nflverse: + = home favored
        tot = float(r.total_line)
        gid = f"{a}@{h}"
        env += [{"team": h, "opp": a, "game_id": gid, "spread": sh, "game_total": tot, "team_total": tot / 2 - sh / 2},
                {"team": a, "opp": h, "game_id": gid, "spread": -sh, "game_total": tot, "team_total": tot / 2 + sh / 2}]
    env = pd.DataFrame(env)
    teams = set(env["team"])
    # slate = everyone with history on these teams (by latest team) + everyone who actually played
    lg = bottomup.league_baselines([cur] + ([prior] if prior else []), params)
    prof = bottomup.player_profiles(cur, prior, lg, params)
    played = set(act.loc[(act["offense_snaps"].fillna(0) > 0) | (act["targets"] + act["carries"] + act["dropbacks"] > 0),
                         "player_id"])
    people = full["people"].set_index("player_id")
    team_of_week = act.drop_duplicates("player_id").set_index("player_id")["team"].to_dict()
    for r in prof.itertuples():
        team = team_of_week.get(r.player_id, r.team)
        if team in teams and r.position in ("QB", "RB", "WR", "TE"):
            slate_rows.append({"pid": r.player_id, "name": r.name, "team": team, "position": r.position})
    slate = pd.DataFrame(slate_rows).drop_duplicates("pid").reset_index(drop=True)
    slate["id"] = slate["pid"]
    slate = slate.merge(env[["team", "opp", "game_id"]], on="team", how="left")
    status = {i: ("" if pid in played else "O") for i, pid in enumerate(slate["pid"])}
    res = bottomup.run_model(slate, env, cur, prior, sport, params, status)
    out = res.rows.merge(slate[["pid", "name", "team", "position"]], left_on="dk_index", right_index=True)
    out = out.merge(act[["player_id", "actual"]].groupby("player_id").sum(), left_on="pid", right_index=True,
                    how="inner")
    # naive baseline: season-to-date DK points per game (last season's average before a player's first game)
    hist = cur["player_games"].assign(dk=lambda x: dk_points(x)).groupby("player_id")["dk"].mean()
    if prior:
        ph = prior["player_games"].assign(dk=lambda x: dk_points(x)).groupby("player_id")["dk"].mean()
        hist = hist.combine_first(ph)
    out["naive"] = out["pid"].map(hist)
    out["season"], out["week"] = season, week
    return out[out["pid"].isin(played)]


def summarize(df: pd.DataFrame, params) -> pd.DataFrame:
    bars = params.get("validation.mae_bar")
    rows = []
    for pos, n in POOL.items():
        pool = (df[df["position"] == pos].sort_values("points", ascending=False)
                .groupby(["season", "week"]).head(n))
        e = pool["points"] - pool["actual"]
        en = (pool["naive"] - pool["actual"]).dropna()
        rho = pool.groupby(["season", "week"]).apply(
            lambda x: x["points"].rank().corr(x["actual"].rank()), include_groups=False).mean()
        r2 = pool.groupby(["season", "week"]).apply(
            lambda x: np.corrcoef(x["points"], x["actual"])[0, 1] ** 2, include_groups=False).mean()
        rows.append({"position": pos, "n": len(pool), "MAE": e.abs().mean(), "bias(proj-act)": e.mean(),
                     "spearman": rho, "R2": r2, "naive_MAE": en.abs().mean(), "best_source_MAE_bar": bars.get(pos)})
    return pd.DataFrame(rows).round(3)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--weeks", nargs="+", default=["2025:4-18", "2026:2-5"], help="season:first-last")
    ap.add_argument("--out", default="data/backtest_own_model.csv")
    a = ap.parse_args(argv)
    sport, params = load_sport("nfl"), Params()
    games = pd.read_csv(nflverse.DEFAULT_DIR / "games.csv")
    cache, frames = {}, []
    for spec in a.weeks:
        season, rng = spec.split(":")
        lo, hi = (int(x) for x in rng.split("-"))
        for w in range(lo, hi + 1):
            f = week_frame(int(season), w, games, sport, params, cache)
            if f is not None:
                frames.append(f)
                print(f"{season} wk{w}: {len(f)} players", flush=True)
    df = pd.concat(frames, ignore_index=True)
    df.to_csv(a.out, index=False)
    print(summarize(df, params).to_string(index=False))


if __name__ == "__main__":
    main()
