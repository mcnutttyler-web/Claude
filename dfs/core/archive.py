"""Weekly archive: data/archive/<season>/w<NN>/ with standard names (from the user's archive_week.py).

  dk_salaries.csv       DK salary export for the slate
  dff.csv               the free consensus used (DailyFantasyFuel) — your own consensus archive for later blend fits
  source_<name>.csv     any other projection source used that week (e.g. OWS)
  my_projections.csv    pre-lock pool: name, pos, salary, proj (final calibrated), team_total, own_heuristic
                        (+ prev_salary, filled from last week's archived dk_salaries.csv when present)
  standings_<name>.csv  DK contest standings exports (small-field / single-entry), added after the slate
Sources can be paths or raw bytes (the Streamlit uploader).
"""
from __future__ import annotations

import io
import os
import shutil
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ROOT = ROOT / "data" / "archive"


def week_dir(season: int, week: int, root: str | Path = DEFAULT_ROOT) -> Path:
    return Path(root) / str(season) / f"w{week:02d}"


def _put(src, dest: Path) -> None:
    if isinstance(src, (bytes, bytearray)):
        dest.write_bytes(src)
    else:
        shutil.copy2(src, dest)


def _prev_salaries(season: int, week: int, root: Path) -> pd.DataFrame | None:
    p = week_dir(season, week - 1, root) / "dk_salaries.csv" if week > 1 else None
    if p is None or not p.exists():
        return None
    s = pd.read_csv(p)
    return s.rename(columns={"Name": "name", "Salary": "prev_salary"})[["name", "prev_salary"]].drop_duplicates("name")


def archive(season: int, week: int, root: str | Path = DEFAULT_ROOT, salaries=None, dff=None, pool=None,
            standings: list | dict | None = None, log=print, sources: dict | None = None,
            stamp: str | None = None) -> Path:
    """Copy this week's files into the archive. standings: list of paths, or {filename: bytes}.
    Projection inputs (dff, sources, pool) are ALSO kept as time-stamped snapshots under snapshots/<stamp>/, so a
    Saturday build and the Sunday-final rebuild can be compared later (review: 'CLV-like' check)."""
    from datetime import datetime
    dest = week_dir(season, week, root)
    dest.mkdir(parents=True, exist_ok=True)
    stamp = stamp or datetime.now().strftime("%Y%m%d-%H%M")
    snap = dest / "snapshots" / stamp
    if dff is not None or sources or pool is not None:
        snap.mkdir(parents=True, exist_ok=True)
    for name, src in (("dk_salaries.csv", salaries), ("dff.csv", dff)):
        if src is not None:
            _put(src, dest / name)
            log(f"  -> {dest / name}")
            if name == "dff.csv":
                _put(src, snap / name)
    for name, src in (sources or {}).items():
        _put(src, dest / f"source_{name}.csv")
        _put(src, snap / f"source_{name}.csv")
        log(f"  -> {dest / f'source_{name}.csv'}")
    if pool is not None:
        df = pd.read_csv(io.BytesIO(pool)) if isinstance(pool, (bytes, bytearray)) else pd.read_csv(pool)
        prev = _prev_salaries(season, week, Path(root))
        if prev is not None and "prev_salary" not in df:
            df = df.merge(prev, on="name", how="left")
        df.to_csv(dest / "my_projections.csv", index=False)
        df.to_csv(snap / "my_projections.csv", index=False)
        log(f"  -> {dest / 'my_projections.csv'}" + (" (prev_salary from last week)" if prev is not None else ""))
    items = standings.items() if isinstance(standings, dict) else [(os.path.basename(str(p)), p) for p in standings or []]
    for fname, src in items:
        base = os.path.splitext(os.path.basename(fname))[0]
        if base.startswith("standings_"):
            base = base[len("standings_"):]
        _put(src, dest / f"standings_{base}.csv")
        log(f"  -> {dest / f'standings_{base}.csv'}")
    return dest


def main(argv=None):
    import argparse
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("season", type=int)
    ap.add_argument("week", type=int)
    ap.add_argument("--root", default=str(DEFAULT_ROOT))
    ap.add_argument("--salaries")
    ap.add_argument("--dff")
    ap.add_argument("--pool")
    ap.add_argument("--standings", nargs="*", default=[])
    a = ap.parse_args(argv)
    archive(a.season, a.week, a.root, a.salaries, a.dff, a.pool, a.standings)


if __name__ == "__main__":
    main()
