"""2026 live validation: model trained on 2016-2025, applied to each completed 2026 week; results appended to
docs/live_2026_results.md (one table row per week x position; existing weeks are left untouched)."""
from __future__ import annotations

import re
from datetime import date
from pathlib import Path

import pandas as pd

from core.matchup.backtest import POOL, metrics

ROOT = Path(__file__).resolve().parents[2]
DOC = ROOT / "docs" / "live_2026_results.md"
HEADER = """# Matchup layer — 2026 live results

The model was trained on 2016–2025 and is never refit during the season. Each completed 2026 week is projected
with only the data available before kickoff:
- **A:** the opportunity/Vegas projection.
- **B:** A × the matchup multiplier.

The scoring pool is the top 20 QB/TE and top 40 RB/WR by A, among players who played.

Lower MAE is better. Higher Spearman (ρ, rank correlation) is better. Δ = B − A, so a negative ΔMAE means B was
better.

One week is noise: 40 players, and most multipliers are within ±2%. Read the running total, not the single rows.

| week | pos | n | MAE A | MAE B | ΔMAE | ρ A | ρ B | Δρ | mean \\|mult−1\\| | added |
|---|---|---|---|---|---|---|---|---|---|---|
"""


def week_rows(p: pd.DataFrame, week: int) -> list[str]:
    out = []
    for pos in POOL:
        q = p[(p["week"] == week) & (p["position"] == pos)]
        if q.empty:
            continue
        a, b = metrics(q, "proj_A"), metrics(q, "proj_B")
        out.append(f"| 2026 wk{week} | {pos} | {len(q)} | {a['MAE']:.2f} | {b['MAE']:.2f} | {b['MAE'] - a['MAE']:+.3f} | "
                   f"{a['spearman']:.3f} | {b['spearman']:.3f} | {b['spearman'] - a['spearman']:+.3f} | "
                   f"{(q['mult_B'] - 1).abs().mean():.3%} | {date.today().isoformat()} |")
    return out


def update(p2026: pd.DataFrame, path: Path = DOC) -> list[int]:
    """Append weeks not yet in the doc; rewrite the running-total section. Returns the weeks added."""
    path.parent.mkdir(parents=True, exist_ok=True)
    text = path.read_text() if path.exists() else HEADER
    body = text.split("\n## Season to date")[0]
    have = {int(m) for m in re.findall(r"\| 2026 wk(\d+) \|", body)}
    added = []
    for w in sorted(p2026["week"].unique()):
        if int(w) not in have:
            body = body.rstrip("\n") + "\n" + "\n".join(week_rows(p2026, int(w))) + "\n"
            added.append(int(w))
    lines = ["", "## Season to date", "", "| pos | n | MAE A | MAE B | ΔMAE | ρ A | ρ B |", "|---|---|---|---|---|---|---|"]
    for pos in POOL:
        q = p2026[p2026["position"] == pos]
        if q.empty:
            continue
        a, b = metrics(q, "proj_A"), metrics(q, "proj_B")
        lines.append(f"| {pos} | {len(q)} | {a['MAE']:.2f} | {b['MAE']:.2f} | {b['MAE'] - a['MAE']:+.3f} | "
                     f"{a['spearman']:.3f} | {b['spearman']:.3f} |")
    path.write_text(body.rstrip("\n") + "\n" + "\n".join(lines) + "\n")
    return added
