"""Streamlit smoke test: sample slate -> projections -> cash lineup -> DKEntries export, no exceptions."""
from pathlib import Path

from streamlit.testing.v1 import AppTest

APP = str(Path(__file__).resolve().parent.parent / "app.py")


def test_app_phase1_flow():
    at = AppTest.from_file(APP, default_timeout=60)
    at.run()
    assert not at.exception
    at.checkbox(key="sal_sample").check().run()
    at.checkbox(key="proj_sample").check().run()
    assert not at.exception
    assert at.session_state["build"].ready
    [b for b in at.button if b.label == "Build cash lineup"][0].click().run()
    assert not at.exception
    assert len(at.session_state["cash"].lineups) == 5
    at.checkbox(key="entries_sample").check().run()
    assert not at.exception and not at.error
    [b for b in at.button if b.label == "Run slate sims"][0].click().run()
    assert not at.exception and "sims" in at.session_state
