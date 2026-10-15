"""DraftKings NFL scoring: stat line -> DK fantasy points. Point values come from config/dk_nfl_scoring.yaml."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Mapping

import yaml

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SCORING = ROOT / "config" / "dk_nfl_scoring.yaml"


@lru_cache(maxsize=8)
def _load(path: str) -> dict:
    with open(path) as f:
        return yaml.safe_load(f)


def load_scoring(path: str | Path | None = None) -> dict:
    return _load(str(path or DEFAULT_SCORING))


def known_stats(scoring: dict) -> set[str]:
    return set(scoring["offense"]) | set(scoring["dst"]) | {"pts_allowed"}


def points_allowed_score(points_allowed: float, tiers: list) -> float:
    for max_pa, pts in tiers:
        if max_pa is None or points_allowed <= max_pa:
            return float(pts)
    return float(tiers[-1][1])


def score_breakdown(stats: Mapping[str, float], scoring: dict | None = None) -> dict[str, float]:
    """Points by component. Missing stats count as 0; unknown stat names raise (catches typos like 'rec_yd')."""
    cfg = scoring or load_scoring()
    s = {k: float(v) for k, v in stats.items() if v is not None and v == v}
    unknown = set(s) - known_stats(cfg)
    if unknown:
        raise ValueError(f"unknown stat(s) {sorted(unknown)}; expected a subset of {sorted(known_stats(cfg))}")
    out: dict[str, float] = {}
    for stat, pts in {**cfg["offense"], **cfg["dst"]}.items():
        if s.get(stat):
            out[stat] = s[stat] * pts
    for stat, (threshold, pts) in cfg["bonuses"].items():
        if s.get(stat, 0.0) >= threshold:
            out[f"{stat}_bonus"] = float(pts)
    if "pts_allowed" in s:
        out["pts_allowed"] = points_allowed_score(s["pts_allowed"], cfg["dst_points_allowed"])
    return out


def score_stat_line(stats: Mapping[str, float], scoring: dict | None = None) -> float:
    """DK points for one player-game (offense) or one team-game (DST: pass pts_allowed plus the dst events).

    Rounded to 2 decimals, as DK displays. Yardage bonuses are inclusive: exactly 300 passing yards earns +3.
    """
    return round(sum(score_breakdown(stats, scoring).values()), 2)
