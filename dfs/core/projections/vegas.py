"""Game lines -> consensus spread/total -> implied team totals.

Odds CSV (manual export or cached API pull), one row per book per game:
    book, away, home, spread_home, total[, timestamp]
spread_home is the HOME team's line (negative when home is favored).

implied_total(team) = total/2 - spread_team/2, where spread_team is the team's own line.
So for a 48 total with the home team -6: home 27, away 21. The two always sum to the total.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from core.names import normalize_team


def implied_totals(total: float, spread_home: float) -> tuple[float, float]:
    """(away_implied, home_implied)."""
    home = total / 2 - spread_home / 2
    away = total / 2 + spread_home / 2
    return away, home


def read_odds(path_or_buf, team_aliases: dict[str, str] | None = None) -> pd.DataFrame:
    df = pd.read_csv(path_or_buf)
    df.columns = [c.strip().lower() for c in df.columns]
    need = {"book", "away", "home", "spread_home", "total"}
    if not need <= set(df.columns):
        raise ValueError(f"odds CSV needs columns {sorted(need)}; got {list(df.columns)}")
    al = team_aliases or {}
    df["away"] = df["away"].map(lambda t: normalize_team(t, al))
    df["home"] = df["home"].map(lambda t: normalize_team(t, al))
    df["book"] = df["book"].astype(str).str.strip().str.lower()
    df["spread_home"] = pd.to_numeric(df["spread_home"], errors="coerce")
    df["total"] = pd.to_numeric(df["total"], errors="coerce")
    if "timestamp" in df.columns:
        df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce", utc=True)
    return df.dropna(subset=["spread_home", "total"])


def consensus_lines(odds: pd.DataFrame, book_weights: dict[str, float]) -> pd.DataFrame:
    """Latest line per (game, book), then a book-weighted mean of spread and total per game."""
    o = odds.copy()
    if "timestamp" in o.columns:
        o = o.sort_values("timestamp").groupby(["away", "home", "book"], as_index=False).tail(1)
    default = float(book_weights.get("default", 1.0))
    o["w"] = o["book"].map(lambda b: float(book_weights.get(b, default)))
    rows = []
    for (away, home), g in o.groupby(["away", "home"], sort=False):
        w = g["w"].to_numpy()
        spread = float(np.average(g["spread_home"], weights=w))
        total = float(np.average(g["total"], weights=w))
        a, h = implied_totals(total, spread)
        rows.append({"away": away, "home": home, "game_id": f"{away}@{home}", "spread_home": round(spread, 3),
                     "total": round(total, 3), "implied_away": round(a, 3), "implied_home": round(h, 3),
                     "n_books": len(g), "books": ",".join(sorted(g["book"]))})
    return pd.DataFrame(rows)


def team_environment(lines: pd.DataFrame) -> pd.DataFrame:
    """One row per team: team, opp, game_id, spread (team's own line), game_total, team_total."""
    rows = []
    for r in lines.itertuples():
        rows.append({"team": r.home, "opp": r.away, "game_id": r.game_id, "spread": r.spread_home,
                     "game_total": r.total, "team_total": r.implied_home})
        rows.append({"team": r.away, "opp": r.home, "game_id": r.game_id, "spread": -r.spread_home,
                     "game_total": r.total, "team_total": r.implied_away})
    return pd.DataFrame(rows)
