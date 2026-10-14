"""Synthetic (FICTIONAL) inputs for the projection engine demo and tests.

live_inputs()    -> source CSVs (points-based and stat-line based), odds, injuries, overrides, sources.yaml
backtest_data()  -> multi-season history of source projections + actuals with known source noise levels
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
import yaml

from core.sample import CITY, MASCOT, make_players

CV = {"QB": 0.35, "RB": 0.50, "WR": 0.60, "TE": 0.65, "DST": 0.80, "K": 0.55}


def stat_line(pos: str, pts: float, rng: np.random.Generator, opp_total: float = 22.0) -> dict:
    """A plausible MEAN stat line whose linear DK score is ~pts (bonuses excluded)."""
    pts = max(pts, 0.5)
    if pos == "QB":
        ptd = 0.09 * pts
        rush = 1.1 * pts
        rtd = 0.01 * pts
        ints = 0.75
        pyd = max(0.0, (pts - 4 * ptd + ints - 0.1 * rush - 6 * rtd + 0.2) / 0.04)
        return {"pass_yds": pyd, "pass_td": ptd, "int": ints, "rush_yds": rush, "rush_td": rtd, "fumble_lost": 0.2}
    if pos == "RB":
        rtd = 0.03 * pts
        rec = 0.14 * pts
        recyd = 7.5 * rec
        ryd = max(0.0, (pts - 6 * rtd - rec - 0.1 * recyd + 0.1) / 0.1)
        return {"rush_yds": ryd, "rush_td": rtd, "rec": rec, "rec_yds": recyd, "rec_td": 0.0, "fumble_lost": 0.1}
    if pos in ("WR", "TE"):
        td = 0.028 * pts
        rec = 0.30 * pts
        yd = max(0.0, (pts - rec - 6 * td) / 0.1)
        return {"rec": rec, "rec_yds": yd, "rec_td": td}
    if pos == "DST":
        return {"sacks": 2.6, "def_int": 0.8, "fum_rec": 0.6, "def_td": 0.15, "pts_allowed": opp_total}
    return {}


def live_inputs(out_dir: str | Path, seed: int = 7) -> Path:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(seed + 100)
    p = make_players(seed=seed)
    true = p["median"].to_numpy()
    sd = p["position"].map(CV).to_numpy() * true

    def noisy(scale, bias=0.0):
        return np.round(np.clip(true + bias + rng.normal(0, scale * sd), 0, None), 2)

    dst = p["position"] == "DST"
    ffa = pd.DataFrame({"Player": p["name"].str.strip(), "Team": p["team"], "Pos": p["position"],
                        "FPTS": noisy(0.15), "Own%": (p["ownership"] * 100).round(1)})
    ffa.loc[dst, "Player"] = p.loc[dst, "team"].map(lambda t: f"{CITY[t]} {MASCOT[t]}")
    ffa.loc[dst, "Pos"] = "DEF"
    ffa.to_csv(out / "ffa_avg.csv", index=False)
    dff = pd.DataFrame({"player_name": p["name"].str.strip(), "team": p["team"], "position": p["position"],
                        "ppg_projection": noisy(0.25, 0.3)})
    dff = dff[~dst]                       # this source doesn't cover DST
    dff.columns = ["name", "team", "pos", "proj"]
    dff.to_csv(out / "dff.csv", index=False)
    stats = []
    pts = noisy(0.20)
    for k, r in enumerate(p.itertuples()):
        opp_tt = float(p.loc[(p["team"] == r.opp), "team_total"].iloc[0])
        line = stat_line(r.position, pts[k], rng, opp_tt)
        stats.append({"name": r.name.strip(), "team": r.team, "position": r.position,
                      **{k2: round(v, 2) for k2, v in line.items()}})
    pd.DataFrame(stats).rename(columns={"pass_yds": "pass_yd", "rush_yds": "rush_yd", "rec_yds": "rec_yd",
                                        "int": "pass_int", "fumble_lost": "fum_lost"}) \
        .to_csv(out / "sleeper_stats.csv", index=False)

    games = p.drop_duplicates(["away", "home"])[["away", "home", "game_total", "spread", "team"]]
    odds = []
    for g in games.itertuples():
        spread_home = -g.spread if g.team == g.away else g.spread   # spread column is the team's own line
        for book, ds, dt in (("pinnacle", 0.0, 0.0), ("draftkings", 0.5, -0.5), ("fanduel", -0.5, 0.5)):
            odds.append({"book": book, "away": g.away, "home": g.home,
                         "spread_home": spread_home + ds, "total": g.game_total + dt,
                         "timestamp": "2026-10-18T12:00:00Z"})
    pd.DataFrame(odds).to_csv(out / "odds.csv", index=False)

    wr = p[p["position"] == "WR"].iloc[0]
    rb = p[p["position"] == "RB"].iloc[2]
    pd.DataFrame([{"name": wr["name"], "team": wr["team"], "position": "WR", "status": "Q", "practice": "LIMITED"},
                  {"name": rb["name"], "team": rb["team"], "position": "RB", "status": "OUT", "practice": "DNP"}]) \
        .to_csv(out / "injuries.csv", index=False)
    qb = p[p["position"] == "QB"].iloc[0]
    pd.DataFrame([{"id": qb["id"], "name": qb["name"], "team": qb["team"], "field": "mean", "value": 25.0,
                   "note": "example manual override"}]).to_csv(out / "overrides.csv", index=False)
    # Props (fictional prices): QBs pass yds/TD/INT, RB rush yds, WR/TE rec yds + receptions, anytime TD;
    # the top WR also gets an alt-line ladder.
    from scipy.stats import norm as _n
    props = []

    def price(p):                     # fair prob -> American odds with ~4.5% vig per side
        q = min(max(p * 1.045, 0.02), 0.97)
        return round(-100 * q / (1 - q)) if q >= 0.5 else round(100 * (1 - q) / q)

    for r in p.itertuples():
        nm, tm = r.name.strip(), r.team
        if r.rank != 1 and r.position != "WR":
            continue
        line = stat_line(r.position, r.median, rng)
        for mkt in {"QB": ["pass_yds"], "RB": ["rush_yds"], "WR": ["rec_yds", "rec"], "TE": ["rec_yds", "rec"]}.get(
                r.position, []):
            mu = line[mkt]
            ln = round(mu * 2) / 2 - 0.5
            sd = {"pass_yds": 70, "rush_yds": 28, "rec_yds": 28, "rec": 1.9}[mkt]
            po = float(_n.sf(ln, mu, sd))
            for book in ("draftkings", "fanduel"):
                props.append({"book": book, "name": nm, "team": tm, "market": mkt, "line": ln,
                              "over_odds": price(po), "under_odds": price(1 - po)})
        if r.position == "QB":
            props.append({"book": "draftkings", "name": nm, "team": tm, "market": "pass_td", "line": 1.5,
                          "over_odds": price(0.45), "under_odds": price(0.55)})
            props.append({"book": "draftkings", "name": nm, "team": tm, "market": "int", "line": 0.5,
                          "over_odds": price(0.52), "under_odds": price(0.48)})
        elif r.position in ("RB", "WR", "TE"):
            pt = 1 - np.exp(-(0.03 * r.median if r.position == "RB" else 0.028 * r.median))
            props.append({"book": "draftkings", "name": nm, "team": tm, "market": "anytime_td", "line": 0.5,
                          "over_odds": price(pt), "under_odds": ""})
    top = p[p["position"] == "WR"].sort_values("median").iloc[-1]
    mu = stat_line("WR", top["median"], rng)["rec_yds"]
    for ln in (mu - 30, mu - 15, mu, mu + 15, mu + 30):
        ln = round(ln) + 0.5
        props.append({"book": "fanduel", "name": top["name"].strip(), "team": top["team"], "market": "rec_yds",
                      "line": ln, "over_odds": price(float(_n.sf(ln, mu, 30))), "under_odds": price(float(_n.cdf(ln, mu, 30)))})
    pd.DataFrame(props).to_csv(out / "props.csv", index=False)
    games = p.drop_duplicates(["away", "home"])
    pd.DataFrame({"team": games["home"], "wind_mph": [6, 18, 9, 22, 4, 12][:len(games)],
                  "precip": ["", "", "rain", "", "", ""][:len(games)],
                  "dome": ["N", "N", "N", "N", "Y", "N"][:len(games)]}).to_csv(out / "weather.csv", index=False)
    spec = {"sources": [
        {"name": "ffa_avg", "path": "ffa_avg.csv", "kind": "points", "component": "consensus"},
        {"name": "dff", "path": "dff.csv", "kind": "points", "component": "consensus"},
        {"name": "sleeper", "path": "sleeper_stats.csv", "kind": "stats", "component": "consensus"},
    ]}
    (out / "sources.yaml").write_text(yaml.safe_dump(spec, sort_keys=False))
    return out / "sources.yaml"


def backtest_data(seasons=(2023, 2024, 2025), weeks: int = 17, seed: int = 0,
                  noise: dict[str, float] | None = None, bias: dict[str, float] | None = None,
                  p_inactive: float = 0.05) -> tuple[pd.DataFrame, pd.DataFrame]:
    """history (season, week, source, player, position, points) and actuals (season, week, player, position,
    dk_points, active). Source error = N(bias, noise x position SD of the weekly true mean)."""
    rng = np.random.default_rng(seed)
    noise = noise or {"sharp": 0.25, "mid": 0.40, "noisy": 0.75}
    bias = bias or {}
    roster = {"QB": (1, 19.0, 3.0), "RB": (3, 11.0, 4.0), "WR": (4, 11.5, 4.0), "TE": (2, 7.0, 3.0)}
    hist, act = [], []
    for season in seasons:
        players = []
        for t in range(16):
            for pos, (n, mu, s) in roster.items():
                for k in range(n):
                    players.append((f"T{t:02d}_{pos}{k}", pos, max(2.0, rng.normal(mu - 2.5 * k, s))))
        for week in range(1, weeks + 1):
            for pid, pos, base in players:
                m = max(0.5, base * rng.normal(1.0, 0.12))
                sd = CV[pos] * m
                active = rng.random() > p_inactive
                if active:
                    sig2 = np.log(1 + CV[pos] ** 2)
                    actual = float(rng.lognormal(np.log(m) - sig2 / 2, np.sqrt(sig2)))
                else:
                    actual = 0.0
                act.append((season, week, pid, pos, round(actual, 2), active))
                for src, sc in noise.items():
                    hist.append((season, week, src, pid, pos,
                                 round(max(0.0, m + bias.get(src, 0.0) + rng.normal(0, sc * sd)), 2)))
    history = pd.DataFrame(hist, columns=["season", "week", "source", "player", "position", "points"])
    actuals = pd.DataFrame(act, columns=["season", "week", "player", "position", "dk_points", "active"])
    return history, actuals
