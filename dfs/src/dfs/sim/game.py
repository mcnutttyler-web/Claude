"""Drive-level NFL game simulator.

Per simulated game:
  1. Possessions: total drives ~ Normal(fitted), split between the two teams.
  2. Scoring: each drive ends in a TD with p_td(s), else a FG with q_fg. s is a team-strength shock (fitted sd,
     fitted cross-team corr). p_td is set so mean TDs equal the projection model's team TDs, and FG so mean points
     equal the Vegas implied team total.
  3. Script: dropback rate moves with the simulated margin versus the expected margin (fitted beta). Plays move
     with drives and scoring (fitted).
  4. Volume: team targets and carries are split across players by a Dirichlet-multinomial whose means are the
     model's shares (fitted concentration). Teammates therefore compete for volume.
  5. Efficiency: catch ~ Binomial(targets, catch rate). Yards are a sum of per-catch or per-carry gamma
     (shifted for carries) draws times a team efficiency multiplier correlated with s. That multiplier is what
     makes a QB and his receivers rise together.
  6. TDs: the team's TD count is split into pass and rush TDs, then assigned to players in proportion to their
     TD share and their realized volume.
  7. Box scores reconcile: QB passing yards and TDs are the sum of his receivers'. The DST is scored from the
     opponent's simulated offense (points, sacks, INTs, fumbles) plus fitted return-TD, safety and
     blocked-kick rates.
  8. Availability: Questionable players are active with probability p_play. Regulars leave early with a fitted
     rate. The volume they miss flows to teammates through the Dirichlet renormalization.

Fantasy points use config/dk_nfl_scoring.yaml. Optional re-centering scales each player's points so the sim mean
equals the final projection, keeping the sim's shape and correlations.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd

from dfs.scoring import load_scoring, score_arrays

ROOT = Path(__file__).resolve().parents[3]
PARAMS = ROOT / "config" / "game_sim_params.json"
SKILL = ("QB", "RB", "WR", "TE")
_GH_X, _GH_W = np.polynomial.hermite_e.hermegauss(40)
_GH_W = _GH_W / _GH_W.sum()


def load_params(path: str | Path | None = None) -> dict:
    return json.loads(Path(path or PARAMS).read_text())


def _logit(p):
    return np.log(p / (1 - p))


def _sigmoid(x):
    return 1 / (1 + np.exp(-x))


def _base_logit(p_target: np.ndarray, sd: float) -> np.ndarray:
    """Logit l such that E[sigmoid(l + sd*Z)] = p_target (Gauss-Hermite + Newton)."""
    p_target = np.clip(np.asarray(p_target, float), 1e-4, 0.95)
    lo = _logit(p_target)
    if sd <= 0:
        return lo
    for _ in range(30):
        s = _sigmoid(lo[..., None] + sd * _GH_X)
        f = (s * _GH_W).sum(-1) - p_target
        d = (s * (1 - s) * _GH_W).sum(-1)
        lo = lo - f / np.maximum(d, 1e-9)
    return lo


def _drive_loop(pa, pb, qa, qb, prm, rng, n, G, sa, sb):
    """Alternate possessions on a 2 x 30-minute clock. Each drive ends TD / FG / other with team-specific
    probabilities (logit-shifted by the team-strength shock). Its duration is gamma by outcome (fitted), so
    scoring drives use more clock and leave fewer possessions. A drive that would run past the end of the half
    ends without points."""
    dur = prm["drive_minutes"]
    shape = {o: (dur[o]["mean"] / dur[o]["sd"]) ** 2 for o in ("td", "fg", "other")}
    scale = {o: dur[o]["sd"] ** 2 / dur[o]["mean"] for o in ("td", "fg", "other")}
    la, lb = _logit(np.clip(pa, 1e-4, 0.95))[None] + sa, _logit(np.clip(pb, 1e-4, 0.95))[None] + sb
    p_td = (_sigmoid(la), _sigmoid(lb))
    q_fg = (np.broadcast_to(qa, (n, G)), np.broadcast_to(qb, (n, G)))
    td = [np.zeros((n, G), int), np.zeros((n, G), int)]
    fg = [np.zeros((n, G), int), np.zeros((n, G), int)]
    drives = [np.zeros((n, G), int), np.zeros((n, G), int)]
    first = (rng.random((n, G)) < 0.5).astype(int)
    for half in (0, 1):
        clock = np.zeros((n, G))
        poss = first if half == 0 else 1 - first
        for _ in range(40):
            live = clock < 30
            if not live.any():
                break
            u = rng.random((n, G))
            ptd = np.where(poss == 0, p_td[0], p_td[1])
            pfg = np.where(poss == 0, q_fg[0], q_fg[1]) * (1 - ptd)
            is_td, is_fg = u < ptd, (u >= ptd) & (u < ptd + pfg)
            d = np.where(is_td, rng.gamma(shape["td"], scale["td"], (n, G)),
                         np.where(is_fg, rng.gamma(shape["fg"], scale["fg"], (n, G)),
                                  rng.gamma(shape["other"], scale["other"], (n, G))))
            fits = clock + d <= 30 + dur.get("half_slack", 1.0)
            for k in (0, 1):
                m = live & (poss == k)
                drives[k] += m
                td[k] += m & is_td & fits
                fg[k] += m & is_fg & fits
            clock = np.where(live, clock + d, clock)
            poss = np.where(live, 1 - poss, poss)
    return td, fg, drives


def drive_points(itt_a, itt_b, prm: dict, strength: dict | None, rng: np.random.Generator, n: int,
                 td_a=None, td_b=None, pilot: int = 1500) -> tuple[np.ndarray, np.ndarray] | dict:
    """Simulate G games (arrays of length G) drive by drive. Per-drive TD and FG rates are calibrated with two
    pilot runs, so mean TDs match td_a / td_b (default: implied total / points-per-score) and mean points match
    the implied totals. Returns (pts_a, pts_b) of shape (n, G) when called with an explicit strength (fitting),
    or a dict of arrays otherwise."""
    itt_a, itt_b = np.atleast_1d(np.asarray(itt_a, float)), np.atleast_1d(np.asarray(itt_b, float))
    G = len(itt_a)
    st = strength or prm["team_strength"]
    ppt = 6 + prm["xp_rate"] * (1 - prm["two_pt_per_td"]) + 2 * prm["two_pt_per_td"] * prm["two_pt_success"]
    rho_fg = prm["drive_fg_rate"] / prm["drive_td_rate"]
    Dm = prm["drives_per_game"]["mean"] / 2
    tgt = []
    for itt, td in ((itt_a, td_a), (itt_b, td_b)):
        td_mean = itt / (ppt + 3 * rho_fg) if td is None else np.atleast_1d(np.asarray(td, float))
        fg_mean = np.clip(itt - ppt * td_mean, 0.9, None) / 3
        tgt.append((td_mean, fg_mean))
    sd, c = float(st["sd"]), float(st["corr"])
    # pilot calibration (no shock -> base rates; then the shock is added around them)
    p = [np.clip(t[0] / Dm, 0.02, 0.8) for t in tgt]
    q = [np.clip(t[1] / (Dm * (1 - pp)), 0.01, 0.6) for t, pp in zip(tgt, p)]
    prng = np.random.default_rng(12345)
    for _ in range(2):
        z1, z2 = prng.standard_normal((2, pilot, G))
        td, fg, _d = _drive_loop(_sigmoid(_base_logit(p[0], sd)), _sigmoid(_base_logit(p[1], sd)), q[0], q[1], prm,
                                 prng, pilot, G, sd * z1, sd * (c * z1 + np.sqrt(1 - c * c) * z2))
        for k in (0, 1):
            p[k] = np.clip(p[k] * tgt[k][0] / np.maximum(td[k].mean(0), 1e-3), 0.01, 0.85)
            q[k] = np.clip(q[k] * tgt[k][1] / np.maximum(fg[k].mean(0), 1e-3), 0.005, 0.7)
    z1, z2 = rng.standard_normal((2, n, G))
    sa, sb = sd * z1, sd * (c * z1 + np.sqrt(1 - c * c) * z2)
    td, fg, D = _drive_loop(_sigmoid(_base_logit(p[0], sd)), _sigmoid(_base_logit(p[1], sd)), q[0], q[1], prm,
                            rng, n, G, sa, sb)
    out = {}
    for k, key, s in ((0, "a", sa), (1, "b", sb)):
        two_att = rng.binomial(td[k], prm["two_pt_per_td"])
        pts = 6 * td[k] + rng.binomial(td[k] - two_att, prm["xp_rate"]) \
            + 2 * rng.binomial(two_att, prm["two_pt_success"]) + 3 * fg[k]
        out[key] = {"drives": D[k], "td": td[k], "fg": fg[k], "pts": pts.astype(float),
                    "s": s / sd if sd > 0 else np.zeros_like(s)}
    if strength is not None:
        return out["a"]["pts"], out["b"]["pts"]
    return out


@dataclass
class GameSims:
    points: np.ndarray                     # (n_sims, n_players) float32
    keys: list                             # column key (dk_index or "DST:<team>")
    info: pd.DataFrame                     # name, team, position, sim_mean_raw, center, ...
    stats: dict = field(default_factory=dict)   # optional per-column stat arrays (keep_stats=True)
    team: dict = field(default_factory=dict)    # per-team arrays: pts, margin, pass_yds, ...
    seed: int = 0

    @property
    def n_sims(self) -> int:
        return self.points.shape[0]


def _yards_sum(rng, count: np.ndarray, table: dict, mean: float) -> np.ndarray:
    """Per sim, the sum of `count` per-play yards drawn from the training seasons' empirical distribution
    (401 quantiles, so negative runs and long plays are kept), scaled so the per-play mean is `mean`."""
    count = np.maximum(np.asarray(count, int), 0)
    total = int(count.sum())
    if total == 0:
        return np.zeros(len(count))
    q = np.asarray(table["q"])
    vals = np.interp(rng.random(total), np.linspace(0, 1, len(q)), q) * (mean / table["mean"])
    return np.bincount(np.repeat(np.arange(len(count)), count), weights=vals, minlength=len(count))


def _availability(rng, n: int, pos: str, p_play: float, prm: dict, early_exit: bool) -> np.ndarray:
    f = np.ones(n)
    if p_play < 0.999:
        f[rng.random(n) >= p_play] = 0.0
    if early_exit:
        e = prm["early_exit"].get(pos)
        if e and e["p"] > 0:
            hit = (rng.random(n) < e["p"]) & (f > 0)
            f[hit] = np.clip(rng.uniform(0, 2 * e["frac"], hit.sum()), 0, 1)
    return f


def _share_draw(rng, n: int, w: np.ndarray, kappa: np.ndarray) -> np.ndarray:
    """(n, k) shares ~ normalized Gamma(kappa*w, 1/kappa): mean w/sum(w), variance falling with kappa."""
    g = rng.gamma(np.maximum(kappa * w, 1e-12), 1 / kappa)
    g[w <= 0] = 0.0
    tot = g.sum(1, keepdims=True)
    return np.divide(g, tot, out=np.zeros_like(g), where=tot > 0)


def _multinomial(rng, total: np.ndarray, shares: np.ndarray) -> np.ndarray:
    p = shares / np.maximum(shares.sum(1, keepdims=True), 1e-12)
    p = np.clip(p, 0, 1)
    p[:, -1] = np.clip(1 - p[:, :-1].sum(1), 0, 1)
    return rng.multinomial(total.astype(np.int64), p)


def _f(r, c):
    v = r.get(c, 0.0)
    return float(v) if v is not None and v == v else 0.0


def simulate_games(rows: pd.DataFrame, teams: pd.DataFrame, env: pd.DataFrame, n_sims: int = 10000, seed: int = 0,
                   prm: dict | None = None, def_inputs: pd.DataFrame | None = None, dst_teams: list[str] | None = None,
                   center: pd.Series | None = None, early_exit: bool = True, keep_stats: bool = False,
                   scoring: dict | None = None) -> GameSims:
    """rows: one row per modeled player (index = key) with name, team, position, points and the bottom-up stat
    means (targets, rec, rec_yds, rec_td, rush_att, rush_yds, rush_td, pass_att, pass_yds, pass_td, int,
    fumble_lost; optional p_play). teams: bottom-up team rows (team, itt, spread, plays, pass_rate, dropbacks,
    pass_att, designed_rush, pass_td, rush_td, listed_target_share). env: team, opp, game_id.
    center: optional target mean per key (final projection) for re-centering; DST keys are "DST:<team>"."""
    prm = prm or load_params()
    cfg = scoring or load_scoring()
    rng = np.random.default_rng(seed)
    n = int(n_sims)
    T = teams.set_index("team")
    E = env.drop_duplicates("team").set_index("team")
    rows = rows[rows["position"].isin(SKILL) & (rows["points"].fillna(0) > 0)]
    kap = prm["dirichlet_kappa"]
    yq = prm["yards_quantiles"]
    eff_sd, rho = prm["team_eff_sd"], float(np.clip(prm["eff_points_corr"], -0.9, 0.9))
    beta = prm["script_beta_dropback_rate_per_pt"]
    ppd = prm["plays_per_drive"]
    D = def_inputs if def_inputs is not None else pd.DataFrame()
    lg_sack = 0.065

    # 1-2. drives and points, per game
    modeled = [t for t in T.index if t in E.index]
    games = {}
    for t in modeled:
        g = E.at[t, "game_id"]
        games.setdefault(g, []).append(t)
    team_out: dict[str, dict] = {}
    for g, ts in games.items():
        a = ts[0]
        b = ts[1] if len(ts) > 1 else E.at[a, "opp"]
        itt_b = float(T.at[b, "itt"]) if b in T.index else float(E.at[a, "game_total"] - T.at[a, "itt"]) \
            if "game_total" in E.columns else float(T.at[a, "itt"])
        td_b = float(T.at[b, "pass_td"] + T.at[b, "rush_td"]) if b in T.index else None
        d = drive_points(float(T.at[a, "itt"]), itt_b, prm, None, rng, n,
                         td_a=float(T.at[a, "pass_td"] + T.at[a, "rush_td"]), td_b=td_b)
        for key, t, o in (("a", a, b), ("b", b, a)):
            team_out[t] = {k: v[:, 0] for k, v in d[key].items()} | {"opp": o, "game_id": g}
    for t, o in list(team_out.items()):
        opp = o["opp"]
        o["margin"] = o["pts"] - team_out[opp]["pts"] if opp in team_out else np.zeros(n)

    cols_pts, keys, info, stats_keep = [], [], [], {}
    Dm = prm["drives_per_game"]["mean"] / 2

    # 3-8. per team
    for t in modeled:
        tr, to = T.loc[t], team_out[t]
        grp = rows[rows["team"] == t]
        plays_m, pr_m = float(tr["plays"]), float(tr["pass_rate"])
        mult = (to["drives"] / Dm) * np.exp(ppd["psi_per_pt"] * (to["pts"] - float(tr["itt"]))
                                            + ppd["sd"] * rng.standard_normal(n))
        plays = plays_m * mult / mult.mean()
        exp_margin = -float(tr["spread"])
        pr = np.clip(pr_m + beta * (to["margin"] - exp_margin), 0.25, 0.85)
        db = plays * pr
        att_m = float(tr["pass_att"])
        att = att_m * db / max(float(tr["dropbacks"]), 1e-6)
        rush_scale = plays * (1 - pr) / max(plays_m * (1 - pr_m), 1e-6)
        s_std = to["s"]
        e_pass = np.exp(eff_sd["pass"] * (rho * s_std + np.sqrt(1 - rho ** 2) * rng.standard_normal(n))
                        - eff_sd["pass"] ** 2 / 2)
        e_rush = np.exp(eff_sd["rush"] * (rho * s_std + np.sqrt(1 - rho ** 2) * rng.standard_normal(n))
                        - eff_sd["rush"] ** 2 / 2)

        qbs = grp[grp["position"] == "QB"]
        qb = qbs["pass_att"].fillna(0).idxmax() if len(qbs) and qbs["pass_att"].fillna(0).max() > 0 else None
        avail = {i: _availability(rng, n, r["position"], _f(r, "p_play") if "p_play" in r and r["p_play"] == r["p_play"]
                                  else 1.0, prm, early_exit) for i, r in grp.iterrows()}
        st = {i: {} for i in grp.index}

        # targets
        catchers = [i for i, r in grp.iterrows() if r["position"] != "QB" and _f(r, "targets") > 0]
        tg_m = np.array([_f(grp.loc[i], "targets") for i in catchers])
        listed = float(np.clip(tr.get("listed_target_share", np.nan), 0.05, 1.0)) \
            if tr.get("listed_target_share", np.nan) == tr.get("listed_target_share", np.nan) else min(tg_m.sum() / max(att_m * 0.92, 1), 1.0)
        team_tg_m = max(tg_m.sum() / max(listed, 1e-6), tg_m.sum())
        team_tg = np.rint(team_tg_m * att / att_m).astype(int)
        w = np.append(tg_m / team_tg_m, max(1 - tg_m.sum() / team_tg_m, 0.0))
        kap_t = np.array([kap.get(f"targets_{grp.at[i, 'position']}", kap["targets_WR"]) for i in catchers]
                         + [kap["targets_WR"]])
        W = np.tile(w, (n, 1))
        for c, i in enumerate(catchers):
            W[:, c] *= avail[i]
        shares = _share_draw(rng, n, W, kap_t)
        tgts = _multinomial(rng, team_tg, shares)
        qb_pass_yds_m = _f(grp.loc[qb], "pass_yds") if qb is not None else team_tg_m * 7.0
        rec_yds_tot = np.zeros(n)
        rec_by = {}
        other_rec_m = max(team_tg_m * w[-1] * 0.64, 1e-6)
        other_yds_m = max(qb_pass_yds_m - sum(_f(grp.loc[i], "rec_yds") for i in catchers), 0.0)
        for c, i in enumerate(catchers + ["_other"]):
            if i == "_other":
                catch_r, ypr = 0.64, (other_yds_m / other_rec_m if other_rec_m > 1e-3 else yq["catch_WR"]["mean"])
            else:
                r = grp.loc[i]
                catch_r = float(np.clip(_f(r, "rec") / max(_f(r, "targets"), 1e-6), 0.05, 0.98))
                ypr = _f(r, "rec_yds") / max(_f(r, "rec"), 1e-6)
            rec = rng.binomial(tgts[:, c], catch_r)
            tab = yq[f"catch_{grp.at[i, 'position']}"] if i != "_other" and f"catch_{grp.at[i, 'position']}" in yq \
                else yq["catch_WR"]
            yds = _yards_sum(rng, rec, tab, max(ypr, 0.5)) * e_pass
            rec_yds_tot += yds
            rec_by[i] = rec
            if i == "_other":
                other_yds = yds
            else:
                st[i].update(targets=tgts[:, c], rec=rec, rec_yds=yds)

        # carries (QB1 plus every non-QB with carries plus an "other" bucket)
        rushers = ([qb] if qb is not None and _f(grp.loc[qb], "rush_att") > 0 else []) + \
            [i for i, r in grp.iterrows() if r["position"] != "QB" and _f(r, "rush_att") > 0]
        ca_m = np.array([_f(grp.loc[i], "rush_att") for i in rushers])
        scr = max(float(tr["dropbacks"]) - att_m - lg_sack * float(tr["dropbacks"]), 0.0)
        team_ca_m = max(float(tr["designed_rush"]) + scr, ca_m.sum())
        team_ca = np.rint(team_ca_m * rush_scale).astype(int)
        w = np.append(ca_m / team_ca_m, max(1 - ca_m.sum() / team_ca_m, 0.0))
        kap_c = np.array([kap["carries_QB"] if grp.at[i, "position"] == "QB" else kap["carries_RB"] for i in rushers]
                         + [kap["carries_RB"]])
        W = np.tile(w, (n, 1))
        for c, i in enumerate(rushers):
            W[:, c] *= avail[i]
        car = _multinomial(rng, team_ca, _share_draw(rng, n, W, kap_c))
        car_by = {}
        for c, i in enumerate(rushers):
            r = grp.loc[i]
            ypc = _f(r, "rush_yds") / max(_f(r, "rush_att"), 1e-6)
            tab = yq["carry_QB"] if r["position"] == "QB" else yq["carry_RB"]
            yds = _yards_sum(rng, car[:, c], tab, ypc) * e_rush
            st[i].update(rush_att=car[:, c], rush_yds=yds)
            car_by[i] = car[:, c]

        # touchdowns: team TDs -> pass / rush -> players
        ptd_m, rtd_m = float(tr["pass_td"]), float(tr["rush_td"])
        n_td = to["td"]
        pass_td = rng.binomial(n_td, ptd_m / max(ptd_m + rtd_m, 1e-6))
        rush_td = n_td - pass_td
        wt = np.array([_f(grp.loc[i], "rec_td") / ptd_m for i in catchers] + [0.0]) if ptd_m > 0 else np.zeros(len(catchers) + 1)
        wt[-1] = max(1 - wt[:-1].sum(), 0.0)
        Wt = np.tile(wt, (n, 1))
        for c, i in enumerate(catchers):
            Wt[:, c] *= rec_by[i] / max(_f(grp.loc[i], "rec"), 1e-6)
        Wt[:, -1] *= rec_by["_other"] / other_rec_m
        rec_td = _multinomial(rng, pass_td, np.where(Wt.sum(1, keepdims=True) > 0, Wt, np.eye(len(wt))[-1]))
        for c, i in enumerate(catchers):
            st[i]["rec_td"] = np.minimum(rec_td[:, c], rec_by[i])
        wr_ = np.array([_f(grp.loc[i], "rush_td") / rtd_m for i in rushers] + [0.0]) if rtd_m > 0 else np.zeros(len(rushers) + 1)
        wr_[-1] = max(1 - wr_[:-1].sum(), 0.0)
        Wr = np.tile(wr_, (n, 1))
        for c, i in enumerate(rushers):
            Wr[:, c] *= car_by[i] / max(_f(grp.loc[i], "rush_att"), 1e-6)
        rtd = _multinomial(rng, rush_td, np.where(Wr.sum(1, keepdims=True) > 0, Wr, np.eye(len(wr_))[-1]))
        for c, i in enumerate(rushers):
            st[i]["rush_td"] = np.minimum(rtd[:, c], np.maximum(car_by[i], 0))

        # QB passing reconciles to receivers; INTs, sacks, fumbles
        int_m = _f(grp.loc[qb], "int") if qb is not None else att_m * 0.023
        ints = rng.poisson(np.maximum(int_m * att / att_m / np.sqrt(e_pass), 0))
        if def_inputs is not None and t in D.index and to["opp"] in D.index:
            sr = 0.5 * float(D.at[t, "off_sack_rate_allowed"]) + 0.5 * float(D.at[to["opp"], "def_sack_rate"])
        else:
            sr = lg_sack
        sacks = rng.binomial(np.rint(db).astype(int), float(np.clip(sr, 0.02, 0.15)))
        if qb is not None:
            f = avail[qb]
            st[qb].update(pass_yds=rec_yds_tot * f, pass_td=rng.binomial(pass_td, np.clip(f, 0, 1)),
                          int=rng.binomial(ints, np.clip(f, 0, 1)), pass_att=att * f)
        fum_tot = np.zeros(n, dtype=int)
        for i in grp.index:
            r = grp.loc[i]
            touch_m = _f(r, "rush_att") + _f(r, "rec") + _f(r, "pass_att")
            touch = st[i].get("rush_att", 0) + st[i].get("rec", 0) + st[i].get("pass_att", 0)
            fl = rng.poisson(np.maximum(_f(r, "fumble_lost") * touch / max(touch_m, 1e-6), 0)) \
                if touch_m > 0 else np.zeros(n, dtype=int)
            st[i]["fumble_lost"] = fl
            fum_tot = fum_tot + fl
        to.update(pass_yds=rec_yds_tot, other_rec_yds=other_yds, sacks=sacks, ints=ints, fumbles=fum_tot, plays=plays, pass_rate=pr)

        for i in grp.index:
            s = {k: v for k, v in st[i].items() if k in ("pass_yds", "pass_td", "int", "rush_yds", "rush_td", "rec",
                                                            "rec_yds", "rec_td", "fumble_lost")}
            pts = score_arrays(s, cfg, n) if s else np.zeros(n)
            if i not in st or (grp.at[i, "position"] == "QB" and i != qb):
                pts = np.zeros(n)
            cols_pts.append(pts)
            keys.append(i)
            info.append({"key": i, "name": grp.at[i, "name"], "team": t, "position": grp.at[i, "position"],
                         "proj_in": float(grp.at[i, "points"])})
            if keep_stats:
                stats_keep[i] = st[i]

    # DST from the opposing offense
    dst = prm["dst"]
    for t in (dst_teams if dst_teams is not None else modeled):
        if t not in team_out or team_out[t]["opp"] not in team_out:
            continue
        o = team_out[team_out[t]["opp"]]
        to_forced = o["ints"] + o["fumbles"]
        s = {"sacks": o["sacks"], "def_int": o["ints"], "fum_rec": o["fumbles"],
             "def_td": rng.binomial(to_forced, dst["return_td_per_turnover"]) + rng.poisson(dst["st_td_per_game"], n),
             "safety": rng.poisson(dst["safety_per_game"], n), "blocked_kick": rng.poisson(dst["blocked_kick_per_game"], n),
             "pts_allowed": o["pts"]}
        cols_pts.append(score_arrays(s, cfg, n))
        keys.append(f"DST:{t}")
        info.append({"key": f"DST:{t}", "name": t, "team": t, "position": "DST", "proj_in": np.nan})
        if keep_stats:
            stats_keep[f"DST:{t}"] = s

    P = np.column_stack(cols_pts) if cols_pts else np.zeros((n, 0))
    info = pd.DataFrame(info)
    info["sim_mean_raw"] = P.mean(0) if len(info) else []
    if center is not None and len(info):
        P = recenter(P, info, center)
    info["sim_mean"] = P.mean(0) if len(info) else []
    return GameSims(P.astype(np.float32), keys, info, stats_keep, team_out, seed)


def recenter(P: np.ndarray, info: pd.DataFrame, center: pd.Series) -> np.ndarray:
    """Scale (skill) or shift (DST, or when the ratio is outside [0.5, 2]) so each column's mean = center."""
    P = P.copy()
    tgt = info["key"].map(center)
    info["center"] = tgt
    for j, (m, c, pos) in enumerate(zip(P.mean(0), tgt, info["position"])):
        if c != c:
            continue
        if pos != "DST" and m > 0.5 and 0.5 <= c / m <= 2.0:
            P[:, j] *= c / m
        else:
            P[:, j] += c - m
    return P


def player_summary(gs: GameSims, salary: pd.Series | None = None) -> pd.DataFrame:
    x = gs.points
    q = np.percentile(x, [10, 25, 50, 75, 85, 90, 95], axis=0)
    out = gs.info[["key", "name", "team", "position"]].copy()
    out["mean"], out["std"] = x.mean(0), x.std(0)
    for k, p in enumerate((10, 25, 50, 75, 85, 90, 95)):
        out[f"p{p}"] = q[k]
    for thr in (10, 15, 20, 25, 30):
        out[f"P{thr}+"] = (x >= thr).mean(0)
    return out.round(3)
