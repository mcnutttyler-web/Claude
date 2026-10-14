"""Cash module.

Phase 1: Objective A — the practitioner baseline (Levitan): "highest median team, ignore ownership and
correlation, keep an eye on ceiling". It is the fast fallback and the sanity check against the
simulation answer (P(beat cash line)), which arrives in Phase 2.

Hard rules (Section 6.2.5): exclude O/D/IR, warn on Q, warn on weather, min salary (default $49,500 —
default — calibrate), block QB vs. the opposing DST (via the sport's cash rules).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable

import numpy as np
import pandas as pd

from core.ingest import hard_rule_excludes
from core.lineup import Lineup, lineup_points, lineup_salary, reorder_for_late_swap
from core.optimizer import LineupILP
from sports.base import SportConfig


@dataclass
class CashResult:
    lineups: list[Lineup]
    table: pd.DataFrame
    warnings: list[str] = field(default_factory=list)
    settings: dict = field(default_factory=dict)


def cash_settings(sport: SportConfig, mode: str = "classic", **overrides) -> dict:
    sd = sport.preset("showdown").get("cash") if mode == "showdown" else None
    preset = sd or sport.preset("cash")
    s = {"min_salary": preset.get("min_salary", 0), "rules": dict(preset.get("rules", {}))}
    for k, v in overrides.items():
        if v is not None:
            if k == "rules":
                s["rules"].update(v)
            else:
                s[k] = v
    return s


def build_cash_ilp(sport: SportConfig, slate: pd.DataFrame, mode: str = "classic",
                   locks: Iterable[int] = (), excludes: Iterable[int] = (), **overrides) -> tuple[LineupILP, dict]:
    s = cash_settings(sport, mode, **overrides)
    ex = set(excludes) | set(hard_rule_excludes(slate, sport))
    ilp = LineupILP(sport, slate, mode, min_salary=s["min_salary"], locks=locks, excludes=ex, rules=s["rules"])
    return ilp, s


def objective_a(sport: SportConfig, slate: pd.DataFrame, mode: str = "classic", k: int = 1,
                locks: Iterable[int] = (), excludes: Iterable[int] = (), **overrides) -> CashResult:
    """Top-k lineups by median under cash hard rules (k=1 is Objective A)."""
    ilp, s = build_cash_ilp(sport, slate, mode, locks, excludes, **overrides)
    spec = ilp.spec
    lus = [reorder_for_late_swap(lu, slate, spec) for lu in ilp.solve(slate["median"].to_numpy(), k=k)]
    warnings = []
    if "status" in slate:
        for lu in lus[:1]:
            for i in lu.players:
                if str(slate.at[i, "status"]).upper() in sport.status_warn:
                    warnings.append(f"Rostered questionable player: {slate.at[i, 'name']}")
    return CashResult(lus, describe(lus, slate, spec), warnings, s)


def describe(lus: list[Lineup], slate: pd.DataFrame, spec) -> pd.DataFrame:
    rows = []
    has = {c: c in slate.columns for c in ("floor", "ceiling", "ownership", "cash_ownership")}
    for n, lu in enumerate(lus, start=1):
        r = {"lineup": n}
        for s, i in zip(spec.slots, lu.players):
            key = s.name
            j = 2
            while key in r:
                key = f"{s.name}{j}"
                j += 1
            r[key] = f"{slate.at[i, 'name']} ({slate.at[i, 'team']})"
        r["salary"] = int(round(lineup_salary(lu, slate, spec)))
        r["median"] = round(lineup_points(lu, slate["median"].to_numpy(), spec), 2)
        if has["floor"]:
            r["floor"] = round(lineup_points(lu, slate["floor"].fillna(slate["median"]).to_numpy(), spec), 2)
        if has["ceiling"]:
            r["ceiling"] = round(lineup_points(lu, slate["ceiling"].fillna(slate["median"]).to_numpy(), spec), 2)
        own_col = "cash_ownership" if has["cash_ownership"] else ("ownership" if has["ownership"] else None)
        if own_col:
            own = slate[own_col].fillna(0).to_numpy()
            r["chalk_coverage"] = round(float(sum(own[i] for i in lu.players)), 3)
        rows.append(r)
    return pd.DataFrame(rows)
