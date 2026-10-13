"""DK NBA scoring (Phase 6 stub — verify values)."""
from __future__ import annotations


def score(stat_line: dict[str, float], cfg: dict) -> float:
    s = {k: float(v) for k, v in stat_line.items() if v is not None}
    total = sum(s.get(k, 0.0) * v for k, v in cfg["stats"].items())
    tens = sum(1 for c in cfg["dd_categories"] if s.get(c, 0.0) >= 10)
    if tens >= 3:
        total += cfg["triple_double"] + cfg["double_double"]  # DK awards both; verify
    elif tens >= 2:
        total += cfg["double_double"]
    return round(total, 2)
