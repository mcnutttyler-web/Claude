"""Free public data from nflverse (MIT code; data CC-BY 4.0 — attribute "nflverse" when sharing outputs).

Downloads season files from the nflverse-data GitHub releases with the standard library (no extra dependency),
caches them under data/nflverse/, and aggregates play-by-play into the inputs the bottom-up model needs:

    team_games    one row per (game, offense): plays, dropbacks, sacks, scrambles, attempts, PROE, TDs ...
    defense_games one row per (game, defense): dropbacks faced, sacks, INTs, fumbles recovered
    player_games  one row per (game, player): targets, red-zone targets, carries, goal-line carries, yards, TDs,
                  dropbacks as passer, offensive snaps / snap share (pfr snap counts joined through rosters)

Only completed games strictly before the slate date are used, so a backtest never sees the future.
"""
from __future__ import annotations

import time
import urllib.request
from pathlib import Path

import numpy as np
import pandas as pd

from core.names import normalize_team

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DIR = ROOT / "data" / "nflverse"
URL = "https://github.com/nflverse/nflverse-data/releases/download/{tag}/{stem}_{season}.parquet"
FILES = {"pbp": ("pbp", "play_by_play"), "rosters": ("weekly_rosters", "roster_weekly"),
         "snaps": ("snap_counts", "snap_counts")}
RZ_TARGET_YDS = 20          # red zone: yardline_100 <= 20
GL_CARRY_YDS = 10           # goal-line carries: yardline_100 <= 10


def path_for(kind: str, season: int, dest: str | Path = DEFAULT_DIR) -> Path:
    return Path(dest) / f"{FILES[kind][1]}_{season}.parquet"


def fetch(seasons: list[int], kinds=("pbp", "rosters", "snaps"), dest: str | Path = DEFAULT_DIR,
          max_age_hours: float = 12.0, current: int | None = None, log=print) -> list[Path]:
    """Download missing/stale files. Past seasons download once; the current season refreshes after max_age_hours."""
    dest = Path(dest)
    dest.mkdir(parents=True, exist_ok=True)
    current = current if current is not None else max(seasons)
    out = []
    for season in seasons:
        for kind in kinds:
            p = path_for(kind, season, dest)
            fresh = p.exists() and (season < current or (time.time() - p.stat().st_mtime) < max_age_hours * 3600)
            if not fresh:
                tag, stem = FILES[kind]
                url = URL.format(tag=tag, stem=stem, season=season)
                tmp = p.with_suffix(".part")
                try:
                    with urllib.request.urlopen(url, timeout=120) as r, open(tmp, "wb") as f:
                        f.write(r.read())
                    tmp.replace(p)
                    log(f"downloaded {p.name}")
                except Exception as e:  # keep a stale copy rather than failing the run
                    tmp.unlink(missing_ok=True)
                    if not p.exists():
                        raise RuntimeError(f"could not download {url}: {e}") from e
                    log(f"WARN using cached {p.name} ({e})")
            out.append(p)
    return out


GAMES_URL = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv"


def fetch_games(dest: str | Path = DEFAULT_DIR, max_age_hours: float = 6.0, log=print) -> Path:
    """nflverse schedule with closing/current Vegas lines (spread_line = home margin, total_line), roof, wind."""
    p = Path(dest) / "games.csv"
    if p.exists() and (time.time() - p.stat().st_mtime) < max_age_hours * 3600:
        return p
    p.parent.mkdir(parents=True, exist_ok=True)
    try:
        with urllib.request.urlopen(GAMES_URL, timeout=60) as r:
            p.write_bytes(r.read())
        log(f"downloaded {p.name}")
    except Exception as e:
        if not p.exists():
            raise RuntimeError(f"could not download {GAMES_URL}: {e}") from e
        log(f"WARN using cached {p.name} ({e})")
    return p


def schedule_env(slate: pd.DataFrame, dest: str | Path = DEFAULT_DIR,
                 aliases: dict[str, str] | None = None) -> pd.DataFrame | None:
    """Team environment for the slate's games from the nflverse schedule's lines (free fallback for odds)."""
    p = Path(dest) / "games.csv"
    if not p.exists():
        return None
    al = aliases or {}
    g = pd.read_csv(p)
    g = g.dropna(subset=["spread_line", "total_line"])
    g["home"] = g["home_team"].map(lambda t: normalize_team(t, al))
    g["away"] = g["away_team"].map(lambda t: normalize_team(t, al))
    dates = {pd.Timestamp(x).date() for x in slate["lock_time"] if x is not None and x == x}
    g = g[pd.to_datetime(g["gameday"]).dt.date.isin(dates)]
    out = []
    for gid in slate["game_id"].unique():
        away, home = gid.split("@")
        m = g[((g["home"] == home) & (g["away"] == away)) | ((g["home"] == away) & (g["away"] == home))]
        if m.empty:
            continue
        r = m.iloc[0]
        home, away = r["home"], r["away"]                 # trust the schedule's orientation for the spread sign
        sh, tot = -float(r["spread_line"]), float(r["total_line"])
        out += [{"team": home, "opp": away, "game_id": gid, "spread": sh, "game_total": tot,
                 "team_total": tot / 2 - sh / 2},
                {"team": away, "opp": home, "game_id": gid, "spread": -sh, "game_total": tot,
                 "team_total": tot / 2 + sh / 2}]
    return pd.DataFrame(out) if out else None


def available(season: int, dest: str | Path = DEFAULT_DIR) -> bool:
    return path_for("pbp", season, dest).exists() and path_for("rosters", season, dest).exists()


# --------------------------------------------------------------------------------------------- aggregation
def _offense_plays(pbp: pd.DataFrame) -> pd.DataFrame:
    o = pbp[pbp["play_type"].isin(["pass", "run"]) & (pbp["two_point_attempt"].fillna(0) != 1)].copy()
    for c in ("pass", "rush_attempt", "qb_scramble", "sack", "pass_attempt", "complete_pass", "interception",
              "pass_touchdown", "rush_touchdown", "fumble_lost"):
        o[c] = o[c].fillna(0).astype(float)
    o["att"] = ((o["pass_attempt"] == 1) & (o["sack"] == 0)).astype(float)
    o["designed"] = ((o["rush_attempt"] == 1) & (o["qb_scramble"] == 0)).astype(float)
    o["rz"] = o["yardline_100"] <= RZ_TARGET_YDS
    o["gl"] = o["yardline_100"] <= GL_CARRY_YDS
    o["oe"] = o["pass"] - o["xpass"]
    return o


def load_season(season: int, before: pd.Timestamp | str | None = None, dest: str | Path = DEFAULT_DIR,
                aliases: dict[str, str] | None = None) -> dict[str, pd.DataFrame]:
    """Aggregate one season of nflverse files (regular season, games before `before`)."""
    al = aliases or {}
    pbp = pd.read_parquet(path_for("pbp", season, dest))
    pbp = pbp[pbp["season_type"] == "REG"]
    if before is not None:
        pbp = pbp[pd.to_datetime(pbp["game_date"]) < pd.Timestamp(before).tz_localize(None).normalize()]
    for c in ("posteam", "defteam"):
        pbp[c] = pbp[c].map(lambda t: normalize_team(t, al) if isinstance(t, str) else t)
    o = _offense_plays(pbp)
    gw = pbp.groupby("game_id")["week"].first()

    tg = o.groupby(["game_id", "posteam"]).agg(
        plays=("play_id", "size"), dropbacks=("pass", "sum"), sacks=("sack", "sum"), scrambles=("qb_scramble", "sum"),
        att=("att", "sum"), comp=("complete_pass", "sum"), pass_yds=("passing_yards", "sum"),
        pass_td=("pass_touchdown", "sum"), ints=("interception", "sum"), designed=("designed", "sum"),
        rush_td=("rush_touchdown", "sum"), fumbles_lost=("fumble_lost", "sum"),
        targets=("receiver_player_id", "count"), oe_sum=("oe", "sum"), oe_n=("oe", "count"),
    ).reset_index().rename(columns={"posteam": "team"})
    tg["week"] = tg["game_id"].map(gw)
    rz = o[o["rz"] & (o["att"] == 1) & o["receiver_player_id"].notna()].groupby(["game_id", "posteam"]).size()
    gl = o[o["gl"] & (o["rush_attempt"] == 1)].groupby(["game_id", "posteam"]).size()
    tg["rz_targets"] = [rz.get((g, t), 0) for g, t in zip(tg["game_id"], tg["team"])]
    tg["gl_carries"] = [gl.get((g, t), 0) for g, t in zip(tg["game_id"], tg["team"])]
    tg["rushes"] = o[o["rush_attempt"] == 1].groupby(["game_id", "posteam"]).size().reindex(
        list(zip(tg["game_id"], tg["team"])), fill_value=0).to_numpy()

    dg = o.groupby(["game_id", "defteam"]).agg(
        dropbacks=("pass", "sum"), sacks=("sack", "sum"), att=("att", "sum"), ints=("interception", "sum"),
        fum_rec=("fumble_lost", "sum")).reset_index().rename(columns={"defteam": "team"})
    dg["week"] = dg["game_id"].map(gw)

    # ---- players
    recv = o[(o["att"] == 1) & o["receiver_player_id"].notna()]
    r = recv.groupby(["game_id", "posteam", "receiver_player_id"]).agg(
        targets=("att", "size"), rec=("complete_pass", "sum"), rec_yds=("receiving_yards", "sum"),
        rec_td=("pass_touchdown", "sum"), rz_targets=("rz", "sum")).reset_index()
    r = r.rename(columns={"receiver_player_id": "player_id", "posteam": "team"})
    rush = o[(o["rush_attempt"] == 1) & o["rusher_player_id"].notna()]
    u = rush.groupby(["game_id", "posteam", "rusher_player_id"]).agg(
        carries=("rush_attempt", "size"), designed=("designed", "sum"), scrambles=("qb_scramble", "sum"),
        rush_yds=("rushing_yards", "sum"), rush_td=("rush_touchdown", "sum"), gl_carries=("gl", "sum")).reset_index()
    u = u.rename(columns={"rusher_player_id": "player_id", "posteam": "team"})
    dbk = o[(o["pass"] == 1) & o["passer_player_id"].notna()]
    q = dbk.groupby(["game_id", "posteam", "passer_player_id"]).agg(
        dropbacks=("pass", "size"), att=("att", "sum"), comp=("complete_pass", "sum"), pass_yds=("passing_yards", "sum"),
        pass_td=("pass_touchdown", "sum"), ints=("interception", "sum"), sacks=("sack", "sum")).reset_index()
    q = q.rename(columns={"passer_player_id": "player_id", "posteam": "team"})
    fl = o[(o["fumble_lost"] == 1) & o["fumbled_1_player_id"].notna()].groupby(
        ["game_id", "posteam", "fumbled_1_player_id"]).size().rename("fumbles_lost").reset_index().rename(
        columns={"fumbled_1_player_id": "player_id", "posteam": "team"})
    key = ["game_id", "team", "player_id"]
    pg = r.merge(u, on=key, how="outer").merge(q, on=key, how="outer", suffixes=("", "_qb")).merge(fl, on=key, how="outer")
    pg = pg.fillna({c: 0 for c in pg.columns if c not in key})
    pg["week"] = pg["game_id"].map(gw)

    ros = pd.read_parquet(path_for("rosters", season, dest))
    ros = ros[ros["game_type"].fillna("REG") == "REG"] if "game_type" in ros else ros
    ros["team"] = ros["team"].map(lambda t: normalize_team(t, al) if isinstance(t, str) else t)
    people = (ros.sort_values("week").groupby("gsis_id").agg(
        name=("full_name", "last"), position=("position", "last"), team_now=("team", "last"),
        pfr_id=("pfr_id", "last")).reset_index().rename(columns={"gsis_id": "player_id"}))

    # snap counts: games actually played (denominator for shares) + snap share (route-participation proxy)
    sp = path_for("snaps", season, dest)
    if sp.exists():
        sn = pd.read_parquet(sp)
        sn = sn[sn["game_type"].fillna("REG") == "REG"]
        sn["team"] = sn["team"].map(lambda t: normalize_team(t, al) if isinstance(t, str) else t)
        pfr2gsis = people.dropna(subset=["pfr_id"]).set_index("pfr_id")["player_id"].to_dict()
        sn["player_id"] = sn["pfr_player_id"].map(pfr2gsis)
        sn = sn.dropna(subset=["player_id"])
        sn = sn[sn["week"].isin(set(tg["week"]))]
        wk_game = tg.drop_duplicates(["week", "team"]).set_index(["week", "team"])["game_id"].to_dict()
        sn["game_id"] = [wk_game.get((w, t)) for w, t in zip(sn["week"], sn["team"])]
        sn = sn.dropna(subset=["game_id"])
        sn = sn[sn["offense_snaps"].fillna(0) > 0][["game_id", "team", "player_id", "offense_snaps", "offense_pct"]]
        pg = pg.merge(sn, on=key, how="outer")
        pg = pg.fillna({c: 0 for c in pg.columns if c not in key + ["offense_pct", "offense_snaps"]})
        pg["week"] = pg["game_id"].map(gw)
    else:
        pg["offense_snaps"], pg["offense_pct"] = np.nan, np.nan
    pg = pg.merge(people[["player_id", "name", "position"]], on="player_id", how="left")
    pg["season"] = season
    tg["season"], dg["season"] = season, season
    return {"team_games": tg, "defense_games": dg, "player_games": pg, "people": people}


def main(argv=None) -> None:
    import argparse
    ap = argparse.ArgumentParser(description="Download nflverse play-by-play, rosters and snap counts")
    ap.add_argument("--season", type=int, required=True, help="current season (last season is fetched too)")
    ap.add_argument("--dest", default=str(DEFAULT_DIR))
    a = ap.parse_args(argv)
    fetch([a.season - 1, a.season], dest=a.dest)
    fetch_games(a.dest)


if __name__ == "__main__":
    main()
