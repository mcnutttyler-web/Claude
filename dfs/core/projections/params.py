"""Access to config/projections.yaml: every tunable carries {value, calibrated, source}."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PATH = ROOT / "config" / "projections.yaml"


@lru_cache(maxsize=8)
def _load(path: str) -> dict:
    with open(path) as f:
        return yaml.safe_load(f)


class Params:
    def __init__(self, sport: str = "nfl", path: str | Path = DEFAULT_PATH, overrides: dict | None = None):
        self.sport = sport
        self.raw = _load(str(path))
        self.overrides = overrides or {}

    def node(self, dotted: str) -> dict:
        cur: Any = self.raw[self.sport] if not dotted.startswith("api.") else self.raw
        for part in dotted.split("."):
            cur = cur[part]
        return cur

    def get(self, dotted: str) -> Any:
        """Value of a parameter (overrides win)."""
        if dotted in self.overrides:
            return self.overrides[dotted]
        n = self.node(dotted)
        return n["value"] if isinstance(n, dict) and "value" in n else n

    def calibrated(self, dotted: str) -> bool:
        n = self.node(dotted)
        return bool(n.get("calibrated", False)) if isinstance(n, dict) else False

    def uncalibrated(self) -> list[str]:
        """Dotted names of every parameter still flagged calibrated: false (for UI badges / run logs)."""
        out: list[str] = []

        def walk(node, prefix):
            if isinstance(node, dict) and "value" in node:
                if not node.get("calibrated", False):
                    out.append(prefix)
                return
            if isinstance(node, dict):
                for k, v in node.items():
                    walk(v, f"{prefix}.{k}" if prefix else k)

        walk(self.raw[self.sport], "")
        return out
