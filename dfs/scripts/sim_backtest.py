"""Out-of-sample test of the drive-level game simulator against the current simulator and a dumb baseline.

Test seasons default to 2023-2025. The simulator's parameters were fit on 2016-2022 only, and 2026 (the holdout) is
never read. Each week builds the bottom-up model from data before kickoff, as scripts/backtest_own_model.py does.
All three engines use the same player means, so only the shape and correlation of the distributions differ.

Engines:
  new      src/dfs/sim/game.py (drive-level), re-centered to the model's points
  current  core/projections/distributions.py: the projection engine's sim (factor copula with fixed loadings),
           which supplies p10/p90 in the projection table
  app      core/slate_sim.py: what the Cash/GPP tabs actually simulate with. It is given what the app gets:
           median = the projection, ceiling = the current engine's p90, plus correlations.yaml. DST is excluded
           because it has no comparable input here.
  baseline Normal(mean, fixed CV by position), independent players

Metrics on the FFA pool (top-20 QB/TE and top-40 RB/WR by projection, among players who played) plus every DST:
  coverage   share of actuals below p10 / above p90 (target 10% each) and inside p25-p75 (target 50%)
  CRPS       continuous ranked probability score (lower is better; proper scoring rule for the full distribution)
  Brier20    Brier score for P(20+ DK points) (ceiling calibration)
  corr       within-game correlation of residuals for role pairs (QB-WR1, WR1-WR2, ...), actual vs simulated

    python scripts/sim_backtest.py --weeks 2023:2-18 2024:2-18 2025:2-18 --sims 2000
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / "src"), str(ROOT / "scripts")]

from backtest_own_model import POOL, week_frame  # noqa: E402
from core.projections import nflverse  # noqa: E402
from core.projections.distributions import simulate as current_simulate  # noqa: E402
from core.projections.params import Params  # noqa: E402
from core.scorecard import dst_points  # noqa: E402
from core.slate_sim import simulate_slate  # noqa: E402
from dfs.sim.game import simulate_games  # noqa: E402
from sports.base import load_sport  # noqa: E402

PAIRS = [("QB1", "WR1"), ("QB1", "WR2"), ("QB1", "TE1"), ("QB1", "RB1"), ("WR1", "WR2"), ("WR1", "TE1"),
         ("RB1", "RB2"), ("RB1", "WR1"), ("QB1", "oQB1"), ("QB1", "oWR1"), ("RB1", "oRB1"), ("DST", "oQB1"),
         ("DST", "RB1"), ("DST", "QB1")]


def crps_sample(x: np.ndarray, y: np.ndarray) -> np.ndarray:
    """CRPS per column from sorted samples x (n, k) and observations y (k,): E|X-y| - 0.5 E|X-X'|."""
    xs = np.sort(x, axis=0)
    n = xs.shape[0]
    t1 = np.abs(xs - y[None]).mean(0)
    w = (2 * np.arange(1, n + 1) - n - 1)[:, None]
    t2 = (w * xs).sum(0) / (n * n)
    return t1 - t2


def crps_normal(mu, sd, y):
    from scipy.stats import norm
    z = (y - mu) / sd
    return sd * (z * (2 * norm.cdf(z) - 1) + 2 * norm.pdf(z) - 1 / np.sqrt(np.pi))


def roles(rows: pd.DataFrame) -> dict:
    """Pre-game roles per team by projected points: QB1, RB1-2, WR1-3, TE1 -> key."""
    out = {}
    for team, g in rows.groupby("team"):
        r = {}
        for pos, k in (("QB", 1), ("RB", 2), ("WR", 3), ("TE", 1)):
            top = g[g["position"] == pos].sort_values("points", ascending=False).index[:k]
            for j, key in enumerate(top):
                r[f"{pos}{j + 1}"] = key
        r["DST"] = f"DST:{team}"
        out[team] = r
    return out


def evaluate_week(season, week, games, sport, params, cache, n_sims, seed, cv):
    got = week_frame(season, week, games, sport, params, cache, return_model=True)
    if got is None:
        return None
    out, res, env, slate, act = got
    rows = res.rows.merge(slate[["name", "team", "position"]], left_on="dk_index", right_index=True)
    rows = rows.set_index("dk_index")
    rows = rows[rows["points"] > 0]
    # actual DK points (offense: model frame; DST: play-by-play)
    actual = out.set_index("dk_index")["actual"] if "dk_index" in out else pd.Series(dtype=float)
    dst = dst_points(season, week, sport.team_aliases, nflverse).set_index("team")["dk"]

    # new engine (re-centered to the model's own points; DST is the sim's own mean, no external projection)
    new = simulate_games(rows, res.teams, env, n_sims=n_sims, seed=seed, def_inputs=res.dst_inputs,
                         center=rows["points"])
    new_x = pd.DataFrame(new.points, columns=new.keys)

    # current engine on identical means and stat lines (no DST detail -> DST excluded for it)
    tab = rows.merge(env[["team", "opp", "game_id"]], left_on="team", right_on="team", how="left")
    tab.index = rows.index
    tab = tab.assign(mean=rows["points"], p_play=1.0)
    cur = current_simulate(tab, params, sport.scoring_cfg, n_sims, seed)
    cur_x = pd.DataFrame(cur.sims, columns=list(cur.index))

    # app engine: Gaussian copula over marginals fit to (median, ceiling)
    p90 = cur.summary.set_index("dk_index")["p90"]
    sl = tab[["name", "team", "opp", "game_id", "position"]].copy()
    sl["id"] = sl.index.astype(str)
    sl["median"] = rows["points"]
    sl["ceiling"] = p90.reindex(sl.index)
    sl["salary"] = 5000
    sl = sl[sl["ceiling"].notna() & (sl["ceiling"] > sl["median"])]
    app = simulate_slate(sl, sport, n_sims=n_sims, seed=seed)
    app_x = pd.DataFrame(app.scores, columns=list(sl.index))

    pool = out[out["position"].isin(POOL)].copy()
    pool = pd.concat([g.sort_values("points", ascending=False).head(POOL[p])
                      for p, g in pool.groupby("position")])
    recs = []
    for r in pool.itertuples():
        k = r.dk_index
        if k not in new_x.columns or k not in cur_x.columns:
            continue
        recs.append({"season": season, "week": week, "key": k, "position": r.position, "team": r.team,
                     "proj": r.points, "actual": r.actual})
    for team in new.info.loc[new.info["position"] == "DST", "team"]:
        if team in dst.index:
            recs.append({"season": season, "week": week, "key": f"DST:{team}", "position": "DST", "team": team,
                         "proj": float(new_x[f"DST:{team}"].mean()), "actual": float(dst[team])})
    ev = pd.DataFrame(recs)
    if ev.empty:
        return None
    y = ev["actual"].to_numpy(float)
    for name, X in (("new", new_x), ("current", cur_x), ("app", app_x)):
        cols = [k if k in X.columns else None for k in ev["key"]]
        have = np.array([c is not None for c in cols])
        x = np.full((n_sims, len(ev)), np.nan)
        x[:, have] = X[[c for c in cols if c is not None]].to_numpy(float)
        q = np.nanpercentile(x, [10, 25, 75, 90], axis=0)
        ev[f"{name}_below10"] = np.where(have, y < q[0], np.nan)
        ev[f"{name}_above90"] = np.where(have, y > q[3], np.nan)
        ev[f"{name}_in50"] = np.where(have, (y >= q[1]) & (y <= q[2]), np.nan)
        cr = np.full(len(ev), np.nan)
        cr[have] = crps_sample(x[:, have], y[have])
        ev[f"{name}_crps"] = cr
        p20 = np.where(have, (x >= 20).mean(0), np.nan)
        ev[f"{name}_brier20"] = (p20 - (y >= 20)) ** 2
    mu = ev["proj"].to_numpy(float)
    sd = np.maximum(ev["position"].map(cv).to_numpy(float) * np.maximum(mu, 1.0), 0.5)
    from scipy.stats import norm
    ev["baseline_below10"] = y < norm.ppf(0.10, mu, sd)
    ev["baseline_above90"] = y > norm.ppf(0.90, mu, sd)
    ev["baseline_in50"] = (y >= norm.ppf(0.25, mu, sd)) & (y <= norm.ppf(0.75, mu, sd))
    ev["baseline_crps"] = crps_normal(mu, sd, y)
    ev["baseline_brier20"] = (norm.sf(20, mu, sd) - (y >= 20)) ** 2

    # residual pairs for correlation
    R = roles(rows)
    team_opp = env.drop_duplicates("team").set_index("team")["opp"].to_dict()
    act_all = dict(zip(out["dk_index"], out["actual"]))
    act_all.update({f"DST:{t}": float(v) for t, v in dst.items()})
    pairs = []
    for team, r in R.items():
        o = R.get(team_opp.get(team), {})
        for a, b in PAIRS:
            ka = r.get(a)
            kb = o.get(b[1:]) if b.startswith("o") else r.get(b)
            if ka is None or kb is None or ka not in act_all or kb not in act_all:
                continue
            if ka not in new_x.columns or kb not in new_x.columns:
                continue
            xa, xb = new_x[ka].to_numpy(), new_x[kb].to_numpy()
            rec = {"pair": f"{a}-{b}", "res_a": act_all[ka] - xa.mean(), "res_b": act_all[kb] - xb.mean(),
                   "new_corr": np.corrcoef(xa, xb)[0, 1]}
            if ka in cur_x.columns and kb in cur_x.columns:
                rec["current_corr"] = np.corrcoef(cur_x[ka], cur_x[kb])[0, 1]
            if ka in app_x.columns and kb in app_x.columns:
                rec["app_corr"] = np.corrcoef(app_x[ka], app_x[kb])[0, 1]
            pairs.append(rec)
    team_rows = []
    for t, o in new.team.items():
        g = games[(games["season"] == season) & (games["week"] == week)]
        hit = g[(g["home_team"].map(lambda x: sport.team_aliases.get(x, x)) == t)]
        score = hit["home_score"] if len(hit) else g[g["away_team"].map(lambda x: sport.team_aliases.get(x, x)) == t]["away_score"]
        if len(score):
            team_rows.append({"team": t, "actual": float(score.iloc[0]), "sim_mean": float(o["pts"].mean()),
                              "below10": float(score.iloc[0]) < np.percentile(o["pts"], 10),
                              "above90": float(score.iloc[0]) > np.percentile(o["pts"], 90),
                              "crps": float(crps_sample(o["pts"][:, None], np.array([float(score.iloc[0])]))[0])})
    return ev, pd.DataFrame(pairs), pd.DataFrame(team_rows)


def report(ev: pd.DataFrame, pairs: pd.DataFrame, teams: pd.DataFrame) -> str:
    lines = []
    rows = []
    for pos in ["QB", "RB", "WR", "TE", "DST", "ALL"]:  # ALL = QB/RB/WR/TE (the current engine has no DST)
        g = ev[ev["position"] != "DST"] if pos == "ALL" else ev[ev["position"] == pos]
        for eng in ("new", "current", "app", "baseline"):
            if g[f"{eng}_crps"].notna().sum() == 0:
                continue
            gg = g[g[f"{eng}_crps"].notna()]
            rows.append({"pos": pos, "engine": eng, "n": len(gg), "below_p10": gg[f"{eng}_below10"].mean(),
                         "above_p90": gg[f"{eng}_above90"].mean(), "in_p25_p75": gg[f"{eng}_in50"].mean(),
                         "CRPS": gg[f"{eng}_crps"].mean(), "Brier20": gg[f"{eng}_brier20"].mean()})
    t = pd.DataFrame(rows)
    lines.append("### Distribution calibration (targets: 10% / 10% / 50%; CRPS and Brier lower = better)\n")
    lines.append(md(t, {"below_p10": "{:.1%}", "above_p90": "{:.1%}", "in_p25_p75": "{:.1%}", "CRPS": "{:.3f}",
                        "Brier20": "{:.4f}"}))
    # paired CRPS difference with a by-week block bootstrap CI
    lines.append("\n### CRPS: new minus each other engine (negative = new is better), 95% CI by week\n")
    rows = []
    rng = np.random.default_rng(0)
    for pos in ["QB", "RB", "WR", "TE", "ALL"]:
        g = ev if pos == "ALL" else ev[ev["position"] == pos]
        g = g[g["current_crps"].notna() & g["app_crps"].notna()]
        for other in ("current", "app", "baseline"):
            d = (g["new_crps"] - g[f"{other}_crps"]).groupby([g["season"], g["week"]]).agg(["sum", "count"])
            boots = []
            for _ in range(1000):
                s = d.iloc[rng.integers(0, len(d), len(d))]
                boots.append(s["sum"].sum() / s["count"].sum())
            rows.append({"pos": pos, "vs": other, "diff": d["sum"].sum() / d["count"].sum(),
                         "ci_lo": np.percentile(boots, 2.5), "ci_hi": np.percentile(boots, 97.5)})
    lines.append(md(pd.DataFrame(rows), {"diff": "{:+.3f}", "ci_lo": "{:+.3f}", "ci_hi": "{:+.3f}"}))
    # correlations
    lines.append("\n### Within-game correlation of DK-point residuals: actual vs simulated\n")
    rows = []
    for pair, g in pairs.groupby("pair", sort=False):
        if len(g) < 30:
            continue
        r = {"pair": pair, "n": len(g), "actual": np.corrcoef(g["res_a"], g["res_b"])[0, 1],
             "new": np.tanh(np.arctanh(np.clip(g["new_corr"], -0.99, 0.99)).mean())}
        for e in ("current", "app"):
            if f"{e}_corr" in g and g[f"{e}_corr"].notna().any():
                r[e] = np.tanh(np.arctanh(np.clip(g[f"{e}_corr"].dropna(), -0.99, 0.99)).mean())
        se = 1 / np.sqrt(len(g) - 3)
        r["actual_95ci"] = f"[{np.tanh(np.arctanh(r['actual']) - 1.96 * se):+.2f}, {np.tanh(np.arctanh(r['actual']) + 1.96 * se):+.2f}]"
        rows.append(r)
    lines.append(md(pd.DataFrame(rows), {"actual": "{:+.2f}", "new": "{:+.2f}", "current": "{:+.2f}", "app": "{:+.2f}"}))
    lines.append("\n### Team points (new engine)\n")
    lines.append(md(pd.DataFrame([{"n": len(teams), "below_p10": teams["below10"].mean(),
                                   "above_p90": teams["above90"].mean(), "bias(sim-actual)": (teams["sim_mean"] - teams["actual"]).mean(),
                                   "CRPS": teams["crps"].mean()}]),
                    {"below_p10": "{:.1%}", "above_p90": "{:.1%}", "bias(sim-actual)": "{:+.2f}", "CRPS": "{:.3f}"}))
    return "\n".join(lines)


def md(df: pd.DataFrame, fmt: dict) -> str:
    cols = list(df.columns)
    out = ["| " + " | ".join(cols) + " |", "|" + "---|" * len(cols)]
    for _, r in df.iterrows():
        out.append("| " + " | ".join(fmt[c].format(r[c]) if c in fmt and r[c] == r[c] else
                                     ("" if r[c] != r[c] else str(r[c])) for c in cols) + " |")
    return "\n".join(out)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--weeks", nargs="+", default=["2023:2-18", "2024:2-18", "2025:2-18"])
    ap.add_argument("--sims", type=int, default=2000)
    ap.add_argument("--out", default="docs/game_sim_backtest.md")
    a = ap.parse_args(argv)
    for spec in a.weeks:
        if spec.startswith("2026"):
            raise SystemExit("2026 is the holdout season: not used here.")
    sport, params = load_sport("nfl"), Params()
    cv = sport.distribution_defaults["cv_by_position"]
    games = pd.read_csv(nflverse.DEFAULT_DIR / "games.csv")
    cache, evs, prs, tms = {}, [], [], []
    t0 = time.time()
    for spec in a.weeks:
        season, rng_ = spec.split(":")
        lo, hi = (int(x) for x in rng_.split("-"))
        for w in range(lo, hi + 1):
            r = evaluate_week(int(season), w, games, sport, params, cache, a.sims, 1000 * int(season) + w, cv)
            if r is None:
                continue
            evs.append(r[0]); prs.append(r[1]); tms.append(r[2])
            print(f"{season} wk{w}: {len(r[0])} players  ({time.time() - t0:.0f}s)", flush=True)
    ev, pairs, teams = pd.concat(evs), pd.concat(prs), pd.concat(tms)
    ev.to_csv(ROOT / "data" / "game_sim_backtest_rows.csv", index=False)
    text = report(ev, pairs, teams)
    print(text)
    Path(ROOT / a.out).write_text("# Game simulator backtest (generated by scripts/sim_backtest.py)\n\n"
                                  f"Weeks: {' '.join(a.weeks)}; {a.sims} sims per engine per week; parameters fit on "
                                  "2016-2022.\n\n" + text + "\n")


if __name__ == "__main__":
    main()
