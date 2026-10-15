"""Weekly scorecard (see core/scorecard.py). Run Tuesday evening after nflverse updates:

    python scripts/weekly_scorecard.py 2026 6
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.projections import nflverse  # noqa: E402
from core.scorecard import write  # noqa: E402
from sports.base import load_sport  # noqa: E402

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("season", type=int)
    ap.add_argument("week", type=int)
    a = ap.parse_args()
    nflverse.fetch([a.season], dest=nflverse.DEFAULT_DIR, log=print)
    out = write(a.season, a.week, load_sport("nfl").team_aliases)
    print(out.read_text())
    print(f"saved {out}")
