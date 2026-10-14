"""Betting-market model: player props -> de-vigged probabilities -> stat medians/means -> DK points.

props.csv (one row per book per player per market per line):
    book, name, team, market, line, over_odds, under_odds[, timestamp]
markets: pass_yds pass_att completions pass_td int rush_yds rush_att rec rec_yds anytime_td
Odds are American. For anytime_td put the "yes" price in over_odds and the "no" price (if posted) in under_odds.

Method (build prompt §3.6):
  * de-vig two-way prices with the POWER method (solve p_i^k summing to 1); multiplicative is the fallback.
    One-sided prices get an assumed margin (props.one_sided_margin, calibrate).
  * O/U line ~ median: median = line + sigma * Phi^-1(p_over), sigma = coef[stat] * sqrt(line).
  * median -> mean with a skew table (mean = median + skew_frac * sigma), never an assumed family.
  * >= alt_line_min distinct lines -> fit a monotone CDF through them (PCHIP) with Normal tails and read
    mean/median/percentiles directly.
  * TDs: anytime (0.5) lambda = -ln(1-p); an "over 1.5" line solves P(X>=2)=p. Pass TD O/U solves the Poisson
    lambda with P(X>line)=p. INT 0.5: lambda = -ln(P(under)).
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from scipy.interpolate import PchipInterpolator
from scipy.optimize import brentq
from scipy.stats import norm, poisson

from core.names import match_players
from core.projections.params import Params
from sports.base import SportConfig

YARD_MARKETS = ["pass_yds", "pass_att", "completions", "rush_yds", "rush_att", "rec", "rec_yds"]
COUNT_MARKETS = ["pass_td", "int", "anytime_td"]
MARKETS = YARD_MARKETS + COUNT_MARKETS
BONUS = {"pass_yds": 300, "rush_yds": 100, "rec_yds": 100}


# ------------------------------------------------------------------ odds math
def american_to_prob(odds: float) -> float:
    o = float(odds)
    return 100.0 / (o + 100.0) if o > 0 else -o / (-o + 100.0)


def devig_multiplicative(probs) -> np.ndarray:
    p = np.asarray(probs, dtype=float)
    return p / p.sum()


def devig_power(probs) -> np.ndarray:
    """Find k with sum(p_i^k) = 1 (k > 1 when there is vig)."""
    p = np.asarray(probs, dtype=float)
    s = p.sum()
    if abs(s - 1.0) < 1e-12:
        return p.copy()
    f = lambda k: np.sum(p ** k) - 1.0
    lo, hi = (1.0, 50.0) if s > 1 else (0.01, 1.0)
    k = brentq(f, lo, hi)
    return p ** k


def devig(probs, method: str = "power") -> np.ndarray:
    if method == "power":
        try:
            return devig_power(probs)
        except ValueError:
            return devig_multiplicative(probs)
    return devig_multiplicative(probs)


def p_over_from_prices(over_odds, under_odds, method: str, one_sided_margin: float) -> float:
    po = american_to_prob(over_odds)
    if under_odds is None or (isinstance(under_odds, float) and np.isnan(under_odds)) or under_odds == "":
        return float(min(max(po / (1.0 + one_sided_margin), 1e-6), 1 - 1e-6))
    pu = american_to_prob(under_odds)
    return float(devig([po, pu], method)[0])


# --------------------------------------------------------------- count markets
def poisson_lambda_for_over(line: float, p_over: float) -> float:
    """lambda such that P(X > line) = p_over for X ~ Poisson(lambda)."""
    k = int(np.floor(line))          # P(X > line) = P(X >= k+1) = 1 - cdf(k)
    f = lambda lam: (1.0 - poisson.cdf(k, lam)) - p_over
    return float(brentq(f, 1e-9, 50.0))


def anytime_td_lambda(p_yes: float, line: float = 0.5) -> float:
    if abs(line - 0.5) < 1e-9:
        return float(-np.log(1.0 - p_yes))
    if abs(line - 1.5) < 1e-9:     # feeds sometimes post "over 1.5" as the main TD line — convert, don't misread
        return poisson_lambda_for_over(1.5, p_yes)
    raise ValueError(f"anytime_td line must be 0.5 or 1.5, got {line}")


def int_lambda(p_under: float, line: float = 0.5) -> float:
    if abs(line - 0.5) < 1e-9:
        return float(-np.log(p_under))
    return poisson_lambda_for_over(line, 1.0 - p_under)


# ---------------------------------------------------------------- yard markets
@dataclass
class StatDist:
    """A marginal for one stat: Normal(median, sigma) with skew-shifted mean, or an alt-line CDF."""
    median: float
    mean: float
    sigma: float
    cdf_x: np.ndarray | None = None     # grid for alt-line CDFs
    cdf_f: np.ndarray | None = None

    def p_at_least(self, x: float) -> float:
        if self.cdf_x is not None:
            return float(1.0 - np.interp(x - 0.5, self.cdf_x, self.cdf_f))
        return float(norm.sf(x - 0.5, self.median, max(self.sigma, 1e-9)))

    def quantile(self, q: float) -> float:
        if self.cdf_x is not None:
            return float(np.interp(q, self.cdf_f, self.cdf_x))
        return float(self.median + self.sigma * norm.ppf(q))


def median_from_line(line: float, p_over: float, sigma: float) -> float:
    return float(line + sigma * norm.ppf(p_over))


def fit_alt_line_cdf(lines, p_overs) -> StatDist:
    """Monotone CDF through (line, 1 - p_over) points with Normal tails fitted to the same points."""
    x = np.asarray(lines, dtype=float)
    F = 1.0 - np.asarray(p_overs, dtype=float)
    o = np.argsort(x)
    x, F = x[o], np.clip(F[o], 1e-4, 1 - 1e-4)
    F = np.maximum.accumulate(F)                       # isotonic (non-decreasing)
    F = F + np.arange(len(F)) * 1e-6                   # strictly increasing for interpolation
    z = norm.ppf(np.clip(F, 1e-4, 1 - 1e-4))
    slope, icpt = np.polyfit(x, z, 1)                  # z = (x - mu)/sigma
    sigma = 1.0 / max(slope, 1e-9)
    mu = -icpt * sigma
    lo, hi = mu - 5 * sigma, mu + 5 * sigma
    grid = np.linspace(min(lo, x[0]), max(hi, x[-1]), 2001)
    inner = PchipInterpolator(x, F, extrapolate=False)(grid)
    tail = norm.cdf(grid, mu, sigma)
    Fg = np.where(np.isnan(inner), tail, inner)
    # stitch: below the first line use the tail scaled to meet F[0]; above the last, to meet F[-1]
    left, right = grid < x[0], grid > x[-1]
    if left.any():
        Fg[left] = tail[left] * F[0] / max(norm.cdf(x[0], mu, sigma), 1e-9)
    if right.any():
        t = norm.cdf(x[-1], mu, sigma)
        Fg[right] = F[-1] + (tail[right] - t) * (1 - F[-1]) / max(1 - t, 1e-9)
    Fg = np.clip(np.maximum.accumulate(Fg), 0, 1)
    u = np.linspace(0.0005, 0.9995, 1999)
    q = np.interp(u, Fg, grid)
    return StatDist(median=float(np.interp(0.5, Fg, grid)), mean=float(q.mean()),
                    sigma=float(np.std(q)), cdf_x=grid, cdf_f=Fg)


# ----------------------------------------------------------------- per player
@dataclass
class MarketPlayer:
    dists: dict[str, StatDist] = field(default_factory=dict)
    lambdas: dict[str, float] = field(default_factory=dict)   # pass_td, int, anytime_td
    books: set = field(default_factory=set)


def read_props(path_or_buf) -> pd.DataFrame:
    df = pd.read_csv(path_or_buf)
    df.columns = [c.strip().lower() for c in df.columns]
    need = {"book", "name", "team", "market", "line", "over_odds"}
    if not need <= set(df.columns):
        raise ValueError(f"props CSV needs {sorted(need)}")
    if "under_odds" not in df:
        df["under_odds"] = np.nan
    df["market"] = df["market"].str.strip().str.lower()
    bad = set(df["market"]) - set(MARKETS)
    if bad:
        raise ValueError(f"unknown prop markets {sorted(bad)}")
    df["book"] = df["book"].astype(str).str.strip().str.lower()
    if "timestamp" in df:
        df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce", utc=True)
        df = df.sort_values("timestamp").groupby(["book", "name", "team", "market", "line"]).tail(1)
    return df.reset_index(drop=True)


def build_market_players(props: pd.DataFrame, params: Params) -> dict[tuple[str, str], MarketPlayer]:
    method = params.get("props.devig_method")
    margin = float(params.get("props.one_sided_margin"))
    coef = params.get("props.sigma_coef")
    skew = params.get("props.skew_frac_of_sigma")
    bw = params.get("props.book_weights")
    alt_min = int(params.get("props.alt_line_min"))
    out: dict[tuple[str, str], MarketPlayer] = {}
    props = props.copy()
    props["p_over"] = [p_over_from_prices(o, u, method, margin) for o, u in zip(props["over_odds"], props["under_odds"])]
    props["w"] = props["book"].map(lambda b: float(bw.get(b, bw.get("default", 1.0))))
    for (name, team), g in props.groupby(["name", "team"]):
        mp = MarketPlayer(books=set(g["book"]))
        for mkt, gm in g.groupby("market"):
            if mkt in YARD_MARKETS:
                lines = gm.groupby("line").apply(lambda d: np.average(d["p_over"], weights=d["w"]),
                                                 include_groups=False)
                if len(lines) >= alt_min:
                    mp.dists[mkt] = fit_alt_line_cdf(lines.index.to_numpy(), lines.to_numpy())
                else:
                    sig = np.array([coef[mkt] * np.sqrt(max(l, 1.0)) for l in gm["line"]])
                    meds = np.array([median_from_line(l, p, s) for l, p, s in zip(gm["line"], gm["p_over"], sig)])
                    med = float(np.average(meds, weights=gm["w"]))
                    s = float(np.average(sig, weights=gm["w"]))
                    mp.dists[mkt] = StatDist(median=med, mean=med + float(skew.get(mkt, 0.0)) * s, sigma=s)
            elif mkt == "anytime_td":
                lam = [anytime_td_lambda(p, l) for p, l in zip(gm["p_over"], gm["line"])]
                mp.lambdas["anytime_td"] = float(np.average(lam, weights=gm["w"]))
            elif mkt == "pass_td":
                lam = [poisson_lambda_for_over(l, p) for p, l in zip(gm["p_over"], gm["line"])]
                mp.lambdas["pass_td"] = float(np.average(lam, weights=gm["w"]))
            elif mkt == "int":
                lam = [int_lambda(1 - p, l) for p, l in zip(gm["p_over"], gm["line"])]
                mp.lambdas["int"] = float(np.average(lam, weights=gm["w"]))
        out[(name, team)] = mp
    return out


# Fill-ins when a core market exists but a secondary one is missing (default — calibrate).
FILL_RATIOS = {
    "QB": {"int": ("const", 0.8), "pass_td": ("ratio_pass_yds", 1 / 160.0), "rush_yds": ("const", 12.0),
           "anytime_td": ("const", 0.12)},
    "RB": {"rec": ("const", 2.5), "rec_yds": ("ratio_rec", 7.5), "anytime_td": ("ratio_rush_yds", 1 / 90.0)},
    "WR": {"rec": ("ratio_rec_yds", 1 / 12.0), "rec_yds": ("ratio_rec", 12.0), "anytime_td": ("ratio_rec_yds", 1 / 170.0)},
    "TE": {"rec": ("ratio_rec_yds", 1 / 10.5), "rec_yds": ("ratio_rec", 10.5), "anytime_td": ("ratio_rec_yds", 1 / 140.0)},
}
CORE = {"QB": ["pass_yds"], "RB": ["rush_yds"], "WR": ["rec_yds", "rec"], "TE": ["rec_yds", "rec"]}


def market_stat_means(mp: MarketPlayer, pos: str, fallback: dict[str, float] | None = None) -> dict[str, float] | None:
    """Mean stat line from market data, or None when the core market for the position is missing.

    Missing secondary stats come from `fallback` (a consensus stat line) when available, else FILL_RATIOS.
    """
    if pos not in CORE or not any(c in mp.dists for c in CORE[pos]):
        return None
    m = {k: d.mean for k, d in mp.dists.items()}
    m.update({k: v for k, v in mp.lambdas.items() if k in ("pass_td", "int")})
    if "anytime_td" in mp.lambdas:
        m["anytime_td"] = mp.lambdas["anytime_td"]
    fb = fallback or {}
    for stat, (kind, val) in FILL_RATIOS.get(pos, {}).items():
        if stat in m:
            continue
        if stat in fb and fb[stat] == fb[stat]:
            m[stat] = fb[stat]
        elif kind == "const":
            m[stat] = val
        else:
            base = kind.replace("ratio_", "")
            if base in m:
                m[stat] = m[base] * val
    return m


def market_points(m: dict[str, float], mp: MarketPlayer, pos: str, scoring: dict) -> tuple[float, dict]:
    """Expected DK points from market stat means; bonuses priced by P(stat >= threshold) from the market dist."""
    off = scoring["offense"]
    pts = (m.get("pass_yds", 0) * off["pass_yds"] + m.get("pass_td", 0) * off["pass_td"]
           + m.get("int", 0) * off["int"] + m.get("rush_yds", 0) * off["rush_yds"]
           + m.get("rec", 0) * off["rec"] + m.get("rec_yds", 0) * off["rec_yds"])
    # anytime TD lambda covers rush + rec TDs; split by yardage share for the stat line (both worth 6)
    td = m.get("anytime_td", 0.0)
    pts += td * off["rush_td"]
    probs = {}
    for stat, thr in BONUS.items():
        if stat in mp.dists:
            p = mp.dists[stat].p_at_least(thr)
        elif m.get(stat, 0) > 0:
            p = float(norm.sf(thr - 0.5, m[stat], 0.5 * m[stat]))
        else:
            p = 0.0
        probs[stat] = p
        pts += p * scoring["bonuses"][stat][1]
    ry, cy = m.get("rush_yds", 0.0), m.get("rec_yds", 0.0)
    share = ry / (ry + cy) if (ry + cy) > 0 else (1.0 if pos == "QB" else 0.5)
    m["rush_td"], m["rec_td"] = td * share, td * (1 - share)
    return float(pts), probs


def market_rows(props: pd.DataFrame, slate: pd.DataFrame, sport: SportConfig, params: Params,
                fallback_stats: pd.DataFrame | None = None) -> tuple[pd.DataFrame, dict[int, MarketPlayer], list[str]]:
    """Market component rows keyed by dk_index (same shape as a projection source)."""
    warnings: list[str] = []
    players = build_market_players(props, params)
    keys = pd.DataFrame([{"name": n, "team": t, "position": ""} for n, t in players])
    m = match_players(slate, keys, sport.team_aliases, sport.team_unit_positions)
    rows, by_idx = [], {}
    for (_, r), (key, mp) in zip(m.iterrows(), players.items()):
        i = int(r["dk_index"])
        if i < 0:
            warnings.append(f"props: unmatched player {key[0]} ({key[1]})")
            continue
        pos = slate.at[i, "position"]
        fb = fallback_stats.loc[i].to_dict() if fallback_stats is not None and i in fallback_stats.index else None
        stats = market_stat_means(mp, pos, fb)
        if stats is None:
            warnings.append(f"props: {key[0]} has no core {pos} market - market component skipped")
            continue
        pts, probs = market_points(stats, mp, pos, sport.scoring_cfg)
        row = {"dk_index": i, "source": "market", "component": "market", "points": pts,
               "p_300_pass": probs.get("pass_yds", 0.0), "p_100_rush": probs.get("rush_yds", 0.0),
               "p_100_rec": probs.get("rec_yds", 0.0), "n_books": len(mp.books)}
        for s in ("pass_yds", "pass_att", "completions", "pass_td", "int", "rush_yds", "rush_att", "rush_td", "rec",
                  "rec_yds", "rec_td"):
            if s in stats:
                row[s] = stats[s]
        for s, d in mp.dists.items():
            row[f"sd_{s}"] = d.sigma
            row[f"median_{s}"] = d.median
        rows.append(row)
        by_idx[i] = mp
    return pd.DataFrame(rows), by_idx, warnings
