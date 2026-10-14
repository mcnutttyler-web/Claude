"""CSV importers: projection sources, injuries, overrides, and backtest history.

A *source* is any projection CSV: a free consensus (FFA/ffanalytics, DailyFantasyFuel), a site's stat-line
projections (Sleeper/ESPN — converted to DK scoring from their STAT LINES, never their own points), or an
optional paid CSV. Each source is matched to the DK slate with the same name matcher the lineup generator uses.

sources.yaml:
    sources:
      - name: ffa_avg            # unique label
        path: data/ffa.csv
        kind: points             # points | stats
        component: consensus     # consensus | model | market   (P1 only produces consensus)
        mapping: {}              # optional canonical -> CSV column overrides
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd
import yaml

from core.ingest import auto_column_mapping, prepare_projection_frame
from core.names import match_players
from core.projections.params import Params
from sports.base import SportConfig

# DK scoring stat keys (sports/nfl/config.yaml) <- common source header spellings.
STAT_SYNONYMS: dict[str, list[str]] = {
    "pass_att": ["pass_att", "pass_attempts", "passing_attempts", "att"],
    "completions": ["completions", "pass_cmp", "cmp", "pass_comp"],
    "pass_yds": ["pass_yds", "pass_yd", "passing_yards", "pass_yards", "passyds"],
    "pass_td": ["pass_td", "pass_tds", "passing_tds", "passtd"],
    "int": ["int", "pass_int", "interceptions", "ints_thrown"],
    "rush_att": ["rush_att", "carries", "rushing_attempts", "rush_attempts"],
    "rush_yds": ["rush_yds", "rush_yd", "rushing_yards", "rush_yards"],
    "rush_td": ["rush_td", "rush_tds", "rushing_tds"],
    "targets": ["targets", "tgt", "rec_tgt"],
    "rec": ["rec", "receptions"],
    "rec_yds": ["rec_yds", "rec_yd", "receiving_yards", "rec_yards"],
    "rec_td": ["rec_td", "rec_tds", "receiving_tds"],
    "fumble_lost": ["fumble_lost", "fum_lost", "fumbles_lost"],
    "two_pt": ["two_pt", "2pt", "two_pt_conversions", "pass_2pt"],
    "sacks": ["sacks", "def_sack", "dst_sacks"],
    "def_int": ["def_int", "dst_int", "def_ints"],
    "fum_rec": ["fum_rec", "def_fum_rec", "dst_fum_rec"],
    "safety": ["safety", "safeties", "def_safety"],
    "blocked_kick": ["blocked_kick", "blk_kick", "def_blk_kick"],
    "def_td": ["def_td", "dst_td", "def_tds", "ret_td_def"],
    "pts_allowed": ["pts_allowed", "points_allowed", "def_pts_allow"],
}
STAT_COLS = list(STAT_SYNONYMS)


@dataclass
class SourceSpec:
    name: str
    path: str
    kind: str = "points"
    component: str = "consensus"
    mapping: dict = field(default_factory=dict)


def load_source_specs(path: str | Path) -> list[SourceSpec]:
    with open(path) as f:
        d = yaml.safe_load(f)
    base = Path(path).parent
    out = []
    for s in d["sources"]:
        p = Path(s["path"])
        s["path"] = str(p if p.is_absolute() or p.exists() else base / p)
        out.append(SourceSpec(**s))
    return out


def stat_mapping(columns: list[str]) -> dict[str, str]:
    lower = {c.strip().lower(): c for c in columns}
    out = {}
    for canon, syns in STAT_SYNONYMS.items():
        for s in syns:
            if s in lower:
                out[canon] = lower[s]
                break
    return out


def read_source(spec: SourceSpec, slate: pd.DataFrame, sport: SportConfig, params: Params,
                buf=None) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Return (matched rows keyed by dk_index, unmatched rows)."""
    raw = prepare_projection_frame(pd.read_csv(buf if buf is not None else spec.path))
    m = auto_column_mapping(list(raw.columns))
    m.update(spec.mapping or {})
    for c in ("name", "team", "position"):
        if c not in m:
            raise ValueError(f"source {spec.name}: no column for {c}")
    df = pd.DataFrame({
        "name": raw[m["name"]].astype(str).str.strip(),
        "team": raw[m["team"]].astype(str).str.strip().str.upper(),
        "position": raw[m["position"]].astype(str).str.strip().str.upper(),
    })
    if spec.kind == "stats":
        sm = stat_mapping(list(raw.columns))
        sm.update({k: v for k, v in (spec.mapping or {}).items() if k in STAT_SYNONYMS})
        if not sm:
            raise ValueError(f"source {spec.name}: kind=stats but no stat columns recognised")
        for canon, col in sm.items():
            df[canon] = pd.to_numeric(raw[col], errors="coerce")
        disp = {"cv": params.get("stat_conversion.bonus_cv"), "pa_sigma": params.get("stat_conversion.pa_sigma")}
        df["points"] = [sport.expected_score({k: r[k] for k in sm}, disp) for _, r in df.iterrows()]
    else:
        if "median" not in m:
            raise ValueError(f"source {spec.name}: no points column")
        df["points"] = pd.to_numeric(raw[m["median"]], errors="coerce")
    for c in ("floor", "ceiling", "ownership", "cash_ownership", "cpt_ownership", "status"):
        if c in m:
            df[c] = raw[m[c]]
    for c in ("ownership", "cash_ownership", "cpt_ownership"):
        if c in df:
            v = pd.to_numeric(df[c].astype(str).str.rstrip("%"), errors="coerce")
            df[c] = v / 100.0 if v.max(skipna=True) > 1.0 else v
    for c in ("team_total", "spread", "game_total"):
        if c in m:
            df[c] = pd.to_numeric(raw[m[c]], errors="coerce")
    for c in ("floor", "ceiling"):
        if c in df:
            df[c] = pd.to_numeric(df[c], errors="coerce")
    matched = match_players(slate, df, sport.team_aliases, sport.team_unit_positions)
    matched["source"] = spec.name
    matched["component"] = spec.component
    good = matched[matched["dk_index"] >= 0].drop(columns=["name", "team", "position", "match_method"])
    bad = matched[matched["dk_index"] < 0]
    return good.reset_index(drop=True), bad.reset_index(drop=True)


# ------------------------------------------------------------------ injuries
def read_injuries(path_or_buf, slate: pd.DataFrame, sport: SportConfig, params: Params) -> pd.DataFrame:
    """injuries.csv: name, team, position(opt), status, practice(opt: FULL/LIMITED/DNP, last practice of week).

    Returns dk_index, status, practice, p_play.
    """
    raw = pd.read_csv(path_or_buf)
    raw.columns = [c.strip().lower() for c in raw.columns]
    if "position" not in raw:
        raw["position"] = ""
    matched = match_players(slate, raw, sport.team_aliases, sport.team_unit_positions)
    matched = matched[matched["dk_index"] >= 0].copy()
    matched["status"] = matched["status"].fillna("").astype(str).str.strip().str.upper()
    matched["practice"] = (matched["practice"].fillna("").astype(str).str.strip().str.upper()
                           if "practice" in matched else "")
    matched["p_play"] = [p_play(s, pr, params) for s, pr in zip(matched["status"], matched["practice"])]
    return matched[["dk_index", "status", "practice", "p_play"]]


def p_play(status: str, practice: str, params: Params) -> float:
    table = {str(k).upper(): float(v) for k, v in params.get("injuries.p_play").items()}
    s = (status or "").upper()
    if s in ("Q", "QUESTIONABLE"):
        by_prac = {str(k).upper(): float(v) for k, v in params.get("injuries.questionable_by_practice").items()}
        if (practice or "").upper() in by_prac:
            return by_prac[practice.upper()]
    return table.get(s, table.get("", 0.98))


# ----------------------------------------------------------------- overrides
OVERRIDE_FIELDS = {"mean", "median", "floor", "ceiling", "own_gpp", "own_cash", "own_cpt", "p_play", "status"}


def read_overrides(path_or_buf, slate: pd.DataFrame, sport: SportConfig) -> pd.DataFrame:
    """overrides.csv: id (DK ID) or name+team, field, value, note. Returns dk_index, field, value, note."""
    raw = pd.read_csv(path_or_buf, dtype=str).fillna("")
    raw.columns = [c.strip().lower() for c in raw.columns]
    bad = set(raw["field"]) - OVERRIDE_FIELDS
    if bad:
        raise ValueError(f"unknown override fields {sorted(bad)}; allowed {sorted(OVERRIDE_FIELDS)}")
    by_id = {str(v): i for i, v in slate["id"].items()}
    for c in ("id", "name", "team", "position"):
        if c not in raw:
            raw[c] = ""
    # One player can carry several override rows: match each distinct (name, team) once.
    keys = raw.loc[~raw["id"].isin(by_id), ["name", "team", "position"]].drop_duplicates(["name", "team"])
    lookup = {}
    if len(keys):
        m = match_players(slate, keys.reset_index(drop=True), sport.team_aliases, sport.team_unit_positions)
        lookup = {(r["name"], r["team"]): int(r["dk_index"]) for _, r in m.iterrows()}
    raw["dk_index"] = [by_id[r["id"]] if r["id"] in by_id else lookup.get((r["name"], r["team"]), -1)
                       for _, r in raw.iterrows()]
    if (raw["dk_index"] < 0).any():
        raise ValueError(f"overrides not matched: {list(raw.loc[raw['dk_index'] < 0, 'name'])}")
    return raw[["dk_index", "field", "value"] + (["note"] if "note" in raw else [])]


# ----------------------------------------------------------- backtest inputs
def read_history(path_or_buf) -> pd.DataFrame:
    """Historical source projections: season, week, source, player, position, points."""
    df = pd.read_csv(path_or_buf)
    need = {"season", "week", "source", "player", "position", "points"}
    if not need <= set(df.columns):
        raise ValueError(f"history needs {sorted(need)}")
    return df


def read_actuals(path_or_buf) -> pd.DataFrame:
    """Actual results: season, week, player, position, dk_points[, active]."""
    df = pd.read_csv(path_or_buf)
    need = {"season", "week", "player", "position", "dk_points"}
    if not need <= set(df.columns):
        raise ValueError(f"actuals need {sorted(need)}")
    if "active" not in df:
        df["active"] = True
    return df
