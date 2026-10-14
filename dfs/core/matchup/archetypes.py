"""Player archetypes: rolling usage profiles -> k-means clusters with plain-English names.

Profile "as of" a game uses only the player's EARLIER games:
  - current season: last `window` games (default 6)
  - before week 4: blended with last season's profile, weight_current = g / (g + 3)
  - reset to current-season-only when the player changed team, his team changed head coach or offensive
    coordinator (config/coordinator_changes.yaml), or his snap share moved > 20 pts vs last season
  - no current games: last season's profile (flagged)
Clusters are fit on player-season profiles (>= 6 games) from training seasons only (refit each offseason) and
features are standardized with the training mean / sd. k-means++ in numpy (no extra dependency).
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

FEATURES = {
    "WR": ["tgt_share", "adot", "slot_rate", "snap_share", "yac_per_rec", "rz_share"],
    "TE": ["tgt_share", "adot", "slot_rate", "snap_share", "yac_per_rec", "rz_share"],
    "RB": ["carry_share", "tgt_share", "gl_share", "snap_share"],
    "QB": ["dropbacks_pg", "adot", "designed_pg", "scramble_rate"],
}
# (numerator, denominator) for each feature over a window of games; denominator None = per game
RATIOS = {
    "tgt_share": ("targets", "team_targets"), "adot": ("air_yards", "targets"), "slot_rate": ("mid_targets", "targets"),
    "snap_share": ("snap_share", None), "yac_per_rec": ("yac", "rec"), "rz_share": ("rz_targets", "team_rz_targets"),
    "carry_share": ("carries", "team_designed"), "gl_share": ("gl_carries", "team_gl_carries"),
    "dropbacks_pg": ("dropbacks", None), "designed_pg": ("carries", None), "qb_adot": ("pass_air", "att"),
    "scramble_rate": ("scrambles", "dropbacks"),
}
# name templates: label -> feature signs (score = sum of sign x centroid z); assigned greedily, unique per position
NAMES = {
    "WR": {"alpha target-hog WR": {"tgt_share": 1, "rz_share": 0.5, "snap_share": 0.5},
           "deep outside WR": {"adot": 1, "slot_rate": -1, "yac_per_rec": -0.3},
           "slot PPR WR": {"slot_rate": 1, "adot": -1},
           "YAC / gadget WR": {"yac_per_rec": 1, "adot": -0.5},
           "rotational depth WR": {"snap_share": -1, "tgt_share": -1},
           "possession outside WR": {"adot": 0.3, "slot_rate": -0.5, "tgt_share": 0.3}},
    "TE": {"move / receiving TE": {"tgt_share": 1, "slot_rate": 0.5, "snap_share": 0.3},
           "red-zone TE": {"rz_share": 1, "adot": -0.3},
           "seam / deep TE": {"adot": 1},
           "blocking / depth TE": {"tgt_share": -1, "snap_share": -0.5},
           "dump-off YAC TE": {"yac_per_rec": 1, "adot": -1}},
    "RB": {"workhorse RB": {"carry_share": 1, "snap_share": 0.5, "gl_share": 0.5},
           "pass-catching RB": {"tgt_share": 1, "carry_share": -0.5},
           "goal-line / early-down RB": {"gl_share": 1, "tgt_share": -1},
           "committee / change-of-pace RB": {"carry_share": -1, "snap_share": -1},
           "three-down RB": {"carry_share": 0.5, "tgt_share": 0.5, "snap_share": 1}},
    "QB": {"rushing QB": {"designed_pg": 1, "scramble_rate": 0.5},
           "high-volume pocket QB": {"dropbacks_pg": 1, "designed_pg": -0.5},
           "aggressive deep-ball QB": {"adot": 1},
           "scrambling QB": {"scramble_rate": 1, "designed_pg": -0.3},
           "conservative game-manager QB": {"adot": -1, "dropbacks_pg": -0.5}},
}


def _ratio(num, den):
    return np.where(den > 0, num / np.where(den > 0, den, 1), np.nan)


def _qb_frame(pg):
    pg = pg.copy()
    pg["qb_air_num"] = pg["pass_air"]
    return pg


def rolling_profiles(pg: pd.DataFrame, window: int = 6) -> pd.DataFrame:
    """Profile of each player BEFORE each of his games (current-season games only, last `window`)."""
    pg = pg.sort_values(["player_id", "season", "week"]).reset_index(drop=True)
    cols = sorted({c for n, d in RATIOS.values() for c in (n, d) if c})
    keys = [pg["player_id"], pg["season"]]
    out = pg[["player_id", "season", "week", "game_id", "team", "opp", "position"]].copy()
    sums = {}
    for c in cols + ["_one"]:
        v = pg[c].fillna(0.0) if c != "_one" else pd.Series(1.0, index=pg.index)
        if c == "snap_share":
            sums["_snap_n"] = _window_prev(pg["snap_share"].notna().astype(float), keys, window)
        cs = v.groupby(keys).cumsum()
        sums[c] = _window_prev(v, keys, window, cs)
    out["g_cur"] = sums["_one"]
    for f, (n, d) in RATIOS.items():
        if d is None:
            out[f] = _ratio(sums[n], sums["_snap_n"] if n == "snap_share" else sums["_one"])
        else:
            out[f] = _ratio(sums[n], sums[d])
    out.loc[out["position"] == "QB", "adot"] = out.loc[out["position"] == "QB", "qb_adot"]
    return out.drop(columns="qb_adot")


def _window_prev(v: pd.Series, keys, window: int, cs: pd.Series | None = None) -> np.ndarray:
    """Sum of the previous `window` values within each group (excluding the current row)."""
    cs = v.groupby(keys).cumsum() if cs is None else cs
    g = cs.groupby(keys)
    prev = g.shift(1).fillna(0.0)
    old = g.shift(window + 1).fillna(0.0)
    return (prev - old).to_numpy(float)


def season_profiles(pg: pd.DataFrame, min_games: int = 4) -> pd.DataFrame:
    """One profile per player-season (all games) + last team; used as the prior and for clustering."""
    pg = pg.sort_values(["player_id", "season", "week"])
    agg = pg.groupby(["player_id", "season"]).agg(
        **{c: (c, "sum") for c in sorted({c for n, d in RATIOS.values() for c in (n, d) if c and c != "snap_share"})},
        snap_share=("snap_share", "mean"), games=("game_id", "nunique"), team=("team", "last"),
        position=("position", "last")).reset_index()
    for f, (n, d) in RATIOS.items():
        if f == "snap_share":
            continue
        agg[f] = _ratio(agg[n], agg[d]) if d else agg[n] / agg["games"]
    agg.loc[agg["position"] == "QB", "adot"] = agg.loc[agg["position"] == "QB", "qb_adot"]
    return agg[agg["games"] >= min_games]


@dataclass
class ArchetypeModel:
    centroids: dict = field(default_factory=dict)     # pos -> (k, d) in z-space
    mean: dict = field(default_factory=dict)
    sd: dict = field(default_factory=dict)
    names: dict = field(default_factory=dict)          # pos -> [name per cluster]
    fit_seasons: tuple = ()

    def to_json(self) -> dict:
        return {"centroids": {p: c.tolist() for p, c in self.centroids.items()},
                "mean": {p: m.tolist() for p, m in self.mean.items()}, "sd": {p: s.tolist() for p, s in self.sd.items()},
                "names": self.names, "fit_seasons": list(self.fit_seasons)}

    @classmethod
    def from_json(cls, d: dict) -> "ArchetypeModel":
        return cls({p: np.array(c) for p, c in d["centroids"].items()}, {p: np.array(m) for p, m in d["mean"].items()},
                   {p: np.array(s) for p, s in d["sd"].items()}, d["names"], tuple(d["fit_seasons"]))

    def assign(self, prof: pd.DataFrame) -> pd.Series:
        """Cluster index per row (-1 when the profile is missing)."""
        out = pd.Series(-1, index=prof.index, dtype=int)
        for pos, C in self.centroids.items():
            m = (prof["position"] == pos).to_numpy()
            if not m.any():
                continue
            X = prof.loc[m, FEATURES[pos]].to_numpy(float)
            ok = ~np.isnan(X).any(axis=1)
            Z = (X[ok] - self.mean[pos]) / self.sd[pos]
            d = ((Z[:, None, :] - C[None]) ** 2).sum(axis=2)
            idx = np.flatnonzero(m)[ok]
            out.iloc[idx] = d.argmin(axis=1)
        return out


def kmeans(Z: np.ndarray, k: int, seed: int = 0, n_init: int = 10, iters: int = 100) -> np.ndarray:
    rng = np.random.default_rng(seed)
    best, best_inertia = None, np.inf
    for _ in range(n_init):
        C = [Z[rng.integers(len(Z))]]
        for _ in range(1, k):                                       # k-means++
            d2 = np.min(((Z[:, None, :] - np.array(C)[None]) ** 2).sum(axis=2), axis=1)
            C.append(Z[rng.choice(len(Z), p=d2 / d2.sum())])
        C = np.array(C)
        for _ in range(iters):
            lab = ((Z[:, None, :] - C[None]) ** 2).sum(axis=2).argmin(axis=1)
            newC = np.array([Z[lab == j].mean(axis=0) if (lab == j).any() else C[j] for j in range(k)])
            if np.allclose(newC, C):
                break
            C = newC
        inertia = ((Z - C[lab]) ** 2).sum()
        if inertia < best_inertia:
            best, best_inertia = C, inertia
    return best


def name_clusters(pos: str, C: np.ndarray) -> list[str]:
    feats = FEATURES[pos]
    templ = NAMES[pos]
    scores = {(j, lab): sum(w * C[j, feats.index(f)] for f, w in t.items()) for j in range(len(C))
              for lab, t in templ.items()}
    names, used_l, used_c = [None] * len(C), set(), set()
    for (j, lab), _ in sorted(scores.items(), key=lambda kv: -kv[1]):
        if j in used_c or lab in used_l:
            continue
        names[j] = lab
        used_c.add(j)
        used_l.add(lab)
    return [n or f"{pos} type {j}" for j, n in enumerate(names)]


MIN_USAGE = {"QB": ("dropbacks_pg", 20.0), "RB": ("carries", 40.0), "WR": ("targets", 25.0), "TE": ("targets", 15.0)}


def fit(pg_train: pd.DataFrame, k: dict[str, int], seed: int = 0) -> ArchetypeModel:
    """Clusters are fit on regular contributors only (backups would form junk clusters); everyone is assigned."""
    sp = season_profiles(pg_train, min_games=6)
    keep = np.zeros(len(sp), dtype=bool)
    for pos, (col, mn) in MIN_USAGE.items():
        keep |= (sp["position"] == pos).to_numpy() & (sp[col] >= mn).to_numpy()
    sp = sp[keep]
    m = ArchetypeModel(fit_seasons=tuple(sorted(pg_train["season"].unique())))
    for pos, feats in FEATURES.items():
        X = sp.loc[sp["position"] == pos, feats].dropna().to_numpy(float)
        mu, sd = X.mean(axis=0), X.std(axis=0) + 1e-9
        Z = (X - mu) / sd
        C = kmeans(Z, k[pos], seed)
        m.centroids[pos], m.mean[pos], m.sd[pos] = C, mu, sd
        m.names[pos] = name_clusters(pos, C)
    return m


# ------------------------------------------------------------------------------------- in-season profiles
def hc_changes(games: pd.DataFrame, aliases: dict) -> set[tuple[int, str]]:
    """(season, team) whose head coach differs from the previous season's last head coach (nflverse schedule)."""
    from core.names import normalize_team
    rows = []
    for side in ("home", "away"):
        g = games[["season", "week", f"{side}_team", f"{side}_coach"]].rename(
            columns={f"{side}_team": "team", f"{side}_coach": "coach"})
        rows.append(g)
    g = pd.concat(rows).dropna(subset=["coach"])
    g["team"] = g["team"].map(lambda t: normalize_team(t, aliases))
    first = g.sort_values("week").groupby(["season", "team"])["coach"].first()
    last = g.sort_values("week").groupby(["season", "team"])["coach"].last()
    out = set()
    for (s, t), c in first.items():
        if (s - 1, t) in last.index and last[(s - 1, t)] != c:
            out.add((int(s), t))
    return out


def in_season_profiles(pg: pd.DataFrame, window: int = 6, blend_k: float = 3.0, blend_before_week: int = 4,
                       role_change_pts: float = 0.20, coach_changes: set | None = None,
                       oc_changes: set | None = None) -> pd.DataFrame:
    """Profile per player-game as of kickoff, with the prior-season blend and reset flags."""
    cur = rolling_profiles(pg, window)
    prior = season_profiles(pg, min_games=4).copy()
    prior["season"] = prior["season"] + 1                      # last season's profile serves next season
    feats = sorted({f for fs in FEATURES.values() for f in fs})
    pr = prior.set_index(["player_id", "season"])
    cur = cur.join(pr[feats + ["team"]].rename(columns={f: f"prior_{f}" for f in feats} | {"team": "prior_team"}),
                   on=["player_id", "season"])
    coach_changes, oc_changes = coach_changes or set(), oc_changes or set()
    has_prior = cur["prior_team"].notna()
    team_changed = has_prior & (cur["prior_team"] != cur["team"])
    st = [(int(s), t) for s, t in zip(cur["season"], cur["team"])]
    coach = np.array([x in coach_changes for x in st])
    oc = np.array([x in oc_changes for x in st])
    role = (cur["snap_share"] - cur["prior_snap_share"]).abs() > role_change_pts
    cur["flag_team_change"], cur["flag_coach_change"] = team_changed.to_numpy(), coach | oc
    cur["flag_role_change"] = role.fillna(False).to_numpy()
    reset = cur["flag_team_change"] | cur["flag_coach_change"] | cur["flag_role_change"]
    g = cur["g_cur"].to_numpy(float)
    w = np.where(~has_prior, 1.0, np.where(reset, 1.0, np.where(cur["week"] < blend_before_week, g / (g + blend_k), 1.0)))
    w = np.where(g == 0, 0.0, w)                                 # no games yet -> prior profile only
    cur["weight_current"] = w
    cur["profile_source"] = np.select([g == 0, w < 1], ["prior season only", "blended"], "current season")
    for f in feats:
        c, p = cur[f].to_numpy(float), cur[f"prior_{f}"].to_numpy(float)
        cur[f] = np.where(np.isnan(c), p, np.where(np.isnan(p), c, w * c + (1 - w) * p))
    return cur.drop(columns=[f"prior_{f}" for f in feats])
