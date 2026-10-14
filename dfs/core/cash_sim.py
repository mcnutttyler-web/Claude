"""Sim-driven cash engine (Section 6.1–6.3). The goal is P(beat the cash line), not points.

For each sim s: the cash line L_s is the order statistic of (field_size - 1) opponents drawn from the cash field,
at rank = paid places (you cash if fewer than `paid` opponents beat you). The line is random and correlated with
your lineup because you share chalk. D = your score - L.
  favored  (E[D] >= 0): mean-variance rule max E[D] - lambda Var(D)  -> shares chalk, reduces Var(D)
  underdog (E[D] <  0): max E[D] + lambda Var(D)                    -> adds variance
Maximising P(D > 0) directly handles both regimes; the regime and the MV score are reported for transparency.
Ties count half. Objective A (highest median) is the fallback and sanity check.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd
import yaml
from scipy import sparse

from core.cash import build_cash_ilp, cash_settings
from core.contest import Contest
from core.field import FieldSample
from core.ingest import hard_rule_excludes
from core.lineup import Lineup, eligibility_matrix, is_valid, lineup_points, lineup_salary, reorder_for_late_swap
from core.optimizer import LineupILP
from sports.base import SportConfig

ROOT = Path(__file__).resolve().parent.parent
APP = yaml.safe_load((ROOT / "config" / "app.yaml").read_text())
CASH = APP["cash"]


# ------------------------------------------------------------------ scoring
def incidence(lineups: list[Lineup], n_players: int, spec) -> sparse.csr_matrix:
    mult = [s.points_mult for s in spec.slots]
    rows = [p for lu in lineups for p in lu.players]
    cols = [m for m, lu in enumerate(lineups) for _ in lu.players]
    vals = [k for lu in lineups for k in mult]
    return sparse.csr_matrix((np.array(vals, dtype=np.float32), (rows, cols)), shape=(n_players, len(lineups)))


def lineup_scores(lineups: list[Lineup], sims: np.ndarray, spec) -> np.ndarray:
    W = incidence(lineups, sims.shape[1], spec)
    return np.asarray((W.T @ sims.T).T, dtype=np.float32)


def cash_line(sims: np.ndarray, field: FieldSample, n_opponents: int, paid: int, rng, chunk: int = 1000,
              return_draws: bool = False):
    """Per-sim cash line: the `paid`-th highest score among n_opponents field entrants drawn by weight.

    You beat the line  <=>  fewer than `paid` opponents score above you  <=>  you cash.
    """
    W = field.incidence()
    n = sims.shape[0]
    line = np.empty(n, dtype=np.float64)
    draws = []
    kth = n_opponents - paid                    # index in ascending order
    if kth < 0:
        raise ValueError("paid places exceed opponents")
    for s in range(0, n, chunk):
        e = min(n, s + chunk)
        fs = np.asarray((W.T @ sims[s:e].T).T)  # (chunk x M)
        idx = field.draw(rng, (e - s, n_opponents))
        opp = np.take_along_axis(fs, idx, axis=1)
        line[s:e] = np.partition(opp, kth, axis=1)[:, kth]
        if return_draws:
            draws.append(opp)
    return (line, np.vstack(draws)) if return_draws else line


def evaluate(cand_scores: np.ndarray, line: np.ndarray, payout_multiple: float,
             lam: float | None = None) -> pd.DataFrame:
    lam = float(CASH.get("mv_lambda", 0.01) if lam is None else lam)
    D = cand_scores - line[:, None]
    p_win = (D > 0).mean(0) + 0.5 * (D == 0).mean(0)
    ed, sd = D.mean(0), D.std(0)
    favored = ed >= 0
    mv = np.where(favored, ed - lam * sd ** 2, ed + lam * sd ** 2)
    return pd.DataFrame({"p_win": p_win, "e_d": ed, "sd_d": sd, "ev": p_win * payout_multiple - 1.0,
                         "regime": np.where(favored, "favored", "underdog"), "mv_score": mv})


def select_best(metrics: pd.DataFrame, medians: np.ndarray, flex_lock: np.ndarray | None = None) -> int:
    """Max P(win); tie-breaks: higher median, lower SD(D), then later FLEX lock (late-swap option)."""
    m = metrics.assign(median=medians, flex_lock=flex_lock if flex_lock is not None else 0,
                       p_round=metrics["p_win"].round(4))
    m = m.sort_values(["p_round", "median", "sd_d", "flex_lock"], ascending=[False, False, True, False])
    return int(m.index[0])


# ------------------------------------------------------------ candidates
def _hard_ok(sport, slate, lu, rules) -> bool:
    return not (sport.check_lineup and sport.check_lineup(slate, lu.players, rules))


def generate_candidates(sport: SportConfig, slate: pd.DataFrame, mode: str = "classic",
                        consensus: list[Lineup] | None = None, floor: np.ndarray | None = None,
                        cash_own: np.ndarray | None = None, cfg: dict | None = None,
                        **overrides) -> tuple[list[Lineup], dict]:
    """Top-K by median, median/floor blends, fade pivots, consensus neighbours (Section 6.2.1)."""
    c = {**CASH["candidates"], **(cfg or {})}
    settings = cash_settings(sport, **overrides)
    spec = sport.mode(mode)
    med = slate["median"].to_numpy(float)
    flo = floor if floor is not None else (slate["floor"].fillna(slate["median"] * 0.5).to_numpy(float)
                                           if "floor" in slate else med * 0.5)
    seen, out, tags = set(), [], {}

    def add(lus, tag):
        for lu in lus:
            k = lu.key(slate, spec)
            if k not in seen:
                seen.add(k)
                out.append(lu)
                tags[len(out) - 1] = tag

    ilp, _ = build_cash_ilp(sport, slate, mode, **overrides)
    add(ilp.solve(med, k=int(c["top_k"])), "top_median")
    for w in c.get("blends", []):
        ilp, _ = build_cash_ilp(sport, slate, mode, **overrides)
        add(ilp.solve((1 - w) * med + w * flo, k=int(c["blend_k"])), f"blend_floor_{w}")
    if cash_own is not None and int(c.get("fade_pivots", 0)):
        top = np.argsort(-cash_own)[: int(c["fade_pivots"])]
        excl0 = set(overrides.pop("excludes", ()) or ())
        for j in top:
            try:
                ilp, _ = build_cash_ilp(sport, slate, mode, excludes=excl0 | {int(j)}, **overrides)
                add(ilp.solve(med, k=1), f"fade:{slate.at[int(j), 'name']}")
            except Exception:
                continue
    if consensus:
        names, elig = eligibility_matrix(slate, spec)
        col = [names.index(s.name) for s in spec.slots]
        excluded = set(hard_rule_excludes(slate, sport))
        n_swaps = int(c.get("neighbor_swaps", 5))
        for base in consensus:
            add([base], "consensus")
            singles = []
            for k, p in enumerate(base.players):
                pool = [q for q in np.flatnonzero(elig[:, col[k]]) if q not in base.players and q not in excluded
                        and med[q] > med[p]]
                pool = sorted(pool, key=lambda q: -med[q])[:n_swaps]
                for q in pool:
                    pl = list(base.players)
                    pl[k] = int(q)
                    lu = Lineup(tuple(pl), spec.name)
                    if is_valid(lu, slate, spec) and _hard_ok(sport, slate, lu, settings["rules"]):
                        singles.append((k, int(q)))
                        add([lu], "consensus_1swap")
            for a in range(len(singles)):
                for b in range(a + 1, len(singles)):
                    (k1, q1), (k2, q2) = singles[a], singles[b]
                    if k1 == k2 or q1 == q2:
                        continue
                    pl = list(base.players)
                    pl[k1], pl[k2] = q1, q2
                    lu = Lineup(tuple(pl), spec.name)
                    if is_valid(lu, slate, spec) and _hard_ok(sport, slate, lu, settings["rules"]) and \
                            lineup_salary(lu, slate, spec) >= settings["min_salary"]:
                        add([lu], "consensus_2swap")
    out = [reorder_for_late_swap(lu, slate, spec) for lu in out]
    return out, tags


# --------------------------------------------------------------- reports
def differential(lu: Lineup, slate, own: np.ndarray, chalk: float, low: float) -> dict:
    names = slate["name"].to_numpy()
    held = set(lu.players)
    return {"low_owned_held": [names[p] for p in lu.players if own[p] < low],
            "chalk_missing": [names[p] for p in np.flatnonzero(own > chalk) if p not in held],
            "chalk_coverage": round(float(own[list(lu.players)].sum()), 3)}


def fade_risk(lu: Lineup, cand_scores: np.ndarray, line: np.ndarray, sims: np.ndarray, own: np.ndarray,
              chalk: float, names) -> pd.DataFrame:
    """P(win) lost in sims where each missing chalk player scores >= his p75."""
    base = float(((cand_scores - line) > 0).mean())
    rows = []
    for p in np.flatnonzero(own > chalk):
        if p in lu.players:
            continue
        hot = sims[:, p] >= np.percentile(sims[:, p], 75)
        pw = float(((cand_scores[hot] - line[hot]) > 0).mean())
        rows.append({"player": names[p], "cash_own": round(float(own[p]), 3), "p_win_if_he_hits": round(pw, 4),
                     "fade_risk": round(base - pw, 4)})
    return pd.DataFrame(rows)


@dataclass
class ContestResult:
    contest: Contest
    recommended: Lineup
    metrics: pd.DataFrame              # all candidates
    table: pd.DataFrame                # recommended + alternatives
    alternatives: list[Lineup]
    fade: pd.DataFrame
    line: np.ndarray
    free_squares: pd.DataFrame = field(default_factory=pd.DataFrame)
    vs_consensus: pd.DataFrame = field(default_factory=pd.DataFrame)


@dataclass
class CashReport:
    results: dict[str, ContestResult]
    candidates: list[Lineup]
    objective_a: Lineup
    split: pd.DataFrame | None = None
    info: dict = field(default_factory=dict)


def _row(lu, slate, spec, m, own, cfg) -> dict:
    names = slate["name"].to_numpy()
    sc = slate.get("ceiling")
    d = differential(lu, slate, own, cfg["chalk_threshold"], cfg["low_own_threshold"])
    r = {"lineup": " | ".join(f"{s.name}:{names[p]}" for s, p in zip(spec.slots, lu.players)),
         "salary": int(round(lineup_salary(lu, slate, spec))),
         "median": round(lineup_points(lu, slate["median"].to_numpy(float), spec), 2)}
    r.update({k: (round(float(v), 4) if isinstance(v, (float, np.floating)) else v) for k, v in m.items()})
    r.update(d)
    return r


def _alternatives(order, cands, rec, n, min_diff):
    alts, picked = [], [rec]
    for k in order:
        lu = cands[k]
        if all(len(set(lu.players) ^ set(o.players)) // 2 >= min_diff for o in picked):
            alts.append(k)
            picked.append(lu)
        if len(alts) == n:
            break
    return alts


def run_cash(sport: SportConfig, slate: pd.DataFrame, sims: np.ndarray, contests: Iterable[Contest],
             field: FieldSample, sharp_field: FieldSample | None = None, consensus: list[Lineup] | None = None,
             mode: str = "classic", seed: int = 0, candidates: list[Lineup] | None = None,
             cand_cfg: dict | None = None, h2h_sharp: bool = False, split: bool = False, **overrides) -> CashReport:
    spec = sport.mode(mode)
    cfg = CASH
    rng = np.random.default_rng(seed)
    own_col = "cash_ownership" if "cash_ownership" in slate and slate["cash_ownership"].notna().any() else "ownership"
    own = slate[own_col].fillna(0).to_numpy(float) if own_col in slate else np.zeros(len(slate))
    floor = np.percentile(sims, 25, axis=0) if "floor" not in slate else None
    if candidates is None:
        candidates, _ = generate_candidates(sport, slate, mode, consensus, floor, own, cand_cfg, **overrides)
    obj_a = candidates[0]
    S = lineup_scores(candidates, sims, spec)
    med = np.array([lineup_points(lu, slate["median"].to_numpy(float), spec) for lu in candidates])
    lock = slate["lock_time"] if "lock_time" in slate else None
    flex_lock = None
    if lock is not None:
        flex_name = next((s.name for s in spec.slots if len(s.eligible) > 1 and s.name != spec.captain_slot), None)
        if flex_name:
            fk = [k for k, s in enumerate(spec.slots) if s.name == flex_name][0]
            flex_lock = np.array([pd.Timestamp(lock.iloc[lu.players[fk]]).value for lu in candidates])
    names = slate["name"].to_numpy()
    results = {}
    for c in contests:
        fld = sharp_field if (c.type == "h2h" and h2h_sharp and sharp_field is not None) else field
        line = cash_line(sims, fld, c.field_size - 1, c.paid_places, rng)
        m = evaluate(S, line, c.payout_multiple)
        best = select_best(m, med, flex_lock)
        order = m.assign(median=med).sort_values(["p_win", "median"], ascending=False).index
        alts = _alternatives([k for k in order if k != best], candidates, candidates[best],
                             int(cfg["alternatives"]), int(cfg["alt_min_diff"]))
        rows = [dict(rank="recommended", **_row(candidates[best], slate, spec, m.loc[best].to_dict(), own, cfg))]
        rows += [dict(rank=f"alt{j + 1}", **_row(candidates[k], slate, spec, m.loc[k].to_dict(), own, cfg))
                 for j, k in enumerate(alts)]
        q = np.percentile(S[:, [best] + alts], [10, 90], axis=0)
        tbl = pd.DataFrame(rows)
        tbl.insert(3, "p10", q[0].round(2))
        tbl.insert(4, "p90", q[1].round(2))
        fr = fade_risk(candidates[best], S[:, best], line, sims, own, cfg["chalk_threshold"], names)
        # free squares: cheap + heavily owned -> P(win) best-with vs best-without
        fsq = []
        sal = slate["salary"].to_numpy(float)
        for p in np.flatnonzero((sal <= cfg["free_square_salary"]) & (own >= cfg["free_square_own"])):
            has = np.array([p in lu.players for lu in candidates])
            if has.any() and (~has).any():
                fsq.append({"player": names[p], "cash_own": round(float(own[p]), 3),
                            "best_p_win_with": round(float(m["p_win"][has].max()), 4),
                            "best_p_win_without": round(float(m["p_win"][~has].max()), 4),
                            "cost_of_fading": round(float(m["p_win"][has].max() - m["p_win"][~has].max()), 4)})
        vs = pd.DataFrame()
        if consensus:
            base = consensus[0]
            rec = candidates[best]
            rr = []
            for k, (p_ours, p_cons) in enumerate(zip(rec.players, base.players)):
                if p_ours == p_cons or p_cons in rec.players:
                    continue
                pl = list(rec.players)
                pl[k] = p_cons
                alt = Lineup(tuple(pl), spec.name)
                if not is_valid(alt, slate, spec):
                    continue
                s_alt = lineup_scores([alt], sims, spec)[:, 0]
                pw = float((s_alt - line > 0).mean())
                rr.append({"slot": spec.slots[k].name, "ours": names[p_ours], "consensus": names[p_cons],
                           "p_win_ours": round(float(m.at[best, "p_win"]), 4), "p_win_if_swapped": round(pw, 4),
                           "impact": round(pw - float(m.at[best, "p_win"]), 4)})
            vs = pd.DataFrame(rr)
        results[c.type] = ContestResult(c, candidates[best], m, tbl, [candidates[k] for k in alts], fr, line,
                                        pd.DataFrame(fsq), vs)
    split_tbl = None
    if split and results:
        # One lineup in every cash contest vs alternating it with the best >=2-different alternative.
        res = list(results.values())
        rec = res[0].recommended
        alt = res[0].alternatives[0] if res[0].alternatives else None
        if alt is not None:
            k_rec, k_alt = candidates.index(rec), candidates.index(alt)
            plans = {"one_lineup": [k_rec] * len(res), "split": [k_rec if j % 2 == 0 else k_alt
                                                                 for j in range(len(res))]}
            rows = []
            for label, picks in plans.items():
                tot = np.zeros(len(sims))
                for r_, k in zip(res, picks):
                    tot += (S[:, k] > r_.line) * r_.contest.payout_multiple - 1
                rows.append({"plan": label, "ev_units": round(float(tot.mean()), 4),
                             "sd_units": round(float(tot.std()), 4)})
            split_tbl = pd.DataFrame(rows)
    return CashReport(results, candidates, obj_a, split_tbl, {"own_col": own_col, "n_candidates": len(candidates)})


def read_consensus(path_or_buf, slate: pd.DataFrame, spec) -> list[Lineup]:
    """consensus_cash.csv: one lineup per row, columns = the sport's export header (cells: DK ID, 'Name (ID)'
    or player name). Unparseable rows are skipped."""
    raw = pd.read_csv(path_or_buf, dtype=str).fillna("")
    by_id = {str(v): i for i, v in slate["id"].items()}
    by_name = {}
    for i, n in slate["name"].items():
        by_name.setdefault(str(n).strip().lower(), i)
    out = []
    for _, r in raw.iterrows():
        cells = [str(x).strip() for x in r.tolist()[: spec.roster_size]]
        idx = []
        for c in cells:
            m = c.rsplit("(", 1)
            key = m[1].rstrip(")").strip() if len(m) == 2 else c
            i = by_id.get(key, by_name.get(m[0].strip().lower(), by_name.get(c.lower())))
            idx.append(i)
        if None in idx or len(idx) != spec.roster_size:
            continue
        lu = Lineup(tuple(int(i) for i in idx), spec.name)
        if is_valid(lu, slate, spec):
            out.append(lu)
    return out
