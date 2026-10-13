import pytest

from core.contest import break_even_table, load_contest, template_paths


def test_templates_load_and_break_even():
    cs = {p.stem: load_contest(p) for p in template_paths()}
    assert set(cs) == {"h2h", "5050", "double_up", "triple_up", "gpp_20max", "gpp_milly"}
    assert cs["h2h"].cash_rate_needed == pytest.approx(1 / 1.8)
    assert cs["5050"].cash_rate_needed == pytest.approx(0.5556, abs=1e-4)
    assert cs["double_up"].cash_rate_needed == pytest.approx(0.5)
    assert cs["double_up"].cash_line_percentile == pytest.approx(0.435, abs=0.001)
    assert cs["triple_up"].cash_rate_needed == pytest.approx(1 / 3)
    for c in cs.values():
        assert c.payout_vector().sum() == pytest.approx(c.prize_pool)
        assert 0 <= c.rake < 0.25
    assert cs["gpp_milly"].max_entries == 150 and cs["gpp_20max"].max_entries == 20
    assert list(break_even_table()["break_even_rate"][:3]) == [0.5556, 0.5, 0.3333]
