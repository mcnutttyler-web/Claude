"""SportConfig interface.

Core code touches sport specifics ONLY through `SportConfig` / `ModeSpec`.
A sport plugin is a directory containing:

    config.yaml          rules, slots, scoring tables, distribution defaults, lock rule
    scoring.py           score(stat_line, scoring_cfg) -> float
    roles.py (opt)       roles(player_df) -> pd.Series of role labels
    rules.py (opt)       build_constraints(ctx, options) ; objective_terms(ctx, options)
    correlations.yaml    (opt) correlation prior
    presets.yaml         (opt) cash / GPP presets

Plugins are loaded by name (``sports/<name>``) or by an explicit directory path,
so a test sport can live outside this package with zero core changes.
"""
from __future__ import annotations

import importlib.util
from dataclasses import dataclass, field
from pathlib import Path
from types import ModuleType
from typing import Any, Callable

import pandas as pd
import yaml

SPORTS_DIR = Path(__file__).resolve().parent


@dataclass(frozen=True)
class Slot:
    name: str
    eligible: frozenset[str]          # eligible base positions
    salary_mult: float = 1.0
    points_mult: float = 1.0


@dataclass
class ModeSpec:
    """One contest format of a sport (Classic or Showdown)."""

    name: str                          # "classic" | "showdown"
    slots: list[Slot]
    salary_cap: int
    min_teams: int = 1
    min_games: int = 1
    max_per_team: int | None = None    # DK hard rule (None = no DK limit)
    min_per_team: int = 0              # e.g. showdown: >=1 from each team in the game
    use_roster_position_tokens: bool = True
    export_header: list[str] = field(default_factory=list)
    captain_slot: str | None = None    # name of the multiplier slot (showdown)

    @property
    def roster_size(self) -> int:
        return len(self.slots)

    def slot_counts(self) -> dict[str, int]:
        out: dict[str, int] = {}
        for s in self.slots:
            out[s.name] = out.get(s.name, 0) + 1
        return out

    def slot_by_name(self, name: str) -> Slot:
        for s in self.slots:
            if s.name == name:
                return s
        raise KeyError(name)


class SportConfig:
    """Everything core needs to know about a sport."""

    def __init__(self, plugin_dir: Path):
        self.plugin_dir = Path(plugin_dir)
        with open(self.plugin_dir / "config.yaml") as f:
            self.cfg: dict[str, Any] = yaml.safe_load(f)
        self.name: str = self.cfg["name"]
        self.display_name: str = self.cfg.get("display_name", self.name.upper())
        self.modes: dict[str, ModeSpec] = {}
        self.modes["classic"] = self._build_classic(self.cfg["classic"])
        if self.cfg.get("showdown"):
            self.modes["showdown"] = self._build_showdown(self.cfg["showdown"])

        self._scoring_mod = self._load_module("scoring")
        self._roles_mod = self._load_module("roles", required=False)
        self._rules_mod = self._load_module("rules", required=False)
        self.correlation_prior: dict = self._load_yaml("correlations.yaml")
        self.presets: dict = self._load_yaml("presets.yaml")

    # ------------------------------------------------------------------ build
    @staticmethod
    def _build_classic(c: dict) -> ModeSpec:
        slots = [Slot(s["name"], frozenset(s["eligible"])) for s in c["roster_slots"]]
        return ModeSpec(
            name="classic",
            slots=slots,
            salary_cap=int(c["salary_cap"]),
            min_teams=int(c.get("min_teams", 1)),
            min_games=int(c.get("min_games", 1)),
            max_per_team=c.get("max_per_team"),
            min_per_team=int(c.get("min_per_team", 0)),
            use_roster_position_tokens=bool(c.get("use_roster_position_tokens", True)),
            export_header=list(c.get("export_header", [s.name for s in slots])),
        )

    @staticmethod
    def _build_showdown(c: dict) -> ModeSpec:
        elig = frozenset(c["eligible_positions"])
        cap = c["captain"]
        flex = c["flex"]
        slots = [Slot(cap["name"], elig, float(cap["salary_mult"]), float(cap["points_mult"]))]
        slots += [Slot(flex["name"], elig) for _ in range(int(flex["count"]))]
        return ModeSpec(
            name="showdown",
            slots=slots,
            salary_cap=int(c["salary_cap"]),
            min_teams=int(c.get("min_teams", 2)),
            min_games=1,
            max_per_team=c.get("max_per_team"),
            min_per_team=int(c.get("min_per_team", 1)),
            use_roster_position_tokens=False,
            export_header=list(c.get("export_header", [s.name for s in slots])),
            captain_slot=cap["name"],
        )

    def _load_module(self, stem: str, required: bool = True) -> ModuleType | None:
        path = self.plugin_dir / f"{stem}.py"
        if not path.exists():
            if required:
                raise FileNotFoundError(path)
            return None
        mod_name = f"_sport_{self.name}_{stem}"
        spec = importlib.util.spec_from_file_location(mod_name, path)
        mod = importlib.util.module_from_spec(spec)
        assert spec.loader is not None
        spec.loader.exec_module(mod)
        return mod

    def _load_yaml(self, fname: str) -> dict:
        p = self.plugin_dir / fname
        if not p.exists():
            return {}
        with open(p) as f:
            return yaml.safe_load(f) or {}

    # ------------------------------------------------------------- interface
    def mode(self, name: str = "classic") -> ModeSpec:
        if name not in self.modes:
            raise ValueError(f"{self.name} has no '{name}' mode")
        return self.modes[name]

    # Convenience accessors mirroring the spec's interface names.
    @property
    def roster_slots(self) -> list[Slot]:
        return self.modes["classic"].slots

    @property
    def salary_cap(self) -> int:
        return self.modes["classic"].salary_cap

    @property
    def min_teams(self) -> int:
        return self.modes["classic"].min_teams

    @property
    def min_games(self) -> int:
        return self.modes["classic"].min_games

    @property
    def max_per_team(self) -> int | None:
        return self.modes["classic"].max_per_team

    @property
    def showdown(self) -> ModeSpec | None:
        return self.modes.get("showdown")

    @property
    def export_header(self) -> dict[str, list[str]]:
        return {k: m.export_header for k, m in self.modes.items()}

    @property
    def scoring_cfg(self) -> dict:
        return self.cfg.get("scoring", {})

    @property
    def distribution_defaults(self) -> dict:
        return self.cfg.get("distribution_defaults", {})

    @property
    def lock_rule(self) -> dict:
        return self.cfg.get("lock_rule", {"per_game": True, "news_heavy": False})

    @property
    def status_exclude(self) -> set[str]:
        return {s.upper() for s in self.cfg.get("status_exclude", ["O", "OUT", "D", "IR"])}

    @property
    def status_warn(self) -> set[str]:
        return {s.upper() for s in self.cfg.get("status_warn", ["Q"])}

    @property
    def team_aliases(self) -> dict[str, str]:
        return {str(k).upper(): str(v).upper() for k, v in (self.cfg.get("team_aliases") or {}).items()}

    @property
    def team_unit_positions(self) -> set[str]:
        """Positions that represent a whole team (e.g. NFL DST) — matched by team, not name."""
        return set(self.cfg.get("team_unit_positions", []))

    def score(self, stat_line: dict[str, float]) -> float:
        return float(self._scoring_mod.score(stat_line, self.scoring_cfg))

    def expected_score(self, stat_means: dict[str, float], dispersion: dict | None = None) -> float:
        """Expected points from mean stat projections (handles nonlinear bonuses/tiers if the plugin can)."""
        fn = getattr(self._scoring_mod, "expected_score", None)
        if fn is None:
            return self.score(stat_means)
        return float(fn(stat_means, self.scoring_cfg, dispersion))

    def roles(self, player_df: pd.DataFrame) -> pd.Series:
        if self._roles_mod is None:
            return player_df["position"].astype(str)
        return self._roles_mod.roles(player_df)

    @property
    def stack_rules(self) -> Callable | None:
        """build_constraints(ctx, options) — sport-specific ILP constraints."""
        return getattr(self._rules_mod, "build_constraints", None) if self._rules_mod else None

    @property
    def objective_terms(self) -> Callable | None:
        """objective_terms(ctx, options) -> list of PuLP expressions added to the objective."""
        return getattr(self._rules_mod, "objective_terms", None) if self._rules_mod else None

    def preset(self, kind: str, name: str | None = None) -> dict:
        block = self.presets.get(kind, {})
        if name is None:
            return block
        return block.get(name, {})


_CACHE: dict[str, SportConfig] = {}


def load_sport(name_or_path: str | Path) -> SportConfig:
    p = Path(name_or_path)
    plugin_dir = p if p.is_dir() else SPORTS_DIR / str(name_or_path)
    key = str(plugin_dir.resolve())
    if key not in _CACHE:
        _CACHE[key] = SportConfig(plugin_dir)
    return _CACHE[key]


def available_sports() -> list[str]:
    return sorted(
        d.name for d in SPORTS_DIR.iterdir() if d.is_dir() and (d / "config.yaml").exists()
        and not (d / "STUB").exists()
    )
