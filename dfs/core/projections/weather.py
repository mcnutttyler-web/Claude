"""Weather multipliers (outdoor games only). All values are config defaults, calibrated: false.

weather.csv: team (home or away; applied to both teams in the game), wind_mph, precip (none|rain|snow), dome (Y/N)
"""
from __future__ import annotations

import pandas as pd

from core.projections.params import Params


def multipliers(wind_mph: float | None, precip: str | None, dome: bool, params: Params) -> dict[str, float]:
    m = {"pass_yds_mult": 1.0, "comp_pct_pts": 0.0, "rush_att_mult": 1.0, "fg_range_yds": 0.0, "fg_make_pts": 0.0}
    if dome:
        return m
    w = float(wind_mph or 0.0)
    if w >= 20:
        m.update(params.get("weather.wind_20_plus"))
    elif w >= 15:
        m.update(params.get("weather.wind_15_20"))
    elif w >= 10:
        m.update(params.get("weather.wind_10_15"))
    if str(precip if precip == precip and precip is not None else "").lower() in ("rain", "snow"):
        m["rain"] = 1.0
    return {"pass_yds_mult": float(m.get("pass_yds_mult", 1.0)), "comp_pct_pts": float(m.get("comp_pct_pts", 0.0)),
            "rush_att_mult": float(m.get("rush_att_mult", 1.0)), "fg_range_yds": float(m.get("fg_range_yds", 0.0)),
            "fg_make_pts": float(m.get("fg_make_pts", 0.0)), "rain": float(m.get("rain", 0.0))}


def read_weather(path_or_buf) -> pd.DataFrame:
    df = pd.read_csv(path_or_buf)
    df.columns = [c.strip().lower() for c in df.columns]
    df["team"] = df["team"].str.strip().str.upper()
    df["dome"] = df.get("dome", "N").astype(str).str.upper().isin(["Y", "YES", "TRUE", "1"])
    df["precip"] = df["precip"].fillna("").astype(str) if "precip" in df else ""
    return df


def points_factor(position: str, mult: dict[str, float], params: Params) -> float:
    """Multiplier on a points-only projection implied by the stat multipliers."""
    share_p = float(params.get("weather.points_share_passing").get(position, 0.0))
    share_r = float(params.get("weather.rush_points_share").get(position, 0.0))
    return (1.0 - share_p * (1.0 - mult["pass_yds_mult"])) * (1.0 + share_r * (mult["rush_att_mult"] - 1.0))


def apply_weather(table: pd.DataFrame, weather: pd.DataFrame, params: Params) -> tuple[pd.DataFrame, list[str]]:
    """Scale mean/stat columns per team. Both teams in a game share its weather row."""
    t = table.copy()
    notes = []
    game_of = t.groupby("team")["game_id"].first().to_dict()
    by_game = {}
    for r in weather.itertuples():
        g = game_of.get(r.team)
        if g:
            by_game[g] = r
    for g, r in by_game.items():
        mult = multipliers(getattr(r, "wind_mph", 0), getattr(r, "precip", ""), bool(r.dome), params)
        rows = t["game_id"] == g
        t.loc[rows, "wind_mph"] = getattr(r, "wind_mph", None)
        t.loc[rows, "precip"] = getattr(r, "precip", "")
        t.loc[rows, "is_dome"] = bool(r.dome)
        if mult["pass_yds_mult"] == 1.0 and mult["rush_att_mult"] == 1.0:
            continue
        f = t.loc[rows, "position"].map(lambda p: points_factor(p, mult, params))
        t.loc[rows, "mean"] = t.loc[rows, "mean"] * f
        for c in ("pass_yds", "rec_yds"):
            if c in t:
                t.loc[rows, c] = t.loc[rows, c] * mult["pass_yds_mult"]
        if "rush_att" in t:
            t.loc[rows, "rush_att"] = t.loc[rows, "rush_att"] * mult["rush_att_mult"]
        notes.append(f"weather {g}: wind {getattr(r, 'wind_mph', 0)} mph -> pass yds x{mult['pass_yds_mult']:.2f}")
    return t, notes
