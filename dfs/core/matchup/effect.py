"""Matchup effect: archetype x defense profile -> residual DK points beyond opportunity, heavily shrunk.

1. expected points from opportunity: OLS (no intercept) per position on training seasons
       WR/TE/RB: dk ~ targets + carries        QB: dk ~ attempts + designed carries + scrambles
   residual = actual DK - expected
2. player adjustment: subtract the player's own prior mean residual (last 16 games, shrunk n/(n+8)) so a good
   player's usual surplus isn't credited to his opponents ("result vs his norm" = schedule adjustment)
3. "allowed" features per defense-week (games before the week, last season shrunk 30% to 0, blend g/(g+k)):
   mean adjusted residual allowed to the position and to the archetype, each empirical-Bayes shrunk by
   n/(n + sigma^2/tau^2) estimated from defense-season means (small samples shrink to ~0)
4. ridge per position on [defense features, defense features x archetype]; penalty chosen by
   leave-one-season-out CV with the one-standard-error rule toward MORE shrinkage
5. multiplier = 1 + clip(effect / projection, +-cap)
Fit once per offseason on all seasons before the target season.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd

from core.matchup import archetypes as A
from core.matchup import defense as D

POSITIONS = ["QB", "RB", "WR", "TE"]
OPP = {"QB": ["att", "carries", "scrambles"], "RB": ["targets", "carries"], "WR": ["targets", "carries"],
       "TE": ["targets", "carries"]}


@dataclass
class MatchupConfig:
    k_def: float = 5.0
    prior_shrink: float = 0.30
    cap: float = 0.08
    window: int = 6
    blend_k: float = 3.0
    blend_before_week: int = 4
    role_change_pts: float = 0.20
    clusters: dict = field(default_factory=lambda: {"WR": 5, "TE": 4, "RB": 4, "QB": 4})
    player_k: float = 8.0
    player_window: int = 16
    lambdas: tuple = tuple(np.logspace(1, 7, 13))
    min_proj: float = 5.0


def opportunity_fit(pg: pd.DataFrame) -> dict[str, np.ndarray]:
    out = {}
    for pos in POSITIONS:
        g = pg[pg["position"] == pos]
        X, y = g[OPP[pos]].to_numpy(float), g["dk"].to_numpy(float)
        out[pos] = np.linalg.lstsq(X, y, rcond=None)[0]
    return out


def residuals(pg: pd.DataFrame, coef: dict, cfg: MatchupConfig) -> pd.DataFrame:
    pg = pg.sort_values(["player_id", "season", "week"]).reset_index(drop=True).copy()
    pg["expected"] = 0.0
    for pos in POSITIONS:
        m = pg["position"] == pos
        pg.loc[m, "expected"] = pg.loc[m, OPP[pos]].to_numpy(float) @ coef[pos]
    pg["resid"] = pg["dk"] - pg["expected"]
    keys = pg["player_id"]
    cs = pg["resid"].groupby(keys).cumsum()
    prev, old = cs.groupby(keys).shift(1).fillna(0), cs.groupby(keys).shift(cfg.player_window + 1).fillna(0)
    n = np.minimum(pg.groupby(keys).cumcount(), cfg.player_window)
    base = (prev - old) / np.maximum(n, 1)
    pg["player_base"] = base * n / (n + cfg.player_k)
    pg["adj_resid"] = pg["resid"] - pg["player_base"]
    return pg


def eb_k(rows: pd.DataFrame, value: str, group: list[str]) -> float:
    """sigma^2 / tau^2 from group means (method of moments). Huge when there is no between-group signal."""
    g = rows.groupby(group)[value].agg(["mean", "var", "count"])
    g = g[g["count"] >= 2]
    if len(g) < 5:
        return 1e6
    sigma2 = float(np.average(g["var"], weights=g["count"] - 1))
    tau2 = float(g["mean"].var() - np.mean(sigma2 / g["count"]))
    return sigma2 / tau2 if tau2 > 1e-9 else 1e6


def allowed_features(rp: pd.DataFrame, cfg: MatchupConfig, train_seasons: list[int]) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    """Per (season, week, defense, position[, archetype]) EB-shrunk adjusted residual allowed."""
    pos_rows, arch_rows, ks = [], [], {}
    tr = rp[rp["season"].isin(train_seasons)]
    for pos in POSITIONS:
        r = rp[rp["position"] == pos]
        k1 = eb_k(tr[tr["position"] == pos], "adj_resid", ["season", "opp"])
        k2 = eb_k(tr[(tr["position"] == pos) & (tr["arch"] >= 0)], "adj_resid", ["season", "opp", "arch"])
        ks[pos] = {"position": k1, "archetype": k2}
        r = r.drop(columns="team")
        a = D.asof_blend(r.rename(columns={"opp": "team"}), ["adj_resid"], ["team"], cfg.k_def, cfg.prior_shrink,
                         eb_k={"adj_resid": k1}, count_col="game_id")
        pos_rows.append(a.rename(columns={"adj_resid": "allowed_pos"}).assign(position=pos)[
            ["season", "week", "team", "position", "allowed_pos"]])
        ra = r[r["arch"] >= 0].rename(columns={"opp": "team"})
        b = D.asof_blend(ra, ["adj_resid"], ["team", "arch"], cfg.k_def, cfg.prior_shrink,
                         eb_k={"adj_resid": k2}, count_col="game_id")
        arch_rows.append(b.rename(columns={"adj_resid": "allowed_arch"}).assign(position=pos)[
            ["season", "week", "team", "arch", "position", "allowed_arch"]])
    return pd.concat(pos_rows), pd.concat(arch_rows), ks


def design(rows: pd.DataFrame, n_arch: int, mu=None, sd=None):
    cols = D.GENERIC + ["allowed_pos", "allowed_arch"]
    X = rows[cols].to_numpy(float)
    X = np.nan_to_num(X, nan=0.0)
    if mu is None:
        mu, sd = X.mean(axis=0), X.std(axis=0) + 1e-9
    Z = (X - mu) / sd
    oh = np.zeros((len(rows), n_arch))
    a = rows["arch"].to_numpy(int)
    ok = a >= 0
    oh[np.flatnonzero(ok), a[ok]] = 1.0
    inter = (Z[:, :, None] * oh[:, None, :]).reshape(len(rows), -1)
    return np.hstack([Z, inter]), mu, sd, cols


def ridge(X, y, lam, pen=None):
    pen = np.ones(X.shape[1]) if pen is None else pen
    return np.linalg.solve(X.T @ X + lam * np.diag(pen), X.T @ y)


@dataclass
class EffectModel:
    season: int                                   # season it was fit FOR (trained on seasons < season)
    cfg: MatchupConfig
    arche: A.ArchetypeModel
    opp_coef: dict
    beta: dict = field(default_factory=dict)
    mu: dict = field(default_factory=dict)
    sd: dict = field(default_factory=dict)
    lam: dict = field(default_factory=dict)
    cv: dict = field(default_factory=dict)
    ymean: dict = field(default_factory=dict)
    eb: dict = field(default_factory=dict)

    def save(self, path: Path) -> None:
        d = {"season": self.season, "cfg": {k: (list(v) if isinstance(v, tuple) else v) for k, v in self.cfg.__dict__.items()},
             "arche": self.arche.to_json(), "opp_coef": {p: c.tolist() for p, c in self.opp_coef.items()},
             "beta": {p: b.tolist() for p, b in self.beta.items()}, "mu": {p: m.tolist() for p, m in self.mu.items()},
             "sd": {p: s.tolist() for p, s in self.sd.items()}, "lam": self.lam, "cv": self.cv, "ymean": self.ymean,
             "eb": self.eb}
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        Path(path).write_text(json.dumps(d, indent=1, default=lambda o: o.item() if hasattr(o, "item") else o.tolist()))

    @classmethod
    def load(cls, path: Path) -> "EffectModel":
        d = json.loads(Path(path).read_text())
        cfg = MatchupConfig(**{k: (tuple(v) if k == "lambdas" else v) for k, v in d["cfg"].items()})
        return cls(d["season"], cfg, A.ArchetypeModel.from_json(d["arche"]),
                   {p: np.array(c) for p, c in d["opp_coef"].items()}, {p: np.array(b) for p, b in d["beta"].items()},
                   {p: np.array(m) for p, m in d["mu"].items()}, {p: np.array(s) for p, s in d["sd"].items()},
                   d["lam"], d["cv"], d["ymean"], d["eb"])


def feature_table(pg, dg, games, cfg: MatchupConfig, arche: A.ArchetypeModel, opp_coef: dict,
                  train_seasons: list[int], aliases: dict, coverage_off=None, oc_changes=None):
    """Every player-game with archetype (as of kickoff), defense profile (as of the week) and residual target."""
    prof = A.in_season_profiles(pg, cfg.window, cfg.blend_k, cfg.blend_before_week, cfg.role_change_pts,
                                A.hc_changes(games, aliases) if games is not None else set(), oc_changes)
    prof["arch"] = arche.assign(prof)
    rp = residuals(pg, opp_coef, cfg).merge(
        prof[["player_id", "game_id", "arch", "profile_source", "flag_team_change", "flag_coach_change",
              "flag_role_change", "weight_current"]], on=["player_id", "game_id"], how="left")
    rp["arch"] = rp["arch"].fillna(-1).astype(int)
    gen = D.generic_profiles(dg, cfg.k_def, cfg.prior_shrink, coverage_off)
    ap, aa, ks = allowed_features(rp, cfg, train_seasons)
    ft = rp.merge(gen, left_on=["season", "week", "opp"], right_on=["season", "week", "team"], how="left",
                  suffixes=("", "_def")).drop(columns=["team_def", "games"], errors="ignore")
    ft = ft.merge(ap.rename(columns={"team": "opp"}), on=["season", "week", "opp", "position"], how="left")
    ft = ft.merge(aa.rename(columns={"team": "opp"}), on=["season", "week", "opp", "arch", "position"], how="left")
    ft[["allowed_pos", "allowed_arch"]] = ft[["allowed_pos", "allowed_arch"]].fillna(0.0)
    return ft, ks


def fit(pg, dg, games, season: int, cfg: MatchupConfig, aliases: dict, coverage_off=None, oc_changes=None,
        first_train: int = 2017):
    """Fit everything on seasons < `season` (one offseason refit). Returns (model, feature table incl. `season`)."""
    train = [s for s in sorted(pg["season"].unique()) if s < season]
    pg_tr = pg[pg["season"].isin(train)]
    arche = A.fit(pg_tr, cfg.clusters)
    coef = opportunity_fit(pg_tr)
    ft, ks = feature_table(pg[pg["season"] <= season], dg[dg["season"] <= season], games, cfg, arche, coef, train,
                           aliases, coverage_off, oc_changes)
    m = EffectModel(season, cfg, arche, coef, eb=ks)
    fit_rows = ft[(ft["season"] >= first_train) & (ft["season"] < season)]
    for pos in POSITIONS:
        r = fit_rows[fit_rows["position"] == pos]
        X, mu, sd, _ = design(r, cfg.clusters[pos])
        y = r["adj_resid"].to_numpy(float)
        ym = float(y.mean())
        y = y - ym
        seasons = r["season"].to_numpy()
        pen = np.r_[np.ones(len(D.GENERIC) + 2), 2.0 * np.ones(X.shape[1] - len(D.GENERIC) - 2)]
        errs = []
        for lam in cfg.lambdas:
            fold = []
            for s in np.unique(seasons):
                tr, te = seasons != s, seasons == s
                b = ridge(X[tr], y[tr], lam, pen)
                fold.append(np.mean((y[te] - X[te] @ b) ** 2) - np.mean(y[te] ** 2))   # vs predicting zero
            errs.append((np.mean(fold), np.std(fold) / np.sqrt(len(fold))))
        errs = np.array(errs)
        best = int(np.argmin(errs[:, 0]))
        ok = np.flatnonzero(errs[:, 0] <= errs[best, 0] + errs[best, 1])      # 1-SE rule: most shrinkage
        j = int(ok.max())
        m.lam[pos] = float(cfg.lambdas[j])
        m.cv[pos] = {"mse_gain_vs_zero": float(-errs[j, 0]), "se": float(errs[j, 1])}
        m.beta[pos], m.mu[pos], m.sd[pos], m.ymean[pos] = ridge(X, y, cfg.lambdas[j], pen), mu, sd, ym
    return m, ft


def predict(m: EffectModel, ft: pd.DataFrame) -> pd.Series:
    """Effect in DK points per row (0 where the archetype is unknown)."""
    out = pd.Series(0.0, index=ft.index)
    for pos in POSITIONS:
        idx = ft.index[(ft["position"] == pos) & (ft["arch"] >= 0)]
        if len(idx) == 0:
            continue
        X, *_ = design(ft.loc[idx], m.cfg.clusters[pos], m.mu[pos], m.sd[pos])
        out.loc[idx] = X @ m.beta[pos]
    return out


def multiplier(effect: pd.Series | np.ndarray, proj: pd.Series | np.ndarray, cap: float, min_proj: float = 5.0):
    proj = np.maximum(np.asarray(proj, float), min_proj)
    return 1.0 + np.clip(np.asarray(effect, float) / proj, -cap, cap)
