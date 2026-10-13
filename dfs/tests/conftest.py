import io
from pathlib import Path

import pytest

from core.ingest import build_slate, read_dk_salaries, read_projections
from core.sample import GAMES, dk_entries_csv, dk_salaries_csv, make_players, projections_csv
from sports.base import load_sport

FIXTURES = Path(__file__).parent / "fixtures"
NFL_HEADER = ["QB", "RB", "RB", "WR", "WR", "WR", "TE", "FLEX", "DST"]


@pytest.fixture(scope="session")
def nfl():
    return load_sport("nfl")


@pytest.fixture(scope="session")
def players():
    return make_players(seed=7)


@pytest.fixture(scope="session")
def classic_slate(nfl, players):
    sal, mode = read_dk_salaries(io.StringIO(dk_salaries_csv(players)), nfl)
    proj = read_projections(io.StringIO(projections_csv(players)))
    b = build_slate(sal, mode, proj, nfl)
    assert b.ready and mode == "classic"
    return b.slate


@pytest.fixture(scope="session")
def showdown_slate(nfl):
    sd = make_players(seed=11, games=[GAMES[-1]], include_k=True)
    sal, mode = read_dk_salaries(io.StringIO(dk_salaries_csv(sd, showdown=True)), nfl)
    proj = read_projections(io.StringIO(projections_csv(sd, messy=False)))
    b = build_slate(sal, mode, proj, nfl)
    assert b.ready and mode == "showdown"
    return b.slate


@pytest.fixture()
def entries_bytes(players):
    return dk_entries_csv(
        [("NFL $10 Double Up, Sunday Main", "180000001", "$10", 3),
         ("NFL $20 20-Max \"GPP\" [Mid-Field]", "180000002", "$20", 5)], NFL_HEADER, players,
    ).encode()
