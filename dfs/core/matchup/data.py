"""Free nflverse data -> per-game tables for the matchup layer.

Seasons 2016+ (regular season). Sources (nflverse-data releases, the same files nflreadpy reads):
  play-by-play, weekly rosters, snap counts, pbp participation (man/zone; 2016-2025, published after the
  season), FTN charting (blitzers; 2022+), weekly player stats (cross-check of DK points).

Tables
  player_games   one row per player-game: opportunity, raw stats, DK points, archetype inputs
  defense_games  one row per defense-game: EPA/play allowed (pass, run), explosive pass rate, pressure rate,
                 man rate, blitz rate, middle-target share allowed
  team_games     one row per offense-game (denominators for shares, schedule adjustment)

Proxies (free data has no alignment or route charting for 2026):
  route participation -> offensive snap share (pfr snap counts), every season, so training = live
  slot rate           -> share of targets thrown to the middle of the field (pbp pass_location)
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from core.names import normalize_team
from core.projections import nflverse

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "data" / "matchup" / "cache"
DATA = nflverse.DEFAULT_DIR
EXTRA = {"participation": ("pbp_participation", "pbp_participation"), "ftn": ("ftn_charting", "ftn_charting"),
         "stats": ("stats_player", "stats_player_week")}
RZ, GL, EXPLOSIVE = 20, 5, 20

DK = {"pass_yds": 0.04, "pass_td": 4, "ints": -1, "rush_yds": 0.1, "rush_td": 6, "rec": 1, "rec_yds": 0.1,
      "rec_td": 6, "fumbles_lost": -1}


def dk_points(df: pd.DataFrame) -> pd.Series:
    """DK classic scoring from raw stats (+3 at 300 pass / 100 rush / 100 rec yards). 2-pt conversions ignored."""
    pts = sum(df[c].fillna(0) * w for c, w in DK.items())
    return pts + 3 * (df["pass_yds"] >= 300) + 3 * (df["rush_yds"] >= 100) + 3 * (df["rec_yds"] >= 100)


def extra_path(kind: str, season: int, dest: Path = DATA) -> Path:
    return Path(dest) / f"{EXTRA[kind][1]}_{season}.parquet"


def fetch_extra(season: int, kinds=("participation", "ftn", "stats"), dest: Path = DATA, max_age_hours=12.0,
                log=print) -> dict[str, bool]:
    """Download the matchup layer's extra files. Missing files (e.g. 2026 participation) are reported, not fatal."""
    import time
    import urllib.request
    ok = {}
    for k in kinds:
        p = extra_path(k, season, dest)
        if p.exists() and (time.time() - p.stat().st_mtime) < max_age_hours * 3600:
            ok[k] = True
            continue
        tag, stem = EXTRA[k]
        url = f"https://github.com/nflverse/nflverse-data/releases/download/{tag}/{stem}_{season}.parquet"
        try:
            with nflverse.urlopen(url, timeout=120) as r:
                p.write_bytes(r.read())
            ok[k] = True
            log(f"downloaded {p.name}")
        except Exception as e:
            ok[k] = p.exists()
            log(f"{'WARN using cached' if p.exists() else 'not available:'} {p.name} ({e})")
    return ok


def _norm(s: pd.Series, al: dict) -> pd.Series:
    return s.map(lambda t: normalize_team(t, al) if isinstance(t, str) else t)


def build_season(season: int, aliases: dict, dest: Path = DATA) -> dict[str, pd.DataFrame]:
    pbp = pd.read_parquet(nflverse.path_for("pbp", season, dest))
    pbp = pbp[pbp["season_type"] == "REG"].copy()
    for c in ("posteam", "defteam"):
        pbp[c] = _norm(pbp[c], aliases)
    o = pbp[pbp["play_type"].isin(["pass", "run"]) & (pbp["two_point_attempt"].fillna(0) != 1)].copy()
    num = ["pass", "rush_attempt", "qb_scramble", "sack", "pass_attempt", "complete_pass", "interception",
           "pass_touchdown", "rush_touchdown", "fumble_lost", "qb_hit"]
    for c in num:
        o[c] = o[c].fillna(0).astype(float)
    o["att"] = ((o["pass_attempt"] == 1) & (o["sack"] == 0)).astype(float)
    o["designed"] = ((o["rush_attempt"] == 1) & (o["qb_scramble"] == 0)).astype(float)
    o["tgt"] = ((o["att"] == 1) & o["receiver_player_id"].notna()).astype(float)
    o["mid"] = (o["tgt"] == 1) & (o["pass_location"] == "middle")
    o["rz"] = (o["tgt"] == 1) & (o["yardline_100"] <= RZ)
    o["gl"] = (o["rush_attempt"] == 1) & (o["yardline_100"] <= GL)
    o["explosive"] = (o["att"] == 1) & (o["complete_pass"] == 1) & (o["passing_yards"].fillna(0) >= EXPLOSIVE)
    o["pressure"] = ((o["sack"] == 1) | (o["qb_hit"] == 1)) & (o["pass"] == 1)
    o["air"] = np.where(o["att"] == 1, o["air_yards"].fillna(0), 0.0)

    # coverage features: man/zone (participation), blitz (FTN)
    o["man"], o["zone"], o["blitz"], o["charted"] = np.nan, np.nan, np.nan, np.nan
    pp = extra_path("participation", season, dest)
    if pp.exists():
        part = pd.read_parquet(pp, columns=["nflverse_game_id", "play_id", "defense_man_zone_type"])
        part = part.rename(columns={"nflverse_game_id": "game_id"})
        o = o.drop(columns=["man", "zone"]).merge(part, on=["game_id", "play_id"], how="left")
        mz = o["defense_man_zone_type"].fillna("").astype(str)
        o["man"] = (mz == "MAN_COVERAGE").astype(float)
        o["zone"] = (mz == "ZONE_COVERAGE").astype(float)
    fp = extra_path("ftn", season, dest)
    if fp.exists():
        ftn = pd.read_parquet(fp, columns=["nflverse_game_id", "nflverse_play_id", "n_blitzers"])
        ftn = ftn.rename(columns={"nflverse_game_id": "game_id", "nflverse_play_id": "play_id"})
        o = o.drop(columns=["blitz", "charted"]).merge(ftn, on=["game_id", "play_id"], how="left")
        o["charted"] = (o["n_blitzers"].notna() & (o["pass"] == 1)).astype(float)       # charted dropbacks
        o["blitz"] = ((o["n_blitzers"].fillna(0) > 0) & (o["pass"] == 1)).astype(float)

    gw = pbp.groupby("game_id").agg(week=("week", "first"), gameday=("game_date", "first"))
    key = ["game_id", "posteam"]
    tg = o.groupby(key).agg(plays=("play_id", "size"), dropbacks=("pass", "sum"), att=("att", "sum"),
                            targets=("tgt", "sum"), rz_targets=("rz", "sum"), designed=("designed", "sum"),
                            gl_carries=("gl", "sum")).reset_index().rename(columns={"posteam": "team"})

    db = o[o["pass"] == 1]
    ru = o[o["designed"] == 1]
    dg = o.groupby(["game_id", "defteam", "posteam"]).agg(
        dropbacks=("pass", "sum"), att=("att", "sum"), targets=("tgt", "sum"), mid=("mid", "sum"),
        explosive=("explosive", "sum"), pressure=("pressure", "sum"), man=("man", "sum"), zone=("zone", "sum"),
        blitz=("blitz", "sum"), charted=("charted", "sum")).reset_index()
    dg = dg.merge(db.groupby(["game_id", "defteam"])["epa"].mean().rename("pass_epa"), on=["game_id", "defteam"],
                  how="left")
    dg = dg.merge(ru.groupby(["game_id", "defteam"])["epa"].mean().rename("rush_epa"), on=["game_id", "defteam"],
                  how="left")
    dg = dg.rename(columns={"defteam": "team", "posteam": "opp"})
    dg["explosive_rate"] = dg["explosive"] / dg["att"].clip(lower=1)
    dg["pressure_rate"] = dg["pressure"] / dg["dropbacks"].clip(lower=1)
    dg["mid_share"] = dg["mid"] / dg["targets"].clip(lower=1)
    dg["man_rate"] = np.where(dg["man"] + dg["zone"] > 20, dg["man"] / (dg["man"] + dg["zone"]).clip(lower=1), np.nan)
    dg["blitz_rate"] = np.where(dg["charted"] > 20, dg["blitz"] / dg["charted"].clip(lower=1), np.nan)
    dg["coverage_charted"] = dg["charted"] / dg["dropbacks"].clip(lower=1)

    # ---- player-games
    rec = o[o["tgt"] == 1].groupby(["game_id", "posteam", "defteam", "receiver_player_id"]).agg(
        targets=("tgt", "sum"), rec=("complete_pass", "sum"), rec_yds=("receiving_yards", "sum"),
        rec_td=("pass_touchdown", "sum"), air_yards=("air", "sum"), mid_targets=("mid", "sum"),
        rz_targets=("rz", "sum"),
        yac=("yards_after_catch", lambda x: x.fillna(0).sum())).reset_index().rename(
        columns={"receiver_player_id": "player_id"})
    rush = o[o["rush_attempt"] == 1].groupby(["game_id", "posteam", "defteam", "rusher_player_id"]).agg(
        carries=("designed", "sum"), scrambles=("qb_scramble", "sum"), rush_yds=("rushing_yards", "sum"),
        rush_td=("rush_touchdown", "sum"), gl_carries=("gl", "sum")).reset_index().rename(
        columns={"rusher_player_id": "player_id"})
    qb = db[db["passer_player_id"].notna()].groupby(["game_id", "posteam", "defteam", "passer_player_id"]).agg(
        dropbacks=("pass", "sum"), att=("att", "sum"), pass_yds=("passing_yards", "sum"),
        pass_td=("pass_touchdown", "sum"), ints=("interception", "sum"),
        pass_air=("air", "sum")).reset_index().rename(columns={"passer_player_id": "player_id"})
    fl = o[(o["fumble_lost"] == 1) & o["fumbled_1_player_id"].notna()].groupby(
        ["game_id", "posteam", "defteam", "fumbled_1_player_id"]).size().rename("fumbles_lost").reset_index().rename(
        columns={"fumbled_1_player_id": "player_id"})
    k = ["game_id", "posteam", "defteam", "player_id"]
    pg = rec.merge(rush, on=k, how="outer").merge(qb, on=k, how="outer").merge(fl, on=k, how="outer")
    pg = pg.rename(columns={"posteam": "team", "defteam": "opp"})
    stat_cols = [c for c in pg.columns if c not in ("game_id", "team", "opp", "player_id")]
    pg[stat_cols] = pg[stat_cols].fillna(0.0)

    ros = pd.read_parquet(nflverse.path_for("rosters", season, dest))
    people = ros.sort_values("week").groupby("gsis_id").agg(
        name=("full_name", "last"), position=("position", "last"), pfr_id=("pfr_id", "last")).reset_index()
    pg = pg.merge(people[["gsis_id", "name", "position"]], left_on="player_id", right_on="gsis_id",
                  how="left").drop(columns="gsis_id")
    pg["position"] = pg["position"].replace({"FB": "RB"})
    pg = pg.merge(gw, left_on="game_id", right_index=True)
    pg["team"], pg["opp"] = _norm(pg["team"], aliases), _norm(pg["opp"], aliases)

    sp = nflverse.path_for("snaps", season, dest)
    pg["snap_share"] = np.nan
    if sp.exists():
        sn = pd.read_parquet(sp)
        sn = sn[sn["game_type"].fillna("REG") == "REG"]
        pfr = people.dropna(subset=["pfr_id"]).set_index("pfr_id")["gsis_id"].to_dict()
        sn["player_id"] = sn["pfr_player_id"].map(pfr)
        sn["team"] = _norm(sn["team"], aliases)
        sn = sn.dropna(subset=["player_id"]).groupby(["week", "team", "player_id"])["offense_pct"].max()
        pg["snap_share"] = [sn.get((w, t, p), np.nan) for w, t, p in zip(pg["week"], pg["team"], pg["player_id"])]

    tgk = tg.set_index(["game_id", "team"])
    for c in ("targets", "rz_targets", "designed", "gl_carries", "dropbacks"):
        pg[f"team_{c}"] = [tgk.at[(g, t), c] if (g, t) in tgk.index else np.nan
                           for g, t in zip(pg["game_id"], pg["team"])]
    pg["dk"] = dk_points(pg)
    pg["season"] = season
    tg = tg.merge(gw, left_on="game_id", right_index=True)
    tg["team"] = _norm(tg["team"], aliases)
    dg = dg.merge(gw, left_on="game_id", right_index=True)
    tg["season"], dg["season"] = season, season
    pg = pg[pg["position"].isin(["QB", "RB", "WR", "TE"])].reset_index(drop=True)
    return {"player_games": pg, "defense_games": dg, "team_games": tg}


def load(seasons: list[int], aliases: dict, refresh: set[int] | None = None, dest: Path = DATA) -> dict[str, pd.DataFrame]:
    """Concatenate seasons, using the parquet cache for completed seasons."""
    CACHE.mkdir(parents=True, exist_ok=True)
    out = {"player_games": [], "defense_games": [], "team_games": []}
    for s in seasons:
        if not nflverse.path_for("pbp", s, dest).exists():
            continue
        paths = {k: CACHE / f"{k}_{s}.parquet" for k in out}
        if (refresh and s in refresh) or not all(p.exists() for p in paths.values()) or dest != DATA:
            d = build_season(s, aliases, dest)
            if dest == DATA:
                for k, p in paths.items():
                    d[k].to_parquet(p, index=False)
        else:
            d = {k: pd.read_parquet(p) for k, p in paths.items()}
        for k in out:
            out[k].append(d[k])
    return {k: pd.concat(v, ignore_index=True) if v else pd.DataFrame() for k, v in out.items()}
