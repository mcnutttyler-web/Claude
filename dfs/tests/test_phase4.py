"""Phase 4: Showdown rules + fields, late swap (acceptance tests 7 and 15)."""
import io
from datetime import datetime
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd
import pytest

from core.cash import objective_a
from core.contest import load_contest, template_paths
from core.export import read_entries, split_raw_fields, write_entries
from core.field import fit_field, generate_field
from core.gpp import gpp_settings, rules_generator
from core.lateswap import (conditional_sims, late_swap_cash, late_swap_entries, locked_mask, parse_entries)
from core.lineup import Lineup, validate_lineup
from core.sample import dk_entries_csv
from core.slate_sim import simulate_slate
from tests.conftest import NFL_HEADER, showdown_ownership

ET = ZoneInfo("America/New_York")
TEMPL = {p.stem: load_contest(p) for p in template_paths()}


# ------------------------------------------------------------------ Showdown
def test_showdown_rules_hold(nfl, showdown_slate):
    s = showdown_slate.copy()
    s.loc[s["position"].isin(["K", "DST"]), "median"] += 12        # tempt the optimizer with K/DST
    spec = nfl.mode("showdown")
    lus = objective_a(nfl, s, "showdown", k=15, min_salary=0).lineups
    pos, team, opp = (s[c].to_numpy() for c in ("position", "team", "opp"))
    for lu in lus:
        assert validate_lineup(lu, s, spec) == []
        p = np.array(lu.players)
        assert np.isin(pos[p], ["K", "DST"]).sum() <= 2               # K + DST combined <= 2
        cpt = p[0]
        if pos[cpt] == "QB":                                         # CPT QB -> own pass catcher
            assert any(team[x] == team[cpt] and pos[x] in ("WR", "TE") for x in p[1:])
        assert not any(pos[x] == "DST" and opp[x] in {team[q] for q in p if pos[q] == "QB"} for x in p)
    gst = gpp_settings(nfl, "showdown")
    for lu in rules_generator(nfl, showdown_slate, gst, 8, "showdown"):
        p = np.array(lu.players)
        cpt = p[0]
        if pos[cpt] in ("QB", "WR", "TE"):                           # bring-back for a QB/WR/TE captain
            assert any(team[x] == opp[cpt] and pos[x] in ("QB", "WR", "TE") for x in p[1:])


def test_showdown_captain_uses_cpt_ownership(nfl, showdown_slate):
    s = showdown_slate.copy()
    top = int(s["median"].idxmax())
    st = gpp_settings(nfl, "showdown", lam=3.0, product_log_cap=None, min_under=0)
    s["cpt_ownership"] = 0.02
    s.loc[top, "cpt_ownership"] = 0.95                                # chalk captain
    a = rules_generator(nfl, s, st, 1, "showdown")[0]
    s.loc[top, "cpt_ownership"] = 0.002                               # same player, contrarian captain
    b = rules_generator(nfl, s, st, 1, "showdown")[0]
    assert b.players[0] == top and a.players[0] != top


def test_showdown_field_fits_cpt_and_flex(nfl, showdown_slate):
    s = showdown_slate
    flex, cpt = showdown_ownership(s)
    f = fit_field(s, nfl, np.r_[flex, cpt], 4000, "gpp", "showdown", seed=1)
    o = f.ownership()
    n = len(s)
    assert o[:n].sum() == pytest.approx(5.0) and o[n:].sum() == pytest.approx(1.0)
    assert np.max(np.abs(o - np.r_[flex, cpt])) <= 0.015
    spec = nfl.mode("showdown")
    for lu in f.lineups[:300]:
        assert validate_lineup(lu, s, spec) == []


# ------------------------------------------------------------------ late swap
@pytest.fixture(scope="module")
def ls(nfl, classic_slate):
    s = classic_slate
    sims = simulate_slate(s, nfl, 6000, seed=4).scores
    early_teams = {"PHI", "DAL"}                                       # 1:00 PM game
    other_early = s.index[(s["lock_window"] == "early") & ~s["team"].isin(early_teams)]
    lu = objective_a(nfl, s, excludes=list(other_early), min_salary=0).lineups[0]
    as_of = datetime(2026, 10, 18, 14, 0, tzinfo=ET)                    # early games started
    locked = locked_mask(s, as_of)
    assert locked[list(lu.players)].any() and (~locked[list(lu.players)]).any()
    cash = fit_field(s, nfl, s["ownership"].to_numpy(), 2500, "cash", seed=2)
    return s, sims, lu, locked, cash


def _conditional(s, sims, lu, locked, ours_q):
    """Our locked players at their ours_q quantile, everyone else locked at their median."""
    actual = {}
    for j in np.flatnonzero(locked):
        q = ours_q if j in lu.players else 0.5
        actual[str(s.at[j, "id"])] = float(np.quantile(sims[:, j], q))
    return conditional_sims(sims, s, locked, actual)


def test_cash_late_swap_ahead_vs_behind(nfl, ls):
    s, sims, lu, locked, cash = ls
    c = TEMPL["5050"]
    own = s["ownership"].to_numpy()
    spec = nfl.mode("classic")
    out = {}
    for label, q in (("ahead", 0.97), ("behind", 0.03)):
        sc = _conditional(s, sims, lu, locked, q)
        r = late_swap_cash(nfl, s, sc, lu, c, cash, locked, seed=1)
        assert r.regime == label
        assert r.value_after >= r.value_before - 1e-9                 # conditional P(win) reported, never worse
        open_idx = [k for k, p in enumerate(r.after.players) if not locked[p]]
        from core.cash_sim import cash_line, lineup_scores
        line = cash_line(sc, cash, c.field_size - 1, c.paid_places, np.random.default_rng(1))
        d = lineup_scores([r.after], sc, spec)[:, 0] - line
        out[label] = dict(chalk=float(own[[r.after.players[k] for k in open_idx]].sum()), sd=float(d.std()),
                          p=r.value_after)
    assert out["ahead"]["chalk"] >= out["behind"]["chalk"]             # ahead -> toward chalk
    assert out["ahead"]["sd"] <= out["behind"]["sd"]                   # behind -> toward variance
    assert out["ahead"]["p"] > out["behind"]["p"]


def test_late_swap_entries_validity_and_roundtrip(nfl, ls, players):
    s, sims, lu, locked, cash = ls
    spec = nfl.mode("classic")
    from core.export import assign_lineups_to_entries
    raw = dk_entries_csv([("NFL $10 Double Up, Sunday Main", "180000001", "$10", 2),
                          ("NFL $20 20-Max GPP [Mid-Field]", "180000002", "$20", 2)], NFL_HEADER, players).encode()
    ef = read_entries(raw)
    ef2 = read_entries(write_entries(ef, assign_lineups_to_entries(ef, {"180000001": [lu], "180000002": [lu]}, s,
                                                                   spec)))
    before = {e.entry_id: e.lineup for e in parse_entries(ef2, s, spec)}
    gpp_field = generate_field(s, nfl, s["ownership"].to_numpy(), 3000, "gpp", rng=np.random.default_rng(3))
    contests = {"180000001": TEMPL["double_up"], "180000002": TEMPL["gpp_20max"]}
    as_of = datetime(2026, 10, 18, 14, 0, tzinfo=ET)
    assign, rep = late_swap_entries(nfl, s, sims, ef2, contests, {"cash": cash, "gpp": gpp_field}, as_of)
    assert (rep["status"] == "ok").all() and len(assign) == 4
    out = write_entries(ef2, assign)
    after = {e.entry_id: e.lineup for e in parse_entries(read_entries(out), s, spec)}
    started = locked
    for eid, b in before.items():
        a = after[eid]
        assert validate_lineup(a, s, spec) == []                     # DK-valid
        for k, (pb, pa) in enumerate(zip(b.players, a.players)):
            if started[pb]:
                assert pa == pb                                      # locked players unchanged, same slot
            if pa != pb:
                assert not started[pa] and not started[pb]           # swaps only in unstarted games
    # contest columns byte-identical after the late-swap round trip
    for la, lb in zip(ef2.lines, read_entries(out).lines):
        assert split_raw_fields(la)[:4] == split_raw_fields(lb)[:4]
