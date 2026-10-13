"""Write the shipped contest templates into config/payouts and config/contests.

Payout structures are illustrative templates (default — calibrate), not copies of any real contest.
Replace them with the real payout table of the contest you enter.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
import yaml

ROOT = Path(__file__).resolve().parent.parent
PAY = ROOT / "config" / "payouts"
CON = ROOT / "config" / "contests"


def flat(field: int, paid: int, prize: float) -> pd.DataFrame:
    return pd.DataFrame([{"rank_from": 1, "rank_to": paid, "prize": prize}])


def gpp_curve(field: int, fee: float, rake: float, paid_frac: float, top_share: float,
              min_mult: float) -> pd.DataFrame:
    pool = round(field * fee * (1 - rake), 2)
    paid = int(field * paid_frac)
    min_prize = min_mult * fee
    first = round(pool * top_share, 0)
    r = np.arange(2, paid + 1, dtype=float)
    # Power-law decay from rank 2 to min prize; solve the exponent so the total matches.
    rest = pool - first
    lo, hi = 0.1, 3.0
    for _ in range(100):
        b = (lo + hi) / 2
        shape = r ** (-b)
        shape = (shape - shape[-1]) / (shape[0] - shape[-1])
        top2 = first * 0.5
        prizes = min_prize + (top2 - min_prize) * shape
        if prizes.sum() > rest:
            lo = b
        else:
            hi = b
    prizes = np.maximum(np.round(prizes / 5) * 5 if fee >= 5 else np.round(prizes, 2), min_prize)
    # Collapse equal prizes into rank bands.
    rows = [{"rank_from": 1, "rank_to": 1, "prize": first}]
    start = 2
    for k in range(1, len(prizes) + 1):
        if k == len(prizes) or prizes[k] != prizes[k - 1]:
            rows.append({"rank_from": start, "rank_to": k + 1, "prize": float(prizes[k - 1])})
            start = k + 2
    df = pd.DataFrame(rows)
    total = ((df.rank_to - df.rank_from + 1) * df.prize).sum()
    df.loc[0, "prize"] += round(pool - total, 2)   # absorb rounding into 1st place
    return df


def main() -> None:
    PAY.mkdir(parents=True, exist_ok=True)
    CON.mkdir(parents=True, exist_ok=True)
    templates = [
        ("h2h", "H2H $10", "h2h", 2, 10.0, 1, flat(2, 1, 18.0)),
        ("5050", "50/50 $10 (100)", "5050", 100, 10.0, 1, flat(100, 50, 18.0)),
        ("double_up", "Double-Up $10 (230)", "double_up", 230, 10.0, 1, flat(230, 100, 20.0)),
        ("triple_up", "Triple-Up $10 (100)", "triple_up", 100, 10.0, 1, flat(100, 30, 30.0)),
        ("gpp_20max", "20-max mid-field GPP $20 (11,890)", "gpp", 11890, 20.0, 20,
         gpp_curve(11890, 20.0, 0.15, 0.22, 0.10, 1.5)),
        ("gpp_milly", "150-max Milly-style GPP $20 (196,078)", "gpp", 196078, 20.0, 150,
         gpp_curve(196078, 20.0, 0.15, 0.22, 0.30, 1.5)),
    ]
    for key, name, typ, field, fee, max_e, pay in templates:
        pay.to_csv(PAY / f"{key}.csv", index=False)
        doc = {"name": name, "type": typ, "field_size": field, "entry_fee": fee, "max_entries": max_e,
               "sport": "nfl", "mode": "classic", "payouts": f"config/payouts/{key}.csv"}
        with open(CON / f"{key}.yaml", "w") as f:
            f.write("# Template — default — calibrate. Replace payouts with your contest's real table.\n")
            yaml.safe_dump(doc, f, sort_keys=False)
        pool = ((pay.rank_to - pay.rank_from + 1) * pay.prize).sum()
        print(f"{key:10s} field={field:>7} pool={pool:>12,.2f} rake={1 - pool / (field * fee):.3f} bands={len(pay)}")


if __name__ == "__main__":
    main()
