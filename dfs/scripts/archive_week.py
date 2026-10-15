"""CLI wrapper — the code lives in core/archive.py.

  python scripts/archive_week.py 2026 6 --salaries DKSalaries.csv --dff dff.csv --pool my_projections.csv
  python scripts/archive_week.py 2026 6 --standings contest-standings-123.csv
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.archive import main  # noqa: E402

if __name__ == "__main__":
    main()
