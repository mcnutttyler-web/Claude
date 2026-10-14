"""Correlation matrix from the sport's role-pair prior + a game-level factor, repaired to nearest PSD (Higham).

Lookup for a pair (i, j) in the same team / opposing teams:
    exact role pair "R1|R2" (either order) -> position-generic pair "P1|P2" -> 0.
Role labels come from SportConfig.roles(); generic position = role with trailing digits removed.
Game factor: every player whose position is in game_factor.positions loads `loading` on a latent game shock,
adding loading^2 to each same-game pair. Showdown-only pairs apply when mode == "showdown".
All values: default — calibrate.
"""
from __future__ import annotations

import logging
import re

import numpy as np
import pandas as pd

log = logging.getLogger(__name__)


def _generic(role: str) -> str:
    return re.sub(r"\d+$", "", str(role))


def _lookup(table: dict, a: str, b: str) -> float | None:
    for x, y in ((a, b), (b, a)):
        k = f"{x}|{y}"
        if k in table:
            return float(table[k])
    return None


def pair_corr(table: dict, ra: str, rb: str) -> float:
    for a, b in ((ra, rb), (_generic(ra), rb), (ra, _generic(rb)), (_generic(ra), _generic(rb))):
        v = _lookup(table, a, b)
        if v is not None:
            return v
    return 0.0


def build_correlation(slate: pd.DataFrame, prior: dict, roles: pd.Series | None = None,
                      mode: str = "classic") -> np.ndarray:
    n = len(slate)
    roles = (roles if roles is not None else slate.get("role", slate["position"])).astype(str).to_numpy()
    team = slate["team"].to_numpy()
    opp = slate["opp"].to_numpy()
    game = slate["game_id"].to_numpy()
    pos = slate["position"].to_numpy()
    same = {k: v for k, v in (prior.get("same_team") or {}).items() if k != "showdown"}
    if mode == "showdown":
        same.update((prior.get("same_team") or {}).get("showdown") or {})
    oppt = prior.get("opponent") or {}
    gf = prior.get("game_factor") or {}
    load = float(gf.get("loading", 0.0))
    gpos = set(gf.get("positions", []))
    C = np.eye(n)
    for i in range(n):
        for j in range(i + 1, n):
            if game[i] != game[j]:
                continue
            if team[i] == team[j]:
                c = pair_corr(same, roles[i], roles[j])
            elif opp[i] == team[j]:
                c = pair_corr(oppt, roles[i], roles[j])
            else:
                c = 0.0
            if pos[i] in gpos and pos[j] in gpos:
                c += load * load
            C[i, j] = C[j, i] = c
    return C


def nearest_correlation(A: np.ndarray, tol: float = 1e-9, max_iter: int = 200) -> tuple[np.ndarray, float]:
    """Higham (2002) alternating projections onto {PSD} ∩ {unit diagonal}. Returns (matrix, max |adjustment|)."""
    X = (A + A.T) / 2
    Y = X.copy()
    dS = np.zeros_like(X)
    for _ in range(max_iter):
        R = Y - dS
        w, V = np.linalg.eigh(R)
        Xp = (V * np.maximum(w, 0)) @ V.T
        dS = Xp - R
        Y_new = Xp.copy()
        np.fill_diagonal(Y_new, 1.0)
        if np.linalg.norm(Y_new - Y, "fro") / max(np.linalg.norm(Y, "fro"), 1e-12) < tol:
            Y = Y_new
            break
        Y = Y_new
    # guarantee strict PSD for Cholesky: tiny eigenvalue floor then re-normalize the diagonal
    w, V = np.linalg.eigh((Y + Y.T) / 2)
    Y = (V * np.maximum(w, 1e-8)) @ V.T
    d = np.sqrt(np.diag(Y))
    Y = Y / np.outer(d, d)
    adj = float(np.max(np.abs(Y - X)))
    return Y, adj


def is_psd(C: np.ndarray, tol: float = -1e-10) -> bool:
    return bool(np.linalg.eigvalsh((C + C.T) / 2).min() >= tol)


def repaired_correlation(slate: pd.DataFrame, prior: dict, roles=None, mode: str = "classic") -> tuple[np.ndarray, float]:
    C = build_correlation(slate, prior, roles, mode)
    if is_psd(C, 1e-10):
        return C, 0.0
    R, adj = nearest_correlation(C)
    log.info("correlation matrix repaired to nearest PSD; largest adjustment %.4f", adj)
    return R, adj
