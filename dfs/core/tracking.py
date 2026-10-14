"""Results tracking (Section 6.5 and 10). Flat CSV files in data/tracking — no database in v1.

entries_log.csv : one row per entry you played, logged at build time with the model's prediction
    logged_at, slate, entry_id, contest_id, contest_name, contest_type, entry_fee, payout_multiple, lineup_ids,
    pred_p_win (cash), pred_exp_payout (gpp), pred_median
settled after the slate from DK's contest-history export (My Contests -> Download):
    Entry_Key, Contest_Key, Place, Points, Winnings_Non_Ticket, Winnings_Ticket, Entry_Fee, Contest_Entries ...
Reports: reliability (predicted vs realized cash rate by bin), cumulative ROI vs break-even, and the
overconfidence flag: realized - predicted < -5 pp over >= 50 settled cash entries.
"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
LOG = ROOT / "data" / "tracking" / "entries_log.csv"
COLS = ["logged_at", "slate", "entry_id", "contest_id", "contest_name", "contest_type", "entry_fee",
        "payout_multiple", "lineup_ids", "pred_p_win", "pred_exp_payout", "pred_median",
        "points", "place", "winnings", "cashed", "settled"]


def load_log(path: Path = LOG) -> pd.DataFrame:
    if Path(path).exists():
        df = pd.read_csv(path, dtype={"entry_id": str, "contest_id": str, "lineup_ids": str})
        for c in COLS:
            if c not in df:
                df[c] = np.nan
        return df[COLS]
    return pd.DataFrame(columns=COLS)


def save_log(df: pd.DataFrame, path: Path = LOG) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    df[COLS].to_csv(path, index=False)


def log_entries(rows: list[dict], path: Path = LOG) -> pd.DataFrame:
    """Append predictions. Each row needs entry_id (or a placeholder), contest_type, entry_fee and a prediction.
    Re-logging an entry_id replaces its unsettled row."""
    df = load_log(path)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    new = pd.DataFrame([{**{c: np.nan for c in COLS}, "logged_at": now, "settled": False, **r} for r in rows])
    new["entry_id"] = new["entry_id"].astype(str)
    keep = df[~(df["entry_id"].astype(str).isin(new["entry_id"]) & ~_settled(df))]
    out = pd.concat([keep, new[COLS]], ignore_index=True)
    save_log(out, path)
    return out


def read_contest_history(path_or_buf) -> pd.DataFrame:
    """DK contest-history export -> entry_id, place, points, winnings, entry_fee, contest_entries."""
    h = pd.read_csv(path_or_buf, dtype=str)
    h.columns = [c.strip() for c in h.columns]

    def money(s):
        return pd.to_numeric(s.astype(str).str.replace(r"[$,]", "", regex=True), errors="coerce").fillna(0.0)

    out = pd.DataFrame({
        "entry_id": h["Entry_Key"].astype(str).str.strip(),
        "contest_id": h.get("Contest_Key", pd.Series("", index=h.index)).astype(str),
        "place": pd.to_numeric(h.get("Place"), errors="coerce"),
        "points": pd.to_numeric(h.get("Points"), errors="coerce"),
        "winnings": money(h.get("Winnings_Non_Ticket", pd.Series("0", index=h.index)))
        + money(h.get("Winnings_Ticket", pd.Series("0", index=h.index))),
        "entry_fee_hist": money(h.get("Entry_Fee", pd.Series("0", index=h.index))),
    })
    return out


def settle(history: pd.DataFrame, path: Path = LOG) -> tuple[pd.DataFrame, int]:
    """Attach actual results to logged entries by Entry ID. Returns (log, n newly settled)."""
    df = load_log(path)
    for c in ("points", "place", "winnings", "cashed", "settled"):
        df[c] = df[c].astype(object)
    h = history.set_index("entry_id")
    n = 0
    for k, r in df.iterrows():
        eid = str(r["entry_id"])
        done = r["settled"]
        done = str(done).lower() == "true" if not isinstance(done, bool) else done
        if eid in h.index and not done:
            hr = h.loc[eid]
            if isinstance(hr, pd.DataFrame):
                hr = hr.iloc[0]
            df.at[k, "points"] = hr["points"]
            df.at[k, "place"] = hr["place"]
            df.at[k, "winnings"] = hr["winnings"]
            df.at[k, "cashed"] = bool(hr["winnings"] > 0)
            df.at[k, "settled"] = True
            n += 1
    save_log(df, path)
    return df, n


def _settled(df: pd.DataFrame) -> pd.Series:
    return df["settled"].astype(str).str.lower() == "true"


def reliability(df: pd.DataFrame, bins=(0, .3, .4, .5, .55, .6, .65, .7, .8, 1.0)) -> pd.DataFrame:
    """Predicted vs realized cash rate for settled cash entries."""
    c = df[_settled(df) & df["pred_p_win"].notna()].copy()
    if c.empty:
        return pd.DataFrame(columns=["bin", "n", "predicted", "realized"])
    c["bin"] = pd.cut(c["pred_p_win"].astype(float), bins, include_lowest=True)
    g = c.groupby("bin", observed=True).agg(n=("pred_p_win", "size"), predicted=("pred_p_win", "mean"),
                                            realized=("cashed", lambda x: (x.astype(str).str.lower() == "true").mean()))
    return g.reset_index().round(4)


def cumulative_roi(df: pd.DataFrame) -> pd.DataFrame:
    s = df[_settled(df)].copy()
    if s.empty:
        return pd.DataFrame(columns=["n", "fees", "winnings", "profit", "roi", "breakeven_roi"])
    s = s.sort_values("logged_at")
    s["fees"] = s["entry_fee"].astype(float).cumsum()
    s["won"] = s["winnings"].astype(float).cumsum()
    out = pd.DataFrame({"n": np.arange(1, len(s) + 1), "fees": s["fees"].to_numpy(), "winnings": s["won"].to_numpy()})
    out["profit"] = out["winnings"] - out["fees"]
    out["roi"] = out["profit"] / out["fees"]
    out["breakeven_roi"] = 0.0
    return out.round(4)


def overconfidence(df: pd.DataFrame, min_n: int = 50, threshold: float = -0.05) -> dict:
    """Flag the cash model as overconfident if realized - predicted < -5 pp over >= 50 settled cash entries."""
    c = df[_settled(df) & df["pred_p_win"].notna()]
    n = len(c)
    if n == 0:
        return {"n": 0, "predicted": None, "realized": None, "gap": None, "overconfident": False,
                "enough_data": False}
    pred = float(c["pred_p_win"].astype(float).mean())
    real = float((c["cashed"].astype(str).str.lower() == "true").mean())
    gap = real - pred
    return {"n": n, "predicted": round(pred, 4), "realized": round(real, 4), "gap": round(gap, 4),
            "overconfident": bool(n >= min_n and gap < threshold), "enough_data": n >= min_n}
