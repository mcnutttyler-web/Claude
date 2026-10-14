"""Projection engine P2: props/de-vig, TD lambdas, alt-line CDFs, distributions, Q mixtures, weather, DST,
ownership v1, end-to-end publish with props."""
import numpy as np
import pandas as pd
import pytest
from scipy.stats import norm, poisson

from core.projections import market as mk
from core.projections.distributions import coverage, fit_dispersion, simulate
from core.projections.dst import dst_projection
from core.projections.ownership import classic_ownership, showdown_ownership
from core.projections.params import Params
from core.projections.weather import multipliers, points_factor

P = Params("nfl")


# ------------------------------------------------------------------ de-vig
@pytest.mark.parametrize("a,b", [(-110, -110), (-150, 125), (-300, 240), (105, -125), (-115, -105)])
def test_devig_sums_to_one(a, b):
    raw = [mk.american_to_prob(a), mk.american_to_prob(b)]
    assert sum(raw) > 1.0
    for f in (mk.devig_power, mk.devig_multiplicative):
        p = f(raw)
        assert p.sum() == pytest.approx(1.0, abs=1e-9) and (p > 0).all()
    # power shifts probability toward the favorite relative to multiplicative
    fav = int(np.argmax(raw))
    if raw[0] != raw[1]:
        assert mk.devig_power(raw)[fav] > mk.devig_multiplicative(raw)[fav]


def test_one_sided_price_uses_margin():
    p = mk.p_over_from_prices(150, None, "power", 0.07)
    assert p == pytest.approx(mk.american_to_prob(150) / 1.07)


# ------------------------------------------------------------- TD lambdas
@pytest.mark.parametrize("lam", [0.15, 0.4, 0.75, 1.2])
def test_anytime_td_round_trip(lam):
    p = 1 - np.exp(-lam)
    assert mk.anytime_td_lambda(p, 0.5) == pytest.approx(lam, rel=1e-9)
    p15 = 1 - poisson.cdf(1, lam)                       # an "over 1.5 TDs" price
    assert mk.anytime_td_lambda(p15, 1.5) == pytest.approx(lam, rel=1e-6)
    # misreading the 1.5 line as anytime would badly understate lambda
    assert -np.log(1 - p15) < lam * 0.8


def test_td_line_must_be_half_or_one_and_half():
    with pytest.raises(ValueError):
        mk.anytime_td_lambda(0.3, 2.5)


@pytest.mark.parametrize("lam,line", [(1.6, 1.5), (2.1, 2.5), (0.9, 0.5)])
def test_pass_td_and_int_lambdas(lam, line):
    p_over = 1 - poisson.cdf(int(np.floor(line)), lam)
    assert mk.poisson_lambda_for_over(line, p_over) == pytest.approx(lam, rel=1e-6)
    assert mk.int_lambda(np.exp(-lam), 0.5) == pytest.approx(lam)


# ---------------------------------------------------------- yard markets
def test_median_from_line_and_alt_line_cdf():
    assert mk.median_from_line(70.5, 0.5, 30) == pytest.approx(70.5)
    assert mk.median_from_line(70.5, 0.6, 30) > 70.5
    mu, sd = 255.0, 60.0
    lines = np.array([195.5, 225.5, 255.5, 285.5, 315.5])
    d = mk.fit_alt_line_cdf(lines, norm.sf(lines, mu, sd))
    assert d.median == pytest.approx(mu, abs=1.0)
    assert d.mean == pytest.approx(mu, abs=1.5)
    assert d.sigma == pytest.approx(sd, rel=0.05)
    assert d.p_at_least(300) == pytest.approx(norm.sf(299.5, mu, sd), abs=0.01)


def test_props_fixture_to_dk_points():
    """Fair (no-vig) WR props -> DK points equals the hand calculation within 0.1."""
    props = pd.DataFrame([
        {"book": "x", "name": "W R", "team": "AAA", "market": "rec_yds", "line": 75.5, "over_odds": 100, "under_odds": 100},
        {"book": "x", "name": "W R", "team": "AAA", "market": "rec", "line": 5.5, "over_odds": 100, "under_odds": 100},
        {"book": "x", "name": "W R", "team": "AAA", "market": "anytime_td", "line": 0.5, "over_odds": 150,
         "under_odds": -150},
    ])
    mp = mk.build_market_players(props, P)[("W R", "AAA")]
    stats = mk.market_stat_means(mp, "WR")
    from sports.base import load_sport
    pts, probs = mk.market_points(stats, mp, "WR", load_sport("nfl").scoring_cfg)
    coef, skew = P.get("props.sigma_coef"), P.get("props.skew_frac_of_sigma")
    s_yd, s_rec = coef["rec_yds"] * np.sqrt(75.5), coef["rec"] * np.sqrt(5.5)
    rec_yds = 75.5 + skew["rec_yds"] * s_yd
    rec = 5.5 + skew["rec"] * s_rec
    p_td = 0.4                                            # +150 / -150 is already fair at 0.4 / 0.6
    lam = -np.log(1 - p_td)
    hand = rec + 0.1 * rec_yds + 6 * lam + 3 * norm.sf(99.5, 75.5, s_yd)
    assert pts == pytest.approx(hand, abs=0.1)
    assert probs["rec_yds"] == pytest.approx(norm.sf(99.5, 75.5, s_yd), abs=1e-6)


# ---------------------------------------------------------- distributions
def _toy_table():
    return pd.DataFrame([
        dict(team="A", opp="B", game_id="A@B", position="QB", mean=20.0, p_play=1.0, pass_yds=260, pass_td=1.7,
             int=0.8, rush_yds=15, rush_td=0.1),
        dict(team="A", opp="B", game_id="A@B", position="WR", mean=16.0, p_play=1.0, rec=6, rec_yds=80, rec_td=0.45),
        dict(team="A", opp="B", game_id="A@B", position="WR", mean=11.0, p_play=1.0, rec=4, rec_yds=55, rec_td=0.3),
        dict(team="A", opp="B", game_id="A@B", position="WR", mean=9.0, p_play=0.6),
        dict(team="A", opp="B", game_id="A@B", position="RB", mean=14.0, p_play=1.0),
        dict(team="B", opp="A", game_id="A@B", position="QB", mean=18.0, p_play=1.0),
        dict(team="B", opp="A", game_id="A@B", position="DST", mean=6.0, p_play=1.0),
    ])


def test_sim_means_correlations_and_mixture():
    from sports.base import load_sport
    sc = load_sport("nfl").scoring_cfg
    t = _toy_table()
    det = {6: dst_projection(23.0, P, sc)}
    r = simulate(t, P, sc, n_sims=20000, seed=3, dst_detail=det)
    s = r.summary.set_index("dk_index")
    c = np.corrcoef(r.sims.T)
    assert 0.25 < c[0, 1] < 0.55                         # QB - own WR1
    assert abs(c[1, 2]) < 0.15                           # WR - WR teammates ~ 0
    assert c[0, 5] > 0.1                                 # QB - opposing QB (game shock)
    assert c[0, 6] < 0                                   # QB - opposing DST
    # QB/RB means preserved (no Q teammates in their group); mixture mean = p_play x conditional mean
    assert s.at[0, "sim_mean"] == pytest.approx(20.0, rel=0.03)
    assert s.at[4, "sim_mean"] == pytest.approx(14.0, rel=0.03)
    assert s.at[3, "sim_mean_mixture"] == pytest.approx(0.6 * s.at[3, "sim_mean"], rel=0.05)
    # Q WR inactive -> other WRs get a boost in those sims
    inactive = r.sims[:, 3] == 0
    boost = r.sims[inactive, 1].mean() / r.sims[~inactive, 1].mean()
    assert boost > 1.05
    assert s.loc[0, "p10"] < s.loc[0, "median"] < s.loc[0, "p90"]


def test_percentile_coverage_synthetic():
    """Actuals drawn from the same distribution land below p10 / above p90 10% +/- 1% of the time."""
    from sports.base import load_sport
    rng = np.random.default_rng(0)
    n = 1500
    pos = rng.choice(["RB", "WR", "TE", "QB"], n)
    mean = rng.uniform(6, 24, n)
    t = pd.DataFrame({"team": [f"T{k % 30}" for k in range(n)], "opp": [f"T{(k + 1) % 30}" for k in range(n)],
                      "game_id": [f"G{k % 15}" for k in range(n)], "position": pos, "mean": mean, "p_play": 1.0})
    r = simulate(t, P, load_sport("nfl").scoring_cfg, n_sims=4000, seed=1)
    s = r.summary.set_index("dk_index")
    # one independent outcome per player per replicate, from the same simulated marginal
    reps = []
    for k in range(6):
        draw = r.sims[rng.integers(0, 4000, n), np.arange(n)]
        reps.append(pd.DataFrame({"position": "ALL", "p10": s["p10"].to_numpy(), "p90": s["p90"].to_numpy(),
                                  "actual": draw}))
    cov = coverage(pd.concat(reps)).iloc[0]
    assert cov["below"] == pytest.approx(0.10, abs=0.01)
    assert cov["above"] == pytest.approx(0.10, abs=0.01)


def test_fit_dispersion_widens_overconfident_bands():
    rng = np.random.default_rng(5)
    n = 20000
    med = rng.uniform(8, 20, n)
    true_sd = 0.6 * med
    actual = med + true_sd * rng.standard_normal(n)
    narrow = 0.6                                          # projected bands only 60% as wide as reality
    df = pd.DataFrame({"position": "WR", "median": med, "p10": med - narrow * 1.2816 * true_sd,
                       "p90": med + narrow * 1.2816 * true_sd, "actual": actual})
    s = fit_dispersion(df)["WR"]
    assert s == pytest.approx(1 / narrow, rel=0.05)
    fresh = med + true_sd * rng.standard_normal(n)
    adj = df.assign(p10=med - s * (med - df["p10"]), p90=med + s * (df["p90"] - med), actual=fresh)
    cov = coverage(adj).iloc[0]
    assert cov["below"] == pytest.approx(0.10, abs=0.01) and cov["above"] == pytest.approx(0.10, abs=0.01)


# --------------------------------------------------------------- weather/DST
def test_weather_buckets():
    assert multipliers(25, "", True, P)["pass_yds_mult"] == 1.0          # dome
    assert multipliers(8, "", False, P)["pass_yds_mult"] == 1.0
    assert multipliers(12, "", False, P)["pass_yds_mult"] == 0.93
    assert multipliers(17, "", False, P)["pass_yds_mult"] == 0.90
    m = multipliers(22, "rain", False, P)
    assert m["pass_yds_mult"] == 0.81 and m["rush_att_mult"] == 1.05 and m["fg_range_yds"] == -7 and m["rain"] == 1.0
    assert points_factor("WR", m, P) < points_factor("QB", m, P) < 1.0


def test_dst_projection_monotone_and_tiers():
    from sports.base import load_sport
    sc = load_sport("nfl").scoring_cfg
    lo, hi = dst_projection(14.0, P, sc), dst_projection(30.0, P, sc)
    assert sum(lo["tier_probs"]) == pytest.approx(1.0) and sum(hi["tier_probs"]) == pytest.approx(1.0)
    assert lo["mean"] > hi["mean"]
    assert dst_projection(20.0, P, sc, opp_int_lambda=1.5)["mean"] > dst_projection(20.0, P, sc, opp_int_lambda=0.5)["mean"]


# ------------------------------------------------------------- ownership v1
def test_ownership_sums_classic_and_showdown(classic_slate):
    s = classic_slate.copy()
    s["mean"], s["p_play"] = s["median"], 1.0
    for fld in ("gpp", "cash"):
        own = classic_ownership(s, P, fld)
        assert own.sum() == pytest.approx(9.0, abs=1e-6)
        for pos, tot in {"QB": 1.0, "DST": 1.0}.items():
            assert own[s["position"] == pos].sum() == pytest.approx(tot, abs=1e-6)
        assert own.max() <= P.get("ownership.cap")[fld] + 1e-9
    g, c = classic_ownership(s, P, "gpp"), classic_ownership(s, P, "cash")
    top = s.assign(v=s["median"] / s["salary"]).sort_values("v").index[-5:]
    assert c[top].sum() > g[top].sum()                    # cash field concentrates on top values
    cpt, flex = showdown_ownership(s.head(30), P)
    assert cpt.sum() == pytest.approx(1.0) and flex.sum() == pytest.approx(5.0)


# ----------------------------------------------------------- end to end
def test_publish_with_props_weather_and_sims(nfl, tmp_path):
    from core.ingest import load_slate
    from core.projections.publish import build_projections, publish
    from core.projections.sources import load_source_specs
    from core.projections.synthetic import live_inputs
    from core.sample import dk_salaries_csv, make_players
    (tmp_path / "DKSalaries.csv").write_text(dk_salaries_csv(make_players(seed=7)), newline="")
    spec = live_inputs(tmp_path)
    run = build_projections(tmp_path / "DKSalaries.csv", load_source_specs(spec), "nfl", odds=tmp_path / "odds.csv",
                            injuries=tmp_path / "injuries.csv", props=tmp_path / "props.csv",
                            weather=tmp_path / "weather.csv", n_sims=3000)
    t = run.table
    assert set(run.log["components"]) == {"consensus", "market", "model"}
    qb = t[(t["position"] == "QB") & t["p_300_pass"].notna()]
    assert len(qb) >= 10 and qb["p_300_pass"].between(0, 1).all()
    b = t[t["mean"] > 0]
    assert (b["p10"] <= b["median"]).all() and (b["median"] <= b["p90"]).all()
    assert (t.loc[t["p_play"] == 0, ["mean", "median", "p90"]] == 0).all().all()
    assert t["own_cash"].sum() == pytest.approx(9.0, abs=1e-6)
    assert (t.loc[t["position"] == "DST", "p_play"] == 1.0).all()
    assert t["wind_mph"].notna().sum() > 0
    paths = publish(run, tmp_path / "out")
    assert np.load(paths["sims"])["sims"].shape == (3000, len(run.sims.index))
    assert load_slate(tmp_path / "DKSalaries.csv", paths["csv"], nfl).ready
