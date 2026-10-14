"""Lineup generator Phase 3 acceptance tests: 8, 12, 13, 17."""
import time

import numpy as np
import pytest

from core.contest import Contest, load_contest, template_paths
from core.field import FieldSample, LineupSampler, generate_field
from core.gpp import candidate_pool, gpp_settings, rules_generator, score_candidates
from core.payouts import FieldDistribution, PayoutCurve, settle_exact, vs_field
from core.portfolio import portfolio_payout, report, select_portfolio
from core.slate_sim import simulate_slate

import pandas as pd


@pytest.fixture(scope="module")
def sims(nfl, classic_slate):
    return simulate_slate(classic_slate, nfl, 10000, seed=5).scores


# --------------------------------------------------------------- Test 8
def test_gpp_constraints_20_lineups(nfl, classic_slate):
    s = classic_slate
    own = np.clip(s["ownership"].to_numpy(), 0.001, 1)
    st = gpp_settings(nfl, "mid_20max", max_exposure=0.5, product_log_cap=-11.0 * np.log(10))
    lus = rules_generator(nfl, s, st, 20)
    assert len(lus) == 20
    spec = nfl.mode("classic")
    pos, team, opp = (s[c].to_numpy() for c in ("position", "team", "opp"))
    counts = np.zeros(len(s))
    for lu in lus:
        p = np.array(lu.players)
        counts[p] += 1
        q = p[pos[p] == "QB"][0]
        mates = [x for x in p if team[x] == team[q] and pos[x] in ("WR", "TE")]
        assert 1 <= len(mates) <= 2                                   # QB + 1-2 stack (mid preset)
        assert not any(pos[x] == "DST" and opp[x] == team[q] for x in p)   # QB vs opposing DST blocked
        assert np.log(own[p]).sum() <= st.product_log_cap + 1e-6        # product-ownership cap
        lo, hi = st.cum_own_band
        assert lo - 1e-6 <= own[p].sum() <= hi + 1e-6                  # cumulative ownership band
        assert (own[p] < st.under_pct).sum() >= st.min_under          # >= 1 player under 8%
        nondst = p[pos[p] != "DST"]
        assert pd.Series(team[nondst]).value_counts().max() <= 4      # max 4 per team excl DST
        assert s.loc[list(p), "salary"].sum() >= st.min_salary
    assert counts.max() <= 0.5 * 20 + 1e-9                             # exposure
    U = st.uniqueness_U
    for i in range(20):
        for j in range(i + 1, 20):
            assert len(set(lus[i].players) & set(lus[j].players)) <= spec.roster_size - U


# --------------------------------------------------------------- Test 12
def test_payouts_pool_ties_and_own_entries():
    rng = np.random.default_rng(0)
    pv = np.array([100, 50, 25, 10, 10, 5, 5, 5, 0, 0, 0, 0], dtype=float)
    scores = np.round(rng.normal(100, 10, (500, 12)))                 # rounding creates many ties
    win = settle_exact(scores, pv)
    np.testing.assert_allclose(win.sum(1), pv.sum())                  # paid per sim == prize pool
    # ties split exactly: a 3-way tie for 2nd shares (50+25+10)/3
    s = np.array([[90, 80, 80, 80, 1, 1, 1, 1, 1, 1, 1, 1.]])
    w = settle_exact(s, pv)
    assert w[0, 0] == 100 and np.allclose(w[0, 1:4], (50 + 25 + 10) / 3)
    np.testing.assert_allclose(w.sum(), pv.sum())
    # own entries compete: two identical own entries against a field split the prize they would win alone
    curve = PayoutCurve(np.array([1000.0, 100, 10]))
    field = np.array([[50.0, 40, 30]])
    fd = FieldDistribution(field, np.ones(3))
    one = vs_field(np.array([[60.0]]), fd, n_field=3, payout_vector=curve.p)
    two = vs_field(np.array([[60.0, 60.0]]), fd, n_field=3, payout_vector=curve.p)
    assert one[0, 0] == 1000 and np.allclose(two[0], (1000 + 100) / 2)


# --------------------------------------------------------------- Test 13
def test_portfolio_greedy_monotone_and_max_entries(nfl, classic_slate, sims):
    s = classic_slate
    st = gpp_settings(nfl, "mid_20max")
    cands = candidate_pool(nfl, s, sims, st, 120, seed=1, n_jobs=1)
    fld = generate_field(s, nfl, s["ownership"].to_numpy(), 3000, "gpp", rng=np.random.default_rng(2))
    from core.cash_sim import lineup_scores
    from core.field import scores as fscores
    sub = sims[:2000]
    S = lineup_scores(cands, sub, nfl.mode("classic"))
    fd = FieldDistribution(fscores(fld, sub), fld.w())
    c = {p.stem: load_contest(p) for p in template_paths()}["gpp_20max"]
    res = select_portfolio(S, cands, fd, c, 30, max_exposure=0.8, max_shared=6)
    assert len(res.lineups) <= c.max_entries == 20                    # 30 requested, max_entries 20
    hist = np.array(res.expected_payout)
    assert (np.diff(hist) >= -1e-9).all()
    n_field = c.field_size - min(30, c.max_entries)
    for k in range(1, len(res.chosen) + 1):                            # independent exact re-evaluation
        exact = portfolio_payout(S[:, res.chosen[:k]], fd, n_field, c.payout_vector()).sum(1).mean()
        assert exact == pytest.approx(hist[k - 1], rel=1e-6)
    for i in range(len(res.lineups)):
        for j in range(i + 1, len(res.lineups)):
            assert len(set(res.lineups[i].players) & set(res.lineups[j].players)) <= 6
    rep = report(res, S, fd, c, s, nfl.mode("classic"), fld)
    assert {"portfolio_roi", "p_any_top1pct", "mean_exp_dupes"} <= set(rep.report)
    assert {"exp_dupes", "sim_roi", "win%", "top1%", "cash%", "stack", "log10_prod_own"} <= set(rep.lineup_table)


# --------------------------------------------------------------- Test 17
def test_performance_rules_generator_150(nfl, classic_slate):
    st = gpp_settings(nfl, "large_150max", max_exposure=0.5)
    t = time.time()
    lus = rules_generator(nfl, classic_slate, st, 150)
    dt = time.time() - t
    assert len(lus) == 150 and dt < 60, dt


def test_performance_scoring_and_reproducibility(nfl, classic_slate):
    s = classic_slate
    spec = nfl.mode("classic")
    sims = simulate_slate(s, nfl, 10000, seed=9).scores
    sampler = LineupSampler(s, spec)
    rng = np.random.default_rng(3)
    cands = []
    while len(cands) < 1500:
        lu = sampler.sample(rng, np.clip(s["ownership"].to_numpy(), 1e-3, 1))
        if lu is not None:
            cands.append(lu)
    fld = generate_field(s, nfl, s["ownership"].to_numpy(), 20000, "gpp", rng=np.random.default_rng(4))
    assert len(fld.lineups) == 20000
    c = {p.stem: load_contest(p) for p in template_paths()}["gpp_milly"]
    t = time.time()
    pay = score_candidates(cands, fld, sims, c, spec)
    dt = time.time() - t
    assert pay.shape == (10000, 1500) and dt < 120, dt
    # reproducibility: same seed + inputs -> identical sims, field and payouts
    sims2 = simulate_slate(s, nfl, 10000, seed=9).scores
    assert np.array_equal(sims, sims2)
    f2 = generate_field(s, nfl, s["ownership"].to_numpy(), 2000, "gpp", rng=np.random.default_rng(4))
    f3 = generate_field(s, nfl, s["ownership"].to_numpy(), 2000, "gpp", rng=np.random.default_rng(4))
    assert [l.players for l in f2.lineups] == [l.players for l in f3.lineups]
    p2 = score_candidates(cands[:50], fld, sims2[:1000], c, spec)
    assert np.array_equal(pay[:1000, :50], p2)
