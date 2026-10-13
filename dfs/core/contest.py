"""Contest definitions (contest.yaml / contest.csv) and break-even math."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
import yaml

CASH_TYPES = {"h2h", "5050", "double_up", "triple_up"}
CONTEST_TYPES = CASH_TYPES | {"gpp"}
ROOT = Path(__file__).resolve().parent.parent


@dataclass
class Contest:
    name: str
    type: str
    field_size: int
    entry_fee: float
    max_entries: int
    payouts: pd.DataFrame          # rank_from, rank_to, prize (per entry at that rank)
    sport: str = "nfl"
    mode: str = "classic"
    contest_id: str | None = None

    def __post_init__(self):
        if self.type not in CONTEST_TYPES:
            raise ValueError(f"contest type must be one of {sorted(CONTEST_TYPES)}")
        p = self.payouts.astype({"rank_from": int, "rank_to": int, "prize": float})
        if (p["rank_from"] > p["rank_to"]).any() or p["rank_to"].max() > self.field_size:
            raise ValueError(f"{self.name}: bad payout ranks")
        self.payouts = p.sort_values("rank_from").reset_index(drop=True)

    @property
    def is_cash(self) -> bool:
        return self.type in CASH_TYPES

    @property
    def prize_pool(self) -> float:
        p = self.payouts
        return float(((p["rank_to"] - p["rank_from"] + 1) * p["prize"]).sum())

    @property
    def rake(self) -> float:
        return 1.0 - self.prize_pool / (self.entry_fee * self.field_size)

    @property
    def paid_places(self) -> int:
        return int(self.payouts["rank_to"].max())

    def payout_vector(self) -> np.ndarray:
        """prize by rank (index 0 = 1st place), length field_size."""
        v = np.zeros(self.field_size, dtype=float)
        for r in self.payouts.itertuples():
            v[r.rank_from - 1: r.rank_to] = r.prize
        return v

    @property
    def payout_multiple(self) -> float:
        """For flat cash contests: prize / fee for a cashing entry."""
        return float(self.payouts["prize"].min() / self.entry_fee)

    @property
    def cash_rate_needed(self) -> float:
        """Break-even win/cash rate, net of rake (flat-payout contests)."""
        return 1.0 / self.payout_multiple

    @property
    def cash_line_percentile(self) -> float:
        """Fraction of the field that cashes (the line sits at 1 - this from the bottom)."""
        return self.paid_places / self.field_size

    def summary(self) -> dict:
        d = {"name": self.name, "type": self.type, "field_size": self.field_size, "entry_fee": self.entry_fee,
             "max_entries": self.max_entries, "prize_pool": round(self.prize_pool, 2),
             "rake": round(self.rake, 4), "paid_places": self.paid_places}
        if self.is_cash:
            d["payout_multiple"] = round(self.payout_multiple, 3)
            d["break_even_rate"] = round(self.cash_rate_needed, 4)
        return d


def _read_payouts(spec, base: Path) -> pd.DataFrame:
    if isinstance(spec, (list, tuple)):
        return pd.DataFrame(spec, columns=["rank_from", "rank_to", "prize"])
    p = Path(spec)
    if not p.is_absolute():
        p = (base / p) if (base / p).exists() else ROOT / p
    return pd.read_csv(p)


def load_contest(path: str | Path) -> Contest:
    path = Path(path)
    if path.suffix in (".yaml", ".yml"):
        with open(path) as f:
            d = yaml.safe_load(f)
        payouts = _read_payouts(d.pop("payouts"), path.parent)
        return Contest(payouts=payouts, **{k: d[k] for k in d if k in Contest.__dataclass_fields__})
    # contest.csv: one row of header fields + payout rows. Format:
    #   key,value rows until a blank line, then rank_from,rank_to,prize
    text = path.read_text().strip().split("\n\n", 1)
    meta = dict(line.split(",", 1) for line in text[0].splitlines() if "," in line)
    payouts = pd.read_csv(pd.io.common.StringIO(text[1]))
    return Contest(
        name=meta["name"], type=meta["type"], field_size=int(meta["field_size"]),
        entry_fee=float(meta["entry_fee"]), max_entries=int(meta["max_entries"]), payouts=payouts,
        sport=meta.get("sport", "nfl"), mode=meta.get("mode", "classic"), contest_id=meta.get("contest_id"),
    )


def break_even_table() -> pd.DataFrame:
    rows = [("H2H / 50-50", 1.8), ("Double-up", 2.0), ("Triple-up", 3.0), ("5x", 5.0)]
    return pd.DataFrame([{"contest": n, "payout_multiple": m, "break_even_rate": round(1 / m, 4)} for n, m in rows])


def template_paths() -> list[Path]:
    return sorted((ROOT / "config" / "contests").glob("*.yaml"))
