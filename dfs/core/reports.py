"""Reports: flashback (Section 7.3) and the optional bankroll panel (Section 10).

Flashback: after a slate, take the DK standings export (the REAL field), re-simulate the slate from the
pre-slate projections, and score each lineup against that real field. Sim ROI of your lineups is the model's
pre-slate view of how good they were relative to what the field actually played. Across the whole field the
average sim ROI equals -rake by construction (prizes are conserved), so a typical break-even is about -10% to
-16%; your lineups should sit above that if the edge is real. Actual finishes are shown alongside.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from core.cash_sim import lineup_scores
from core.contest import Contest
from core.field import FieldSample
from core.payouts import FieldDistribution, settle_exact, standalone
from core.standings import Standings, lineups_from_standings


def flashback(st: Standings, slate: pd.DataFrame, sims: np.ndarray, contest: Contest, spec,
              my_entry_ids: list[str] | None = None, max_field: int = 20000, seed: int = 0,
              exact_if_at_most: int = 2000) -> dict:
    lus = lineups_from_standings(st, slate, spec)
    ok = [k for k, lu in enumerate(lus) if lu is not None]
    if not ok:
        raise ValueError("no standings lineups could be mapped to the slate")
    rng = np.random.default_rng(seed)
    field_lus = [lus[k] for k in ok]
    N = contest.field_size
    fee = contest.entry_fee
    S = lineup_scores(field_lus, sims, spec)                          # (n_sims, n_field_parsed)
    if len(field_lus) <= exact_if_at_most:
        win = settle_exact(S.astype(np.float64), contest.payout_vector()[: len(field_lus)]
                           if len(field_lus) < N else contest.payout_vector())
        sim_roi = win.mean(0) / fee - 1
        method = "exact"
    else:
        pick = rng.choice(len(field_lus), size=min(max_field, len(field_lus)), replace=False)
        fd = FieldDistribution(S[:, pick], np.ones(len(pick)))
        win = standalone(S, fd, N - 1, contest.payout_vector())
        sim_roi = win.mean(0) / fee - 1
        method = "vs sampled field"
    tbl = st.entries.iloc[ok].copy()
    tbl["sim_roi"] = np.round(sim_roi, 4)
    tbl["sim_cash%"] = np.round((win > 0).mean(0), 4)
    mine = tbl[tbl["entry_id"].isin([str(x) for x in (my_entry_ids or [])])]
    pool_frac = contest.prize_pool / (fee * N)
    return {"method": method, "n_field_parsed": len(field_lus), "n_unparsed": len(lus) - len(field_lus),
            "field_mean_sim_roi": round(float(sim_roi.mean()), 4), "rake_breakeven": round(pool_frac - 1, 4),
            "mine": mine.sort_values("rank"), "table": tbl.sort_values("sim_roi", ascending=False)}


def bankroll_warnings(bankroll: float, slate_fees: float, largest_gpp_fee_total: float) -> list[str]:
    """Heuristic only: warn above 10% of bankroll per slate or above 2% in one large-field GPP."""
    out = []
    if bankroll > 0 and slate_fees > 0.10 * bankroll:
        out.append(f"Slate entry fees ${slate_fees:,.0f} exceed 10% of bankroll (${0.10 * bankroll:,.0f}).")
    if bankroll > 0 and largest_gpp_fee_total > 0.02 * bankroll:
        out.append(f"One large-field GPP uses ${largest_gpp_fee_total:,.0f} (> 2% of bankroll).")
    return out
