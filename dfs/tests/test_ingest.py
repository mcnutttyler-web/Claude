import io

import pandas as pd

from core.ingest import auto_column_mapping, build_slate, parse_game_info, read_dk_salaries, read_projections
from core.names import normalize_name
from core.sample import dk_salaries_csv, projections_csv


def test_parse_game_info():
    away, home, dt = parse_game_info("PHI@DAL 10/18/2026 04:25PM ET")
    assert (away, home) == ("PHI", "DAL") and dt.hour == 16 and dt.minute == 25


def test_normalize_name():
    assert normalize_name("Marvin Harrison Jr.") == "marvin harrison"
    assert normalize_name("D'Andre  Swift") == "dandre swift"
    assert normalize_name("Kenneth Walker III") == "kenneth walker"


def test_auto_mapping():
    m = auto_column_mapping(["Player", "Team", "Pos", "Proj", "Own%", "O/U"])
    assert m["name"] == "Player" and m["median"] == "Proj" and m["ownership"] == "Own%" and m["game_total"] == "O/U"


def test_matching_aliases_dst_suffix(nfl, players):
    sal, mode = read_dk_salaries(io.StringIO(dk_salaries_csv(players)), nfl)
    b = build_slate(sal, mode, read_projections(io.StringIO(projections_csv(players))), nfl)
    assert b.ready
    assert (b.matched["dk_index"] >= 0).all()
    assert (b.matched["match_method"] == "team_unit").sum() == 12      # "Philadelphia Eagles" DEF -> DST
    assert b.slate["ownership"].between(0, 1).all()                     # 15.6 -> 0.156
    assert set(b.slate["lock_window"]) == {"early", "late", "prime"}
    assert (b.slate.loc[b.slate["team"] == "WAS", "median"] > 0).all()   # WSH alias


def test_unmatched_blocks_until_excluded(nfl, players):
    sal, mode = read_dk_salaries(io.StringIO(dk_salaries_csv(players)), nfl)
    proj = read_projections(io.StringIO(projections_csv(players)))
    extra = pd.DataFrame([{"name": "Nobody Atall", "team": "PHI", "position": "WR", "median": 5.0}])
    proj = pd.concat([proj, extra], ignore_index=True)
    b = build_slate(sal, mode, proj, nfl)
    assert not b.ready and list(b.unmatched["name"]) == ["Nobody Atall"]
    b2 = build_slate(sal, mode, proj, nfl, excluded_names={"Nobody Atall"})
    assert b2.ready


def test_fuzzy_and_override(nfl, players):
    sal, mode = read_dk_salaries(io.StringIO(dk_salaries_csv(players)), nfl)
    proj = read_projections(io.StringIO(projections_csv(players, messy=False)))
    target = proj.index[(proj["position"] == "WR")][0]
    real = proj.at[target, "name"]
    proj.at[target, "name"] = real[:-1] + "x"           # one-letter typo -> fuzzy
    b = build_slate(sal, mode, proj, nfl)
    assert b.matched.at[target, "match_method"].startswith("fuzzy")
    proj.at[target, "name"] = "Completely Different"
    dk_id = sal.loc[sal["name"] == real, "id"].iloc[0]
    b = build_slate(sal, mode, proj, nfl, overrides={"Completely Different": dk_id})
    assert b.matched.at[target, "match_method"] == "override" and b.ready


def test_showdown_collapse(nfl):
    from core.sample import GAMES, make_players
    sd = make_players(seed=11, games=[GAMES[-1]], include_k=True)
    sal, mode = read_dk_salaries(io.StringIO(dk_salaries_csv(sd, showdown=True)), nfl)
    assert mode == "showdown" and len(sal) == len(sd)
    assert (sal["cpt_salary"] == (sal["salary"] * 1.5).astype(int)).all()
