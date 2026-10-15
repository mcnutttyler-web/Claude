"""Fit a DraftKings NFL Classic ownership model from your own contest standings exports.

How it works
------------
- Each DK standings CSV lists every rostered player with "%Drafted" for that contest.
- Players in your slate pool who don't appear there were owned 0%. That matters, so
  the pool comes from your own projections file, not from the standings.
- Model: ridge regression on logit(ownership) using salary, projection, value,
  value rank within position, team total, salary change, and position.
- Predictions are renormalized per slate so QB sums to 100%, DST to 100%,
  and RB+WR+TE to 700% (DK Classic: 9 slots).
- Leave-one-slate-out CV tells you when it beats your heuristic.

Archive layout (one folder per slate; archive_week.py creates this):
  data/archive/2026/w06/my_projections.csv   # your pre-lock pool export (app: Build projections)
  data/archive/2026/w06/standings_*.csv      # one or more DK standings exports (app sidebar)
Use small-field / single-entry contests only. Large GPP ownership behaves differently.

my_projections.csv needs:  name, pos, salary, proj
optional:                  team_total, prev_salary, own_heuristic (your v1 softmax %, 0-100)

Usage
-----
  python scripts/ownership_fit.py data/archive --cv                  # does it beat the heuristic yet?
  python scripts/ownership_fit.py data/archive --fit                 # save ownership_model.json
  python scripts/ownership_fit.py data/archive --predict this_week_projections.csv   # writes *_own.csv
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import re

from pathlib import Path

import numpy as np
import pandas as pd

MODEL_PATH = Path(__file__).resolve().parents[2] / "data" / "ownership_model.json"

FEATURES = [
    "sal_k", "proj", "value", "log_value_rank", "log_proj_rank", "top2_value",
    "team_total", "sal_change", "pos_QB", "pos_RB", "pos_WR", "pos_TE", "pos_DST",
]
POS_TOTALS = {"QB": 1.0, "DST": 1.0}   # RB/WR/TE share the remaining 7.0
FLEX_TOTAL = 7.0
OWN_CLIP = (0.002, 0.95)


# ---------- parsing ----------

def norm_name(s) -> str:
    s = str(s).lower().strip()
    s = re.sub(r"[.'’,]", "", s)
    s = s.replace("-", " ")
    s = re.sub(r"\s+(jr|sr|ii|iii|iv|v)$", "", s)
    return re.sub(r"\s+", " ", s).strip()


def norm_pos(p) -> str:
    p = str(p).upper().strip()
    return "DST" if p in {"D", "DEF", "D/ST", "DST"} else p


def parse_standings(path: str) -> pd.DataFrame:
    """Return name_key, own (0-1) from a DK contest standings export."""
    raw = pd.read_csv(path, dtype=str, keep_default_na=False)
    cols = {c.strip().lower(): c for c in raw.columns}
    if "player" not in cols or "%drafted" not in cols:
        raise ValueError(f"{path}: expected 'Player' and '%Drafted' columns, got {list(raw.columns)}")
    df = raw[[cols["player"], cols["%drafted"]]].copy()
    df.columns = ["player", "drafted"]
    df = df[df["player"].str.strip() != ""]
    df["own"] = pd.to_numeric(df["drafted"].str.replace("%", "", regex=False), errors="coerce") / 100
    df["name_key"] = df["player"].map(norm_name)
    return df.dropna(subset=["own"]).drop_duplicates("name_key")[["name_key", "own"]]


def load_slate(slate_dir: str, root: str = ".") -> pd.DataFrame | None:
    pool_path = os.path.join(slate_dir, "my_projections.csv")
    stand = sorted(glob.glob(os.path.join(slate_dir, "standings_*.csv")))
    if not os.path.exists(pool_path) or not stand:
        return None
    pool = pd.read_csv(pool_path)
    pool["name_key"] = pool["name"].map(norm_name)
    # average ownership across multiple same-type contests for that slate
    own = pd.concat([parse_standings(p) for p in stand]).groupby("name_key", as_index=False)["own"].mean()
    df = pool.merge(own, on="name_key", how="left")
    df["own"] = df["own"].fillna(0.0)  # in pool but nobody rostered = 0%
    df["slate"] = os.path.relpath(slate_dir, root)
    matched = df["own"].gt(0).sum()
    if matched < 0.8 * len(own):
        print(f"  warning: {slate_dir}: only {matched}/{len(own)} owned players matched the pool; check names")
    return df


def load_archive(root: str) -> pd.DataFrame:
    dirs = sorted({os.path.dirname(p) for p in glob.glob(os.path.join(root, "**", "my_projections.csv"), recursive=True)})
    slates = [s for s in (load_slate(d, root) for d in dirs) if s is not None]
    if not slates:
        raise SystemExit(f"No complete slates under {root}")
    return pd.concat(slates, ignore_index=True)


# ---------- features ----------

def build_features(df: pd.DataFrame) -> pd.DataFrame:
    d = df.copy()
    if "slate" not in d:
        d["slate"] = "current"
    d["pos"] = d["pos"].map(norm_pos)
    d = d[d["pos"].isin(["QB", "RB", "WR", "TE", "DST"]) & d["proj"].notna() & d["salary"].gt(0)]
    d["sal_k"] = d["salary"] / 1000
    d["value"] = d["proj"] / d["sal_k"]
    grp = d.groupby(["slate", "pos"])
    d["value_rank"] = grp["value"].rank(ascending=False, method="min")
    d["proj_rank"] = grp["proj"].rank(ascending=False, method="min")
    d["log_value_rank"] = np.log(d["value_rank"])
    d["log_proj_rank"] = np.log(d["proj_rank"])
    d["top2_value"] = (d["value_rank"] <= 2).astype(float)
    tt = d["team_total"] if "team_total" in d else pd.Series(np.nan, index=d.index)
    d["team_total"] = tt.fillna(tt.mean() if tt.notna().any() else 22.0)
    if "prev_salary" in d:
        d["sal_change"] = ((d["salary"] - d["prev_salary"]) / 1000).fillna(0.0)
    else:
        d["sal_change"] = 0.0
    for p in ["QB", "RB", "WR", "TE", "DST"]:
        d[f"pos_{p}"] = (d["pos"] == p).astype(float)
    return d


# ---------- model ----------

def _logit(p):
    p = np.clip(p, *OWN_CLIP)
    return np.log(p / (1 - p))


def fit(d: pd.DataFrame, alpha: float = 3.0) -> dict:
    X = d[FEATURES].to_numpy(float)
    mu, sd = X.mean(0), X.std(0)
    sd[sd == 0] = 1.0
    Z = (X - mu) / sd
    y = _logit(d["own"].to_numpy(float))
    A = np.column_stack([np.ones(len(Z)), Z])
    pen = alpha * np.eye(A.shape[1])
    pen[0, 0] = 0.0  # don't penalize intercept
    beta = np.linalg.solve(A.T @ A + pen, A.T @ y)
    return {"features": FEATURES, "mu": mu.tolist(), "sd": sd.tolist(), "beta": beta.tolist(), "alpha": alpha}


def normalize(d: pd.DataFrame, col: str) -> pd.Series:
    """Rescale so QB=100%, DST=100%, RB+WR+TE=700% within each slate."""
    out = d[col].astype(float).copy()
    for _, g in d.groupby("slate"):
        for pos, tot in POS_TOTALS.items():
            idx = g.index[g["pos"] == pos]
            s = out[idx].sum()
            if s > 0:
                out[idx] = out[idx] * tot / s
        idx = g.index[g["pos"].isin(["RB", "WR", "TE"])]
        s = out[idx].sum()
        if s > 0:
            out[idx] = out[idx] * FLEX_TOTAL / s
    return out.clip(upper=0.95)


def predict(model: dict, d: pd.DataFrame) -> pd.Series:
    X = d[model["features"]].to_numpy(float)
    Z = (X - np.array(model["mu"])) / np.array(model["sd"])
    z = np.array(model["beta"][0]) + Z @ np.array(model["beta"][1:])
    tmp = d.assign(_raw=1 / (1 + np.exp(-z)))
    return normalize(tmp, "_raw")


def heuristic(d: pd.DataFrame) -> pd.Series:
    """Your v1 heuristic if present (own_heuristic, in %), else a simple stand-in."""
    if "own_heuristic" in d and d["own_heuristic"].notna().any():
        tmp = d.assign(_h=d["own_heuristic"].fillna(0) / 100)
    else:
        score = 1.5 * (d["value"] - d["value"].mean()) / d["value"].std() + 0.5 * (d["proj"] - d["proj"].mean()) / d["proj"].std()
        tmp = d.assign(_h=np.exp(score))
    return normalize(tmp, "_h")


def cross_validate(d: pd.DataFrame, alpha: float = 3.0) -> pd.DataFrame:
    slates = sorted(d["slate"].unique())
    if len(slates) < 3:
        raise SystemExit(f"Need at least 3 slates for CV; have {len(slates)}.")
    rows = []
    for s in slates:
        train, test = d[d["slate"] != s], d[d["slate"] == s]
        m = fit(train, alpha)
        pm, ph = predict(m, test), heuristic(test)
        rel = test["own"].ge(0.03) | pm.ge(0.03) | ph.ge(0.03)  # players that matter
        row = {
            "slate": s, "n": int(rel.sum()),
            "mae_model": 100 * (pm - test["own"])[rel].abs().mean(),
            "mae_heur": 100 * (ph - test["own"])[rel].abs().mean(),
        }
        if "own_source" in test and test["own_source"].notna().any():     # published ownership (e.g. OWS)
            psrc = normalize(test.assign(_s=test["own_source"].fillna(0) / 100), "_s")
            row["mae_source"] = 100 * (psrc - test["own"])[rel].abs().mean()
        rows.append(row)
    rep = pd.DataFrame(rows)
    rep["model_wins"] = rep["mae_model"] < rep["mae_heur"]
    return rep.round(2)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("archive")
    ap.add_argument("--cv", action="store_true")
    ap.add_argument("--fit", action="store_true")
    ap.add_argument("--predict", metavar="PROJECTIONS_CSV")
    ap.add_argument("--model", default=str(MODEL_PATH))
    ap.add_argument("--alpha", type=float, default=3.0)
    a = ap.parse_args()

    if a.cv or a.fit:
        d = build_features(load_archive(a.archive))
        print(f"{d['slate'].nunique()} slates, {len(d)} player rows")
    if a.cv:
        rep = cross_validate(d, a.alpha)
        print("\nLeave-one-slate-out MAE in ownership points (players ≥3% owned or predicted):")
        print(rep.to_string(index=False))
        print(f"\nModel {rep['mae_model'].mean():.2f} vs heuristic {rep['mae_heur'].mean():.2f}; "
              f"model wins {int(rep['model_wins'].sum())}/{len(rep)} slates.")
        if "mae_source" in rep:
            print(f"Published source (own_source, e.g. OWS): {rep['mae_source'].mean():.2f} — use the fitted model "
                  f"only if it also beats this.")
        print("Switch over once the model wins the 3 most recent slates.")
    if a.fit:
        with open(a.model, "w") as f:
            json.dump(fit(d, a.alpha), f, indent=2)
        print(f"Saved {a.model}")
    if a.predict:
        with open(a.model) as f:
            m = json.load(f)
        cur = build_features(pd.read_csv(a.predict))
        cur["own_pred_pct"] = (100 * predict(m, cur)).round(1)
        out = os.path.splitext(a.predict)[0] + "_own.csv"
        cur.drop(columns=[c for c in FEATURES if c.startswith("pos_")] + ["slate"]).to_csv(out, index=False)
        print(f"Wrote {out}")


if __name__ == "__main__":
    main()


def predict_slate(slate: pd.DataFrame, model: dict | None = None, path: Path = MODEL_PATH) -> pd.Series:
    """GPP ownership (0-1) for a lineup-generator slate (name, position, salary, median[, team_total]),
    aligned to slate.index and normalized to QB 100% / DST 100% / RB+WR+TE 700%."""
    if model is None:
        with open(path) as f:
            model = json.load(f)
    d = pd.DataFrame({"name": slate["name"], "pos": slate["position"], "salary": slate["salary"],
                      "proj": slate["median"],
                      "team_total": slate["team_total"] if "team_total" in slate else np.nan}, index=slate.index)
    f = build_features(d)
    return predict(model, f).reindex(slate.index).fillna(0.0)
