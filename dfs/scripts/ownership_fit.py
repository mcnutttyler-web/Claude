"""CLI wrapper — the code lives in core/projections/ownership_fit.py (see its docstring for usage)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.projections.ownership_fit import main  # noqa: E402

if __name__ == "__main__":
    main()
