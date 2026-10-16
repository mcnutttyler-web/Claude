"""Fit the game simulator's parameters from nflverse history (training seasons only; the test and holdout
seasons are never read here).

Every number in config/game_sim_params.json comes from this script. Run:
    python -m dfs.sim.fit --seasons 2016-2022
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[3]
NFLVERSE = ROOT / "data" / "nflverse"
OUT = ROOT / "config" / "game_sim_params.json"


def _pbp(season: int) -> pd.DataFrame:
    cols = ["game_id", "season", "week", "season_type", "posteam", "defteam", "home_team", "away_team", "fixed_drive",
            "fixed_drive_result", "play_type", "rush_attempt", "qb_kneel", "qb_scramble", "complete_pass",
            "yards_gained", "extra_point_result", "two_point_conv_result", "td_team", "touchdown", "interception",
            "fumble_lost", "punt_blocked", "field_goal_result", "safety", "pass_attempt", "sack",
            "drive_time_of_possession", "receiver_player_id", "rusher_player_id"]
    p = pd.read_parquet(NFLVERSE / f"play_by_play_{season}.parquet", columns=cols)
    return p[p["season_type"] == "REG"]


def excess_log_sd(team_games: pd.DataFrame, num: str, den: str, per_unit_var: float) -> float:
    """SD of a shared team-game efficiency multiplier: variance of per-unit efficiency beyond the independent
    per-play noise, after removing each team-season's mean."""
    g = team_games[team_games[den] >= 5].copy()
    g["eff"] = g[num] / g[den]
    g["eff_dm"] = g["eff"] - g.groupby(["season", "team"])["eff"].transform("mean")
    excess = g["eff_dm"].var() - (per_unit_var / g[den]).mean()
    return float(np.sqrt(max(excess, 0.0)) / g["eff"].mean())


def dirichlet_kappa(pg: pd.DataFrame, tg: pd.DataFrame, stat: str, team_stat: str, positions: list[str],
                    exits: pd.Series) -> float:
    """Dirichlet-multinomial concentration from the over-dispersion of weekly counts around the player's
    leave-one-out share (games flagged as early exits are excluded: they are modeled separately)."""
    d = pg[pg["position"].isin(positions) & ~exits].merge(
        tg[["game_id", "team", team_stat]].rename(columns={team_stat: "T"}), on=["game_id", "team"])
    d = d[d["T"] > 0]
    grp = d.groupby(["season", "player_id", "team"])
    d["n"] = grp[stat].transform("size")
    d = d[d["n"] >= 6]
    sx, sT = grp[stat].transform("sum"), grp["T"].transform("sum")
    d["p"] = ((sx - d[stat]) / (sT - d["T"])).clip(1e-4, 0.999)
    d = d[d["p"] >= 0.03]
    r = ((d[stat] - d["T"] * d["p"]) ** 2).sum() / (d["T"] * d["p"] * (1 - d["p"])).sum()
    tbar = float(d["T"].mean())
    return float((tbar - 1) / max(r - 1, 1e-6) - 1)


def early_exits(pg: pd.DataFrame) -> pd.Series:
    """True where a regular (prior-3-game avg snap share >= 50%) player played under half his usual share."""
    pg = pg.sort_values(["player_id", "season", "week"])
    prev = pg.groupby(["player_id", "season"])["offense_pct"].transform(
        lambda s: s.shift(1).rolling(3, min_periods=2).mean())
    return (prev >= 0.5) & (pg["offense_pct"] < 0.5 * prev), prev


def fit(seasons: list[int]) -> dict:
    from core.projections import nflverse
    pbps = [_pbp(s) for s in seasons]
    p = pd.concat(pbps, ignore_index=True)

    # --- drives and drive outcomes
    dr = p.dropna(subset=["posteam"]).drop_duplicates(["game_id", "posteam", "fixed_drive"])
    per_game = dr.groupby("game_id").size()
    res = dr["fixed_drive_result"].value_counts(normalize=True)
    xp = p["extra_point_result"].dropna()
    two = p["two_point_conv_result"].dropna()
    td_n = (dr["fixed_drive_result"] == "Touchdown").sum()

    # --- per-play yardage shapes
    catch = p.loc[p["complete_pass"] == 1, "yards_gained"].dropna().to_numpy(float)
    rush = p.loc[(p["rush_attempt"] == 1) & (p["qb_kneel"] != 1) & (p["qb_scramble"] != 1),
                 "yards_gained"].dropna().to_numpy(float)

    # --- drive durations by outcome (minutes)
    t = dr["drive_time_of_possession"].str.split(":", expand=True).astype(float)
    mins = t[0] + t[1] / 60
    outc = np.where(dr["fixed_drive_result"] == "Touchdown", "td",
                    np.where(dr["fixed_drive_result"] == "Field goal", "fg", "other"))
    drive_minutes = {o: {"mean": round(float(mins[outc == o].mean()), 4), "sd": round(float(mins[outc == o].std()), 4)}
                     for o in ("td", "fg", "other")}

    # --- DST extras (per team-game, from the defending team's point of view)
    tg_n = per_game.size * 2
    to_plays = p[(p["interception"] == 1) | (p["fumble_lost"] == 1)]
    ret_td = (to_plays["td_team"].notna() & (to_plays["td_team"] == to_plays["defteam"])).sum()
    st = p[p["play_type"].isin(["kickoff", "punt"])]
    st_td = (st["td_team"].notna() & (st["td_team"] != st["posteam"])).sum()
    blk = ((p["field_goal_result"] == "blocked") | (p["extra_point_result"] == "blocked") | (p["punt_blocked"] == 1)).sum()
    saf = (p["safety"] == 1).sum()

    # --- team-game tables
    seas = {s: nflverse.load_season(s) for s in seasons}
    tg = pd.concat([v["team_games"] for v in seas.values()], ignore_index=True)
    pg = pd.concat([v["player_games"] for v in seas.values()], ignore_index=True)
    drives_tg = dr.groupby(["game_id", "posteam"]).size().rename("drives").reset_index().rename(columns={"posteam": "team"})
    tg = tg.merge(drives_tg, on=["game_id", "team"], how="left")

    games = pd.read_csv(NFLVERSE / "games.csv")
    games = games[games["season"].isin(seasons) & (games["game_type"] == "REG")].dropna(subset=["home_score"])
    rows = []
    for r in games.itertuples():
        for team, opp, pts, opp_pts, sign in ((r.home_team, r.away_team, r.home_score, r.away_score, 1),
                                              (r.away_team, r.home_team, r.away_score, r.home_score, -1)):
            exp_margin = sign * r.spread_line            # nflverse spread_line: + = home favored
            itt = r.total_line / 2 + exp_margin / 2
            rows.append({"game_id": r.game_id, "team": team, "pts": pts, "opp_pts": opp_pts, "itt": itt,
                         "exp_margin": exp_margin, "home": sign == 1})
    gm = pd.DataFrame(rows)
    gm["team"] = gm["team"].replace({"OAK": "LV", "SD": "LAC", "STL": "LA"})
    gm["resid"] = gm["pts"] - gm["itt"]
    home, away = gm[gm["home"]].set_index("game_id")["resid"], gm[~gm["home"]].set_index("game_id")["resid"]
    resid_corr = float(home.corr(away.reindex(home.index)))

    tg = tg.merge(gm[["game_id", "team", "pts", "opp_pts", "itt", "exp_margin"]], on=["game_id", "team"], how="inner")
    tg["db_rate"] = tg["dropbacks"] / tg["plays"]
    tg["surprise"] = (tg["pts"] - tg["opp_pts"]) - tg["exp_margin"]
    X = pd.DataFrame({c: tg[c] - tg.groupby(["season", "team"])[c].transform("mean")
                      for c in ("db_rate", "surprise", "exp_margin")})
    beta = np.linalg.lstsq(X[["surprise", "exp_margin"]].to_numpy(), X["db_rate"].to_numpy(), rcond=None)[0]
    tg["lppd"] = np.log(tg["plays"] / tg["drives"])
    lp = tg["lppd"] - tg.groupby(["season", "team"])["lppd"].transform("mean")
    pr = (tg["pts"] - tg["itt"])
    psi = float(np.polyfit(pr, lp, 1)[0])
    sd_ppd = float((lp - psi * pr).std())

    sigma_pass = excess_log_sd(tg, "pass_yds", "comp", float(catch.var()))
    tg["designed_yds"] = np.nan
    rush_tg = (p[(p["rush_attempt"] == 1) & (p["qb_kneel"] != 1) & (p["qb_scramble"] != 1)]
               .groupby(["game_id", "posteam"]).agg(ry=("yards_gained", "sum"), rn=("yards_gained", "size"))
               .reset_index().rename(columns={"posteam": "team"}))
    rush_tg["season"] = rush_tg["game_id"].str[:4].astype(int)
    sigma_rush = excess_log_sd(rush_tg, "ry", "rn", float(rush.var()))
    tg["ypc_resid"] = tg["pass_yds"] / tg["comp"].clip(lower=1)
    tg["ypc_resid"] -= tg.groupby(["season", "team"])["ypc_resid"].transform("mean")
    rho_eff = float(tg["ypc_resid"].corr(pr))

    exits, prev = early_exits(pg)
    exits = exits.reindex(pg.index).fillna(False)
    exit_rate = {}
    for pos in ("QB", "RB", "WR", "TE"):
        regular = (pg["position"] == pos) & (prev.reindex(pg.index) >= 0.5)
        e = regular & exits
        exit_rate[pos] = {"p": round(float(e.sum() / max(regular.sum(), 1)), 4),
                          "frac": round(float((pg.loc[e, "offense_pct"] / prev.reindex(pg.index)[e]).mean()), 4)}
    kappa = {"targets_WR": dirichlet_kappa(pg, tg, "targets", "targets", ["WR"], exits),
             "targets_TE": dirichlet_kappa(pg, tg, "targets", "targets", ["TE"], exits),
             "targets_RB": dirichlet_kappa(pg, tg, "targets", "targets", ["RB"], exits),
             "carries_RB": dirichlet_kappa(pg, tg, "carries", "rushes", ["RB"], exits),
             "carries_QB": dirichlet_kappa(pg, tg, "carries", "rushes", ["QB"], exits)}

    pos_of = pg.drop_duplicates("player_id").set_index("player_id")["position"]
    grid = np.linspace(0, 1, 401)
    cp = p[p["complete_pass"] == 1].assign(pos=lambda x: x["receiver_player_id"].map(pos_of))
    rp = p[(p["rush_attempt"] == 1) & (p["qb_kneel"] != 1)].assign(pos=lambda x: x["rusher_player_id"].map(pos_of))
    yards_q = {}
    for name, sub in (("catch_RB", cp[cp["pos"] == "RB"]), ("catch_WR", cp[cp["pos"] == "WR"]),
                      ("catch_TE", cp[cp["pos"] == "TE"]), ("carry_RB", rp[rp["pos"].isin(["RB", "WR", "TE"])]),
                      ("carry_QB", rp[rp["pos"] == "QB"])):
        y = sub["yards_gained"].dropna().to_numpy(float)
        yards_q[name] = {"n": int(len(y)), "mean": round(float(y.mean()), 4),
                         "q": [round(float(v), 2) for v in np.quantile(y, grid)]}

    out = {
        "trained_on": seasons,
        "drive_minutes": drive_minutes,
        "yards_quantiles": yards_q,
        "drives_per_game": {"mean": round(float(per_game.mean()), 3), "sd": round(float(per_game.std()), 3)},
        "drive_td_rate": round(float(res.get("Touchdown", 0)), 4),
        "drive_fg_rate": round(float(res.get("Field goal", 0)), 4),
        "xp_rate": round(float((xp == "good").mean()), 4),
        "two_pt_per_td": round(float(len(two) / td_n), 4), "two_pt_success": round(float((two == "success").mean()), 4),
        "team_points_resid": {"sd": round(float(gm["resid"].std()), 3), "corr": round(resid_corr, 4)},
        "script_beta_dropback_rate_per_pt": round(float(beta[0]), 5),
        "plays_per_drive": {"psi_per_pt": round(psi, 5), "sd": round(sd_ppd, 4)},
        "team_eff_sd": {"pass": round(sigma_pass, 4), "rush": round(sigma_rush, 4)},
        "eff_points_corr": round(rho_eff, 4),
        "dirichlet_kappa": {k: round(v, 2) for k, v in kappa.items()},
        "early_exit": exit_rate,
        "dst": {"return_td_per_turnover": round(float(ret_td / len(to_plays)), 4),
                "st_td_per_game": round(float(st_td / tg_n), 4), "blocked_kick_per_game": round(float(blk / tg_n), 4),
                "safety_per_game": round(float(saf / tg_n), 4)},
    }
    out["team_strength"] = fit_strength(out, gm)
    return out


def fit_strength(prm: dict, gm: pd.DataFrame, n: int = 150, seed: int = 7, max_games: int = 700) -> dict:
    """Grid-search the drive-level team-strength shock (sd, cross-team corr) so simulated points around the
    Vegas implied total match the observed residual SD and between-team correlation."""
    from dfs.sim.game import drive_points
    rng = np.random.default_rng(seed)
    home = gm[gm["home"]].set_index("game_id")
    home = home.sample(min(max_games, len(home)), random_state=seed)
    away = gm[~gm["home"]].set_index("game_id").reindex(home.index)
    itt = np.stack([home["itt"].to_numpy(float), away["itt"].to_numpy(float)])
    target_sd, target_corr = prm["team_points_resid"]["sd"], prm["team_points_resid"]["corr"]
    best = None
    for sd in np.arange(0.0, 0.61, 0.1):
        for corr in np.arange(-0.2, 0.41, 0.1):
            pts_a, pts_b = drive_points(itt[0], itt[1], prm, {"sd": sd, "corr": corr}, rng, n, pilot=300)
            ra, rb = pts_a - itt[0][None], pts_b - itt[1][None]
            s = float(np.sqrt((ra.var() + rb.var()) / 2))
            c = float(np.corrcoef(ra.ravel(), rb.ravel())[0, 1])
            loss = ((s - target_sd) / target_sd) ** 2 + (c - target_corr) ** 2
            print(f"  strength sd={sd:.1f} corr={corr:+.1f}: points sd {s:.2f} corr {c:+.3f}", flush=True)
            if best is None or loss < best[0]:
                best = (loss, sd, corr, s, c)
    return {"sd": round(float(best[1]), 3), "corr": round(float(best[2]), 3),
            "sim_points_sd": round(best[3], 3), "sim_points_corr": round(best[4], 4)}


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--seasons", default="2016-2022")
    a = ap.parse_args(argv)
    lo, hi = (int(x) for x in a.seasons.split("-"))
    prm = fit(list(range(lo, hi + 1)))
    OUT.write_text(json.dumps(prm, indent=2))
    print(json.dumps(prm, indent=2))


if __name__ == "__main__":
    main()
