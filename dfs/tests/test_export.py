"""Acceptance test 14: upload schema matches DK; DKEntries contest columns byte-identical after round-trip."""
import csv
import io

import pytest

from core.cash import objective_a
from core.export import (ExportError, assign_lineups_to_entries, read_entries, split_raw_fields, upload_csv,
                         write_entries)
from tests.conftest import NFL_HEADER


def test_upload_schema_matches_dk(nfl, classic_slate, entries_bytes):
    spec = nfl.mode("classic")
    lus = objective_a(nfl, classic_slate, k=3).lineups
    text = upload_csv(lus, classic_slate, spec)
    rows = list(csv.reader(io.StringIO(text)))
    assert rows[0] == NFL_HEADER
    # same slot header as DK's own DKEntries template
    assert read_entries(entries_bytes).slot_header == rows[0]
    ids = set(classic_slate["id"])
    for r in rows[1:]:
        assert len(r) == 9 and all(c in ids for c in r)
    assert text.endswith("\r\n")


def test_showdown_upload_uses_cpt_ids(nfl, showdown_slate):
    spec = nfl.mode("showdown")
    lus = objective_a(nfl, showdown_slate, mode="showdown", min_salary=0).lineups
    rows = list(csv.reader(io.StringIO(upload_csv(lus, showdown_slate, spec))))
    assert rows[0] == ["CPT", "FLEX", "FLEX", "FLEX", "FLEX", "FLEX"]
    cpt_ids = set(showdown_slate["cpt_id"])
    assert rows[1][0] in cpt_ids
    assert all(c in set(showdown_slate["id"]) for c in rows[1][1:])


def test_max_entries_enforced(nfl, classic_slate):
    lus = objective_a(nfl, classic_slate, k=3).lineups
    with pytest.raises(ExportError):
        upload_csv(lus, classic_slate, nfl.mode("classic"), max_entries=2)


def test_entries_noop_roundtrip_is_byte_identical(entries_bytes):
    ef = read_entries(entries_bytes)
    assert write_entries(ef, {}) == entries_bytes


def test_entries_roundtrip_contest_columns_byte_identical(nfl, classic_slate, entries_bytes):
    spec = nfl.mode("classic")
    lus = objective_a(nfl, classic_slate, k=2).lineups
    ef = read_entries(entries_bytes)
    assert len(ef.entry_rows) == 8
    assign = assign_lineups_to_entries(ef, {"180000001": lus[:1], "180000002": lus}, classic_slate, spec)
    out = write_entries(ef, assign)
    in_lines = entries_bytes.decode().split("\r\n")
    out_lines = out.decode().split("\r\n")
    assert len(in_lines) == len(out_lines)
    for k, (a, b) in enumerate(zip(in_lines, out_lines)):
        fa, fb = split_raw_fields(a), split_raw_fields(b)
        assert fa[:4] == fb[:4]                          # Entry ID / Contest Name / Contest ID / Entry Fee
        if k in ef.entry_rows:
            assert fa[13:] == fb[13:]                    # everything right of the lineup is untouched
        else:
            assert a == b                                # non-entry lines unchanged
    # the written lineups parse back to the intended IDs
    ef2 = read_entries(out)
    ents = ef2.entries
    for _, r in ents.iterrows():
        assert r["current"] == assign[r["Entry ID"]]


def test_entries_rejects_wrong_sport_header(nfl, showdown_slate, entries_bytes):
    ef = read_entries(entries_bytes)
    with pytest.raises(ExportError):
        assign_lineups_to_entries(ef, {"180000001": []}, showdown_slate, nfl.mode("showdown"))


def test_entries_max_entries(nfl, classic_slate, entries_bytes):
    lus = objective_a(nfl, classic_slate).lineups
    ef = read_entries(entries_bytes)
    with pytest.raises(ExportError):
        assign_lineups_to_entries(ef, {"180000002": lus}, classic_slate, nfl.mode("classic"),
                                  max_entries={"180000002": 3})
