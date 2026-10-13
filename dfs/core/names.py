"""Name normalization and fuzzy matching of projections to DK salaries (stdlib difflib only)."""
from __future__ import annotations

import re
import unicodedata
from difflib import SequenceMatcher

import pandas as pd

SUFFIXES = {"jr", "sr", "ii", "iii", "iv", "v"}
TEAM_UNIT_WORDS = {"dst", "d/st", "def", "defense", "d", "st"}


def normalize_name(name: str) -> str:
    s = unicodedata.normalize("NFKD", str(name)).encode("ascii", "ignore").decode()
    s = s.lower().replace("&", " and ")
    s = re.sub(r"[\.\,'’`]", "", s)
    s = re.sub(r"[^a-z0-9/ ]+", " ", s)
    toks = [t for t in s.split() if t not in SUFFIXES]
    return " ".join(toks)


def normalize_team(team: str, aliases: dict[str, str]) -> str:
    t = str(team).strip().upper()
    return aliases.get(t, t)


def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()


def match_players(
    salaries: pd.DataFrame,
    proj: pd.DataFrame,
    team_aliases: dict[str, str],
    team_unit_positions: set[str],
    overrides: dict[str, str] | None = None,
    threshold: float = 0.86,
) -> pd.DataFrame:
    """Return proj with a `dk_index` column (row index into salaries, or -1) and `match_method`.

    Order: manual override -> team-unit (DST) by team -> exact name+team -> exact name (unique)
           -> fuzzy within team+position -> fuzzy within team.
    overrides maps a projection name (normalized) to a DK ID.
    """
    overrides = {normalize_name(k): str(v) for k, v in (overrides or {}).items()}
    sal = salaries.copy()
    sal["_n"] = sal["name"].map(normalize_name)
    sal["_t"] = sal["team"].map(lambda t: normalize_team(t, team_aliases))
    by_id = {str(v): i for i, v in sal["id"].items()}

    out = proj.copy()
    out["_n"] = out["name"].map(normalize_name)
    out["_t"] = out["team"].map(lambda t: normalize_team(t, team_aliases)) if "team" in out else ""
    out["_p"] = out["position"].astype(str).str.upper().str.replace("D/ST", "DST").replace(
        {"DEF": "DST", "D": "DST", "DS": "DST"}) if "position" in out else ""

    dk_index, method = [], []
    used: set[int] = set()
    for _, r in out.iterrows():
        idx, how = -1, "unmatched"
        if r["_n"] in overrides and overrides[r["_n"]] in by_id:
            idx, how = by_id[overrides[r["_n"]]], "override"
        elif r["_p"] in team_unit_positions or any(w in r["_n"].split() for w in ("dst", "defense", "d/st")):
            cand = sal[(sal["_t"] == r["_t"]) & sal["position"].isin(team_unit_positions)]
            if len(cand) == 1:
                idx, how = int(cand.index[0]), "team_unit"
        if idx < 0:
            cand = sal[(sal["_n"] == r["_n"]) & (sal["_t"] == r["_t"])]
            if len(cand) >= 1:
                idx, how = int(cand.index[0]), "exact"
        if idx < 0:
            cand = sal[sal["_n"] == r["_n"]]
            if len(cand) == 1:
                idx, how = int(cand.index[0]), "exact_name"
        if idx < 0:
            for pool_mask, label in (
                ((sal["_t"] == r["_t"]) & (sal["position"].astype(str).str.contains(str(r["_p"]), regex=False)),
                 "fuzzy_team_pos"),
                (sal["_t"] == r["_t"], "fuzzy_team"),
            ):
                pool = sal[pool_mask]
                if pool.empty:
                    continue
                scores = pool["_n"].map(lambda n: similarity(n, r["_n"]))
                best = scores.idxmax()
                if scores[best] >= threshold:
                    idx, how = int(best), f"{label}:{scores[best]:.2f}"
                    break
        if idx in used and how != "override":
            how = f"duplicate({how})"
            idx = -1
        if idx >= 0:
            used.add(idx)
        dk_index.append(idx)
        method.append(how)
    out["dk_index"] = dk_index
    out["match_method"] = method
    return out.drop(columns=["_n", "_t", "_p"])


def unmatched_table(matched: pd.DataFrame, value_col: str = "median") -> pd.DataFrame:
    """Players projected above 0 that are not matched. The run is blocked until this is empty
    (or the rows are explicitly excluded by the user)."""
    m = matched[(matched["dk_index"] < 0) & (pd.to_numeric(matched[value_col], errors="coerce").fillna(0) > 0)]
    if "excluded" in m.columns:
        m = m[~m["excluded"].fillna(False).astype(bool)]
    return m
