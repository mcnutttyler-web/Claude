"""Per-position projection recalibration + rookie/missing fallback.

Fits  actual ≈ a + b * proj  per position, shrunk toward identity (a=0, b=1)
so small samples can't produce wild corrections. Includes a walk-forward
check so you only ship it if it actually helps out of sample.

Usage
-----
  # 1) Check it out-of-sample on your existing backtest output
  python scripts/recalibrate.py data/backtest.csv --walk-forward

  # 2) Fit on everything and save params for the app
  python scripts/recalibrate.py data/backtest.csv --out calibration.json

  # 3) In the app:
  from core.projections.recalibrate import load_calibration, apply_calibration, blend_with_fallback
  cal = load_calibration("config/calibration.json")
  df = blend_with_fallback(df, model_col="proj_model", cons_col="proj_dff", w_model=0.5)
  df = apply_calibration(df, cal, proj_col="proj_final", pos_col="pos")

Input CSV columns (rename with flags if yours differ):
  season, week, pos, proj, actual
IMPORTANT: the backtest pool must be chosen pre-game (by salary or projection),
not by actual points, or the fitted bias is contaminated.
"""
from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass

import numpy as np
import pandas as pd

MIN_N = 30            # below this, leave the position uncalibrated
B_CLIP = (0.75, 1.25)  # never let the slope go further than this


@dataclass
class PosCal:
    a: float = 0.0
    b: float = 1.0
    n: int = 0
    lo: float | None = None     # projection range the fit saw (5th-95th pct); the correction is not extrapolated
    hi: float | None = None

    def correct(self, proj: np.ndarray) -> np.ndarray:
        """Calibrated projection. Inside [lo, hi]: a + b*proj. Above hi: the correction at hi. Below lo: the
        correction at lo faded linearly to 0 at proj=0 (a pool of top players says nothing about scrubs)."""
        x = np.asarray(proj, float)
        if self.lo is None or self.hi is None:
            return self.a + self.b * x
        corr = self.a + (self.b - 1.0) * np.clip(x, self.lo, self.hi)
        fade = np.clip(x / self.lo, 0.0, 1.0) if self.lo > 0 else 1.0
        return x + corr * np.where(x < self.lo, fade, 1.0)


def fit_position(proj, actual, prior_strength: float = 50.0) -> PosCal:
    """Ridge fit of actual on proj, pulled toward a=0, b=1.

    prior_strength ~ number of pseudo-games of 'trust the raw projection'.
    50 is a moderate default; raise it (e.g. 150) if walk-forward results are jumpy.
    """
    x = np.asarray(proj, float)
    y = np.asarray(actual, float)
    m = np.isfinite(x) & np.isfinite(y)
    x, y = x[m], y[m]
    n = len(x)
    if n < MIN_N:
        return PosCal(0.0, 1.0, n)
    lo, hi = (float(v) for v in np.percentile(x, [5, 95]))

    # Center x so intercept and slope penalties are independent.
    xm = x.mean()
    xc = x - xm
    # Prior in centered space: intercept_c = 0 + 1*xm, slope = 1
    prior = np.array([xm, 1.0])
    X = np.column_stack([np.ones(n), xc])
    lam = prior_strength * np.diag([1.0, xc.var() if xc.var() > 0 else 1.0])
    beta_c = np.linalg.solve(X.T @ X + lam, X.T @ y + lam @ prior)
    b = float(np.clip(beta_c[1], *B_CLIP))
    a = float(beta_c[0] - b * xm)
    return PosCal(a, b, n, lo, hi)


def fit_all(df: pd.DataFrame, pos_col="pos", proj_col="proj", actual_col="actual",
            prior_strength: float = 50.0) -> dict[str, PosCal]:
    return {
        pos: fit_position(g[proj_col], g[actual_col], prior_strength)
        for pos, g in df.groupby(pos_col)
    }


def apply_calibration(df: pd.DataFrame, cal: dict[str, PosCal], proj_col="proj",
                      pos_col="pos", out_col="proj_cal") -> pd.DataFrame:
    out = df.copy()
    vals = np.full(len(out), np.nan)
    pos = out[pos_col].to_numpy()
    x = out[proj_col].to_numpy(float)
    for p in pd.unique(pos):
        m = pos == p
        vals[m] = cal.get(p, PosCal()).correct(x[m])
    out[out_col] = pd.Series(vals, index=out.index).clip(lower=0.0)
    # keep NaN projections NaN
    out.loc[out[proj_col].isna(), out_col] = np.nan
    return out


def blend_with_fallback(df: pd.DataFrame, model_col="proj_model", cons_col="proj_dff",
                        w_model: float = 0.5, out_col="proj_final") -> pd.DataFrame:
    """Blend model + consensus; if the model has no projection (rookies, new
    signings), use 100% consensus instead of dropping the player."""
    out = df.copy()
    m, c = out[model_col], out[cons_col]
    out[out_col] = np.where(
        m.notna() & c.notna(), w_model * m + (1 - w_model) * c,
        np.where(m.notna(), m, c),
    )
    out["proj_source"] = np.select(
        [m.notna() & c.notna(), m.notna(), c.notna()],
        ["blend", "model_only", "consensus_fallback"], default="none",
    )
    return out


def save_calibration(cal: dict[str, PosCal], path: str) -> None:
    with open(path, "w") as f:
        json.dump({k: asdict(v) for k, v in cal.items()}, f, indent=2)


def load_calibration(path: str) -> dict[str, PosCal]:
    with open(path) as f:
        return {k: PosCal(**v) for k, v in json.load(f).items()}


def walk_forward(df: pd.DataFrame, pos_col="pos", proj_col="proj", actual_col="actual",
                 season_col="season", week_col="week", min_prior_weeks: int = 4,
                 prior_strength: float = 50.0) -> pd.DataFrame:
    """Each week: fit on all strictly earlier weeks, apply to this week."""
    d = df.copy()
    d["_t"] = d[season_col] * 100 + d[week_col]
    weeks = sorted(d["_t"].unique())
    parts = []
    for i, t in enumerate(weeks):
        if i < min_prior_weeks:
            continue
        train = d[d["_t"] < t]
        test = d[d["_t"] == t]
        cal = fit_all(train, pos_col, proj_col, actual_col, prior_strength)
        parts.append(apply_calibration(test, cal, proj_col, pos_col))
    if not parts:
        raise ValueError("Not enough weeks for walk-forward.")
    res = pd.concat(parts)
    rows = []
    for pos, g in res.groupby(pos_col):
        e_raw = g[proj_col] - g[actual_col]
        e_cal = g["proj_cal"] - g[actual_col]
        rows.append({
            "pos": pos, "n": len(g),
            "mae_raw": e_raw.abs().mean(), "mae_cal": e_cal.abs().mean(),
            "rmse_raw": np.sqrt((e_raw ** 2).mean()), "rmse_cal": np.sqrt((e_cal ** 2).mean()),
            "bias_raw": e_raw.mean(), "bias_cal": e_cal.mean(),
        })
    rep = pd.DataFrame(rows)
    rep["mae_change"] = rep["mae_cal"] - rep["mae_raw"]
    rep["rmse_change"] = rep["rmse_cal"] - rep["rmse_raw"]
    return rep.round(3)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv")
    ap.add_argument("--out", default="calibration.json")
    ap.add_argument("--walk-forward", action="store_true")
    ap.add_argument("--prior-strength", type=float, default=50.0)
    ap.add_argument("--pos-col", default="pos")
    ap.add_argument("--proj-col", default="proj")
    ap.add_argument("--actual-col", default="actual")
    ap.add_argument("--season-col", default="season")
    ap.add_argument("--week-col", default="week")
    a = ap.parse_args()
    df = pd.read_csv(a.csv)

    if a.walk_forward:
        rep = walk_forward(df, a.pos_col, a.proj_col, a.actual_col, a.season_col,
                           a.week_col, prior_strength=a.prior_strength)
        print("\nWalk-forward (negative mae_change = calibration helps):")
        print(rep.to_string(index=False))
        print("\nShip it if bias_cal is near 0 everywhere and rmse_change <= 0. MAE rewards the MEDIAN; for right-skewed"
              "\npositions (WR/TE) a mean-correct projection can raise MAE slightly while fixing the bias the optimizer sees.")
        return

    cal = fit_all(df, a.pos_col, a.proj_col, a.actual_col, a.prior_strength)
    save_calibration(cal, a.out)
    print(f"Saved {a.out}")
    for p, c in cal.items():
        rng = f"  fitted on proj {c.lo:.1f}-{c.hi:.1f}" if c.lo is not None else ""
        print(f"  {p:4s} actual ≈ {c.a:+.2f} + {c.b:.3f}·proj   (n={c.n}){rng}")


if __name__ == "__main__":
    main()
