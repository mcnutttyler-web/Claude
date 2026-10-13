"""DK upload CSV and DKEntries.csv round-trip.

The DKEntries round-trip edits ONLY the lineup cells (column E onward, one per roster slot).
Every other byte — Entry ID / Contest Name / Contest ID / Entry Fee, the instructions block,
quoting, line endings — is copied from the original file verbatim.
"""
from __future__ import annotations

import csv
import io
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

import pandas as pd

from core.lineup import Lineup, export_ids, validate_lineup
from sports.base import ModeSpec

ENTRY_COLS = ["Entry ID", "Contest Name", "Contest ID", "Entry Fee"]
N_ENTRY_COLS = 4


class ExportError(ValueError):
    pass


def upload_csv(lineups: Sequence[Lineup], slate: pd.DataFrame, spec: ModeSpec,
               max_entries: int | None = None) -> str:
    """DK bulk-upload CSV: header from SportConfig export_header, cells are DK player IDs."""
    if max_entries is not None and len(lineups) > max_entries:
        raise ExportError(f"{len(lineups)} lineups exceed max_entries={max_entries}")
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\r\n")
    w.writerow(spec.export_header)
    for lu in lineups:
        errs = validate_lineup(lu, slate, spec)
        if errs:
            raise ExportError(f"invalid lineup {lu.players}: {errs}")
        w.writerow(export_ids(lu, slate, spec))
    return buf.getvalue()


# ----------------------------------------------------------- raw CSV helpers
def split_raw_fields(line: str) -> list[str]:
    """Split one CSV line into its RAW field strings (quotes kept), so it can be re-joined byte-exactly."""
    fields, cur, inq, i = [], [], False, 0
    while i < len(line):
        ch = line[i]
        if inq:
            cur.append(ch)
            if ch == '"':
                if i + 1 < len(line) and line[i + 1] == '"':
                    cur.append('"')
                    i += 1
                else:
                    inq = False
        elif ch == '"':
            inq = True
            cur.append(ch)
        elif ch == ",":
            fields.append("".join(cur))
            cur = []
        else:
            cur.append(ch)
        i += 1
    fields.append("".join(cur))
    return fields


def unquote(raw: str) -> str:
    raw = raw.strip()
    if len(raw) >= 2 and raw[0] == raw[-1] == '"':
        return raw[1:-1].replace('""', '"')
    return raw


def quote_if_needed(val: str) -> str:
    return f'"{val.replace(chr(34), chr(34) * 2)}"' if any(c in val for c in ',"\r\n') else val


@dataclass
class EntriesFile:
    lines: list[str]               # raw lines, without terminators
    terminators: list[str]         # "\r\n", "\n" or "" per line
    header: list[str]
    entry_rows: list[int]          # line numbers holding an entry
    slot_header: list[str]         # roster slot names found starting at column E

    @property
    def entries(self) -> pd.DataFrame:
        recs = []
        for ln in self.entry_rows:
            f = split_raw_fields(self.lines[ln])
            r = {c: unquote(f[k]) for k, c in enumerate(ENTRY_COLS)}
            r["line"] = ln
            r["current"] = [unquote(x) for x in f[N_ENTRY_COLS:N_ENTRY_COLS + len(self.slot_header)]]
            recs.append(r)
        return pd.DataFrame(recs)


def read_entries(path_or_bytes) -> EntriesFile:
    if isinstance(path_or_bytes, (str, Path)) and Path(path_or_bytes).exists():
        data = Path(path_or_bytes).read_bytes()
    elif isinstance(path_or_bytes, (bytes, bytearray)):
        data = bytes(path_or_bytes)
    else:
        data = path_or_bytes.read()
    text = data.decode("utf-8-sig") if data.startswith(b"\xef\xbb\xbf") else data.decode("utf-8")
    bom = data.startswith(b"\xef\xbb\xbf")
    lines, terms = [], []
    parts = text.split("\n")
    for k, part in enumerate(parts):
        last = k == len(parts) - 1
        if last and part == "":
            break
        if last:
            lines.append(part)
            terms.append("")
        elif part.endswith("\r"):
            lines.append(part[:-1])
            terms.append("\r\n")
        else:
            lines.append(part)
            terms.append("\n")
    header = [unquote(x) for x in split_raw_fields(lines[0])]
    if header[:N_ENTRY_COLS] != ENTRY_COLS:
        raise ExportError(f"DKEntries header must start with {ENTRY_COLS}, got {header[:N_ENTRY_COLS]}")
    slots = []
    for h in header[N_ENTRY_COLS:]:
        if not h or h.lower().startswith("instructions"):
            break
        slots.append(h)
    entry_rows = []
    for ln in range(1, len(lines)):
        f = split_raw_fields(lines[ln])
        if len(f) > N_ENTRY_COLS and unquote(f[0]).strip().isdigit():
            entry_rows.append(ln)
    ef = EntriesFile(lines, terms, header, entry_rows, slots)
    ef._bom = bom  # type: ignore[attr-defined]
    return ef


def write_entries(ef: EntriesFile, assignments: dict[str, Sequence[str]]) -> bytes:
    """assignments: Entry ID -> list of DK player IDs in slot order. Unassigned entries are untouched."""
    out_lines = list(ef.lines)
    n = len(ef.slot_header)
    for ln in ef.entry_rows:
        f = split_raw_fields(ef.lines[ln])
        eid = unquote(f[0])
        if eid not in assignments:
            continue
        ids = [str(x) for x in assignments[eid]]
        if len(ids) != n:
            raise ExportError(f"entry {eid}: {len(ids)} players for {n} slots")
        while len(f) < N_ENTRY_COLS + n:
            f.append("")
        f[N_ENTRY_COLS:N_ENTRY_COLS + n] = [quote_if_needed(x) for x in ids]
        out_lines[ln] = ",".join(f)
    body = "".join(l + t for l, t in zip(out_lines, ef.terminators))
    data = body.encode("utf-8")
    return (b"\xef\xbb\xbf" + data) if getattr(ef, "_bom", False) else data


def assign_lineups_to_entries(
    ef: EntriesFile, lineups_by_contest: dict[str, Sequence[Lineup]], slate: pd.DataFrame, spec: ModeSpec,
    max_entries: dict[str, int] | None = None,
) -> dict[str, list[str]]:
    """Map each entry of a contest to a lineup (cycling if fewer lineups than entries).

    Validates that slot headers match the sport's export header and that entry counts respect max_entries.
    """
    if ef.slot_header != spec.export_header:
        raise ExportError(f"DKEntries slots {ef.slot_header} != export header {spec.export_header}")
    ents = ef.entries
    out: dict[str, list[str]] = {}
    for cid, lus in lineups_by_contest.items():
        rows = ents[ents["Contest ID"] == str(cid)]
        if max_entries and cid in max_entries and len(rows) > max_entries[cid]:
            raise ExportError(f"contest {cid}: {len(rows)} entries > max_entries {max_entries[cid]}")
        if not lus:
            continue
        for k, eid in enumerate(rows["Entry ID"]):
            lu = lus[k % len(lus)]
            errs = validate_lineup(lu, slate, spec)
            if errs:
                raise ExportError(f"invalid lineup for entry {eid}: {errs}")
            out[eid] = export_ids(lu, slate, spec)
    return out
