"""GPP module (Section 7): candidate generation, presets, player metrics. Defaults — calibrate.

Per-candidate objective: sum(value_i) - lambda * sum(log own_i). log(own) makes PRODUCT ownership linear.
  "sim-sampled" mode (preferred): one ILP per simulated slate outcome -> correlation is embedded in the pool.
  "rules" mode: sequential lineups on a fixed value vector with uniqueness U and exposure caps (Section 7.1).
Constraints from the sport's stack rules (presets.yaml `gpp.<preset>.rules`) plus:
  cumulative ownership band, product-ownership cap  sum(log own) <= log(P_max), >= k players under X% owned,
  salary floor, locks / excludes, global and per-player exposure, uniqueness vs earlier lineups.
"""
from __future__ import annotations

import os
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd
import pulp

from core.ingest import hard_rule_excludes
from core.lineup import Lineup, reorder_for_late_swap
from core.optimizer import InfeasibleError, LineupILP
from sports.base import SportConfig, load_sport

OWN_FLOOR = 0.001          # ownership floor for log(own)


@dataclass
class GPPSettings:
    preset: str
    lam: float
    cum_own_band: tuple[float, float] | None
    product_log_cap: float | None              # natural-log cap on sum(log own)
    min_under: int = 0
    under_pct: float = 0.0
    rules: dict = field(default_factory=dict)
    uniqueness_U: int | None = None
    min_salary: float = 49000
    max_exposure: float = 1.0
    player_exposure: dict[int, float] = field(default_factory=dict)


def gpp_settings(sport: SportConfig, preset: str = "mid_20max", **ov) -> GPPSettings:
    p = sport.preset("showdown").get("gpp") if preset == "showdown" else sport.preset("gpp", preset)
    if not p:
        raise ValueError(f"unknown GPP preset {preset}")
    po = p.get("product_own") or {}
    cap = None
    if po.get("log10_cap") is not None:
        cap = float(po["log10_cap"]) * np.log(10)
    s = GPPSettings(
        preset=preset, lam=float(p.get("lambda_log_own", 1.0)),
        cum_own_band=tuple(p["cum_own_band"]) if p.get("cum_own_band") else None,
        product_log_cap=cap, min_under=int(po.get("min_players_under", 0) or 0),
        under_pct=float(po.get("under_pct", 0.0) or 0.0), rules=dict(p.get("rules", {})),
        uniqueness_U=p.get("uniqueness_U"), min_salary=float(p.get("min_salary", 49000)))
    for k, v in ov.items():
        if v is not None:
            setattr(s, k, v)
    return s


def _own(slate: pd.DataFrame) -> np.ndarray:
    o = slate["ownership"].fillna(0).to_numpy(float) if "ownership" in slate else np.full(len(slate), 0.05)
    return np.clip(o, OWN_FLOOR, 1.0)


def objective_values(values: np.ndarray, own: np.ndarray, lam: float) -> np.ndarray:
    return np.asarray(values, dtype=float) - lam * np.log(np.clip(own, OWN_FLOOR, 1.0))


def captain_values(values: np.ndarray, slate: pd.DataFrame, spec, lam: float) -> dict | None:
    """Showdown: the captain coefficient is mult x points - lambda log(CPT ownership)."""
    if spec.captain_slot is None:
        return None
    mult = spec.slot_by_name(spec.captain_slot).points_mult
    if "cpt_ownership" in slate and slate["cpt_ownership"].notna().any():
        co = slate["cpt_ownership"].fillna(0).to_numpy(float)
    else:
        co = _own(slate) / 5.0              # rough fallback: CPT share ~ FLEX share / 5 (default — calibrate)
    return {spec.captain_slot: mult * np.asarray(values, dtype=float) - lam * np.log(np.clip(co, OWN_FLOOR, 1.0))}


def build_gpp_ilp(sport: SportConfig, slate: pd.DataFrame, st: GPPSettings, mode: str = "classic",
                  locks=(), excludes=(), engine: str = "cbc", gap_rel: float | None = 0.02) -> LineupILP:
    own = _own(slate)
    logo = np.log(own)

    def extra(ctx):
        xp = ctx.xp
        if st.cum_own_band:
            lo, hi = st.cum_own_band
            e = pulp.lpSum(float(own[i]) * v for i, v in xp.items())
            ctx.add(e >= lo, "cum_own_lo")
            ctx.add(e <= hi, "cum_own_hi")
        if st.product_log_cap is not None:
            ctx.add(pulp.lpSum(float(logo[i]) * v for i, v in xp.items()) <= st.product_log_cap, "prod_own")
        if st.min_under:
            under = [i for i in xp if own[i] < st.under_pct]
            ctx.add(pulp.lpSum(xp[i] for i in under) >= st.min_under, "min_under")

    ex = set(int(i) for i in excludes) | set(hard_rule_excludes(slate, sport))
    return LineupILP(sport, slate, mode, min_salary=st.min_salary, locks=locks, excludes=ex, rules=st.rules,
                     extra_constraints=extra, engine=engine, gap_rel=gap_rel)


# ------------------------------------------------------------- rules mode
def rules_generator(sport: SportConfig, slate: pd.DataFrame, st: GPPSettings, n: int, mode: str = "classic",
                    values: np.ndarray | None = None, locks=(), excludes=(), diversity: float = 0.25,
                    max_rounds: int = 8) -> list[Lineup]:
    """n lineups on a fixed value vector (default median) with uniqueness U and exposure caps.

    Uniqueness is enforced with LAZY cuts: solve, and only if the new lineup shares more than roster-U
    players with an earlier lineup add that cut and re-solve. A small diversity penalty (points per prior use
    of a player) steers the solver away from near-copies so few lazy cuts are needed. default — calibrate.
    """
    spec = sport.mode(mode)
    own = _own(slate)
    base = objective_values(slate["median"].to_numpy(float) if values is None else values, own, st.lam)
    ilp = build_gpp_ilp(sport, slate, st, mode, locks, excludes)
    max_shared = spec.roster_size - st.uniqueness_U if st.uniqueness_U else None
    counts = np.zeros(len(slate))
    cap_n = {i: int(np.floor(st.player_exposure.get(i, st.max_exposure) * n + 1e-9)) for i in range(len(slate))}
    out: list[Lineup] = []
    sets: list[set] = []
    for _ in range(n):
        raw = slate["median"].to_numpy(float) if values is None else values
        ilp._set_objective(base - diversity * counts, captain_values(raw - diversity * counts, slate, spec, st.lam))
        lu = None
        for _r in range(max_rounds):
            cand = ilp._solve_once()
            if cand is None:
                break
            ps = set(cand.players)
            bad = [k for k, o in enumerate(sets) if max_shared is not None and len(ps & o) > max_shared]
            if not bad and all(ps != o for o in sets):
                lu = cand
                break
            for k in bad:
                ilp.add_no_good(out[k], max_shared=max_shared)
            if not bad:
                ilp.add_no_good(cand)
        if lu is None:
            break
        out.append(lu)
        sets.append(set(lu.players))
        ilp.add_no_good(lu, max_shared=max_shared) if max_shared is not None else ilp.add_no_good(lu)
        for p in lu.players:
            counts[p] += 1
            if counts[p] >= cap_n[p] and p in ilp.xp:
                ilp.prob += ilp.xp[p] <= 0, f"exposure_{p}_{len(out)}"
    return [reorder_for_late_swap(lu, slate, spec) for lu in out]


# ------------------------------------------------------- sim-sampled mode
_W: dict = {}


def _worker_init(sport_dir: str, slate: pd.DataFrame, st: GPPSettings, mode: str, own: np.ndarray):
    sport = load_sport(sport_dir)
    _W.update(sport=sport, slate=slate, st=st, mode=mode, own=own, ilp=build_gpp_ilp(sport, slate, st, mode))


def _solve_rows(rows: np.ndarray) -> list[tuple]:
    ilp, own, st = _W["ilp"], _W["own"], _W["st"]
    out = []
    for v in rows:
        ilp._set_objective(objective_values(v, own, st.lam), captain_values(v, _W["slate"], ilp.spec, st.lam))
        lu = ilp._solve_once()
        if lu is not None:
            out.append(lu.players)
    return out


def candidate_pool(sport: SportConfig, slate: pd.DataFrame, sims: np.ndarray, st: GPPSettings, n: int,
                   mode: str = "classic", seed: int = 0, n_jobs: int | None = None) -> list[Lineup]:
    """Sim-sampled candidates: one ILP per simulated outcome (deduplicated)."""
    spec = sport.mode(mode)
    rng = np.random.default_rng(seed)
    rows = sims[rng.choice(sims.shape[0], size=min(n, sims.shape[0]), replace=n > sims.shape[0])].astype(float)
    own = _own(slate)
    n_jobs = n_jobs if n_jobs is not None else min(4, os.cpu_count() or 1)
    if n_jobs <= 1 or len(rows) < 40:
        _worker_init(str(sport.plugin_dir), slate, st, mode, own)
        res = _solve_rows(rows)
    else:
        chunks = np.array_split(rows, n_jobs * 4)
        with ProcessPoolExecutor(n_jobs, initializer=_worker_init,
                                 initargs=(str(sport.plugin_dir), slate, st, mode, own)) as ex:
            res = [p for part in ex.map(_solve_rows, chunks) for p in part]
    seen, out = set(), []
    for players in res:
        lu = Lineup(tuple(players), spec.name)
        k = lu.key(slate, spec)
        if k not in seen:
            seen.add(k)
            out.append(reorder_for_late_swap(lu, slate, spec))
    return out


# --------------------------------------------------------- player metrics
def optimal_pct(sport: SportConfig, slate: pd.DataFrame, sims: np.ndarray, n: int = 1000, mode: str = "classic",
                seed: int = 0, n_jobs: int | None = None) -> np.ndarray:
    """Share of sims in which each player is in the sim-optimal lineup (ILP on an n-sim subsample)."""
    st = GPPSettings("optimal", lam=0.0, cum_own_band=None, product_log_cap=None, rules={}, min_salary=0)
    lus = []
    rng = np.random.default_rng(seed)
    rows = sims[rng.choice(sims.shape[0], size=min(n, sims.shape[0]), replace=False)].astype(float)
    n_jobs = n_jobs if n_jobs is not None else min(4, os.cpu_count() or 1)
    own = np.ones(len(slate))
    if n_jobs <= 1 or len(rows) < 40:
        _worker_init(str(sport.plugin_dir), slate, st, mode, own)
        res = _solve_rows(rows)
    else:
        with ProcessPoolExecutor(n_jobs, initializer=_worker_init,
                                 initargs=(str(sport.plugin_dir), slate, st, mode, own)) as ex:
            res = [p for part in ex.map(_solve_rows, np.array_split(rows, n_jobs * 4)) for p in part]
    c = np.zeros(len(slate))
    for players in res:
        c[list(players)] += 1
    return c / max(len(res), 1)


def leverage_table(slate: pd.DataFrame, opt: np.ndarray, own: np.ndarray | None = None) -> pd.DataFrame:
    own = _own(slate) if own is None else own
    return pd.DataFrame({"name": slate["name"], "team": slate["team"], "position": slate["position"],
                         "salary": slate["salary"], "own": own.round(4), "optimal": opt.round(4),
                         "leverage": (opt - own).round(4), "leverage_ratio": (opt / np.maximum(own, 1e-4)).round(2)}
                        ).sort_values("leverage", ascending=False)


# ------------------------------------------------------------- end to end
@dataclass
class GPPRun:
    portfolio: object
    candidates: list[Lineup]
    field: object
    optimal: np.ndarray | None
    leverage: pd.DataFrame | None
    info: dict = field(default_factory=dict)


def run_gpp(sport: SportConfig, slate: pd.DataFrame, sims: np.ndarray, contest, n_lineups: int,
            preset: str = "mid_20max", mode: str = "classic", n_candidates: int = 1000, field_pool: int = 5000,
            select_sims: int = 4000, seed: int = 0, optimal_sims: int = 0, max_exposure: float | None = None,
            n_jobs: int | None = None, field_sample=None, **ov) -> GPPRun:
    """Candidate pool -> GPP field -> greedy portfolio by simulated payout -> report."""
    from core.field import fit_field
    from core.payouts import FieldDistribution
    from core.portfolio import report, select_portfolio
    from core.cash_sim import lineup_scores
    import time

    t0 = time.time()
    spec = sport.mode(mode)
    st = gpp_settings(sport, preset, **ov)
    port_cfg = sport.preset("gpp").get("portfolio", {})
    cands = candidate_pool(sport, slate, sims, st, n_candidates, mode, seed, n_jobs)
    t1 = time.time()
    own = slate["ownership"].fillna(0).to_numpy(float)
    fld = field_sample or fit_field(slate, sport, own, field_pool, "gpp", mode, seed)
    t2 = time.time()
    rng = np.random.default_rng(seed)
    rows = rng.choice(sims.shape[0], size=min(select_sims, sims.shape[0]), replace=False)
    sub = sims[rows]
    from core.field import scores as field_scores
    fd = FieldDistribution(field_scores(fld, sub), fld.w())
    S = lineup_scores(cands, sub, spec)
    t3 = time.time()
    res = select_portfolio(S, cands, fd, contest, n_lineups,
                           max_exposure if max_exposure is not None else float(port_cfg.get("max_exposure", 1.0)),
                           int(port_cfg.get("max_shared_players", spec.roster_size - 3)),
                           shortlist=int(port_cfg.get("shortlist", 25)), approx_sims=port_cfg.get("approx_sims"))
    t4 = time.time()
    opt = optimal_pct(sport, slate, sims, optimal_sims, mode, seed, n_jobs) if optimal_sims else None
    res = report(res, S, fd, contest, slate, spec, fld, opt)
    lev = leverage_table(slate, opt) if opt is not None else None
    return GPPRun(res, cands, fld, opt, lev, {"t_candidates": round(t1 - t0, 1), "t_field": round(t2 - t1, 1),
                                               "t_scoring": round(t3 - t2, 1), "t_select": round(t4 - t3, 1),
                                               "n_candidates": len(cands), "preset": preset})


def score_candidates(candidates: list[Lineup], field, sims: np.ndarray, contest, spec, n_field: int | None = None,
                     chunk: int = 500) -> np.ndarray:
    """Standalone expected winnings (n_sims, C) float32 for each candidate vs the weighted field, chunked over
    sims so 10k sims x 20k field lineups never materialise at once."""
    from core.cash_sim import incidence
    from core.payouts import FieldDistribution, standalone

    n_field = n_field if n_field is not None else contest.field_size - 1
    Wc = incidence(candidates, sims.shape[1], spec)
    Wf = field.incidence()
    w = field.w()
    pv = contest.payout_vector()
    out = np.empty((sims.shape[0], len(candidates)), dtype=np.float32)
    for s in range(0, sims.shape[0], chunk):
        e = min(sims.shape[0], s + chunk)
        blk = sims[s:e]
        fs = np.asarray((Wf.T @ blk.T).T, dtype=np.float32)
        cs = np.asarray((Wc.T @ blk.T).T, dtype=np.float32)
        out[s:e] = standalone(cs, FieldDistribution(fs, w), n_field, pv)
    return out
