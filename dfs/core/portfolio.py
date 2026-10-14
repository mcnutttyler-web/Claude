"""GPP portfolio selection (Section 7.3) — greedy, submodular (Haugh & Singal; Hunter et al.).

Each step adds the candidate with the largest MARGINAL increase in portfolio expected payout, with ranks
recomputed including the lineups already chosen (own entries compete and split ties). A fast approximation
shortlists candidates; the shortlist is re-scored exactly; the step is taken only if the exact marginal > 0,
so expected payout never decreases. Respects exposure caps, the overlap limit and max_entries.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from core.contest import Contest
from core.field import FieldSample
from core.lineup import Lineup, lineup_points, lineup_salary
from core.payouts import FieldDistribution, PayoutCurve, standalone, vs_field


@dataclass
class PortfolioResult:
    chosen: list[int]                  # candidate indices, in selection order
    lineups: list[Lineup]
    expected_payout: list[float]       # portfolio E[payout] after each addition
    report: dict = field(default_factory=dict)
    lineup_table: pd.DataFrame = field(default_factory=pd.DataFrame)
    exposure: pd.DataFrame = field(default_factory=pd.DataFrame)
    stacks: pd.DataFrame = field(default_factory=pd.DataFrame)


def portfolio_payout(X: np.ndarray, fd: FieldDistribution, n_field: int, payouts: np.ndarray) -> np.ndarray:
    """Exact (given the field distribution) winnings (n_sims, k) for a set of our entries."""
    return vs_field(X, fd, n_field, payouts, own_compete=True)


def _exact(X: np.ndarray, above_f: np.ndarray, ties_f: np.ndarray, curve: PayoutCurve) -> float:
    """Portfolio E[payout] from precomputed field terms (columns = our entries); own entries compete."""
    above = above_f + (X[:, None, :] > X[:, :, None]).sum(2)
    ties = ties_f + (X[:, None, :] == X[:, :, None]).sum(2)
    return float(curve.avg(above, ties).sum(1).mean())


def caps_get(caps, p, default):
    return (caps or {}).get(p, default)


def select_portfolio(cand_scores: np.ndarray, candidates: list[Lineup], fd: FieldDistribution, contest: Contest,
                     n: int, max_exposure: float = 1.0, max_shared: int | None = None,
                     player_caps: dict[int, float] | None = None, shortlist: int = 25,
                     n_field: int | None = None, approx_sims: int | None = None) -> PortfolioResult:
    payouts = contest.payout_vector()
    n = min(n, contest.max_entries)
    n_field = n_field if n_field is not None else contest.field_size - n
    curve = PayoutCurve(payouts)
    S, C = cand_scores.shape
    X = np.round(cand_scores.astype(np.float64), fd.decimals)
    gt, eq = fd.above_and_equal(X)
    above_field, ties_field = n_field * gt, n_field * eq
    # approximation (shortlist ranking) runs on a sim subsample; exact marginals use all sims
    Sa = S if approx_sims is None else min(S, approx_sims)
    Xa, af_a, tf_a = X[:Sa], above_field[:Sa], ties_field[:Sa]
    own_above = np.zeros((Sa, C))
    damage = np.zeros((Sa, C))
    n_players = 1 + max(max(lu.players) for lu in candidates)
    B = np.zeros((C, n_players), dtype=np.int16)
    for k, lu in enumerate(candidates):
        B[k, list(lu.players)] = 1
    max_shared_seen = np.zeros(C, dtype=np.int16)
    cnt = np.zeros(n_players)
    cap_vec = np.array([np.floor(caps_get(player_caps, p, max_exposure) * min(n, contest.max_entries) + 1e-9)
                        for p in range(n_players)])
    # exact incremental state for chosen entries
    A = np.zeros((S, 0)); T = np.zeros((S, 0)); P = np.zeros((S, 0))
    chosen: list[int] = []
    sets: list[set] = []
    counts: dict[int, int] = {}
    caps = player_caps or {}
    history: list[float] = []
    current = 0.0
    while len(chosen) < n:
        ok = np.ones(C, dtype=bool)
        ok[chosen] = False
        blocked = np.flatnonzero(cnt + 1 > cap_vec)
        if len(blocked):
            ok &= B[:, blocked].sum(1) == 0
        if max_shared is not None and chosen:
            ok &= max_shared_seen <= max_shared
        if not ok.any():
            break
        approx = (curve.avg(af_a + own_above, tf_a + 1.0) - damage).mean(0)
        approx[~ok] = -np.inf
        short = [int(k) for k in np.argsort(-approx)[:shortlist] if np.isfinite(approx[k])]
        xj = X[:, chosen]
        best = None
        for k in short:                               # exact marginal (own entries compete, ties split)
            xc = X[:, k]
            a_c = above_field[:, k] + (xj > xc[:, None]).sum(1)
            t_c = ties_field[:, k] + 1 + (xj == xc[:, None]).sum(1)
            self_pay = curve.avg(a_c, t_c)
            passes = xc[:, None] > xj
            eqs = xc[:, None] == xj
            newP = curve.avg(A + passes, T + eqs) if chosen else P
            marginal = float((self_pay + (newP - P).sum(1)).mean())
            if marginal > 1e-9 and (best is None or marginal > best[0]):
                best = (marginal, k, a_c, t_c, self_pay, passes, eqs, newP)
        if best is None:
            break
        marginal, k, a_c, t_c, self_pay, passes, eqs, newP = best
        if chosen:
            A, T, P = A + passes, T + eqs, newP
        A, T, P = np.c_[A, a_c], np.c_[T, t_c], np.c_[P, self_pay]
        xk = Xa[:, k][:, None]
        own_above += (xk > Xa)
        delta = curve.avg(a_c[:Sa], t_c[:Sa]) - curve.avg(a_c[:Sa] + 1, t_c[:Sa])
        damage += (Xa > xk) * delta[:, None]
        chosen.append(k)
        max_shared_seen = np.maximum(max_shared_seen, (B @ B[k]).astype(np.int16))
        cnt[list(candidates[k].players)] += 1
        current += marginal
        history.append(current)
    return PortfolioResult(chosen, [candidates[k] for k in chosen], history)


def dupes_in_field(lus: list[Lineup], field: FieldSample, slate, n_field: int) -> np.ndarray:
    w = field.w()
    idx: dict = {}
    for m, lu in enumerate(field.lineups):
        k = lu.key(slate, field.spec)
        idx[k] = idx.get(k, 0.0) + w[m]
    return np.array([n_field * idx.get(lu.key(slate, field.spec), 0.0) for lu in lus])


def report(res: PortfolioResult, cand_scores: np.ndarray, fd: FieldDistribution, contest: Contest, slate,
           spec, field: FieldSample, optimal: np.ndarray | None = None, n_field: int | None = None) -> PortfolioResult:
    if not res.chosen:
        return res
    n_field = n_field if n_field is not None else contest.field_size - len(res.chosen)
    X = cand_scores[:, res.chosen]
    win = portfolio_payout(X, fd, n_field, contest.payout_vector())
    fee = contest.entry_fee
    tot = win.sum(1)
    top1 = max(1, int(np.ceil(0.01 * contest.field_size)))
    gt, _ = fd.above_and_equal(X)
    rank = 1 + n_field * gt
    own = slate["ownership"].fillna(0).to_numpy(float) if "ownership" in slate else np.zeros(len(slate))
    dup = dupes_in_field(res.lineups, field, slate, n_field)
    names = slate["name"].to_numpy()
    rows = []
    for j, lu in enumerate(res.lineups):
        rows.append({"lineup": " | ".join(f"{s.name}:{names[p]}" for s, p in zip(spec.slots, lu.players)),
                     "salary": int(round(lineup_salary(lu, slate, spec))),
                     "median": round(lineup_points(lu, slate["median"].to_numpy(float), spec), 2),
                     "p90": round(float(np.percentile(X[:, j], 90)), 2),
                     "cum_own": round(float(own[list(lu.players)].sum()), 3),
                     "log10_prod_own": round(float(np.log10(np.clip(own[list(lu.players)], 1e-3, 1)).sum()), 2),
                     "exp_dupes": round(float(dup[j]), 3),
                     "sim_roi": round(float(win[:, j].mean() / fee - 1), 4),
                     "win%": round(float((rank[:, j] < 1.5).mean()), 5),
                     "top1%": round(float((rank[:, j] <= top1).mean()), 4),
                     "cash%": round(float((win[:, j] > 0).mean()), 4),
                     "stack": _stack_label(lu, slate)})
    res.lineup_table = pd.DataFrame(rows)
    cnt = np.zeros(len(slate))
    for lu in res.lineups:
        cnt[list(lu.players)] += 1
    exp = pd.DataFrame({"name": names, "team": slate["team"], "position": slate["position"],
                        "my_exposure": cnt / len(res.lineups), "field_own": own})
    if optimal is not None:
        exp["optimal"] = optimal
    res.exposure = exp[exp["my_exposure"] > 0].sort_values("my_exposure", ascending=False).round(4)
    res.stacks = (res.lineup_table.groupby("stack").size().rename("lineups").reset_index()
                  .sort_values("lineups", ascending=False))
    res.report = {"n_lineups": len(res.lineups), "entry_fees": fee * len(res.lineups),
                  "expected_payout": round(float(tot.mean()), 2),
                  "portfolio_roi": round(float(tot.mean() / (fee * len(res.lineups)) - 1), 4),
                  "p_any_top1pct": round(float((rank <= top1).any(1).mean()), 4),
                  "mean_exp_dupes": round(float(dup.mean()), 3)}
    return res


def _stack_label(lu: Lineup, slate) -> str:
    pos = slate["position"].to_numpy()
    team = slate["team"].to_numpy()
    opp = slate["opp"].to_numpy()
    qbs = [p for p in lu.players if pos[p] == "QB"]
    if not qbs:
        return "none"
    t, o = team[qbs[0]], opp[qbs[0]]
    mates = sum(1 for p in lu.players if team[p] == t and pos[p] in ("WR", "TE", "RB") )
    bb = sum(1 for p in lu.players if team[p] == o and pos[p] in ("WR", "TE", "RB"))
    return f"{t} QB+{mates}" + (f" / {o}+{bb}" if bb else "")
