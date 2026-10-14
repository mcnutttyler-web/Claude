"""Per-player outcome marginals for the slate simulator (Section 4.4 / 5.1). Defaults — calibrate.

Default family: shifted lognormal  X = lo + exp(mu + sigma * Z), lo = sport's minimum score for the position.
Alternative: gamma (shifted by lo).
Fitting, in order of preference:
  median + ceiling (treated as p90 unless `ceiling_q` says otherwise)
  median + std_dev
  median + default CV for the position (sport's distribution_defaults.cv_by_position)
Bust mixture: with probability p a skill player scores U(0, max_frac x median). The base distribution is fitted
so that the MIXTURE hits the target median and ceiling exactly.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from scipy.optimize import brentq
from scipy.stats import gamma as gamma_dist, norm

from sports.base import SportConfig


@dataclass
class Marginals:
    family: str
    lo: np.ndarray          # shift (support starts here)
    a: np.ndarray           # lognormal mu  | gamma shape
    b: np.ndarray           # lognormal sigma | gamma scale
    bust_p: np.ndarray      # per-player bust probability (0 for non-skill)
    bust_hi: np.ndarray     # bust draws ~ U(0, bust_hi)

    def base_quantile(self, u: np.ndarray) -> np.ndarray:
        if self.family == "gamma":
            return self.lo + gamma_dist.ppf(u, self.a, scale=self.b)
        return self.lo + np.exp(self.a + self.b * norm.ppf(u))

    def quantile(self, u: np.ndarray, bust_u: np.ndarray | None = None) -> np.ndarray:
        """u: (n_sims, n_players) copula uniforms. bust_u: independent uniforms for the bust mixture."""
        x = self.base_quantile(np.clip(u, 1e-9, 1 - 1e-9))
        if bust_u is not None and self.bust_p.any():
            busted = bust_u < self.bust_p
            # reuse bust_u (rescaled to [0,1)) for the uniform bust score -> no extra RNG state
            frac = np.where(self.bust_p > 0, bust_u / np.maximum(self.bust_p, 1e-12), 0.0)
            x = np.where(busted, frac * self.bust_hi, x)
        return x


def _lognormal_sigma_for_cv(m_shift: float, sd: float) -> float:
    """sigma such that a lognormal with MEDIAN m_shift has std sd."""
    if sd <= 0 or m_shift <= 0:
        return 1e-3
    f = lambda s: m_shift * np.exp(s * s / 2) * np.sqrt(np.exp(s * s) - 1) - sd
    return float(brentq(f, 1e-4, 4.0))


def fit_marginals(slate: pd.DataFrame, sport: SportConfig, family: str | None = None,
                  ceiling_q: float = 0.90, bust: bool = True) -> Marginals:
    d = sport.distribution_defaults
    family = family or d.get("family", "shifted_lognormal")
    cv = d.get("cv_by_position", {})
    mins = d.get("min_score_by_position", {})
    allow_neg = bool(d.get("allow_negative", True))
    b = d.get("bust", {}) if bust else {}
    bp, bfrac, bpos = float(b.get("p", 0.0)), float(b.get("max_frac_of_median", 0.25)), set(b.get("positions", []))
    n = len(slate)
    lo, A, B = np.zeros(n), np.zeros(n), np.zeros(n)
    bust_p, bust_hi = np.zeros(n), np.zeros(n)
    for k, r in enumerate(slate.itertuples()):
        pos = r.position
        med = max(float(r.median), 0.05)
        lo_k = float(mins.get(pos, 0.0)) if allow_neg else 0.0
        lo[k] = lo_k
        p = bp if pos in bpos else 0.0
        bust_p[k], bust_hi[k] = p, bfrac * med
        # mixture-corrected base quantile levels
        q50 = (0.5 - p) / (1 - p)
        qc = (ceiling_q - p) / (1 - p)
        ceil = getattr(r, "ceiling", np.nan)
        sd = getattr(r, "std_dev", np.nan)
        m_shift = med - lo_k
        if family == "gamma":
            target_sd = (sd if sd == sd and sd > 0 else cv.get(pos, 0.6) * med)
            shape = max((m_shift / target_sd) ** 2, 0.05)
            # solve scale so the base quantile at q50 equals m_shift
            scale = m_shift / gamma_dist.ppf(q50, shape)
            A[k], B[k] = shape, scale
            continue
        if ceil == ceil and ceil is not None and ceil > med:
            # mu from median, sigma from ceiling: lo + exp(mu + sigma z) at both levels
            z50, zc = norm.ppf(q50), norm.ppf(qc)
            sigma = (np.log(ceil - lo_k) - np.log(m_shift)) / (zc - z50)
            mu = np.log(m_shift) - sigma * z50
        else:
            target_sd = sd if sd == sd and sd and sd > 0 else cv.get(pos, 0.6) * med
            sigma = _lognormal_sigma_for_cv(m_shift, target_sd)
            mu = np.log(m_shift) - sigma * norm.ppf(q50)
        A[k], B[k] = mu, max(sigma, 1e-4)
    return Marginals(family if family == "gamma" else "shifted_lognormal", lo, A, B, bust_p, bust_hi)
