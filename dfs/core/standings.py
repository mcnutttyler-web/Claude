"""DK contest standings export (download it from a completed contest while logged in — never scraped).

Layout: Rank, EntryId, EntryName, TimeRemaining, Points, Lineup, <blank>, Player, Roster Position, %Drafted, FPTS
  * the left block has one row per entry; `Lineup` is "QB Name RB Name ... FLEX Name DST Name" (Showdown:
    "CPT Name UTIL/FLEX Name ...")
  * the right block lists each player once with actual %Drafted and FPTS (rows not aligned with entries)
"""
from __future__ import annotations

import re
from dataclasses import dataclass

import numpy as np
import pandas as pd

from core.lineup import Lineup, is_valid
from core.names import normalize_name


@dataclass
class Standings:
    entries: pd.DataFrame        # rank, entry_id, entry_name, points, lineup
    players: pd.DataFrame        # player, roster_position, pct_drafted (0-1), fpts


def read_standings(path_or_buf) -> Standings:
    raw = pd.read_csv(path_or_buf, dtype=str, keep_default_na=False)
    raw.columns = [c.strip() for c in raw.columns]
    e = raw[raw["EntryId"].str.strip() != ""][["Rank", "EntryId", "EntryName", "Points", "Lineup"]].copy()
    e.columns = ["rank", "entry_id", "entry_name", "points", "lineup"]
    e["rank"] = pd.to_numeric(e["rank"], errors="coerce")
    e["points"] = pd.to_numeric(e["points"], errors="coerce")
    p = raw[raw["Player"].str.strip() != ""][["Player", "Roster Position", "%Drafted", "FPTS"]].copy()
    p.columns = ["player", "roster_position", "pct_drafted", "fpts"]
    p["pct_drafted"] = pd.to_numeric(p["pct_drafted"].str.rstrip("%"), errors="coerce") / 100.0
    p["fpts"] = pd.to_numeric(p["fpts"], errors="coerce")
    return Standings(e.reset_index(drop=True), p.reset_index(drop=True))


def split_lineup(text: str, slot_labels: list[str]) -> list[tuple[str, str]]:
    """'QB Josh Allen RB A B WR ...' -> [(slot, name), ...] in the order written."""
    labels = sorted(set(slot_labels), key=len, reverse=True)
    pat = re.compile(r"(?:^|\s)(" + "|".join(re.escape(l) for l in labels) + r")\s")
    parts, pos = [], [(m.start(1), m.group(1)) for m in pat.finditer(" " + text.strip() + " ")]
    s = " " + text.strip() + " "
    for k, (start, lab) in enumerate(pos):
        end = pos[k + 1][0] if k + 1 < len(pos) else len(s)
        name = s[start + len(lab): end].strip()
        parts.append((lab, name))
    return parts


def lineups_from_standings(st: Standings, slate: pd.DataFrame, spec, labels: list[str] | None = None
                           ) -> list[Lineup | None]:
    """Map each entry's lineup text onto slate indices (None if a player can't be resolved or it isn't DK-valid)."""
    labels = labels or list(dict.fromkeys(s.name for s in spec.slots)) + ["UTIL"]
    by_name: dict[str, list[int]] = {}
    for i, n in slate["name"].items():
        by_name.setdefault(normalize_name(n), []).append(int(i))
    out = []
    for text in st.entries["lineup"]:
        parts = split_lineup(text, labels)
        if len(parts) != spec.roster_size:
            out.append(None)
            continue
        # assign parsed players to spec slots: same label first, FLEX/UTIL fill remaining flexible slots
        open_slots = list(range(spec.roster_size))
        chosen = [-1] * spec.roster_size
        ok = True
        for lab, name in parts:
            cands = by_name.get(normalize_name(name), [])
            if len(cands) != 1:
                ok = False
                break
            p = cands[0]
            k = next((k for k in open_slots if spec.slots[k].name == lab), None)
            if k is None and lab == "UTIL":
                k = next((k for k in open_slots if spec.slots[k].name != spec.captain_slot), None)
            if k is None:
                ok = False
                break
            chosen[k] = p
            open_slots.remove(k)
        lu = Lineup(tuple(chosen), spec.name) if ok and -1 not in chosen else None
        out.append(lu if lu is not None and is_valid(lu, slate, spec) else None)
    return out


def actual_ownership(st: Standings, slate: pd.DataFrame, captain: bool = False) -> pd.Series:
    """%Drafted mapped to slate rows (0 for players not listed). captain=True reads CPT rows (Showdown)."""
    p = st.players
    if captain:
        p = p[p["roster_position"].str.upper() == "CPT"]
    else:
        p = p[p["roster_position"].str.upper() != "CPT"]
    m = {normalize_name(n): v for n, v in zip(p["player"], p["pct_drafted"])}
    return slate["name"].map(lambda n: m.get(normalize_name(n), 0.0)).astype(float)


def actual_points(st: Standings, slate: pd.DataFrame) -> pd.Series:
    m = {normalize_name(n): v for n, v in zip(st.players["player"], st.players["fpts"])}
    return slate["name"].map(lambda n: m.get(normalize_name(n), np.nan)).astype(float)
