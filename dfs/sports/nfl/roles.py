"""NFL role labels (QB, RB1, RB2, WR1..WR3, TE1, DST, K).

Rank players within team+position by median unless the user supplied depth_role.
Correlation lookups use these labels.
"""
from __future__ import annotations

import pandas as pd

RANKED = {"RB": 2, "WR": 3, "TE": 1, "QB": 1}


def roles(df: pd.DataFrame) -> pd.Series:
    out = pd.Series(index=df.index, dtype=object)
    med = df["median"] if "median" in df.columns else pd.Series(0.0, index=df.index)
    for (team, pos), grp in df.groupby(["team", "position"], sort=False):
        order = med.loc[grp.index].sort_values(ascending=False, kind="stable").index
        for rank, idx in enumerate(order, start=1):
            if pos in ("DST", "K"):
                out[idx] = pos
            elif pos == "QB":
                out[idx] = "QB" if rank == 1 else f"QB{rank}"
            else:
                cap = RANKED.get(pos, 1)
                out[idx] = f"{pos}{min(rank, cap + 1)}" if rank <= cap else f"{pos}{cap + 1}"
    if "depth_role" in df.columns:
        user = df["depth_role"].astype("string").str.strip().str.upper()
        mask = user.notna() & (user != "")
        out[mask] = user[mask]
    return out.astype(str)
