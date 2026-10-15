"""Monte Carlo outcome distributions (build prompt §3.8, P2 version).

Per sim, latent shocks drive correlation:
    game shock g (per game) -> both teams' scoring move together
    team pass shock, team rush shock, team TD shock (per team)
Players with a stat line (market or stat sources) are simulated stat by stat:
    yards/attempts/receptions ~ Gamma(mean, sd) via the copula, TDs/INTs ~ Poisson(lambda x team-TD multiplier),
    DK bonuses scored on the simulated yards; then scaled so the sim mean equals the blended mean.
Players with only a points projection get a shifted lognormal loaded on the team factor for their role.
DST: points allowed ~ Normal(opp implied, sigma) driven by the OPPONENT's game/TD shocks (negative correlation
with the opposing offense), sacks/INT/fumble recoveries/TD ~ Poisson.
Questionable players: active ~ Bernoulli(p_play); when inactive their points are 0 and redistribute_frac of their
mean moves to same-group teammates (RB->RB, WR/TE->WR/TE) in those sims.

Percentiles reported are CONDITIONAL on the player being active (p_play is reported separately); the saved sim
matrix includes inactive zeros for lineup simulations.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from scipy.stats import gamma as gamma_dist, norm

from core.projections.params import Params

PASS_POS = {"QB", "WR", "TE"}
GROUP = {"RB": "RB", "WR": "PC", "TE": "PC"}


@dataclass
class SimResult:
    summary: pd.DataFrame          # one row per dk_index
    sims: np.ndarray               # (n_sims, n_players) float32, inactive -> 0
    index: np.ndarray              # dk_index for each column


def _gamma_ppf(u: np.ndarray, mean: float, sd: float) -> np.ndarray:
    if mean <= 0:
        return np.zeros_like(u)
    sd = max(sd, 1e-6)
    k = (mean / sd) ** 2
    return gamma_dist.ppf(u, a=k, scale=mean / k)


def simulate(table: pd.DataFrame, params: Params, scoring: dict, n_sims: int | None = None, seed: int = 0,
             dst_detail: dict[int, dict] | None = None) -> SimResult:
    """table: dk_index-indexed rows with team, opp, game_id, position, mean, p_play, salary(opt), stat columns."""
    n = int(n_sims or params.get("distributions.n_sims"))
    rng = np.random.default_rng(seed)
    L = params.get("distributions.loading")
    td_s = float(params.get("distributions.td_shock_scale"))
    stat_cv = params.get("distributions.stat_cv")
    pts_cv = params.get("distributions.points_cv")
    pts_min = params.get("distributions.points_min")
    disp = params.get("distributions.dispersion_scale")
    redistribute = float(params.get("questionable.redistribute_frac"))
    off, bon = scoring["offense"], scoring["bonuses"]

    t = table[table["mean"].notna()].copy()
    games = sorted(t["game_id"].unique())
    teams = sorted(set(t["team"]) | set(t["opp"].dropna()))
    G = {g: rng.standard_normal(n) for g in games}
    TP = {k: rng.standard_normal(n) for k in teams}
    TR = {k: rng.standard_normal(n) for k in teams}
    TT = {k: rng.standard_normal(n) for k in teams}
    game_of_team = dict(zip(t["team"], t["game_id"]))

    def team_td_shock(team):
        g = G.get(game_of_team.get(team), np.zeros(n))
        return L["game"] * g + np.sqrt(1 - L["game"] ** 2) * TT[team]

    # Zero-sum share shocks among each team's pass catchers (centered => negatively correlated teammates).
    catchers = {k: list(t.index[(t["team"] == k) & t["position"].isin(["WR", "TE"])]) for k in teams}
    SHARE = {}
    for k, idx in catchers.items():
        if len(idx) >= 2:
            e = rng.standard_normal((n, len(idx)))
            e = (e - e.mean(axis=1, keepdims=True)) / np.sqrt(1 - 1 / len(idx))
            SHARE.update({i: e[:, c] for c, i in enumerate(idx)})

    def latent(team, kind, idx=None, pos=None):
        g = G.get(game_of_team.get(team), np.zeros(n))
        a = L["game"]
        if kind == "rush":
            b, f, c, sh = L["team_rush"], TR[team], 0.0, 0.0
        elif pos == "QB":
            b, f, c, sh = L["qb_pass"], TP[team], 0.0, 0.0
        else:
            b, f = L["catcher_pass"], TP[team]
            sh = SHARE.get(idx, 0.0)
            c = L["share"] if idx in SHARE else 0.0
        e = rng.standard_normal(n)
        return a * g + b * f + c * sh + np.sqrt(max(1 - a * a - b * b - c * c, 0.05)) * e

    cols, out_rows = [], []
    sims = np.zeros((n, len(t)), dtype=np.float64)
    for j, (i, r) in enumerate(t.iterrows()):
        pos, team = r["position"], r["team"]
        scale = float(disp.get(pos, 1.0))
        mean = float(r["mean"])
        has_stats = any(pd.notna(r.get(c)) and float(r.get(c) or 0) > 0
                        for c in ("pass_yds", "rush_yds", "rec_yds", "rec"))
        if pos == "DST" and dst_detail and int(i) in dst_detail:
            d = dst_detail[int(i)]
            opp = r["opp"]
            z = team_td_shock(opp) * 0.8 + 0.6 * rng.standard_normal(n)
            pa = np.clip(np.round(d["opp_implied"] + d["sigma"] * scale * z), 0, None)
            tiers = scoring["dst_points_allowed"]
            tier_pts = np.full(n, float(tiers[-1][1]))
            for max_pa, p in reversed(tiers[:-1]):
                tier_pts = np.where(pa <= max_pa, float(p), tier_pts)
            pass_down = np.exp(-0.25 * TP[opp])          # opponent pass success -> fewer sacks/INT
            dd = scoring["dst"]
            x = (rng.poisson(d["sacks"] * pass_down) * dd["sacks"] + rng.poisson(d["def_int"] * pass_down) * dd["def_int"]
                 + rng.poisson(d["fum_rec"], n) * dd["fum_rec"] + rng.poisson(d["def_td"], n) * dd["def_td"]
                 + rng.poisson(d["safety"], n) * dd["safety"] + rng.poisson(d["blocked_kick"], n) * dd["blocked_kick"]
                 + tier_pts)
        elif has_stats and pos in ("QB", "RB", "WR", "TE"):
            x = np.zeros(n)
            tdm = np.exp(td_s * team_td_shock(team) - 0.5 * td_s ** 2)
            up = norm.cdf(latent(team, "pass", i, pos))
            ur = norm.cdf(latent(team, "rush"))

            def sd_of(stat, m):
                v = r.get(f"sd_{stat}")
                return float(v) * scale if pd.notna(v) and v else stat_cv.get(stat, 0.5) * m * scale

            py = _gamma_ppf(up, float(r.get("pass_yds") or 0), sd_of("pass_yds", float(r.get("pass_yds") or 0)))
            ry = _gamma_ppf(ur, float(r.get("rush_yds") or 0), sd_of("rush_yds", float(r.get("rush_yds") or 0)))
            u_rec = np.clip(up + 0.0, 1e-6, 1 - 1e-6)
            rec = np.round(_gamma_ppf(u_rec, float(r.get("rec") or 0), sd_of("rec", float(r.get("rec") or 0))))
            cy = _gamma_ppf(np.clip(0.7 * u_rec + 0.3 * rng.random(n), 1e-6, 1 - 1e-6),
                            float(r.get("rec_yds") or 0), sd_of("rec_yds", float(r.get("rec_yds") or 0)))
            x += py * off["pass_yds"] + ry * off["rush_yds"] + rec * off["rec"] + cy * off["rec_yds"]
            for stat, pts in (("pass_td", off["pass_td"]), ("rush_td", off["rush_td"]), ("rec_td", off["rec_td"])):
                lam = float(r.get(stat) or 0)
                if lam > 0:
                    x += rng.poisson(lam * tdm) * pts
            lam_int = float(r.get("int") or 0)
            if lam_int > 0:
                x += rng.poisson(lam_int * np.exp(-0.2 * TP[team]), n) * off["int"]
            x += (py >= bon["pass_yds"][0]) * bon["pass_yds"][1] + (ry >= bon["rush_yds"][0]) * bon["rush_yds"][1] \
                + (cy >= bon["rec_yds"][0]) * bon["rec_yds"][1]
            sm = x.mean()
            if sm > 0 and 0.5 < mean / sm < 2.0:
                x = x * (mean / sm)                       # keep the blended mean; stat sim supplies the shape
            else:
                has_stats = False
        if not (pos == "DST" and dst_detail and int(i) in dst_detail) and not has_stats:
            lo = float(pts_min.get(pos, -2))
            m = max(mean - lo, 1e-3)
            sd = float(pts_cv.get(pos, 0.6)) * max(mean, 0.5) * scale
            s2 = np.log(1 + (sd / m) ** 2)
            kind = "rush" if pos == "RB" else "pass"
            u = latent(team, kind, i, pos) if team in TP else rng.standard_normal(n)
            x = lo + np.exp(np.log(m) - s2 / 2 + np.sqrt(s2) * u)
        sims[:, j] = x
        cols.append(int(i))

    # Questionable mixtures + redistribution to same-group teammates.
    active = np.ones_like(sims, dtype=bool)
    pp = t["p_play"].fillna(1.0).to_numpy()
    tm = t["team"].to_numpy()
    grp = t["position"].map(GROUP).to_numpy()
    means = t["mean"].to_numpy(float)
    for j in np.flatnonzero(pp < 0.999):
        act = rng.random(n) < pp[j]
        active[:, j] = act
        if grp[j] is None or (isinstance(grp[j], float) and np.isnan(grp[j])):
            continue
        mates = np.flatnonzero((tm == tm[j]) & (grp == grp[j]) & (np.arange(len(t)) != j))
        tot = means[mates].clip(min=0).sum()
        if len(mates) and tot > 0 and means[j] > 0:
            boost = 1.0 + redistribute * means[j] / tot
            sims[np.ix_(~act, mates)] *= boost
    cond = sims.copy()
    sims = np.where(active, sims, 0.0)

    rows = []
    sal = t["salary"].to_numpy(float) if "salary" in t else np.full(len(t), np.nan)
    vl_cash = float(params.get("value_line.cash"))
    vl_gpp = float(params.get("value_line.gpp"))
    for j, i in enumerate(cols):
        a = active[:, j]
        x = cond[a, j] if a.any() else cond[:, j]
        q = np.percentile(x, [10, 25, 50, 75, 85, 90])
        r = {"dk_index": i, "sim_mean": float(x.mean()), "median": q[2], "p10": q[0], "p25": q[1], "p75": q[3],
             "p85": q[4], "p90": q[5], "std": float(x.std()), "sim_mean_mixture": float(sims[:, j].mean())}
        if sal[j] == sal[j]:
            r["p_value_cash"] = float((x >= vl_cash * sal[j] / 1000).mean())
            r["p_value_gpp"] = float((x >= vl_gpp * sal[j] / 1000).mean())
        rows.append(r)
    return SimResult(pd.DataFrame(rows).round(3), sims.astype(np.float32), np.array(cols))


# ------------------------------------------------------------------ calibration
def coverage(df: pd.DataFrame) -> pd.DataFrame:
    """df: position, p10, p90, actual -> share below p10 / above p90 by position (target 10% each)."""
    g = df.assign(below=df["actual"] < df["p10"], above=df["actual"] > df["p90"])
    return g.groupby("position")[["below", "above"]].mean().assign(n=g.groupby("position").size())


def fit_dispersion(df: pd.DataFrame, target: float = 0.10) -> dict[str, float]:
    """Scale factor per position so the share outside [p10, p90] is 2 x target.

    Widens/narrows the bands around the median, never the means (build prompt §3.8)."""
    out = {}
    for pos, g in df.groupby("position"):
        med, lo, hi, act = (g[c].to_numpy(float) for c in ("median", "p10", "p90", "actual"))

        def outside(s):
            return np.mean((act < med - s * (med - lo)) | (act > med + s * (hi - med)))

        a, b = 0.2, 5.0
        for _ in range(60):
            mid = (a + b) / 2
            if outside(mid) > 2 * target:
                a = mid
            else:
                b = mid
        out[pos] = round((a + b) / 2, 4)
    return out
