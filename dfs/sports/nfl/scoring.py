"""DK NFL scoring. Point values come from config.yaml so they can be re-verified without code edits."""
from __future__ import annotations


def dst_points_allowed(points_allowed: float, tiers: list) -> float:
    for max_pa, pts in tiers:
        if max_pa is None or points_allowed <= max_pa:
            return float(pts)
    return float(tiers[-1][1])


def score(stat_line: dict[str, float], cfg: dict) -> float:
    s = {k: float(v) for k, v in stat_line.items() if v is not None}
    total = 0.0
    for stat, pts in cfg.get("offense", {}).items():
        total += s.get(stat, 0.0) * pts
    for stat, (threshold, pts) in cfg.get("bonuses", {}).items():
        if s.get(stat, 0.0) >= threshold:
            total += pts
    for stat, pts in cfg.get("dst", {}).items():
        total += s.get(stat, 0.0) * pts
    if "pts_allowed" in s:
        total += dst_points_allowed(s["pts_allowed"], cfg["dst_points_allowed"])
    for stat, pts in cfg.get("kicker", {}).items():
        total += s.get(stat, 0.0) * pts
    return round(total, 2)
