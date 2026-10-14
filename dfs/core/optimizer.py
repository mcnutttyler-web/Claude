"""Sport-agnostic ILP lineup builder (PuLP + CBC).

Slots, eligibility, cap and team/game rules come from a ModeSpec. Sport-specific constraints
(stacks, DST blocks, ...) are added by the sport plugin's rules.build_constraints(ctx, options).

Variables: x[i, s] = 1 if player i fills a slot named s (identical slots, e.g. RB/RB, are aggregated
to remove symmetry). xp[i] = sum_s x[i, s] is "player i is rostered".
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Iterable, Sequence

import numpy as np
import pandas as pd
import pulp
from scipy import sparse
from scipy.optimize import Bounds, LinearConstraint, milp

from core.lineup import Lineup, eligibility_matrix, slot_salary
from sports.base import ModeSpec, SportConfig

log = logging.getLogger(__name__)


class InfeasibleError(RuntimeError):
    pass


@dataclass
class ILPContext:
    """What a sport plugin sees when adding constraints. Never exposes core internals beyond this."""

    prob: pulp.LpProblem
    slate: pd.DataFrame
    spec: ModeSpec
    x: dict[tuple[int, str], pulp.LpVariable]
    xp: dict[int, pulp.LpAffineExpression]
    roles: pd.Series
    _n: int = 0
    objective_extra: list = field(default_factory=list)

    def players(self, positions: Iterable[str] | None = None, team: str | None = None,
                teams: Iterable[str] | None = None, roles: Iterable[str] | None = None,
                game_id: str | None = None) -> list[int]:
        df = self.slate
        m = np.ones(len(df), dtype=bool)
        if positions is not None:
            m &= df["position"].isin(list(positions)).to_numpy()
        if team is not None:
            m &= (df["team"] == team).to_numpy()
        if teams is not None:
            m &= df["team"].isin(list(teams)).to_numpy()
        if roles is not None:
            m &= self.roles.isin(list(roles)).to_numpy()
        if game_id is not None:
            m &= (df["game_id"] == game_id).to_numpy()
        return [int(i) for i in np.flatnonzero(m) if int(i) in self.xp]

    def sum_xp(self, idx: Iterable[int]) -> pulp.LpAffineExpression:
        return pulp.lpSum(self.xp[i] for i in idx if i in self.xp)

    def captain_expr(self, i: int):
        if self.spec.captain_slot is None:
            return 0
        return self.x.get((i, self.spec.captain_slot), 0)

    def add(self, constraint, name: str | None = None) -> None:
        self._n += 1
        self.prob += constraint, f"{name or 'c'}_{self._n}"

    def new_var(self, name: str, cat: str = "Binary", low: float | None = 0, up: float | None = None):
        self._n += 1
        return pulp.LpVariable(f"{name}_{self._n}", lowBound=low, upBound=up, cat=cat)


class LineupILP:
    """Build once, re-solve many times with different objectives / extra cuts."""

    def __init__(
        self,
        sport: SportConfig,
        slate: pd.DataFrame,
        mode: str = "classic",
        *,
        min_salary: float = 0.0,
        max_salary: float | None = None,
        locks: Iterable[int] = (),
        slot_locks: Iterable[tuple[str, int]] = (),
        excludes: Iterable[int] = (),
        rules: dict[str, Any] | None = None,
        extra_constraints: Callable[[ILPContext], None] | None = None,
        time_limit: float | None = 30,
        gap_rel: float | None = None,             # relative MIP gap (None = prove optimality)
        engine: str = "cbc",                 # "highs" = scipy in-process HiGHS (no subprocess)
    ):
        self.sport = sport
        self.spec: ModeSpec = sport.mode(mode)
        self.slate = slate.reset_index(drop=True)
        self.time_limit = time_limit
        self.rules = dict(rules or {})
        excl = set(int(i) for i in excludes)

        names, elig = eligibility_matrix(self.slate, self.spec)
        self.slot_names = names
        counts = self.spec.slot_counts()
        prob = pulp.LpProblem("lineup", pulp.LpMaximize)
        x: dict[tuple[int, str], pulp.LpVariable] = {}
        for j, s in enumerate(names):
            for i in np.flatnonzero(elig[:, j]):
                i = int(i)
                if i in excl:
                    continue
                x[(i, s)] = pulp.LpVariable(f"x_{i}_{j}", cat="Binary")
        self.x = x
        by_player: dict[int, list] = {}
        for (i, s), v in x.items():
            by_player.setdefault(i, []).append(v)
        xp = {i: pulp.lpSum(vs) for i, vs in by_player.items()}
        self.xp = xp

        for s in names:
            prob += pulp.lpSum(v for (i, ss), v in x.items() if ss == s) == counts[s], f"slot_{s}"
        for i, e in xp.items():
            if len(by_player[i]) > 1:
                prob += e <= 1, f"once_{i}"

        sal = pulp.lpSum(v * slot_salary(self.slate, i, self.spec.slot_by_name(s)) for (i, s), v in x.items())
        prob += sal <= (max_salary if max_salary is not None else self.spec.salary_cap), "cap"
        if min_salary:
            prob += sal >= min_salary, "min_salary"

        teams = self.slate["team"].to_numpy()
        games = self.slate["game_id"].to_numpy()
        if self.spec.min_teams > 1:
            ys = []
            for t in pd.unique(teams):
                y = pulp.LpVariable(f"team_{t}", cat="Binary")
                prob += y <= pulp.lpSum(xp[i] for i in xp if teams[i] == t), f"team_used_{t}"
                ys.append(y)
            prob += pulp.lpSum(ys) >= self.spec.min_teams, "min_teams"
        if self.spec.min_games > 1:
            gs = []
            for k, g in enumerate(pd.unique(games)):
                z = pulp.LpVariable(f"game_{k}", cat="Binary")
                prob += z <= pulp.lpSum(xp[i] for i in xp if games[i] == g), f"game_used_{k}"
                gs.append(z)
            prob += pulp.lpSum(gs) >= self.spec.min_games, "min_games"
        if self.spec.max_per_team is not None:
            for t in pd.unique(teams):
                prob += pulp.lpSum(xp[i] for i in xp if teams[i] == t) <= self.spec.max_per_team, f"max_team_{t}"
        if self.spec.min_per_team:
            for t in pd.unique(teams):
                prob += pulp.lpSum(xp[i] for i in xp if teams[i] == t) >= self.spec.min_per_team, f"min_team_{t}"

        for i in locks:
            if int(i) not in xp:
                raise InfeasibleError(f"locked player {i} is excluded or ineligible")
            prob += xp[int(i)] == 1, f"lock_{i}"
        for s, i in slot_locks:
            if (int(i), s) not in x:
                raise InfeasibleError(f"player {i} cannot be locked into {s}")
            prob += x[(int(i), s)] == 1, f"slotlock_{s}_{i}"

        roles = sport.roles(self.slate) if "median" in self.slate.columns else self.slate["position"]
        self.ctx = ILPContext(prob, self.slate, self.spec, x, xp, roles.reset_index(drop=True))
        if sport.stack_rules is not None and self.rules:
            sport.stack_rules(self.ctx, self.rules)
        if sport.objective_terms is not None and self.rules:
            self.ctx.objective_extra.extend(sport.objective_terms(self.ctx, self.rules) or [])
        if extra_constraints is not None:
            extra_constraints(self.ctx)
        self.prob = prob
        self._cuts = 0
        self.engine = engine
        self.gap_rel = gap_rel
        self._compiled = None
        self._extra_rows: list[tuple[dict[int, float], float, float]] = []

    # ------------------------------------------------------- HiGHS (in-process)
    def _compile(self) -> None:
        """Turn the PuLP model into sparse matrices once; HiGHS then re-solves it in-process (no MPS, no subprocess)."""
        vars_ = self.prob.variables()
        col = {v.name: k for k, v in enumerate(vars_)}
        rows, cols, vals, lb, ub = [], [], [], [], []
        for r, (_, c) in enumerate(self.prob.constraints.items()):
            for v, a in c.items():
                rows.append(r)
                cols.append(col[v.name])
                vals.append(float(a))
            rhs = -float(c.constant)
            if c.sense == pulp.LpConstraintLE:
                lb.append(-np.inf); ub.append(rhs)
            elif c.sense == pulp.LpConstraintGE:
                lb.append(rhs); ub.append(np.inf)
            else:
                lb.append(rhs); ub.append(rhs)
        A = sparse.csr_matrix((vals, (rows, cols)), shape=(len(self.prob.constraints), len(vars_)))
        integ = np.array([1 if v.cat in (pulp.LpInteger, pulp.LpBinary) else 0 for v in vars_])
        lo = np.array([-np.inf if v.lowBound is None else v.lowBound for v in vars_], dtype=float)
        hi = np.array([np.inf if v.upBound is None else v.upBound for v in vars_], dtype=float)
        hi[(integ == 1) & np.isinf(hi)] = 1.0          # LpBinary created as cat=Binary -> 0/1
        lo[(integ == 1) & np.isinf(lo)] = 0.0
        x_cols = np.array([col[v.name] for v in self.x.values()])
        extra_c = np.zeros(len(vars_))
        for term in self.ctx.objective_extra:
            for v, a in pulp.lpSum(term).items():
                extra_c[col[v.name]] += float(a)
        self._compiled = dict(A=A, lb=np.array(lb), ub=np.array(ub), integ=integ, lo=lo, hi=hi, col=col,
                              x_cols=x_cols, keys=list(self.x.keys()), extra_c=extra_c, n=len(vars_))

    def _xp_cols(self, players) -> dict[int, float]:
        cp = self._compiled
        out: dict[int, float] = {}
        for k, (i, s) in enumerate(cp["keys"]):
            if i in players:
                out[int(cp["x_cols"][k])] = 1.0
        return out

    def add_row(self, coefs: dict[int, float], lb: float, ub: float) -> None:
        self._extra_rows.append((coefs, lb, ub))

    def _solve_highs(self, values: np.ndarray) -> Lineup | None:
        cp = self._compiled
        c = cp["extra_c"].copy()
        for k, (i, s) in enumerate(cp["keys"]):
            c[cp["x_cols"][k]] += float(values[i]) * self.spec.slot_by_name(s).points_mult
        A, lb, ub = cp["A"], cp["lb"], cp["ub"]
        if self._extra_rows:
            r = sparse.csr_matrix(([v for d, _, _ in self._extra_rows for v in d.values()],
                                   ([k for k, (d, _, _) in enumerate(self._extra_rows) for _ in d],
                                    [j for d, _, _ in self._extra_rows for j in d])),
                                  shape=(len(self._extra_rows), cp["n"]))
            A = sparse.vstack([A, r]).tocsr()
            lb = np.r_[lb, [x for _, x, _ in self._extra_rows]]
            ub = np.r_[ub, [x for _, _, x in self._extra_rows]]
        res = milp(-c, constraints=LinearConstraint(A, lb, ub), integrality=cp["integ"],
                   bounds=Bounds(cp["lo"], cp["hi"]),
                   options={"time_limit": self.time_limit or 30, "disp": False, "mip_rel_gap": self.gap_rel or 1e-6})
        if res.x is None or res.status not in (0,):
            return None
        xv = res.x
        chosen: dict[str, list[int]] = {}
        for k, (i, s) in enumerate(cp["keys"]):
            if xv[cp["x_cols"][k]] > 0.5:
                chosen.setdefault(s, []).append(i)
        return Lineup(tuple(chosen[s.name].pop(0) for s in self.spec.slots), self.spec.name)

    # ----------------------------------------------------------------- solve
    def _set_objective(self, values: np.ndarray) -> None:
        v = np.asarray(values, dtype=float)
        terms = [
            var * float(v[i]) * self.spec.slot_by_name(s).points_mult for (i, s), var in self.x.items()
        ]
        self.prob.setObjective(pulp.lpSum(terms) + pulp.lpSum(self.ctx.objective_extra))

    def _extract(self) -> Lineup:
        chosen: dict[str, list[int]] = {}
        for (i, s), var in self.x.items():
            if var.varValue is not None and var.varValue > 0.5:
                chosen.setdefault(s, []).append(i)
        players = []
        for s in self.spec.slots:
            players.append(chosen[s.name].pop(0))
        return Lineup(tuple(players), self.spec.name)

    def _solve_once(self) -> Lineup | None:
        solver = pulp.PULP_CBC_CMD(msg=False, timeLimit=self.time_limit, gapRel=self.gap_rel)
        self.prob.solve(solver)
        if pulp.LpStatus[self.prob.status] != "Optimal":
            return None
        return self._extract()

    def add_no_good(self, lu: Lineup, max_shared: int | None = None) -> None:
        """Forbid this lineup (default) or force at most `max_shared` shared players with it."""
        self._cuts += 1
        if self.engine == "highs":
            if self._compiled is None:
                self._compile()
            cp = self._compiled
            if max_shared is None and self.spec.captain_slot is not None:
                want = {(i, s.name) for i, s in zip(lu.players, self.spec.slots)}
                d = {int(cp["x_cols"][k]): 1.0 for k, key in enumerate(cp["keys"]) if key in want}
                self.add_row(d, -np.inf, self.spec.roster_size - 1)
            else:
                d = self._xp_cols(set(lu.players))
                self.add_row(d, -np.inf, self.spec.roster_size - 1 if max_shared is None else max_shared)
            return
        if max_shared is None:
            if self.spec.captain_slot is None:
                expr = pulp.lpSum(self.xp[i] for i in lu.players)
            else:
                expr = pulp.lpSum(self.x[(i, s.name)] for i, s in zip(lu.players, self.spec.slots))
            self.prob += expr <= self.spec.roster_size - 1, f"nogood_{self._cuts}"
        else:
            self.prob += pulp.lpSum(self.xp[i] for i in set(lu.players) if i in self.xp) <= max_shared, \
                f"overlap_{self._cuts}"

    def solve(self, values: np.ndarray | pd.Series, k: int = 1, max_shared: int | None = None) -> list[Lineup]:
        """Top-k lineups by `values` (per-player points) using no-good cuts.

        max_shared: if set, each new lineup shares at most this many players with every earlier one
        (uniqueness U = roster_size - max_shared).
        """
        vals = np.asarray(values, dtype=float)
        if self.engine == "highs":
            if self._compiled is None:
                self._compile()
        else:
            self._set_objective(vals)
        out: list[Lineup] = []
        t0 = time.time()
        for _ in range(k):
            lu = self._solve_highs(vals) if self.engine == "highs" else self._solve_once()
            if lu is None:
                break
            out.append(lu)
            self.add_no_good(lu, max_shared=max_shared)
        log.debug("solved %d lineups in %.2fs", len(out), time.time() - t0)
        if not out and k > 0:
            raise InfeasibleError("No feasible lineup — check cap, min salary, locks/excludes and rules.")
        return out


def optimize(
    sport: SportConfig, slate: pd.DataFrame, values: Sequence[float] | np.ndarray, mode: str = "classic",
    k: int = 1, **kw,
) -> list[Lineup]:
    return LineupILP(sport, slate, mode, **kw).solve(np.asarray(values, dtype=float), k=k)
