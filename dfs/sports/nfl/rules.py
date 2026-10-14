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
        for d in dsts:                                   # pairwise form: tight LP relaxation
            for q in ctx.players(positions=["QB"], team=slate.at[d, "opp"]):
                ctx.add(ctx.xp[q] + ctx.xp[d] <= 1, "qb_vs_dst")

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
    # Penalty per (DST, opposing skill player) pair. Only pairs a lineup could plausibly use are modelled
    # (the opponent's top players by median) to keep the model small; z >= x_p + x_d - 1 is the tight form.
    top_k = int(opt.get("soft_penalty_top_k", 6))
    med = ctx.slate["median"] if "median" in ctx.slate else None
    terms = []
    for d in ctx.players(positions=["DST"]):
        opp = ctx.players(positions=list(SKILL), team=ctx.slate.at[d, "opp"])
        if med is not None:
            opp = sorted(opp, key=lambda i: -float(med.iloc[i]))[:top_k]
        for p in opp:
            z = ctx.new_var("dstpen", cat="Continuous", low=0)
            ctx.add(z >= ctx.xp[p] + ctx.xp[d] - 1, "dstpen")
            terms.append(-pen * z)
    return terms


def field_stack(slate, rng, weights, cfg: dict) -> list[int]:
    """Players a 'stacker' field entrant forces in: QB + a main WR, a second pass catcher with p, and a
    bring-back with p (Section 5.3). Chosen in proportion to the entrant's sampling weights."""
    import numpy as np

    w = np.asarray(weights, dtype=float)
    pos = slate["position"].to_numpy()
    team = slate["team"].to_numpy()
    qbs = np.flatnonzero(pos == "QB")
    if not len(qbs) or w[qbs].sum() <= 0:
        return []
    q = int(rng.choice(qbs, p=w[qbs] / w[qbs].sum()))
    t, o = team[q], slate.at[q, "opp"]
    forced = [q]

    def pick(mask):
        idx = np.flatnonzero(mask & ~np.isin(np.arange(len(pos)), forced))
        if not len(idx) or w[idx].sum() <= 0:
            return None
        return int(rng.choice(idx, p=w[idx] / w[idx].sum()))

    wr = pick((pos == "WR") & (team == t))
    if wr is not None:
        forced.append(wr)
    if rng.random() < float(cfg.get("second_catcher_p", 0.4)):
        pc = pick(np.isin(pos, ["WR", "TE"]) & (team == t))
        if pc is not None:
            forced.append(pc)
    if rng.random() < float(cfg.get("bring_back_p", 0.35)):
        bb = pick(np.isin(pos, ["RB", "WR", "TE"]) & (team == o))
        if bb is not None:
            forced.append(bb)
    return forced


def field_stack_batch(slate, rng, W, cfg: dict, is_stacker) -> list:
    """Vectorized field_stack for many entrants (rows of W). Returns a list of forced-index lists (None if not
    a stacker)."""
    import numpy as np

    pos = slate["position"].to_numpy()
    codes, uniq = np.unique(slate["team"].to_numpy(), return_inverse=True)[1], None
    team_code = codes
    opp = slate["opp"].to_numpy()
    tmap = {t: k for k, t in enumerate(np.unique(slate["team"].to_numpy()))}
    opp_code = np.array([tmap.get(o, -1) for o in opp])
    B, n = W.shape

    def draw(mask):                                  # mask: (B x n) bool -> index per row or -1
        w = W * mask
        tot = w.sum(1)
        cum = np.cumsum(w, 1)
        r = rng.random(B) * tot
        k = np.minimum((cum < r[:, None]).sum(1), n - 1)
        return np.where(tot > 0, k, -1)

    rows = np.flatnonzero(is_stacker)
    out = [None] * B
    if not len(rows):
        return out
    qb = draw(np.broadcast_to(pos == "QB", (B, n)))
    t = np.where(qb >= 0, team_code[np.clip(qb, 0, None)], -2)
    o = np.where(qb >= 0, opp_code[np.clip(qb, 0, None)], -2)
    same = team_code[None, :] == t[:, None]
    wr = draw(same & (pos == "WR")[None, :])
    pc_mask = same & np.isin(pos, ["WR", "TE"])[None, :]
    pc_mask[np.arange(B), np.clip(wr, 0, None)] &= wr < 0
    pc = draw(pc_mask)
    bb = draw((opp_code[None, :] * 0 + team_code[None, :] == o[:, None]) & np.isin(pos, ["RB", "WR", "TE"])[None, :])
    u2, u3 = rng.random(B), rng.random(B)
    p2, p3 = float(cfg.get("second_catcher_p", 0.4)), float(cfg.get("bring_back_p", 0.35))
    for b in rows:
        if qb[b] < 0:
            continue
        f = [int(qb[b])]
        if wr[b] >= 0:
            f.append(int(wr[b]))
        if u2[b] < p2 and pc[b] >= 0 and pc[b] not in f:
            f.append(int(pc[b]))
        if u3[b] < p3 and bb[b] >= 0:
            f.append(int(bb[b]))
        out[b] = f
    return out


def check_lineup(slate, players, opt: dict) -> list[str]:
    """Hard-rule check for lineups built outside the ILP (e.g. consensus neighbours)."""
    errs = []
    if opt.get("block_qb_vs_opp_dst"):
        pos = slate["position"].to_numpy()
        team = slate["team"].to_numpy()
        opp = slate["opp"].to_numpy()
        qb_teams = {team[p] for p in players if pos[p] == "QB"}
        for p in players:
            if pos[p] == "DST" and opp[p] in qb_teams:
                errs.append("QB vs opposing DST")
    return errs
