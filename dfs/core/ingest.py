"""Read DKSalaries.csv and projections.csv and build the slate DataFrame."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

from core.names import match_players, unmatched_table
from sports.base import SportConfig

GAME_INFO_RE = re.compile(
    r"(?P<away>[A-Za-z0-9]+)@(?P<home>[A-Za-z0-9]+)\s+(?P<date>\d{1,2}/\d{1,2}/\d{4})\s+(?P<time>\d{1,2}:\d{2}\s*[AP]M)",
    re.I,
)

# Canonical projection columns -> accepted header synonyms (lower-case, stripped).
PROJECTION_SYNONYMS: dict[str, list[str]] = {
    "name": ["name", "player", "player_name", "playername", "full_name"],
    "team": ["team", "teamabbrev", "tm", "team_abbrev"],
    "position": ["position", "pos"],
    "median": ["median", "proj", "projection", "fpts", "points", "dk_points", "dkpts", "mean", "projected_points"],
    "floor": ["floor", "p10", "p25", "low"],
    "ceiling": ["ceiling", "ceil", "p85", "p90", "high"],
    "std_dev": ["std_dev", "stddev", "std", "sd", "stdev"],
    "ownership": ["ownership", "own", "proj_own", "projected_ownership", "own%", "pown", "pown%"],
    "cash_ownership": ["cash_ownership", "cash_own", "cash own"],
    "cpt_ownership": ["cpt_ownership", "cpt_own", "captain_ownership"],
    "optimal_pct": ["optimal_pct", "optimal", "opt%", "optimal%"],
    "team_total": ["team_total", "implied_total", "itt", "implied"],
    "spread": ["spread", "line"],
    "game_total": ["game_total", "total", "o/u", "ou", "over_under"],
    "depth_role": ["depth_role", "role", "depth"],
    "minutes": ["minutes", "min", "mins"],
    "status": ["status", "injury", "injury_status"],
    "weather_flag": ["weather_flag", "weather"],
}
REQUIRED = ["name", "team", "position", "median"]
PCT_COLUMNS = ["ownership", "cash_ownership", "cpt_ownership", "optimal_pct"]


def parse_game_info(s: str, tz: str = "America/New_York") -> tuple[str | None, str | None, datetime | None]:
    m = GAME_INFO_RE.search(str(s))
    if not m:
        return None, None, None
    dt = datetime.strptime(f"{m['date']} {m['time'].replace(' ', '').upper()}", "%m/%d/%Y %I:%M%p")
    return m["away"].upper(), m["home"].upper(), dt.replace(tzinfo=ZoneInfo(tz))


def lock_window(dt: datetime | None, windows: list[dict]) -> str:
    if dt is None or pd.isna(dt):
        return "unknown"
    for w in windows:
        if "before_hour" not in w or dt.hour < w["before_hour"]:
            return w["name"]
    return windows[-1]["name"] if windows else "main"


def read_dk_salaries(path_or_buf, sport: SportConfig) -> tuple[pd.DataFrame, str]:
    """Return (players, mode). Showdown CPT rows are collapsed into cpt_id / cpt_salary columns."""
    raw = pd.read_csv(path_or_buf, dtype={"ID": str})
    raw.columns = [c.strip() for c in raw.columns]
    need = ["Position", "Name", "ID", "Roster Position", "Salary", "Game Info", "TeamAbbrev"]
    missing = [c for c in need if c not in raw.columns]
    if missing:
        raise ValueError(f"DKSalaries is missing columns: {missing}")
    tz = sport.lock_rule.get("timezone", "America/New_York")
    windows = sport.lock_rule.get("windows", [])
    df = pd.DataFrame({
        "id": raw["ID"].astype(str).str.strip(),
        "name": raw["Name"].astype(str).str.strip(),
        "name_id": raw.get("Name + ID", raw["Name"]).astype(str),
        "position": raw["Position"].astype(str).str.strip().str.split("/").str[0],
        "positions": raw["Position"].astype(str).str.strip().str.split("/").map(tuple),
        "roster_position": raw["Roster Position"].astype(str).str.strip(),
        "salary": pd.to_numeric(raw["Salary"], errors="coerce").astype(int),
        "team": raw["TeamAbbrev"].astype(str).str.strip().str.upper(),
        "avg_ppg": pd.to_numeric(raw.get("AvgPointsPerGame", np.nan), errors="coerce"),
        "game_info": raw["Game Info"].astype(str),
    })
    parsed = df["game_info"].map(lambda s: parse_game_info(s, tz))
    df["away"] = parsed.str[0]
    df["home"] = parsed.str[1]
    df["lock_time"] = parsed.str[2]
    df["game_id"] = df["away"].fillna("") + "@" + df["home"].fillna("")
    df["opp"] = np.where(df["team"] == df["home"], df["away"], df["home"])
    df["lock_window"] = df["lock_time"].map(lambda d: lock_window(d, windows))
    df["roster_tokens"] = df["roster_position"].str.split("/").map(tuple)

    is_cpt = df["roster_position"].str.upper().eq("CPT")
    if is_cpt.any():
        mode = "showdown"
        cpt = df[is_cpt].set_index(["name", "team"])[["id", "salary"]].rename(
            columns={"id": "cpt_id", "salary": "cpt_salary"})
        flex = df[~is_cpt].copy()
        flex = flex.join(cpt, on=["name", "team"])
        df = flex
    else:
        mode = "classic"
    return df.reset_index(drop=True), mode


def auto_column_mapping(columns: list[str]) -> dict[str, str]:
    """Guess canonical -> source column mapping. The UI lets the user override it."""
    lower = {c.strip().lower(): c for c in columns}
    mapping: dict[str, str] = {}
    for canon, syns in PROJECTION_SYNONYMS.items():
        for s in syns:
            if s in lower and lower[s] not in mapping.values():
                mapping[canon] = lower[s]
                break
    return mapping


def apply_column_mapping(df: pd.DataFrame, mapping: dict[str, str]) -> pd.DataFrame:
    missing = [c for c in REQUIRED if c not in mapping or mapping[c] not in df.columns]
    if missing:
        raise ValueError(f"projections mapping is missing required columns: {missing}")
    out = pd.DataFrame({canon: df[src] for canon, src in mapping.items() if src in df.columns})
    for c in ["median", "floor", "ceiling", "std_dev", "team_total", "spread", "game_total", "minutes"]:
        if c in out:
            out[c] = pd.to_numeric(out[c], errors="coerce")
    for c in PCT_COLUMNS:
        if c in out:
            v = pd.to_numeric(out[c].astype(str).str.rstrip("%"), errors="coerce")
            out[c] = v / 100.0 if v.max(skipna=True) > 1.0 else v
    out["name"] = out["name"].astype(str).str.strip()
    out["team"] = out["team"].astype(str).str.strip().str.upper()
    out["position"] = out["position"].astype(str).str.strip().str.upper()
    if "status" in out:
        out["status"] = out["status"].fillna("").astype(str).str.strip().str.upper()
    return out


def read_projections(path_or_buf, mapping: dict[str, str] | None = None) -> pd.DataFrame:
    raw = pd.read_csv(path_or_buf)
    return apply_column_mapping(raw, mapping or auto_column_mapping(list(raw.columns)))


@dataclass
class SlateBuild:
    slate: pd.DataFrame                 # DK players merged with projections (RangeIndex)
    mode: str
    matched: pd.DataFrame               # projections with dk_index / match_method
    unmatched: pd.DataFrame             # blocking rows (projected > 0, not matched, not excluded)
    warnings: list[str] = field(default_factory=list)

    @property
    def ready(self) -> bool:
        return self.unmatched.empty


def build_slate(
    salaries: pd.DataFrame,
    mode: str,
    proj: pd.DataFrame,
    sport: SportConfig,
    overrides: dict[str, str] | None = None,
    excluded_names: set[str] | None = None,
    drop_unprojected: bool = True,
) -> SlateBuild:
    matched = match_players(salaries, proj, sport.team_aliases, sport.team_unit_positions, overrides)
    matched["excluded"] = matched["name"].isin(excluded_names or set())
    blocking = unmatched_table(matched)
    good = matched[(matched["dk_index"] >= 0) & ~matched["excluded"]]
    cols = [c for c in good.columns if c not in ("name", "team", "position", "dk_index", "match_method", "excluded")]
    slate = salaries.copy()
    slate = slate.join(good.set_index("dk_index")[cols], how="left")
    slate["median"] = slate["median"].fillna(0.0)
    warnings: list[str] = []
    if "status" in slate:
        slate["status"] = slate["status"].fillna("").astype(str).str.upper()
        q = slate[slate["status"].isin(sport.status_warn) & (slate["median"] > 0)]
        for _, r in q.iterrows():
            warnings.append(f"Questionable: {r['name']} ({r['team']}) status={r['status']}")
    else:
        slate["status"] = ""
    if "weather_flag" in slate:
        flagged = slate.loc[slate["weather_flag"].fillna("").astype(str).str.strip().isin(
            ["1", "True", "true", "Y", "y", "yes", "YES"]) | slate["weather_flag"].eq(True), "game_id"].unique()
        for g in flagged:
            warnings.append(f"Weather flag on game {g}")
    if drop_unprojected:
        slate = slate[slate["median"] > 0]
    slate = slate.reset_index(drop=True)
    slate["role"] = sport.roles(slate).to_numpy()
    if not blocking.empty:
        warnings.insert(0, f"{len(blocking)} projected players are unmatched — map or exclude them to continue.")
    return SlateBuild(slate, mode, matched, blocking, warnings)


def load_slate(salaries_path: str | Path, projections_path: str | Path, sport: SportConfig,
               mapping: dict[str, str] | None = None, **kw) -> SlateBuild:
    sal, mode = read_dk_salaries(salaries_path, sport)
    proj = read_projections(projections_path, mapping)
    return build_slate(sal, mode, proj, sport, **kw)


def hard_rule_excludes(slate: pd.DataFrame, sport: SportConfig) -> list[int]:
    """Row indices excluded by status (O/D/IR...)."""
    if "status" not in slate:
        return []
    return [int(i) for i in np.flatnonzero(slate["status"].astype(str).str.upper().isin(sport.status_exclude))]
