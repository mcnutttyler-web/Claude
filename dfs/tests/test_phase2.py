"""Lineup generator Phase 2 acceptance tests: 4, 5, 6, 9, 10, 11 (+ cash engine smoke)."""
import numpy as np
import pandas as pd
import pytest

from core.cash_sim import cash_line, evaluate, run_cash, select_best
from core.contest import load_contest, template_paths
from core.correlation import build_correlation, is_psd, repaired_correlation
from core.distributions import fit_marginals
from core.field import FieldSample, fit_field, generate_field
from core.lineup import Lineup
from core.slate_sim import correlated_normals, player_metrics, simulate_slate


@pytest.fixture(scope="module")
def sims(nfl, classic_slate):
    return simulate_slate(classic_slate, nfl, 10000, seed=7)


# ------------------------------------------------------------------ Test 4 / 5
def _two_candidates(edge: float, n: int = 40000, seed: int = 0):
    """Chalk player C is on most field rosters, so the line moves with C.
    A rosters C (chalk-heavy), B rosters an equal-mean fade Y. E[D] is equal; Var(D_A) < Var(D_B)."""
    rng = np.random.default_rng(seed)
    C = rng.normal(15, 6, n)          # chalk player
    Y = rng.normal(15, 6, n)          # equal-mean pivot
    X = rng.normal(100, 12, n)        # rest of our lineup
    N = rng.normal(85, 8, n)          # rest of the line
    line = C + N
    A = C + X + edge - 15 + 0         # mean(A - line) = 100 + edge - 85 - 15 = edge
    B = Y + X + edge - 15
    return np.c_[A, B], line


def test_cash_theory_favored_picks_lower_variance():
    S, line = _two_candidates(edge=+3.0)
    m = evaluate(S, line, 1.8)
    assert abs(m.loc[0, "e_d"] - m.loc[1, "e_d"]) < 0.3        # equal edge
    assert m.loc[0, "sd_d"] < m.loc[1, "sd_d"]                  # A (chalk) has lower Var(D)
    assert (m["regime"] == "favored").all()
    assert select_best(m, np.array([1.0, 1.0])) == 0


def test_cash_theory_underdog_picks_higher_variance():
    S, line = _two_candidates(edge=-3.0)
    m = evaluate(S, line, 1.8)
    assert (m["regime"] == "underdog").all()
    assert select_best(m, np.array([1.0, 1.0])) == 1            # the high-variance fade


# ------------------------------------------------------------------ Test 6
def test_cash_line_is_payout_percentile_order_statistic(nfl, classic_slate, sims):
    f = generate_field(classic_slate, nfl, classic_slate["ownership"].to_numpy(), 1500, "cash",
                       rng=np.random.default_rng(3))
    c = {p.stem: load_contest(p) for p in template_paths()}["double_up"]   # 230 entries, 100 paid
    n_opp, paid = c.field_size - 1, c.paid_places
    line, opp = cash_line(sims.scores[:4000], f, n_opp, paid, np.random.default_rng(1), return_draws=True)
    # exact: line equals the paid-th highest opponent score in each sim
    kth = -np.sort(-opp, axis=1)[:, paid - 1]
    np.testing.assert_allclose(line, kth, atol=1e-4)
    # and it matches the field's payout-percentile quantile (1 - paid/n_opp) within 0.5 pts on average
    from core.field import scores
    fs = scores(f, sims.scores[:4000])
    q = np.quantile(fs, 1 - paid / n_opp, axis=1)
    assert abs(line.mean() - q.mean()) < 0.5


# ------------------------------------------------------------------ Test 9
def test_correlation_psd_and_empirical(nfl, classic_slate):
    raw = build_correlation(classic_slate, nfl.correlation_prior, classic_slate["role"])
    C, adj = repaired_correlation(classic_slate, nfl.correlation_prior, classic_slate["role"])
    assert is_psd(C) and np.allclose(np.diag(C), 1.0)
    assert adj < 0.15
    z = correlated_normals(C, 20000, np.random.default_rng(11))
    E = np.corrcoef(z.T)
    mask = np.triu(np.abs(raw) > 0, 1)
    assert np.max(np.abs(E[mask] - C[mask])) < 0.03
    # prior structure survives: QB-WR1 positive, DST vs opposing QB negative
    r = classic_slate["role"].to_numpy()
    t, o = classic_slate["team"].to_numpy(), classic_slate["opp"].to_numpy()
    qb = np.flatnonzero(r == "QB")[0]
    wr1 = np.flatnonzero((r == "WR1") & (t == t[qb]))[0]
    dst = np.flatnonzero((r == "DST") & (t == o[qb]))[0]
    assert C[qb, wr1] > 0.3 and C[qb, dst] < -0.25


# ------------------------------------------------------------------ Test 10
def test_distributions_match_inputs(nfl, classic_slate, sims):
    m = player_metrics(classic_slate, sims, nfl)
    s = classic_slate
    assert (np.abs(m["p50"] / s["median"] - 1) <= 0.03).all()
    assert (np.abs(m["p90"] / s["ceiling"] - 1) <= 0.05).all()
    mins = nfl.distribution_defaults["min_score_by_position"]
    lo = sims.scores.min(0)
    for pos in s["position"].unique():
        assert (lo[(s["position"] == pos).to_numpy()] >= mins[pos] - 1e-6).all()
    # negative support only where the sport allows it
    nonneg = nfl.distribution_defaults.copy()
    nonneg["allow_negative"] = False
    nfl_cfg = nfl.cfg["distribution_defaults"]
    old = nfl_cfg["allow_negative"]
    try:
        nfl_cfg["allow_negative"] = False
        mm = fit_marginals(s, nfl)
        assert (mm.lo == 0).all()
    finally:
        nfl_cfg["allow_negative"] = old


def test_distribution_from_median_only_uses_cv(nfl, classic_slate):
    s = classic_slate.drop(columns=["ceiling"]).head(30)
    r = simulate_slate(s, nfl, 20000, seed=2, bust=False)
    cv = nfl.distribution_defaults["cv_by_position"]
    sd = r.scores.std(0)
    exp_sd = s["position"].map(cv).to_numpy() * s["median"].to_numpy()
    assert np.allclose(sd, exp_sd, rtol=0.08)


# ------------------------------------------------------------------ Test 11
@pytest.fixture(scope="module")
def fields(nfl, classic_slate):
    s = classic_slate
    own = s["ownership"].to_numpy()
    # cash ownership: chalk is chalkier (sharpen within position, keep position totals)
    cash = own.copy()
    for pos, idx in s.groupby("position").indices.items():
        v = own[idx] ** 1.15            # stays feasible: max own < 100%, implied salary >= cash floor
        cash[idx] = v / v.sum() * own[idx].sum()
    gpp = fit_field(s, nfl, own, 8000, "gpp", seed=1)
    csh = fit_field(s, nfl, cash, 8000, "cash", seed=1)
    return own, cash, gpp, csh


def test_field_ownership_within_tolerance(fields):
    own, cash, gpp, csh = fields
    assert np.max(np.abs(gpp.ownership() - own)) <= 0.015
    assert np.max(np.abs(csh.ownership() - cash)) <= 0.015


def test_cash_field_more_concentrated(fields, classic_slate):
    own, cash, gpp, csh = fields
    assert csh.entropy(classic_slate) < gpp.entropy(classic_slate)
    sal = classic_slate["salary"].to_numpy()
    assert min(sal[list(lu.players)].sum() for lu in csh.lineups) >= 49700
    assert min(sal[list(lu.players)].sum() for lu in gpp.lineups) >= 49200


def test_planted_duplicates_counted(nfl, classic_slate, fields):
    _, _, gpp, _ = fields
    base = gpp.lineups[:50]
    planted = base[0]
    shuffled = Lineup(tuple(reversed(planted.players)), planted.mode)   # same players, different order
    fs = FieldSample(list(base) + [planted, planted, shuffled], gpp.spec, gpp.n_players, "gpp")
    counts = fs.duplicates(classic_slate)
    assert counts[planted.key(classic_slate, gpp.spec)] == 4 + base.count(planted) - 1


def test_showdown_duplicate_hash_includes_captain(nfl, showdown_slate):
    spec = nfl.mode("showdown")
    a = Lineup((0, 1, 2, 3, 4, 5), "showdown")
    b = Lineup((1, 0, 2, 3, 4, 5), "showdown")       # same six players, different captain
    assert a.key(showdown_slate, spec) != b.key(showdown_slate, spec)


# --------------------------------------------------------- cash engine smoke
def test_run_cash_end_to_end(nfl, classic_slate, sims, fields):
    _, _, _, csh = fields
    cs = {p.stem: load_contest(p) for p in template_paths()}
    rep = run_cash(nfl, classic_slate, sims.scores, [cs["h2h"], cs["double_up"], cs["triple_up"]], csh,
                   cand_cfg=dict(top_k=25, blend_k=10, fade_pivots=5), split=True)
    for k, r in rep.results.items():
        t = r.table
        assert t.loc[0, "rank"] == "recommended" and len(t) >= 4
        assert t["p_win"].iloc[0] == pytest.approx(r.metrics["p_win"].max(), abs=1e-4)
        # alternatives differ from the recommendation (and each other) by >= 2 players
        lus = [r.recommended] + r.alternatives
        for i in range(len(lus)):
            for j in range(i + 1, len(lus)):
                assert len(set(lus[i].players) ^ set(lus[j].players)) // 2 >= 2
        assert {"p_win", "e_d", "sd_d", "ev", "regime", "chalk_coverage", "chalk_missing"} <= set(t.columns)
    assert set(rep.split["plan"]) == {"one_lineup", "split"}
    # the QB-vs-opposing-DST block holds for every candidate
    pos, team, opp = (classic_slate[c].to_numpy() for c in ("position", "team", "opp"))
    for lu in rep.candidates:
        qbt = {team[p] for p in lu.players if pos[p] == "QB"}
        assert not any(pos[p] == "DST" and opp[p] in qbt for p in lu.players)
