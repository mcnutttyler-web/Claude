"""Write data/backtest.csv (season, week, pos, proj, actual) from the cached walk-forward baseline runs
(scripts/matchup_baseline.py, 2019-2026) — the largest walk-forward sample of the own model.

Pool: top-20 QB/TE and top-40 RB/WR each week BY PROJECTION (pre-game), among players who played.
    python scripts/export_backtest.py [--out data/backtest.csv]
"""
import argparse
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

from backtest_own_model import pool_frame  # noqa: E402

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "data" / "backtest.csv"))
    a = ap.parse_args()
    files = sorted((ROOT / "data" / "matchup" / "baseline").glob("baseline_*.parquet"))
    if not files:
        raise SystemExit("no baseline runs found — run: python scripts/matchup_baseline.py --seasons 2019-2026")
    df = pd.concat([pd.read_parquet(f) for f in files], ignore_index=True)
    p = pool_frame(df)
    p.to_csv(a.out, index=False)
    print(f"wrote {a.out}: {len(p)} player-weeks, seasons {p['season'].min()}-{p['season'].max()}, "
          f"pool chosen pre-game by projection")
