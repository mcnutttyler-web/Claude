"""NFL stack and negative-correlation rules, expressed through core's ILPContext.

Options (all optional; presets.yaml supplies them per contest type):
    block_qb_vs_opp_dst: bool        hard block QB vs the opposing DST (cash and GPP)
    qb_stack_min: int                QB + >= N same-team pass catchers
    qb_stack_max: int                QB + <= N same-team pass catchers
    stack_positions: [WR, TE]        what counts as a pass catcher
    bring_back_min: int              >= N opposing skill players when a QB is rostered
    bring_back_game_total_min: float only require the bring-back when game_total >= this
    game_stack_min: int              >= N players from one game
    max_per_team_excl: {max, exclude_positions}
    soft_penalty_vs_opp_dst: float   objective penalty per RB/WR/TE facing your DST
"""
from __future__ import annotations

import pulp

SKILL = ("RB", "WR", "TE")


def _opp_of(ctx, team: str) -> str | None:
    s = ctx.slate.loc[ctx.slate["team"] == team, "opp"]
    return None if s.empty else s.iloc[0]


def build_constraints(ctx, opt: dict) -> None:
    slate = ctx.slate
    teams = list(dict.fromkeys(slate["team"]))
    qbs = ctx.players(positions=["QB"])
    dsts = ctx.players(positions=["DST"])

    if opt.get("block_qb_vs_opp_dst"):
        for d in dsts:
            opp_qbs = ctx.players(positions=["QB"], team=slate.at[d, "opp"])
            if opp_qbs:
                ctx.add(ctx.sum_xp(opp_qbs) <= len(opp_qbs) * (1 - ctx.xp[d]), "qb_vs_dst")

    stack_pos = opt.get("stack_positions", ["WR", "TE"])
    n_min = int(opt.get("qb_stack_min") or 0)
    n_max = opt.get("qb_stack_max")
    if n_min or n_max is not None:
        for q in qbs:
            mates = [i for i in ctx.players(positions=stack_pos, team=slate.at[q, "team"])]
            if n_min:
                ctx.add(ctx.sum_xp(mates) >= n_min * ctx.xp[q], "qb_stack_min")
            if n_max is not None:
                big = len(mates)
                ctx.add(ctx.sum_xp(mates) <= int(n_max) + big * (1 - ctx.xp[q]), "qb_stack_max")

    bb = int(opt.get("bring_back_min") or 0)
    if bb:
        gt_min = opt.get("bring_back_game_total_min")
        for q in qbs:
            gt = slate.at[q, "game_total"] if "game_total" in slate.columns else None
            if gt_min is not None and gt is not None and gt == gt and float(gt) < float(gt_min):
                continue
            opp = ctx.players(positions=list(SKILL) + ["QB"], team=slate.at[q, "opp"])
            ctx.add(ctx.sum_xp(opp) >= bb * ctx.xp[q], "bring_back")

    gs = int(opt.get("game_stack_min") or 0)
    if gs:
        zs = []
        for g in slate["game_id"].unique():
            z = ctx.new_var("gstack")
            ctx.add(ctx.sum_xp(ctx.players(game_id=g)) >= gs * z, "game_stack")
            zs.append(z)
        ctx.add(pulp.lpSum(zs) >= 1, "game_stack_any")

    mpt = opt.get("max_per_team_excl")
    if mpt:
        excl = set(mpt.get("exclude_positions", ["DST"]))
        for t in teams:
            idx = [i for i in ctx.players(team=t) if slate.at[i, "position"] not in excl]
            ctx.add(ctx.sum_xp(idx) <= int(mpt["max"]), "max_team")


def objective_terms(ctx, opt: dict) -> list:
    """Soft-penalize RB/WR/TE facing your own DST (the hard QB block is in build_constraints)."""
    pen = float(opt.get("soft_penalty_vs_opp_dst") or 0)
    if not pen:
        return []
    terms = []
    for d in ctx.players(positions=["DST"]):
        opp = ctx.players(positions=list(SKILL), team=ctx.slate.at[d, "opp"])
        if not opp:
            continue
        w = ctx.new_var("dstpen", cat="Continuous", low=0)
        ctx.add(w >= ctx.sum_xp(opp) - len(opp) * (1 - ctx.xp[d]), "dstpen")
        terms.append(-pen * w)
    return terms
