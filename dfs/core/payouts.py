"""Contest settlement (Section 5.4).

settle_exact: rank every explicit entry in every sim; tied entries split the combined prizes of the ranks they
              occupy; total paid per sim == prize pool (when entries >= paid places). Own entries compete.
vs_field:     large contests — the field is a weighted pool of M lineups standing in for n_field entrants.
              An entry's rank is 1 + n_field * P_w(field > x) + (# own entries above); ties with field duplicates
              (n_field * P_w(field == x)) and own entries split prizes via a fractional-rank payout curve.
"""
from __future__ import annotations

import numpy as np


class PayoutCurve:
    """C(r) = total prize paid to ranks 1..r, linear between integers (fractional expected ranks)."""

    def __init__(self, payout_vector: np.ndarray):
        self.p = np.asarray(payout_vector, dtype=float)
        self.cum = np.r_[0.0, np.cumsum(self.p)]
        self.n = len(self.p)

    def C(self, r: np.ndarray) -> np.ndarray:
        r = np.clip(np.asarray(r, dtype=float), 0, self.n)
        lo = np.floor(r).astype(int)
        frac = r - lo
        nxt = np.where(lo < self.n, self.p[np.clip(lo, 0, self.n - 1)], 0.0)
        return self.cum[lo] + frac * nxt

    def avg(self, above: np.ndarray, ties: np.ndarray) -> np.ndarray:
        """Average prize for an entry with `above` entries strictly ahead and `ties` entries (incl. itself)
        sharing its score: ranks above+1 .. above+ties split evenly."""
        t = np.maximum(ties, 1.0)
        return (self.C(above + t) - self.C(above)) / t


def settle_exact(scores: np.ndarray, payout_vector: np.ndarray) -> np.ndarray:
    """scores: (n_sims, n_entries) -> winnings (n_sims, n_entries) with exact tie splitting."""
    S, N = scores.shape
    pv = np.zeros(N)
    k = min(N, len(payout_vector))
    pv[:k] = payout_vector[:k]
    curve = PayoutCurve(pv)
    out = np.empty_like(scores, dtype=float)
    for s in range(S):
        x = scores[s]
        order = np.sort(x)[::-1]
        above = np.searchsorted(-order, -x, side="left")          # count strictly greater
        ties = np.searchsorted(-order, -x, side="right") - above   # count equal (incl. self)
        out[s] = curve.avg(above, ties)
    return out


class FieldDistribution:
    """Per-sim sorted field scores with cumulative weights, for fast P_w(field > x) / P_w(field == x)."""

    def __init__(self, field_scores: np.ndarray, weights: np.ndarray, decimals: int = 2):
        w = np.asarray(weights, dtype=float)
        w = w / w.sum()
        fs = np.round(np.asarray(field_scores, dtype=np.float64), decimals)
        order = np.argsort(-fs, axis=1, kind="stable")
        self.sorted_neg = -np.take_along_axis(fs, order, axis=1)           # ascending of -score
        self.cumw = np.cumsum(w[order], axis=1)                              # weight of top-k
        self.decimals = decimals

    def above_and_equal(self, x: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """x: (n_sims, K) -> (P_w(field > x), P_w(field == x))."""
        x = np.round(np.asarray(x, dtype=np.float64), self.decimals)
        S, K = x.shape
        gt = np.empty((S, K))
        eq = np.empty((S, K))
        for s in range(S):
            row = self.sorted_neg[s]
            cw = np.r_[0.0, self.cumw[s]]
            i_gt = np.searchsorted(row, -x[s], side="left")
            i_ge = np.searchsorted(row, -x[s], side="right")
            gt[s] = cw[i_gt]
            eq[s] = cw[i_ge] - cw[i_gt]
        return gt, eq


def vs_field(entry_scores: np.ndarray, fd: FieldDistribution, n_field: int, payout_vector: np.ndarray,
             own_compete: bool = True) -> np.ndarray:
    """Expected winnings (n_sims, K) for our K entries against a field of n_field entrants (+ each other)."""
    curve = PayoutCurve(payout_vector)
    gt, eq = fd.above_and_equal(entry_scores)
    above = n_field * gt
    ties = n_field * eq + 1.0
    if own_compete and entry_scores.shape[1] > 1:
        x = np.round(entry_scores.astype(np.float64), fd.decimals)
        above = above + (x[:, None, :] > x[:, :, None]).sum(2)
        ties = ties + (x[:, None, :] == x[:, :, None]).sum(2) - 1
    return curve.avg(above, ties)


def standalone(cand_scores: np.ndarray, fd: FieldDistribution, n_field: int, payout_vector: np.ndarray) -> np.ndarray:
    """Each candidate entered alone (no own-entry interaction): (n_sims, C)."""
    curve = PayoutCurve(payout_vector)
    gt, eq = fd.above_and_equal(cand_scores)
    return curve.avg(n_field * gt, n_field * eq + 1.0)
