"""Weekly scorecard sections on synthetic data (no network)."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from core import scorecard as SC


def _pool(seed=0):
    rng = np.random.default_rng(seed)
    rows = []
    for pos, n in (("QB", 25), ("RB", 50), ("WR", 50), ("TE", 25)):
        for i in range(n):
            proj = rng.uniform(5, 22)
            rows.append({"name": f"{pos} {i}", "pos": pos, "team": "AAA", "salary": 5000, "proj": proj,
                         "proj_model": proj + 1.0, "proj_dff": proj - 0.5, "p10": proj * 0.4, "p85": proj * 1.45,
                         "p90": proj * 1.6, "own_source": rng.uniform(0, 30), "own_gpp": rng.uniform(0, 30),
                         "actual": max(0.0, proj + rng.normal(0, 6))})
    return pd.DataFrame(rows)


def test_projection_table_same_pool_and_bias():
    p = _pool()
    t = SC.projection_table(p)
    qb = t[t["pos"] == "QB"].set_index("projection")
    assert set(qb["n"]) == {20}                                           # same pool (top-20 QB) for each column
    assert qb.at["proj_model", "bias"] - qb.at["proj", "bias"] == pytest.approx(1.0, abs=1e-6)
    assert qb.at["proj_dff", "bias"] - qb.at["proj", "bias"] == pytest.approx(-0.5, abs=1e-6)
    assert (t["rel_MAE"] > 0).all()


def test_coverage_table():
    p = _pool()
    p.loc[:9, "actual"] = p.loc[:9, "p90"] + 1                          # 10 QBs above p90
    c = SC.coverage_table(p).set_index("pos")
    assert c.at["QB", "above_p90"] >= 10 / 25 and {"above_p85", "below_p10"} <= set(c.columns)


def test_ownership_table_and_chalk():
    p = _pool()
    own = pd.DataFrame({"name_key": p["name"].str.lower(), "own": p["own_source"] / 100 * 1.2})
    t, chalk = SC.ownership_table(p, own)
    src = t.set_index("ownership").loc["own_source"]
    assert src["bias_pts"] < 0                                           # actual chalkier than the source
    assert (chalk["top10_actual"] > 0).all()


def test_news_check(tmp_path):
    snap = tmp_path / "snapshots"
    a, b = snap / "20261017-1000", snap / "20261018-1145"
    a.mkdir(parents=True)
    b.mkdir(parents=True)
    pd.DataFrame({"name": ["x", "y", "z"], "proj_model": [12.0, 5.0, 8.0], "proj_consensus": [10.0, 8.0, 8.0]}).to_csv(
        a / "my_projections.csv", index=False)
    pd.DataFrame({"name": ["x", "y", "z"], "proj_model": [12.0, 5.0, 8.0], "proj_consensus": [11.0, 9.0, 8.0]}).to_csv(
        b / "my_projections.csv", index=False)
    r = SC.news_check(tmp_path)
    assert r["news_moves"] == 2 and r["model_called_direction"] == pytest.approx(0.5)


def test_md_table_no_tabulate():
    s = SC.md_table(pd.DataFrame({"a": [1.23456], "b": ["x"]}))
    assert s.splitlines()[0] == "| a | b |" and "1.235" in s
