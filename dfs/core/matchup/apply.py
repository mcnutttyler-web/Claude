"""Use the frozen offseason model in season: features update weekly, effect coefficients do not.

frozen_features   feature table for every 2026 player-game (+ optional upcoming rows) using the saved model's
                  archetype clusters, opportunity coefficients and config
slate_multipliers DK slate -> multiplier per row for the positions enabled in config/matchup.yaml
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from core.matchup import backtest as BT
from core.matchup import effect as E
from core.matchup.data import load

ROOT = Path(__file__).resolve().parents[2]
MODEL = ROOT / "data" / "matchup" / "model_{season}.json"


def frozen_features(m: E.EffectModel, pg: pd.DataFrame, dg: pd.DataFrame, games: pd.DataFrame | None,
                    aliases: dict, upcoming: pd.DataFrame | None = None) -> pd.DataFrame:
    """upcoming: rows (player_id, name, position, team, opp, season, week) for games not played yet."""
    pg = pg[pg["season"] <= m.season]
    if upcoming is not None and len(upcoming):
        up = upcoming.copy()
        up["game_id"] = "UPCOMING_" + up["season"].astype(str) + "_" + up["week"].astype(str) + "_" + up["team"]
        for c in pg.columns:
            if c not in up:
                up[c] = 0.0 if pg[c].dtype.kind in "fi" else np.nan
        up["snap_share"] = np.nan
        pg = pd.concat([pg, up[pg.columns]], ignore_index=True)
    train = [s for s in sorted(pg["season"].unique()) if s < m.season]
    ft, _ = E.feature_table(pg, dg[dg["season"] <= m.season], games, m.cfg, m.arche, m.opp_coef, train, aliases,
                            BT.coverage_off(dg), BT.oc_changes())
    ft["effect"] = E.predict(m, ft)
    ft["archetype"] = [m.arche.names[p][a] if a >= 0 and p in m.arche.names else "" for p, a in
                       zip(ft["position"], ft["arch"])]
    return ft


def slate_week(slate: pd.DataFrame, games: pd.DataFrame) -> tuple[int, int]:
    d0 = pd.Timestamp(min(x for x in slate["lock_time"] if x is not None and x == x))
    season = d0.year if d0.month >= 3 else d0.year - 1
    g = games[(games["season"] == season) & (games["game_type"] == "REG")]
    g = g[pd.to_datetime(g["gameday"]).dt.date <= (d0 + pd.Timedelta(days=1)).date()]
    return season, int(g["week"].max()) if len(g) else 1


def slate_multipliers(slate: pd.DataFrame, proj: pd.Series, sport, cfg: dict | None = None) -> tuple[pd.Series, list[str]]:
    """Multiplier per slate row (1.0 where not applied). Never raises: problems come back as notes."""
    from core.projections.bottomup import match_to_slate
    cfg = cfg or BT.load_config()
    notes: list[str] = []
    out = pd.Series(1.0, index=slate.index)
    on = [p for p, v in (cfg.get("positions") or {}).items() if v]
    if not cfg.get("enabled") or not on:
        return out, notes
    try:
        games = pd.read_csv(ROOT / "data" / "nflverse" / "games.csv")
        season, week = slate_week(slate, games)
        path = Path(str(MODEL).format(season=season))
        if not path.exists():
            return out, [f"matchup: no model for {season} ({path.name}); run scripts/matchup_backtest.py"]
        m = E.EffectModel.load(path)
        d = load(list(range(2016, season + 1)), sport.team_aliases, refresh={season})
        pg = d["player_games"]
        latest = pg.sort_values(["season", "week"]).groupby("player_id").tail(1)
        prof = latest.rename(columns={})[["player_id", "name", "position", "team"]]
        ids = match_to_slate(slate, prof, sport)
        up = []
        for i, pid in ids.items():
            if slate.at[i, "position"] in on:
                up.append({"player_id": pid, "name": slate.at[i, "name"], "position": slate.at[i, "position"],
                           "team": slate.at[i, "team"], "opp": slate.at[i, "opp"], "season": season, "week": week,
                           "slate_i": i})
        if not up:
            return out, ["matchup: no slate players matched"]
        up = pd.DataFrame(up)
        ft = frozen_features(m, pg, d["defense_games"], games, sport.team_aliases, up.drop(columns="slate_i"))
        f = ft[ft["game_id"].astype(str).str.startswith("UPCOMING_")].set_index("player_id")
        for r in up.itertuples():
            if r.player_id in f.index:
                eff = float(f.loc[r.player_id, "effect"]) if np.ndim(f.loc[r.player_id, "effect"]) == 0 else \
                    float(f.loc[r.player_id, "effect"].iloc[0])
                out[r.slate_i] = float(E.multiplier(eff, proj.get(r.slate_i, 0.0), m.cfg.cap, m.cfg.min_proj))
        notes.append(f"matchup (experimental): applied to {', '.join(on)}; mean |mult-1| "
                     f"{(out[out != 1.0] - 1).abs().mean() if (out != 1.0).any() else 0:.2%}")
    except Exception as e:  # never block publishing on the experimental layer
        notes.append(f"matchup: skipped ({e})")
        out[:] = 1.0
    return out, notes
