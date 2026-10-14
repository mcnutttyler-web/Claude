"""Late swap (Sections 6.4 and 9).

Load DKEntries.csv, lock every player whose game has started (now or a user-set "as of" time), and re-solve the
open slots only:
  cash entries  -> max P(beat the line | locked), where locked players (ours AND the field's) carry their ACTUAL
                   scores when known. Ahead of the projected line -> the search favours the remaining chalk (lower
                   Var(D)); behind -> higher-variance / under-owned late players. Conditional P(win) is reported
                   before and after.
  GPP entries   -> max conditional expected payout vs the field.
Cap, min teams/games and per-lineup rules are respected where they can still be satisfied (rules are relaxed
before giving up). Contest columns in DKEntries stay byte-identical (core/export.write_entries).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

import numpy as np
import pandas as pd

from core.cash import cash_settings
from core.cash_sim import cash_line, evaluate, lineup_scores
from core.contest import Contest
from core.export import EntriesFile, unquote
from core.ingest import hard_rule_excludes
from core.lineup import Lineup, export_ids, is_valid, validate_lineup
from core.optimizer import InfeasibleError, LineupILP
from core.payouts import FieldDistribution, standalone
from sports.base import SportConfig


@dataclass
class EntryLineup:
    entry_id: str
    contest_id: str
    contest_name: str
    lineup: Lineup | None
    problems: list[str] = field(default_factory=list)


@dataclass
class SwapResult:
    entry_id: str
    kind: str                      # cash | gpp
    before: Lineup
    after: Lineup
    metric: str                    # p_win | exp_payout
    value_before: float
    value_after: float
    regime: str = ""               # ahead | behind (cash)
    changes: list[tuple[str, str, str]] = field(default_factory=list)   # (slot, out, in)


# ------------------------------------------------------------------ parsing
def _cell_id(cell: str) -> str:
    c = unquote(cell).strip()
    if "(" in c and c.endswith(")"):
        return c.rsplit("(", 1)[1].rstrip(")").strip()
    return c


def parse_entries(ef: EntriesFile, slate: pd.DataFrame, spec) -> list[EntryLineup]:
    by_id = {str(v): i for i, v in slate["id"].items()}
    by_cpt = {str(v): i for i, v in slate["cpt_id"].items()} if "cpt_id" in slate else {}
    out = []
    for _, r in ef.entries.iterrows():
        ids = [_cell_id(c) for c in r["current"]]
        players, probs = [], []
        for sl, pid in zip(spec.slots, ids):
            if not pid:
                probs.append(f"{sl.name} empty")
                players.append(None)
                continue
            i = by_cpt.get(pid) if sl.name == spec.captain_slot else by_id.get(pid)
            if i is None:
                i = by_id.get(pid, by_cpt.get(pid))
            if i is None:
                probs.append(f"{sl.name}: id {pid} not on slate")
            players.append(i)
        lu = Lineup(tuple(int(p) for p in players), spec.name) if None not in players else None
        out.append(EntryLineup(str(r["Entry ID"]), str(r["Contest ID"]), str(r["Contest Name"]), lu, probs))
    return out


def guess_contest_template(name: str) -> str:
    n = name.lower()
    if "double up" in n or "double-up" in n:
        return "double_up"
    if "50/50" in n or "fifty" in n:
        return "5050"
    if "triple" in n:
        return "triple_up"
    if "head-to-head" in n or "h2h" in n or " vs" in n:
        return "h2h"
    if "150" in n or "milly" in n or "millionaire" in n:
        return "gpp_milly"
    return "gpp_20max"


# ------------------------------------------------------------------ locking
def locked_mask(slate: pd.DataFrame, as_of: datetime | pd.Timestamp) -> np.ndarray:
    lt = pd.to_datetime(slate["lock_time"])
    ts = pd.Timestamp(as_of)
    if ts.tzinfo is None and lt.dt.tz is not None:
        ts = ts.tz_localize(lt.dt.tz)
    return (lt <= ts).to_numpy()


def conditional_sims(sims: np.ndarray, slate: pd.DataFrame, locked: np.ndarray,
                     actual: dict[str, float] | None) -> np.ndarray:
    """Locked players with a known actual score are fixed at it in every sim (ours and the field's)."""
    out = sims.copy()
    if actual:
        ids = slate["id"].astype(str).to_numpy()
        for j in np.flatnonzero(locked):
            if ids[j] in actual:
                out[:, j] = float(actual[ids[j]])
    return out


def _ilp_for(sport, slate, mode, lu: Lineup, locked: np.ndarray, rules: dict, min_salary: float) -> LineupILP:
    spec = sport.mode(mode)
    slot_locks = [(s.name, p) for s, p in zip(spec.slots, lu.players) if locked[p]]
    excl = set(int(i) for i in np.flatnonzero(locked)) - set(lu.players)
    excl |= set(hard_rule_excludes(slate, sport)) - set(lu.players)
    last = None
    for r, ms in ((rules, min_salary), ({}, min_salary), ({}, 0.0)):   # relax rules, then min salary
        try:
            ilp = LineupILP(sport, slate, mode, min_salary=ms, slot_locks=slot_locks, excludes=excl, rules=r,
                            gap_rel=0.005)
            ilp._set_objective(slate["median"].to_numpy(float))
            if ilp._solve_once() is not None:
                return ilp
        except InfeasibleError as e:
            last = e
    raise InfeasibleError(f"no valid late swap: {last}")


def _candidates(ilp: LineupILP, slate, sims_c: np.ndarray, own: np.ndarray, rng, k_med=12, k_chalk=12, k_var=24):
    med = slate["median"].to_numpy(float)
    seen, out = set(), []

    def take(lus):
        for lu in lus:
            key = tuple(sorted(lu.players)) + tuple(lu.players[:1])
            if key not in seen:
                seen.add(key)
                out.append(lu)

    take(ilp.solve(med, k=k_med))
    # chalk-leaning (minimise variance vs a chalky line) and variance-seeking (sim-sampled) searches
    for beta in (8.0, 20.0):
        ilp._set_objective(med + beta * own)
        lu = ilp._solve_once()
        if lu:
            take([lu])
    chalk = med + 10.0 * own
    for j in range(k_chalk):
        ilp._set_objective(chalk * (1 + 0.02 * rng.standard_normal(len(chalk))))
        lu = ilp._solve_once()
        if lu:
            take([lu])
    rows = rng.choice(sims_c.shape[0], size=min(k_var, sims_c.shape[0]), replace=False)
    for r in rows:
        ilp._set_objective(sims_c[r].astype(float))
        lu = ilp._solve_once()
        if lu:
            take([lu])
    return out


def _changes(before: Lineup, after: Lineup, slate, spec):
    names = slate["name"].to_numpy()
    return [(s.name, names[a], names[b]) for s, a, b in zip(spec.slots, before.players, after.players) if a != b]


def align_to_locks(after: Lineup, before: Lineup, locked: np.ndarray, spec) -> Lineup:
    """Keep every locked player in its ORIGINAL slot index (DK does not let a locked player change slots, even
    between two identical slot names such as RB/RB). Remaining players fill the other slots of the same name."""
    pool: dict[str, list[int]] = {}
    for sl, p in zip(spec.slots, after.players):
        pool.setdefault(sl.name, []).append(p)
    out = [-1] * spec.roster_size
    for k, (sl, p) in enumerate(zip(spec.slots, before.players)):
        if locked[p]:
            out[k] = p
            pool[sl.name].remove(p)
    for k, sl in enumerate(spec.slots):
        if out[k] < 0:
            out[k] = pool[sl.name].pop(0)
    return Lineup(tuple(out), after.mode)


def late_swap_cash(sport: SportConfig, slate: pd.DataFrame, sims_c: np.ndarray, lu: Lineup, contest: Contest,
                   field, locked: np.ndarray, mode: str = "classic", seed: int = 0) -> SwapResult:
    spec = sport.mode(mode)
    rng = np.random.default_rng(seed)
    st = cash_settings(sport, mode)
    ilp = _ilp_for(sport, slate, mode, lu, locked, st["rules"], st["min_salary"])
    own_col = "cash_ownership" if "cash_ownership" in slate and slate["cash_ownership"].notna().any() else "ownership"
    own = slate[own_col].fillna(0).to_numpy(float) if own_col in slate else np.zeros(len(slate))
    cands = [lu] + _candidates(ilp, slate, sims_c, own, rng)
    S = lineup_scores(cands, sims_c, spec)
    line = cash_line(sims_c, field, contest.field_size - 1, contest.paid_places, rng)
    m = evaluate(S, line, contest.payout_multiple)
    best = int(m["p_win"].idxmax())
    if m.at[best, "p_win"] <= m.at[0, "p_win"] + 1e-12:
        best = 0
    regime = "ahead" if m.at[0, "e_d"] >= 0 else "behind"
    after = align_to_locks(cands[best], lu, locked, spec)
    return SwapResult("", "cash", lu, after, "p_win", float(m.at[0, "p_win"]), float(m.at[best, "p_win"]), regime,
                      _changes(lu, after, slate, spec))


def late_swap_gpp(sport: SportConfig, slate: pd.DataFrame, sims_c: np.ndarray, lu: Lineup, contest: Contest,
                  field, locked: np.ndarray, mode: str = "classic", seed: int = 0) -> SwapResult:
    from core.field import scores as field_scores
    from core.gpp import gpp_settings
    spec = sport.mode(mode)
    rng = np.random.default_rng(seed)
    st = gpp_settings(sport, "showdown" if mode == "showdown" else "mid_20max")
    ilp = _ilp_for(sport, slate, mode, lu, locked, st.rules, st.min_salary)
    own = slate["ownership"].fillna(0).to_numpy(float) if "ownership" in slate else np.zeros(len(slate))
    cands = [lu] + _candidates(ilp, slate, sims_c, -np.log(np.clip(own, 1e-3, 1)) / 10, rng, k_chalk=6, k_var=40)
    sub = sims_c[: min(len(sims_c), 4000)]
    fd = FieldDistribution(field_scores(field, sub), field.w())
    pay = standalone(lineup_scores(cands, sub, spec), fd, contest.field_size - 1, contest.payout_vector()).mean(0)
    best = int(np.argmax(pay))
    if pay[best] <= pay[0] + 1e-12:
        best = 0
    after = align_to_locks(cands[best], lu, locked, spec)
    return SwapResult("", "gpp", lu, after, "exp_payout", float(pay[0]), float(pay[best]), "",
                      _changes(lu, after, slate, spec))


def late_swap_entries(sport: SportConfig, slate: pd.DataFrame, sims: np.ndarray, ef: EntriesFile,
                      contests: dict[str, Contest], fields: dict[str, object], as_of, actual: dict | None = None,
                      mode: str = "classic", seed: int = 0) -> tuple[dict[str, list[str]], pd.DataFrame]:
    """contests: Contest ID -> Contest; fields: 'cash' / 'gpp' -> FieldSample. Returns (assignments, report)."""
    spec = sport.mode(mode)
    locked = locked_mask(slate, as_of)
    sims_c = conditional_sims(sims, slate, locked, actual)
    assign, rows = {}, []
    for e in parse_entries(ef, slate, spec):
        c = contests.get(e.contest_id)
        if e.lineup is None or c is None:
            rows.append({"entry_id": e.entry_id, "status": "skipped",
                         "note": "; ".join(e.problems) or "no contest definition"})
            continue
        fn = late_swap_cash if c.is_cash else late_swap_gpp
        res = fn(sport, slate, sims_c, e.lineup, c, fields["cash" if c.is_cash else "gpp"], locked, mode, seed)
        errs = validate_lineup(res.after, slate, spec)
        if errs:
            rows.append({"entry_id": e.entry_id, "status": "invalid", "note": "; ".join(errs)})
            continue
        assign[e.entry_id] = export_ids(res.after, slate, spec)
        rows.append({"entry_id": e.entry_id, "contest": e.contest_name, "kind": res.kind, "metric": res.metric,
                     "before": round(res.value_before, 4), "after": round(res.value_after, 4), "regime": res.regime,
                     "swaps": "; ".join(f"{s}: {a} -> {b}" for s, a, b in res.changes) or "no change",
                     "status": "ok"})
    return assign, pd.DataFrame(rows)
