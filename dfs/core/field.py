"""Field models (Section 5.3): a GPP field and a cash field. Defaults — calibrate.

Each entrant:
  1. per-position selection probabilities ~ Dirichlet(kappa * own_pos)    (Haugh–Singal)
  2. with prob q the entrant is a "stacker": the sport's field_stack hook forces players (NFL: QB + WR, ...)
  3. remaining slots sampled ~ the entrant's probabilities, budget-aware; reject infeasible lineups and
     lineups below the salary floor B_lb
Cash field: kappa high (field converges on chalk), q lower, higher B_lb, and — when consensus_cash.csv lineups
exist — with prob consensus_p the entrant plays a consensus lineup with 0..max_pivots value pivots.
fit_field() adjusts the sampling base so simulated ownership lands within tolerance_pp of the input.
Duplicates: sorted player IDs hash (Lineup.key); in Showdown the captain is part of the hash.
"""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from scipy import sparse

from core.lineup import Lineup, eligibility_matrix, is_valid
from sports.base import ModeSpec, SportConfig


class LineupSampler:
    """Fast budget-aware sampler with optional forced players."""

    def __init__(self, slate: pd.DataFrame, spec: ModeSpec):
        self.slate, self.spec = slate, spec
        names, elig = eligibility_matrix(slate, spec)
        self.elig = elig
        self.slot_col = [names.index(s.name) for s in spec.slots]
        base = slate["salary"].to_numpy(float)
        self.sal = []
        for s in spec.slots:
            if s.salary_mult != 1.0:
                cs = slate["cpt_salary"].to_numpy(float) if "cpt_salary" in slate else base * s.salary_mult
                self.sal.append(np.where(np.isnan(cs), base * s.salary_mult, cs))
            else:
                self.sal.append(base)
        self.pools = [np.flatnonzero(elig[:, c]) for c in self.slot_col]
        self.min_sal = [float(self.sal[k][self.pools[k]].min()) if len(self.pools[k]) else np.inf
                        for k in range(spec.roster_size)]
        self.order = sorted(range(spec.roster_size), key=lambda k: len(self.pools[k]))
        self.teams = slate["team"].to_numpy()
        self.games = slate["game_id"].to_numpy()

    def sample(self, rng, w: np.ndarray, forced: list[int] | None = None, min_salary: float = 0.0,
               max_tries: int = 200) -> Lineup | None:
        spec = self.spec
        for _ in range(max_tries):
            chosen = [-1] * spec.roster_size
            used = np.zeros(len(w), dtype=bool)
            spent = 0.0
            ok = True
            # place forced players into their most restrictive open eligible slot
            for p in forced or []:
                slots = [k for k in self.order if chosen[k] < 0 and self.elig[p, self.slot_col[k]]]
                if spec.captain_slot is not None:   # never force into the captain slot implicitly
                    slots = [k for k in slots if spec.slots[k].name != spec.captain_slot] or slots
                if not slots:
                    ok = False
                    break
                k = slots[0]
                chosen[k], used[p] = p, True
                spent += self.sal[k][p]
            if not ok:
                return None
            # random fill order: a fixed order would always squeeze the last slot (e.g. FLEX) to min salary
            open_slots = [k for k in rng.permutation(spec.roster_size) if chosen[k] < 0]
            for idx, k in enumerate(open_slots):
                reserve = sum(self.min_sal[j] for j in open_slots[idx + 1:])
                pool = self.pools[k]
                cand = pool[~used[pool] & (self.sal[k][pool] <= spec.salary_cap - spent - reserve + 1e-9)]
                if not len(cand):
                    ok = False
                    break
                pw = w[cand]
                tot = pw.sum()
                p = int(rng.choice(cand, p=pw / tot)) if tot > 0 else int(rng.choice(cand))
                chosen[k], used[p] = p, True
                spent += self.sal[k][p]
            if not ok or spent < min_salary:
                continue
            idx = np.array(chosen)
            if len(set(self.teams[idx])) < spec.min_teams or len(set(self.games[idx])) < spec.min_games:
                continue
            lu = Lineup(tuple(chosen), spec.name)
            if spec.max_per_team is None and not spec.min_per_team or is_valid(lu, self.slate, spec):
                return lu
        return None


def sample_batch(sampler: "LineupSampler", rng, W: np.ndarray, forced: list[list[int] | None],
                 min_salary: float = 0.0, W_slot: dict[int, np.ndarray] | None = None) -> np.ndarray:
    """Vectorized: one lineup per row of W (B x n_players weights). Returns (B x roster) indices, -1 rows = failed."""
    sp, spec = sampler, sampler.spec
    B, R = W.shape[0], spec.roster_size
    chosen = np.full((B, R), -1, dtype=np.int64)
    used = np.zeros(W.shape, dtype=bool)
    spent = np.zeros(B)
    failed = np.zeros(B, dtype=bool)
    for b, fl in enumerate(forced):
        for p in fl or []:
            slots = [k for k in sp.order if chosen[b, k] < 0 and sp.elig[p, sp.slot_col[k]]]
            if spec.captain_slot is not None:
                slots = [k for k in slots if spec.slots[k].name != spec.captain_slot] or slots
            if not slots:
                failed[b] = True
                break
            chosen[b, slots[0]] = p
            used[b, p] = True
            spent[b] += sp.sal[slots[0]][p]
    perm = rng.permutation(R)          # random fill order per batch (no slot is always squeezed last)
    min_sal = np.array(sp.min_sal)
    for idx, k in enumerate(perm):
        need = (chosen[:, k] < 0) & ~failed
        if not need.any():
            continue
        later = perm[idx + 1:]
        reserve = (chosen[:, later] < 0).astype(float) @ min_sal[later] if len(later) else np.zeros(B)
        pool = sp.pools[k]
        afford = sp.sal[k][pool][None, :] <= (spec.salary_cap - spent - reserve)[:, None] + 1e-9
        mask = afford & ~used[:, pool]
        w = (W_slot or {}).get(k, W)[:, pool] * mask
        tot = w.sum(1)
        failed |= need & (tot <= 0)          # nothing the entrant would play fits -> resample that entrant
        ok = need & ~failed
        cum = np.cumsum(w, 1)
        r = rng.random(B) * tot
        pick = np.minimum((cum < r[:, None]).sum(1), len(pool) - 1)
        rows = np.flatnonzero(ok)
        pl = pool[pick[rows]]
        chosen[rows, k] = pl
        used[rows, pl] = True
        spent[rows] += sp.sal[k][pl]
    failed |= spent < min_salary
    # team / game diversity
    for arr, need_n in ((sp.teams, spec.min_teams), (sp.games, spec.min_games)):
        if need_n > 1:
            codes = pd.factorize(arr)[0]
            c = np.sort(codes[np.clip(chosen, 0, None)], axis=1)
            distinct = 1 + (np.diff(c, axis=1) != 0).sum(1)
            failed |= distinct < need_n
    if spec.min_per_team:
        codes = pd.factorize(sp.teams)[0]
        tc = codes[np.clip(chosen, 0, None)]
        for t in np.unique(codes):
            failed |= (tc == t).sum(1) < spec.min_per_team
    if spec.max_per_team is not None:
        for b in np.flatnonzero(~failed):
            if not is_valid(Lineup(tuple(chosen[b]), spec.name), sp.slate, spec):
                failed[b] = True
    chosen[failed] = -1
    return chosen


@dataclass
class FieldSample:
    lineups: list[Lineup]
    spec: ModeSpec
    n_players: int
    kind: str
    sampling_own: np.ndarray | None = None
    info: dict = field(default_factory=dict)
    weights: np.ndarray | None = None      # acceptance weights (raked); None = equal

    def w(self) -> np.ndarray:
        n = len(self.lineups)
        return np.ones(n) / n if self.weights is None else self.weights / self.weights.sum()

    def incidence(self) -> sparse.csr_matrix:
        """(n_players x M) with the points multiplier of the slot each player occupies."""
        rows, cols, vals = [], [], []
        mult = [s.points_mult for s in self.spec.slots]
        for m, lu in enumerate(self.lineups):
            for p, k in zip(lu.players, mult):
                rows.append(p)
                cols.append(m)
                vals.append(k)
        return sparse.csr_matrix((np.array(vals, dtype=np.float32), (rows, cols)),
                                 shape=(self.n_players, len(self.lineups)))

    @property
    def n_own(self) -> int:
        """Length of the ownership vector: n players, or 2n in Showdown ([FLEX..., CPT...])."""
        return self.n_players * (2 if self.spec.captain_slot else 1)

    def binary_incidence(self) -> sparse.csr_matrix:
        cap = [s.name == self.spec.captain_slot for s in self.spec.slots]
        n = self.n_players
        rows = [p + (n if c else 0) for lu in self.lineups for p, c in zip(lu.players, cap)]
        cols = [m for m, lu in enumerate(self.lineups) for _ in lu.players]
        return sparse.csr_matrix((np.ones(len(rows), dtype=np.float32), (rows, cols)),
                                 shape=(self.n_own, len(self.lineups)))

    def ownership(self, weighted: bool = True) -> np.ndarray:
        A = self.binary_incidence()
        w = self.w() if weighted else np.ones(len(self.lineups)) / max(len(self.lineups), 1)
        return np.asarray(A @ w).ravel()

    def draw(self, rng, size) -> np.ndarray:
        """Indices of field lineups drawn as contest opponents (in proportion to acceptance weights)."""
        return rng.choice(len(self.lineups), size=size, p=self.w())

    def duplicates(self, slate: pd.DataFrame) -> Counter:
        return Counter(lu.key(slate, self.spec) for lu in self.lineups)

    def entropy(self, slate: pd.DataFrame) -> float:
        """Mean per-position selection entropy (nats). Lower = more concentrated field."""
        own = self.ownership()[: self.n_players]
        out = []
        for pos, idx in slate.groupby("position").indices.items():
            f = own[idx]
            f = f[f > 0] / f.sum() if f.sum() > 0 else f[f > 0]
            out.append(float(-(f * np.log(f)).sum()))
        return float(np.mean(out))


def scores(field_sample: FieldSample, sims: np.ndarray) -> np.ndarray:
    """(n_sims x M) field lineup scores = sims @ incidence."""
    W = field_sample.incidence()
    return np.asarray((W.T @ sims.T).T, dtype=np.float32)


def field_config(sport: SportConfig, kind: str, **overrides) -> dict:
    cfg = dict(sport.preset("field").get(kind, {}))
    cfg.update({k: v for k, v in overrides.items() if v is not None})
    return cfg


def _pivot(lu: Lineup, rng, sampler: LineupSampler, w: np.ndarray, n_pivots: int) -> Lineup:
    spec = sampler.spec
    players = list(lu.players)
    for _ in range(n_pivots):
        k = int(rng.integers(spec.roster_size))
        spent = sum(sampler.sal[j][players[j]] for j in range(spec.roster_size)) - sampler.sal[k][players[k]]
        pool = sampler.pools[k]
        mask = ~np.isin(pool, players) & (sampler.sal[k][pool] <= spec.salary_cap - spent)
        cand = pool[mask]
        if not len(cand):
            continue
        pw = w[cand]
        players[k] = int(rng.choice(cand, p=pw / pw.sum())) if pw.sum() > 0 else int(rng.choice(cand))
    new = Lineup(tuple(players), spec.name)
    return new if is_valid(new, sampler.slate, spec) else lu


def generate_field(slate: pd.DataFrame, sport: SportConfig, own: np.ndarray, n: int, kind: str = "gpp",
                   mode: str = "classic", rng: np.random.Generator | None = None,
                   consensus: list[Lineup] | None = None, cfg: dict | None = None,
                   sampler: LineupSampler | None = None) -> FieldSample:
    rng = rng or np.random.default_rng(0)
    spec = sport.mode(mode)
    cfg = cfg or field_config(sport, kind)
    kappa = float(cfg.get("kappa", 200))
    q = float(cfg.get("stacker_q", 0.0))
    floor = float(cfg.get("showdown_salary_floor" if spec.captain_slot else "salary_floor", 0))
    cons_p = float(cfg.get("consensus_p", 0.0)) if consensus else 0.0
    max_piv = int(cfg.get("max_pivots", 2))
    sampler = sampler or LineupSampler(slate, spec)
    own = np.clip(np.asarray(own, dtype=float), 1e-7, None)
    n_pl = len(slate)
    cpt_own = None
    if spec.captain_slot is not None:
        if len(own) == 2 * n_pl:
            own, cpt_own = own[:n_pl], own[n_pl:]
        else:                                   # no CPT ownership given: proportional to FLEX (default — calibrate)
            cpt_own = own / own.sum()
    cap_k = [k for k, sl in enumerate(spec.slots) if sl.name == spec.captain_slot]
    groups = list(slate.groupby("position").indices.values())
    stack_fn = sport.field_stack if mode == "classic" else None
    batch_fn = sport.field_stack_batch if mode == "classic" else None
    out: list[Lineup] = []
    attempts = 0
    batch = 128                        # each batch gets its own random fill order
    while len(out) < n and attempts < n * 20:
        B = min(batch, max(64, int((n - len(out)) * 1.3)))
        attempts += B
        is_cons = rng.random(B) < cons_p if cons_p else np.zeros(B, dtype=bool)
        for _ in range(int(is_cons.sum())):
            base = consensus[int(rng.integers(len(consensus)))]
            out.append(_pivot(base, rng, sampler, own, int(rng.integers(0, max_piv + 1))))
        Bd = int((~is_cons).sum())
        if Bd == 0:
            continue
        W = np.zeros((Bd, len(own)))
        for idx in groups:
            tot = own[idx].sum()
            W[:, idx] = rng.dirichlet(kappa * own[idx] / tot, size=Bd) * tot
        W_slot = None
        if cpt_own is not None:
            Wc = rng.dirichlet(kappa * cpt_own / cpt_own.sum(), size=Bd) * cpt_own.sum()
            W_slot = {k: Wc for k in cap_k}
        stacker = rng.random(Bd) < q if stack_fn else np.zeros(Bd, dtype=bool)
        if batch_fn is not None:
            forced = batch_fn(slate, rng, W, cfg, stacker)
        else:
            forced = [stack_fn(slate, rng, W[b], cfg) if stacker[b] else None for b in range(Bd)]
        res = sample_batch(sampler, rng, W, forced, floor, W_slot)
        out.extend(Lineup(tuple(int(x) for x in row), spec.name) for row in res if row[0] >= 0)
    out = out[:n]
    return FieldSample(out, spec, len(slate), kind, own, {"attempts": attempts, "cfg": cfg})


def rake_weights(fs: FieldSample, target: np.ndarray, iters: int = 200, bound: float = 20.0) -> np.ndarray:
    """Acceptance weights so weighted field ownership matches target (multiplicative raking)."""
    A = fs.binary_incidence().tocsc()          # players x M
    At = A.T.tocsr()
    M = A.shape[1]
    w = np.ones(M)
    k = np.asarray(At.sum(1)).ravel()          # roster size per lineup
    for _ in range(iters):
        own = np.asarray(A @ (w / w.sum())).ravel()
        ratio = np.where(own > 0, (target + 1e-6) / (own + 1e-6), 1.0)
        logr = np.log(np.clip(ratio, 0.2, 5.0))
        step = np.exp(np.asarray(At @ logr).ravel() / k)
        w = np.clip(w * step, 1 / bound, bound)
        if np.max(np.abs(own - target)) < 1e-3:
            break
    return w


def fit_field(slate: pd.DataFrame, sport: SportConfig, target_own: np.ndarray, n: int, kind: str = "gpp",
              mode: str = "classic", seed: int = 0, consensus: list[Lineup] | None = None,
              cfg: dict | None = None) -> FieldSample:
    """Iteratively reweight the sampling base so simulated ownership is within tolerance_pp of target_own."""
    cfg = cfg or field_config(sport, kind)
    fit = sport.preset("field").get("fit", {})
    iters, tol = int(fit.get("iterations", 8)), float(fit.get("tolerance_pp", 1.5)) / 100
    target = np.clip(np.asarray(target_own, dtype=float), 0, None)
    base = np.clip(target, 1e-6, None).copy()
    sampler = LineupSampler(slate, sport.mode(mode))
    n_fit = int(fit.get("fit_sample", 6000))
    best_base, best_err = base.copy(), np.inf
    for it in range(iters):
        fs = generate_field(slate, sport, base, n_fit, kind, mode, np.random.default_rng(seed + it), consensus, cfg,
                            sampler)
        sim = fs.ownership()
        err = float(np.max(np.abs(sim - target)))
        if err < best_err:
            best_base, best_err = base.copy(), err
        if err <= tol * 0.7:
            break
        ratio = (target + 0.002) / (sim + 0.002)
        base = np.clip(base * ratio ** (1.0 if it < 3 else 0.6), 1e-7, None)
    best = generate_field(slate, sport, best_base, n, kind, mode, np.random.default_rng(seed + 1000), consensus,
                          cfg, sampler)
    best.info["max_own_error_unweighted"] = float(np.max(np.abs(best.ownership(weighted=False) - target)))
    best.weights = rake_weights(best, target)
    best_err = float(np.max(np.abs(best.ownership() - target)))
    sal = slate["salary"].to_numpy(float)
    if len(target) == 2 * len(slate):
        cs = slate["cpt_salary"].to_numpy(float) if "cpt_salary" in slate else sal * 1.5
        sal = np.r_[sal, cs]
    implied = float((target * sal).sum())
    best.info.update({"max_own_error": best_err, "iterations": it + 1, "implied_avg_salary": implied,
                      "feasible_target": implied <= sport.mode(mode).salary_cap})
    return best
