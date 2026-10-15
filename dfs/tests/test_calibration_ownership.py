"""User-supplied recalibration / ownership / archive modules as integrated into the app."""
from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pytest

from core.archive import archive
from core.projections import ownership_fit as OF
from core.projections.params import Params
from core.projections.publish import final_calibration
from core.projections.recalibrate import (PosCal, apply_calibration, blend_with_fallback, fit_position,
                                          load_calibration, save_calibration, walk_forward)


# ------------------------------------------------------------------ calibration
def test_calibration_applied_per_position():
    cal = {"QB": PosCal(a=-1.0, b=1.10, n=500), "WR": PosCal(a=2.0, b=0.80, n=500)}
    df = pd.DataFrame({"pos": ["QB", "WR", "RB", "QB"], "proj": [20.0, 10.0, 12.0, np.nan]})
    out = apply_calibration(df, cal, proj_col="proj", pos_col="pos")
    assert out["proj_cal"].iloc[0] == pytest.approx(-1 + 1.1 * 20)
    assert out["proj_cal"].iloc[1] == pytest.approx(2 + 0.8 * 10)
    assert out["proj_cal"].iloc[2] == pytest.approx(12.0)              # position without calibration: unchanged
    assert np.isnan(out["proj_cal"].iloc[3])


def test_calibration_not_extrapolated_below_fitted_range():
    c = PosCal(a=4.0, b=0.75, n=1000, lo=9.0, hi=20.0)
    x = np.array([0.0, 2.0, 9.0, 15.0, 30.0])
    y = c.correct(x)
    assert y[0] == 0.0 and y[1] < 2.0 + 1.0                             # scrubs barely move
    assert y[2] == pytest.approx(4 + 0.75 * 9) and y[3] == pytest.approx(4 + 0.75 * 15)
    assert y[4] == pytest.approx(30 + (4 + (0.75 - 1) * 20))            # above range: correction at hi


def test_fit_recovers_bias_and_shrinks_small_samples(tmp_path):
    rng = np.random.default_rng(0)
    x = rng.uniform(8, 22, 3000)
    c = fit_position(x, x - 1.0 + rng.normal(0, 6, len(x)))
    assert c.b == pytest.approx(1.0, abs=0.06) and (c.a + c.b * 15 - 15) == pytest.approx(-1.0, abs=0.4)
    small = fit_position(x[:10], x[:10] + 5)
    assert (small.a, small.b) == (0.0, 1.0)                            # < MIN_N -> identity
    save_calibration({"QB": c}, tmp_path / "c.json")
    assert load_calibration(tmp_path / "c.json")["QB"].lo == pytest.approx(c.lo)


def test_walk_forward_uses_only_earlier_weeks():
    rows = [{"season": 2025, "week": w, "pos": "RB", "proj": p, "actual": p + (3.0 if w >= 8 else 0.0)}
            for w in range(1, 11) for p in np.linspace(5, 20, 40)]
    rep = walk_forward(pd.DataFrame(rows), min_prior_weeks=4)
    # the week-8 shift can't be known in week 8, so the calibrated error is not ~0 there
    assert rep.loc[0, "n"] == 6 * 40 and rep.loc[0, "bias_cal"] < -0.5


def test_rookie_falls_back_to_consensus():
    df = pd.DataFrame({"proj_model": [10.0, np.nan, 8.0, np.nan], "proj_dff": [12.0, 9.0, np.nan, np.nan]})
    out = blend_with_fallback(df, w_model=0.5)
    assert out["proj_final"].iloc[0] == pytest.approx(11.0)
    assert out["proj_final"].iloc[1] == pytest.approx(9.0)             # rookie: 100% DFF, not dropped
    assert out["proj_final"].iloc[2] == pytest.approx(8.0)
    assert out["proj_source"].tolist() == ["blend", "consensus_fallback", "model_only", "none"]


def _table():
    bd = lambda m, c: json.dumps({**({"model": {"value": m}} if m is not None else {}),
                                  **({"consensus": {"value": c}} if c is not None else {})})
    return pd.DataFrame({"position": ["QB", "WR", "WR", "DST"], "mean": [21.0, 11.0, 9.0, 7.0],
                         "team": ["BBB", "AAA", "CCC", "DDD"],
                         "source_breakdown": [bd(20, 22), bd(10, 12), bd(None, 9), bd(6, 8)]})


def test_calibrate_model_then_blend(tmp_path):
    """Review 1a: the calibration (fit on model errors) is applied to the model component, then blended."""
    save_calibration({"WR": PosCal(3.0, 0.9, 500), "QB": PosCal(0.0, 1.0, 500)}, tmp_path / "cal.json")
    P = Params(overrides={"bottomup.calibration": {"file": str(tmp_path / "cal.json"), "positions": ["QB", "WR"]}})
    t, cal, notes = final_calibration(_table(), P)
    assert t.loc[1, "proj_model_cal"] == pytest.approx(3 + 0.9 * 10)            # 12.0
    assert t.loc[1, "proj_cal"] == pytest.approx(0.5 * 12.0 + 0.5 * 12.0)       # model_cal blended with consensus
    assert t.loc[2, "proj_source"] == "consensus_fallback" and t.loc[2, "proj_cal"] == pytest.approx(9.0)
    assert t.loc[0, "proj_cal"] == pytest.approx(21.0) and t.loc[3, "proj_cal"] == pytest.approx(7.0)
    assert (t["mean"] == t["proj_cal"]).all() and any("before blending" in n for n in notes)
    # old order still available
    P2 = Params(overrides={"bottomup.calibration": {"file": str(tmp_path / "cal.json"), "positions": ["WR"],
                                                     "apply_to": "blend"}})
    t2, _, _ = final_calibration(_table(), P2)
    assert t2.loc[1, "proj_cal"] == pytest.approx(3 + 0.9 * 11.0)


def test_late_news_team_leans_on_consensus(tmp_path):
    P = Params(overrides={"bottomup.calibration": {"file": str(tmp_path / "none.json")}})
    t, _, notes = final_calibration(_table(), P, news_teams={"AAA": ["Out Guy"]})
    w = P.get("blend.late_news_model_weight")
    assert t.loc[1, "proj_cal"] == pytest.approx(w * 10 + (1 - w) * 12)        # AAA player
    assert t.loc[0, "proj_cal"] == pytest.approx(0.5 * 20 + 0.5 * 22)          # other team unchanged
    assert t.loc[1, "proj_source"] == "blend_late_news" and any("late news" in n for n in notes)


def test_missing_calibration_file_warns(tmp_path):
    P = Params(overrides={"bottomup.calibration": {"file": str(tmp_path / "nope.json"), "positions": ["QB"]}})
    t, cal, notes = final_calibration(_table(), P)
    assert cal is None and any("NOT calibrated" in n for n in notes)
    assert t["proj_cal"].tolist() == pytest.approx([21.0, 11.0, 9.0, 7.0])


def test_repo_calibration_file_exists():
    from core.projections.publish import calibration_path
    cal = load_calibration(str(calibration_path(Params())))
    assert set(cal) == {"QB", "RB", "WR", "TE"} and all(0.75 <= c.b <= 1.25 for c in cal.values())


# ------------------------------------------------------------------ standings / ownership
def _standings_csv(path, own: dict[str, float]):
    left = pd.DataFrame({"Rank": [1, 2], "EntryId": [1, 2], "EntryName": ["a", "b"], "TimeRemaining": [0, 0],
                         "Points": [150.2, 140.0], "Lineup": ["QB X RB Y ...", "QB Z ..."]})
    right = pd.DataFrame({"Player": list(own), "Roster Position": "FLEX",
                          "%Drafted": [f"{100 * v:.2f}%" for v in own.values()], "FPTS": 10.0})
    n = max(len(left), len(right))
    df = pd.concat([left.reindex(range(n)), pd.DataFrame({"": [""] * n}), right.reindex(range(n))], axis=1)
    df.to_csv(path, index=False)


def test_standings_parsing(tmp_path):
    p = tmp_path / "contest-standings-1.csv"
    _standings_csv(p, {"Josh Allen": 0.312, "Ja'Marr Chase": 0.255, "Amon-Ra St. Brown Jr.": 0.10})
    s = OF.parse_standings(str(p)).set_index("name_key")["own"]
    assert s["josh allen"] == pytest.approx(0.312)
    assert s["jamarr chase"] == pytest.approx(0.255)
    assert s["amon ra st brown"] == pytest.approx(0.10)
    bad = tmp_path / "bad.csv"
    pd.DataFrame({"Name": ["x"], "Own": [1]}).to_csv(bad, index=False)
    with pytest.raises(ValueError, match="Player"):
        OF.parse_standings(str(bad))


def _pool(seed=0):
    rng = np.random.default_rng(seed)
    rows = []
    for pos, n in (("QB", 12), ("RB", 24), ("WR", 36), ("TE", 12), ("DST", 12)):
        for i in range(n):
            sal = int(rng.integers(30, 90)) * 100
            rows.append({"name": f"{pos} {i}", "pos": pos, "salary": sal, "proj": sal / 1000 * rng.uniform(2, 3.5),
                         "team_total": rng.uniform(17, 29)})
    return pd.DataFrame(rows)


def test_positional_ownership_totals():
    d = OF.build_features(_pool())
    d["own"] = np.clip(np.random.default_rng(1).beta(1, 8, len(d)), 0, 1)
    m = OF.fit(d)
    pred = OF.predict(m, d)
    tot = pred.groupby(d["pos"]).sum()
    assert tot["QB"] == pytest.approx(1.0, abs=1e-6) and tot["DST"] == pytest.approx(1.0, abs=1e-6)
    assert tot[["RB", "WR", "TE"]].sum() == pytest.approx(7.0, abs=1e-6)
    # same totals through the app path (lineup-generator slate columns)
    slate = _pool(2).rename(columns={"pos": "position", "proj": "median"})
    s = OF.predict_slate(slate, m)
    t2 = s.groupby(slate["position"]).sum()
    assert 100 * t2["QB"] == pytest.approx(100) and 100 * t2["DST"] == pytest.approx(100)
    assert 100 * t2[["RB", "WR", "TE"]].sum() == pytest.approx(700)


def test_ownership_cv_on_archive(tmp_path):
    root = tmp_path / "archive"
    rng = np.random.default_rng(3)
    for w in (1, 2, 3):
        pool = _pool(w)
        d = OF.build_features(pool.assign(slate="x"))
        true = np.exp(1.2 * (d["value"] - d["value"].mean()))           # value-driven field
        own = OF.normalize(d.assign(_t=true), "_t")
        dest = archive(2026, w, root, pool=pool.to_csv(index=False).encode(), log=lambda m: None)
        _standings_csv(dest / "s.csv", dict(zip(pool["name"], own * rng.uniform(0.9, 1.1, len(own)))))
        (dest / "s.csv").rename(dest / "standings_main.csv")
    rep = OF.cross_validate(OF.build_features(OF.load_archive(str(root))))
    assert len(rep) == 3 and rep["mae_model"].mean() < rep["mae_heur"].mean() + 5


# ------------------------------------------------------------------ archive
def test_archive_week_layout_and_prev_salary(tmp_path):
    root = tmp_path / "a"
    sal5 = pd.DataFrame({"Name": ["A", "B"], "Salary": [5000, 6000]}).to_csv(index=False).encode()
    archive(2026, 5, root, salaries=sal5, log=lambda m: None)
    pool = pd.DataFrame({"name": ["A", "B", "C"], "pos": ["WR"] * 3, "salary": [5400, 5800, 3000], "proj": [10, 12, 4]})
    dest = archive(2026, 6, root, salaries=sal5, dff=b"x,y\n1,2\n", pool=pool.to_csv(index=False).encode(),
                   standings={"contest-standings-99.csv": b"Player,%Drafted\nA,10%\n"}, log=lambda m: None)
    assert dest == root / "2026" / "w06"
    assert {p.name for p in dest.iterdir()} == {"dk_salaries.csv", "dff.csv", "my_projections.csv",
                                                "standings_contest-standings-99.csv", "snapshots"}
    snaps = list((dest / "snapshots").iterdir())
    assert len(snaps) == 1 and {p.name for p in snaps[0].iterdir()} == {"dff.csv", "my_projections.csv"}
    mp = pd.read_csv(dest / "my_projections.csv")
    assert mp["prev_salary"].tolist()[:2] == [5000, 6000] and np.isnan(mp["prev_salary"].iloc[2])


# ------------------------------------------------------------------ published (OWS-style) ownership
def test_cash_from_gpp_sharpens_and_stays_feasible():
    from core.projections.ownership import cash_from_gpp
    df = _pool(5).rename(columns={"pos": "position"})
    rng = np.random.default_rng(0)
    raw = pd.Series(rng.gamma(0.6, 1.0, len(df)), index=df.index)
    own = raw.groupby(df["position"]).transform(lambda x: x / x.sum())
    own[df["position"].isin(["RB", "WR", "TE"])] *= 7 / own[df["position"].isin(["RB", "WR", "TE"])].sum()
    from core.projections.ownership import salary_feasible
    own = salary_feasible(own, df, 47000, 0.6)          # a feasible published projection, with room under the cap
    cash = cash_from_gpp(own, df, Params())
    for pos in ("QB", "RB", "WR"):
        m = df["position"] == pos
        assert cash[m].sum() == pytest.approx(own[m].sum(), rel=1e-6)          # position totals kept
        top = own[m].idxmax()
        assert cash[top] >= own[top] - 1e-9                                    # chalk gets chalkier
    assert float((cash * df["salary"]).sum()) <= 49800 + 1


def test_source_ownership_end_to_end(tmp_path):
    from core.projections.publish import archive_pool, build_projections
    from core.projections.sources import SourceSpec
    from pathlib import Path
    root = Path(__file__).resolve().parents[1] / "data" / "sample"
    sal = root / "DKSalaries.csv"
    from core.ingest import read_projections
    proj = read_projections(root / "projections.csv")
    src = pd.DataFrame({"Player": proj["name"], "Team": proj["team"], "Position": proj["position"],
                        "Projection": proj["median"]})
    # published ownership for everyone except the last 5 rows (they must get min(heuristic, 1%))
    w = np.exp(src["Projection"] / 6)
    src["Ownership"] = (100 * w / w.groupby(src["Position"]).transform("sum")).round(2)
    src.loc[src.index[-5:], "Ownership"] = np.nan
    p = tmp_path / "ows.csv"
    src.to_csv(p, index=False)
    run = build_projections(sal, [SourceSpec("ows", str(p))], "nfl", simulate_outcomes=False, public_model=False)
    t = run.table[run.table["mean"].notna() & (run.table["mean"] > 0)]
    tot = t.groupby("position")["own_gpp"].sum()
    assert tot["QB"] == pytest.approx(1.0, abs=1e-6) and tot["DST"] == pytest.approx(1.0, abs=1e-6)
    assert tot[["RB", "WR", "TE"]].sum() == pytest.approx(7.0, abs=1e-6)
    assert float((t["own_gpp"] * t["salary"]).sum()) <= 50000 + 1
    assert any("from projection source" in w_ for w_ in run.warnings)
    assert t["own_source"].notna().sum() > 0
    assert "own_source" in archive_pool(run.table).columns


def test_ownership_cv_reports_source_baseline(tmp_path):
    root = tmp_path / "archive"
    rng = np.random.default_rng(9)
    for w in (1, 2, 3):
        pool = _pool(w)
        d = OF.build_features(pool.assign(slate="x"))
        own = OF.normalize(d.assign(_t=np.exp(1.2 * (d["value"] - d["value"].mean()))), "_t")
        pool["own_source"] = 100 * own.to_numpy() * rng.uniform(0.8, 1.2, len(own))
        dest = archive(2026, w, root, pool=pool.to_csv(index=False).encode(), log=lambda m: None)
        _standings_csv(dest / "standings_main.csv", dict(zip(pool["name"], own)))
    rep = OF.cross_validate(OF.build_features(OF.load_archive(str(root))))
    assert "mae_source" in rep and rep["mae_source"].notna().all()


def test_archive_saves_extra_sources(tmp_path):
    dest = archive(2026, 6, tmp_path, sources={"ows": b"Player,Ownership\nA,10\n"}, log=lambda m: None)
    assert (dest / "source_ows.csv").read_bytes().startswith(b"Player")


def test_source_name_detection():
    from core.projections.sources import source_name
    assert source_name("DFF_NFL_cheatsheet_2026-10-15.csv", b"first_name,last_name,ppg_projection") == "dff"
    assert source_name("ows-dk-Week-6-Main-projections.csv", b"Player,Position") == "ows"
    assert source_name("x.csv", b"Player,Team Ownership,Player ID") == "ows"
    assert source_name("My Picks.csv", b"name", {"my_picks"}) == "my_picks2"



def test_bias_correction_learns_chalkier_chalk(tmp_path):
    """Review 2a: if real ownership is a steeper function of the source (chalk chalkier), fit_bias finds b > 1 and
    the corrected numbers beat the raw source out of sample."""
    root = tmp_path / "archive"
    rng = np.random.default_rng(11)
    for w in range(1, 8):
        pool = _pool(w)
        d = OF.build_features(pool.assign(slate="x"))
        src = OF.normalize(d.assign(_t=np.exp(0.8 * (d["value"] - d["value"].mean()))), "_t")
        z = np.log(np.clip(src, 1e-4, None))
        true = OF.normalize(d.assign(_t=np.exp(1.4 * z)), "_t")                 # chalkier than the source
        pool["own_source"] = 100 * src.to_numpy()
        dest = archive(2026, w, root, pool=pool.to_csv(index=False).encode(), log=lambda m: None)
        _standings_csv(dest / "standings_main.csv", dict(zip(pool["name"], true * rng.uniform(0.95, 1.05, len(true)))))
    d = OF.build_features(OF.load_archive(str(root)))
    m = OF.fit_bias(d)
    assert all(v["b"] > 1.05 for k, v in m.items() if k in ("RB", "WR"))
    rep = OF.cross_validate(d)
    assert rep["mae_source_corrected"].mean() < rep["mae_source"].mean()
    pred = OF.predict_bias(m, d[d["slate"] == d["slate"].iloc[0]])
    tot = pred.groupby(d.loc[pred.index, "pos"]).sum()
    assert tot["QB"] == pytest.approx(1.0, abs=1e-6) and tot[["RB", "WR", "TE"]].sum() == pytest.approx(7.0, abs=1e-6)
