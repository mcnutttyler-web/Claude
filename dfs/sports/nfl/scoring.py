"""DK NFL scoring. Point values come from config.yaml so they can be re-verified without code edits."""
from __future__ import annotations


def dst_points_allowed(points_allowed: float, tiers: list) -> float:
    for max_pa, pts in tiers:
        if max_pa is None or points_allowed <= max_pa:
            return float(pts)
    return float(tiers[-1][1])


def score(stat_line: dict[str, float], cfg: dict) -> float:
    s = {k: float(v) for k, v in stat_line.items() if v is not None}
    total = 0.0
    for stat, pts in cfg.get("offense", {}).items():
        total += s.get(stat, 0.0) * pts
    for stat, (threshold, pts) in cfg.get("bonuses", {}).items():
        if s.get(stat, 0.0) >= threshold:
            total += pts
    for stat, pts in cfg.get("dst", {}).items():
        total += s.get(stat, 0.0) * pts
    if "pts_allowed" in s:
        total += dst_points_allowed(s["pts_allowed"], cfg["dst_points_allowed"])
    for stat, pts in cfg.get("kicker", {}).items():
        total += s.get(stat, 0.0) * pts
    return round(total, 2)


def _p_at_least(mean: float, sd: float, threshold: float) -> float:
    from scipy.stats import norm
    if sd <= 0:
        return float(mean >= threshold)
    return float(norm.sf(threshold, loc=mean, scale=sd))


def expected_score(stat_means: dict[str, float], cfg: dict, dispersion: dict | None = None) -> float:
    """Expected DK points from MEAN stat projections.

    score(mean stats) is biased: threshold bonuses and DST points-allowed tiers are nonlinear. So the linear
    part is scored on means and the nonlinear parts use P(stat >= threshold) and E[tier points] under a
    Normal approximation (dispersion = {"cv": {stat: cv}, "pa_sigma": sigma}). Default — calibrate.
    """
    d = dispersion or {}
    cv = d.get("cv", {})
    s = {k: float(v) for k, v in stat_means.items() if v is not None and v == v}
    total = 0.0
    for stat, pts in cfg.get("offense", {}).items():
        total += s.get(stat, 0.0) * pts
    for stat, (threshold, pts) in cfg.get("bonuses", {}).items():
        m = s.get(stat, 0.0)
        if m > 0:
            total += pts * _p_at_least(m, cv.get(stat, 0.5) * m, threshold - 0.5)
    for stat, pts in cfg.get("dst", {}).items():
        total += s.get(stat, 0.0) * pts
    if "pts_allowed" in s:
        total += expected_pa_points(s["pts_allowed"], float(d.get("pa_sigma", 9.0)), cfg["dst_points_allowed"])
    for stat, pts in cfg.get("kicker", {}).items():
        total += s.get(stat, 0.0) * pts
    return round(total, 3)


def pa_tier_probs(mean_pa: float, sigma: float, tiers: list) -> list[float]:
    """P(points allowed falls in each DK tier) with PA ~ Normal(mean, sigma) on integer support (>= 0)."""
    from scipy.stats import norm
    probs, lo = [], -0.5
    edges = [t[0] for t in tiers]
    cdf_floor = norm.cdf(-0.5, mean_pa, sigma)          # mass below 0 is folded into the 0 tier
    for k, max_pa in enumerate(edges):
        hi = float("inf") if max_pa is None else max_pa + 0.5
        p = norm.cdf(hi, mean_pa, sigma) - norm.cdf(lo, mean_pa, sigma)
        if k == 0:
            p += cdf_floor
        probs.append(float(p))
        lo = hi
    return probs


def expected_pa_points(mean_pa: float, sigma: float, tiers: list) -> float:
    return float(sum(p * pts for p, (_, pts) in zip(pa_tier_probs(mean_pa, sigma, tiers), tiers)))
