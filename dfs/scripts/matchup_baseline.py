"""Baseline A for the matchup backtest: the own opportunity/Vegas model (core/projections/bottomup.py), walk-forward,
one file per season under data/matchup/baseline/ (resumable).

    python scripts/matchup_baseline.py --seasons 2019-2026
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from backtest_own_model import week_frame  # noqa: E402
from core.projections import nflverse  # noqa: E402
from core.projections.params import Params  # noqa: E402
from sports.base import load_sport  # noqa: E402

OUT = Path(__file__).resolve().parents[1] / "data" / "matchup" / "baseline"


def run(seasons: list[int], force_current: bool = False, log=print) -> pd.DataFrame:
    OUT.mkdir(parents=True, exist_ok=True)
    sport, params = load_sport("nfl"), Params()
    games = pd.read_csv(nflverse.DEFAULT_DIR / "games.csv")
    frames = []
    for s in seasons:
        p = OUT / f"baseline_{s}.parquet"
        done = pd.read_parquet(p) if p.exists() else pd.DataFrame(columns=["week"])
        weeks = sorted(games.loc[(games["season"] == s) & (games["game_type"] == "REG") & games["home_score"].notna(),
                                 "week"].unique())
        todo = [w for w in weeks if w not in set(done["week"]) or (force_current and w == max(weeks))]
        cache, new = {}, []
        for w in todo:
            f = week_frame(s, int(w), games, sport, params, cache)
            if f is not None:
                new.append(f)
                log(f"baseline {s} wk{w}: {len(f)} players")
        if new:
            done = done[~done["week"].isin([f["week"].iloc[0] for f in new])] if len(done) else done
            done = pd.concat([done] + new, ignore_index=True) if len(done) else pd.concat(new, ignore_index=True)
            done.to_parquet(p, index=False)
        frames.append(done)
    return pd.concat(frames, ignore_index=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--seasons", default="2019-2026")
    a = ap.parse_args()
    lo, hi = (int(x) for x in a.seasons.split("-"))
    run(list(range(lo, hi + 1)))
