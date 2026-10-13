"""Lineup representation, DK validity checks, a fast random sampler, and late-swap slot ordering.

A slate is a DataFrame with a RangeIndex and at least:
    id, name, position, positions (tuple), roster_tokens (tuple), salary, team, opp, game_id, lock_time
Showdown slates additionally carry cpt_id and cpt_salary.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Sequence

import numpy as np
import pandas as pd

from sports.base import ModeSpec, Slot


@dataclass(frozen=True)
class Lineup:
    players: tuple[int, ...]   # slate row index for each slot, in mode.slots order
    mode: str = "classic"

    def key(self, slate: pd.DataFrame, spec: ModeSpec) -> tuple:
        """Duplicate hash: sorted player IDs; in Showdown the captain is part of the hash."""
        ids = slate["id"].to_numpy()
        if spec.captain_slot is None:
            return tuple(sorted(str(ids[i]) for i in self.players))
        cpt = [str(ids[i]) for i, s in zip(self.players, spec.slots) if s.name == spec.captain_slot]
        flex = sorted(str(ids[i]) for i, s in zip(self.players, spec.slots) if s.name != spec.captain_slot)
        return (tuple(cpt), tuple(flex))


# ---------------------------------------------------------------- eligibility
def is_eligible(row: pd.Series | dict, slot: Slot, spec: ModeSpec) -> bool:
    tokens = tuple(row.get("roster_tokens") or ())
    if spec.use_roster_position_tokens and tokens:
        return slot.name in tokens
    positions = tuple(row.get("positions") or (row.get("position"),))
    return any(p in slot.eligible for p in positions)


def eligibility_matrix(slate: pd.DataFrame, spec: ModeSpec) -> tuple[list[str], np.ndarray]:
    """Unique slot names (in first-seen order) and an (n_players x n_slotnames) bool matrix."""
    names: list[str] = []
    for s in spec.slots:
        if s.name not in names:
            names.append(s.name)
    recs = slate.to_dict("records")
    mat = np.zeros((len(slate), len(names)), dtype=bool)
    for j, nm in enumerate(names):
        slot = spec.slot_by_name(nm)
        for i, r in enumerate(recs):
            mat[i, j] = is_eligible(r, slot, spec)
    return names, mat


def slot_salary(slate: pd.DataFrame, i: int, slot: Slot) -> float:
    if slot.salary_mult != 1.0:
        if "cpt_salary" in slate.columns and pd.notna(slate.at[i, "cpt_salary"]):
            return float(slate.at[i, "cpt_salary"])
        return float(slate.at[i, "salary"]) * slot.salary_mult
    return float(slate.at[i, "salary"])


def lineup_salary(lu: Lineup, slate: pd.DataFrame, spec: ModeSpec) -> float:
    return sum(slot_salary(slate, i, s) for i, s in zip(lu.players, spec.slots))


def lineup_points(lu: Lineup, values: np.ndarray | pd.Series, spec: ModeSpec) -> float:
    v = np.asarray(values, dtype=float)
    return float(sum(v[i] * s.points_mult for i, s in zip(lu.players, spec.slots)))


def export_ids(lu: Lineup, slate: pd.DataFrame, spec: ModeSpec) -> list[str]:
    """DK player IDs per slot (captain slot uses the CPT-row ID in Showdown)."""
    out = []
    for i, s in zip(lu.players, spec.slots):
        if s.name == spec.captain_slot and "cpt_id" in slate.columns and pd.notna(slate.at[i, "cpt_id"]):
            out.append(str(slate.at[i, "cpt_id"]))
        else:
            out.append(str(slate.at[i, "id"]))
    return out


# ------------------------------------------------------------------ validity
def validate_lineup(lu: Lineup, slate: pd.DataFrame, spec: ModeSpec) -> list[str]:
    """DK hard-rule check. Returns a list of violations (empty == valid)."""
    errs: list[str] = []
    if len(lu.players) != spec.roster_size:
        return [f"roster size {len(lu.players)} != {spec.roster_size}"]
    if len(set(lu.players)) != len(lu.players):
        errs.append("duplicate player")
    for i, s in zip(lu.players, spec.slots):
        if i < 0 or i >= len(slate):
            return [f"bad player index {i}"]
        if not is_eligible(slate.loc[i], s, spec):
            errs.append(f"{slate.at[i, 'name']} ({slate.at[i, 'position']}) not eligible for {s.name}")
    sal = lineup_salary(lu, slate, spec)
    if sal > spec.salary_cap + 1e-6:
        errs.append(f"salary {sal:.0f} > cap {spec.salary_cap}")
    teams = slate.loc[list(lu.players), "team"]
    games = slate.loc[list(lu.players), "game_id"]
    if teams.nunique() < spec.min_teams:
        errs.append(f"{teams.nunique()} teams < {spec.min_teams}")
    if games.nunique() < spec.min_games:
        errs.append(f"{games.nunique()} games < {spec.min_games}")
    if spec.max_per_team is not None and teams.value_counts().max() > spec.max_per_team:
        errs.append(f"more than {spec.max_per_team} from one team")
    if spec.min_per_team:
        counts = teams.value_counts()
        for t in slate["team"].unique():
            if counts.get(t, 0) < spec.min_per_team:
                errs.append(f"fewer than {spec.min_per_team} from {t}")
    return errs


def is_valid(lu: Lineup, slate: pd.DataFrame, spec: ModeSpec) -> bool:
    return not validate_lineup(lu, slate, spec)


# -------------------------------------------------------------- random sampler
def random_lineups(
    slate: pd.DataFrame,
    spec: ModeSpec,
    n: int,
    rng: np.random.Generator,
    weights: np.ndarray | None = None,
    min_salary: float = 0.0,
    max_tries: int | None = None,
) -> list[Lineup]:
    """Rejection-sample DK-valid lineups. Players drawn ~ weights within each slot's eligible pool.

    This is the primitive the field models build on (Phase 2/3).
    """
    names, elig = eligibility_matrix(slate, spec)
    slot_idx = [names.index(s.name) for s in spec.slots]
    # Fill most restrictive slots first so flexible slots don't eat scarce players.
    order = sorted(range(spec.roster_size), key=lambda k: elig[:, slot_idx[k]].sum())
    w = np.ones(len(slate)) if weights is None else np.asarray(weights, dtype=float).clip(min=0) + 1e-12
    base_sal = slate["salary"].to_numpy(dtype=float)
    sal_by_slot = []
    for s in spec.slots:
        if s.salary_mult != 1.0:
            cs = slate["cpt_salary"].to_numpy(dtype=float) if "cpt_salary" in slate.columns else base_sal * 0
            sal_by_slot.append(np.where(np.isnan(cs) | (cs == 0), base_sal * s.salary_mult, cs))
        else:
            sal_by_slot.append(base_sal)
    pools = [np.flatnonzero(elig[:, slot_idx[k]]) for k in range(spec.roster_size)]
    min_sal = [float(sal_by_slot[k][pools[k]].min()) if len(pools[k]) else np.inf for k in range(spec.roster_size)]
    # Budget reserved for the slots still to fill (cheapest eligible player per slot).
    reserve = {pos: sum(min_sal[k] for k in order[pos + 1:]) for pos in range(len(order))}
    teams = slate["team"].to_numpy()
    games = slate["game_id"].to_numpy()
    out: list[Lineup] = []
    tries, max_tries = 0, max_tries or n * 500
    while len(out) < n and tries < max_tries:
        tries += 1
        chosen = [-1] * spec.roster_size
        used = np.zeros(len(slate), dtype=bool)
        spent = 0.0
        ok = True
        for pos, k in enumerate(order):
            pool = pools[k]
            sal_k = sal_by_slot[k][pool]
            pool_ok = ~used[pool] & (sal_k <= spec.salary_cap - spent - reserve[pos] + 1e-9)
            cand = pool[pool_ok]
            if len(cand) == 0:
                ok = False
                break
            pw = w[cand] / w[cand].sum()
            p = int(rng.choice(cand, p=pw))
            chosen[k] = p
            used[p] = True
            spent += sal_by_slot[k][p]
        if not ok or spent < min_salary:
            continue
        idx = np.array(chosen)
        if len(set(teams[idx])) < spec.min_teams or len(set(games[idx])) < spec.min_games:
            continue
        lu = Lineup(tuple(chosen), spec.name)
        if is_valid(lu, slate, spec):
            out.append(lu)
    return out


# -------------------------------------------------------- late-swap slot order
def reorder_for_late_swap(lu: Lineup, slate: pd.DataFrame, spec: ModeSpec) -> Lineup:
    """Re-assign the same players to slots so the most flexible slots hold the latest-locking players.

    E.g. NFL: the FLEX gets the latest-kickoff RB/WR/TE, preserving the late-swap option.
    The captain slot (Showdown) is never re-assigned.
    """
    if spec.captain_slot is not None:
        return lu
    players = list(lu.players)
    slots = spec.slots
    lock = pd.to_datetime(slate.loc[players, "lock_time"]).to_numpy() if "lock_time" in slate.columns else None
    lock_rank = {p: (lock[k] if lock is not None else 0) for k, p in enumerate(players)}
    elig = {(p, k): is_eligible(slate.loc[p], slots[k], spec) for p in players for k in range(len(slots))}
    # Most flexible slots first (largest eligible set among these players).
    order = sorted(range(len(slots)), key=lambda k: -sum(elig[(p, k)] for p in players))
    assign: dict[int, int] = {}

    def feasible(remaining_slots: list[int], remaining_players: set[int]) -> bool:
        if not remaining_slots:
            return True
        k = remaining_slots[0]
        for p in remaining_players:
            if elig[(p, k)] and feasible(remaining_slots[1:], remaining_players - {p}):
                return True
        return False

    remaining = set(players)
    for idx, k in enumerate(order):
        cands = sorted((p for p in remaining if elig[(p, k)]), key=lambda p: lock_rank[p], reverse=True)
        for p in cands:
            if feasible(order[idx + 1:], remaining - {p}):
                assign[k] = p
                remaining.discard(p)
                break
        else:  # should never happen for a valid lineup
            return lu
    return Lineup(tuple(assign[k] for k in range(len(slots))), lu.mode)


def lineups_to_frame(
    lineups: Sequence[Lineup], slate: pd.DataFrame, spec: ModeSpec, value_cols: Iterable[str] = ("median",)
) -> pd.DataFrame:
    rows = []
    for n, lu in enumerate(lineups, start=1):
        r: dict = {"lineup": n}
        for s, i in zip(spec.slots, lu.players):
            r.setdefault(s.name, [])
            r[s.name].append(slate.at[i, "name"])
        r = {k: (", ".join(v) if isinstance(v, list) else v) for k, v in r.items()}
        r["salary"] = int(round(lineup_salary(lu, slate, spec)))
        for c in value_cols:
            if c in slate.columns:
                r[c] = round(lineup_points(lu, slate[c].fillna(0).to_numpy(), spec), 2)
        rows.append(r)
    return pd.DataFrame(rows)
