"""Bottom-up public model: Vegas -> team volume -> player shares -> stat lines -> DK points.

Implements the playbook in docs/PROJECTION_PLAYBOOK.md §3 using free nflverse data. Every constant lives in
config/projections.yaml under `bottomup.*` (calibrated: false unless measured).

  team plays   = league_plays x pace_factor x (1 + 0.004 x (ITT - league ITT))
  pass rate    = league dropback rate + team PROE + 0.006 x team spread   (favorites run more)
  dropbacks    -> sacks, scrambles (starting QB's rates) -> pass attempts -> targets (team targets/attempt)
  offense TDs  = 0.105 x ITT, split pass/rush by the team's own split shrunk toward 62/38
  players      target share, carry share (recency-weighted, blended with last season early in the year),
               efficiency shrunk toward position average with weight g/(g+8),
               TDs from red-zone / goal-line share (80%) and own TD share (20%)
  injuries     an Out player's targets: 60% to same-position teammates, 40% to all catchers (by share);
               carries: 70% to the next RB, 30% to the rest; team dropbacks -3% if the QB1 or WR1 is out
  receiving yards / receptions / receiving TDs are reconciled to the QB's passing line (stacks stay coherent)
  top-end shrink on the very highest projections (engines overstate the top)
Players with no nflverse history get no model row: the consensus (if any) carries them.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from core.names import match_players
from core.projections.params import Params
from sports.base import SportConfig

SKILL = ("QB", "RB", "WR", "TE")


# ------------------------------------------------------------------------------------------- helpers
def _recency_weights(n: int, halflife: float) -> np.ndarray:
    """Most recent game last; weight 0.5 ** (age / halflife)."""
    age = np.arange(n)[::-1]
    return 0.5 ** (age / max(halflife, 1e-6))


def _ratio(num: pd.Series, den: pd.Series, w: np.ndarray | None = None) -> float:
    w = np.ones(len(num)) if w is None else w
    d = float(np.dot(w, den.to_numpy(float)))
    return float(np.dot(w, num.to_numpy(float)) / d) if d > 0 else np.nan


def current_weight(games: float, params: Params) -> float:
    """Weight on this season vs last (playbook: 25% after week 1, 50% after 3, 75% after 5)."""
    xs, ys = params.get("bottomup.current_season_weight")
    return float(np.interp(games, xs, ys))


def _mix(cur: float, prior: float, w: float) -> float:
    if cur != cur:
        return prior
    if prior != prior:
        return cur
    return w * cur + (1 - w) * prior


# --------------------------------------------------------------------------------------------- league
@dataclass
class League:
    plays: float
    db_rate: float
    sack_rate: float
    scramble_rate: float
    ypa: float
    comp: float
    int_rate: float
    tgt_per_att: float
    pass_td_frac: float
    pos: dict = field(default_factory=dict)   # position -> {ypt, catch, ypc, fum_per_touch, ...}


def league_baselines(seasons: list[dict], params: Params) -> League:
    tg = pd.concat([s["team_games"] for s in seasons], ignore_index=True)
    pg = pd.concat([s["player_games"] for s in seasons], ignore_index=True)
    lg = League(
        plays=float(tg["plays"].mean()), db_rate=_ratio(tg["dropbacks"], tg["plays"]),
        sack_rate=_ratio(tg["sacks"], tg["dropbacks"]), scramble_rate=_ratio(tg["scrambles"], tg["dropbacks"]),
        ypa=_ratio(tg["pass_yds"], tg["att"]), comp=_ratio(tg["comp"], tg["att"]), int_rate=_ratio(tg["ints"], tg["att"]),
        tgt_per_att=_ratio(tg["targets"], tg["att"]),
        pass_td_frac=_ratio(tg["pass_td"], tg["pass_td"] + tg["rush_td"]))
    for pos, g in pg.groupby("position"):
        touches = g["carries"] + g["rec"]
        lg.pos[pos] = {"ypt": _ratio(g["rec_yds"], g["targets"]), "catch": _ratio(g["rec"], g["targets"]),
                       "ypc": _ratio(g["rush_yds"], g["carries"]),
                       "fum_per_touch": _ratio(g["fumbles_lost"], touches + g["dropbacks"])}
    q = pg[pg["dropbacks"] > 0]
    lg.pos.setdefault("QB", {}).update({"ypa": _ratio(q["pass_yds"], q["att"]), "int_rate": _ratio(q["ints"], q["att"]),
                                        "scramble_rate": _ratio(q["scrambles"], q["dropbacks"]),
                                        "sack_rate": _ratio(q["sacks"], q["dropbacks"])})
    return lg


# ---------------------------------------------------------------------------------------------- teams
def team_profiles(cur: dict, prior: dict | None, lg: League, params: Params) -> pd.DataFrame:
    hl = float(params.get("environment.plays_halflife"))
    regress = float(params.get("bottomup.prior_regress"))
    k_td = float(params.get("bottomup.pass_td_frac_k"))
    rows = []
    tg = cur["team_games"].sort_values("week")
    ptg = prior["team_games"] if prior else None
    teams = sorted(set(tg["team"]) | (set(ptg["team"]) if ptg is not None else set()))
    for team in teams:
        g = tg[tg["team"] == team]
        w = _recency_weights(len(g), hl)
        p = ptg[ptg["team"] == team] if ptg is not None else pd.DataFrame()
        wc = current_weight(len(g), params) if len(p) else 1.0

        def mixed(num, den, league_val, per_game=False):
            if per_game:
                c = float(np.average(g[num], weights=w)) if len(g) else np.nan
                pr = float(p[num].mean()) if len(p) else np.nan
            else:
                c = _ratio(g[num], g[den], w) if len(g) else np.nan
                pr = _ratio(p[num], p[den]) if len(p) else np.nan
            pr = (1 - regress) * pr + regress * league_val if pr == pr else league_val
            if c != c:
                return pr
            k = float(params.get("environment.plays_shrink_k"))
            c = (len(g) * c + k * league_val) / (len(g) + k) if not len(p) else c
            return _mix(c, pr, wc)

        oe = mixed("oe_sum", "oe_n", 0.0)
        tds_c = g["pass_td"].sum() + g["rush_td"].sum()
        tds_p = (p["pass_td"].sum() + p["rush_td"].sum()) if len(p) else 0
        n_td = tds_c + 0.5 * tds_p
        frac_raw = (g["pass_td"].sum() + 0.5 * (p["pass_td"].sum() if len(p) else 0)) / n_td if n_td else lg.pass_td_frac
        rows.append({
            "team": team, "games": len(g),
            "plays_pg": mixed("plays", None, lg.plays, per_game=True),
            "proe": oe,
            "sack_rate": mixed("sacks", "dropbacks", lg.sack_rate),
            "scramble_rate": mixed("scrambles", "dropbacks", lg.scramble_rate),
            "tgt_per_att": mixed("targets", "att", lg.tgt_per_att),
            "pass_td_frac": (n_td * frac_raw + k_td * lg.pass_td_frac) / (n_td + k_td),
        })
    return pd.DataFrame(rows).set_index("team")


def defense_inputs(cur: dict, prior: dict | None, params: Params) -> pd.DataFrame:
    """dst_inputs table (core/projections/dst.py format) from play-by-play."""
    d = cur["defense_games"]
    t = cur["team_games"]
    if prior:
        d = pd.concat([d, prior["defense_games"].assign(dropbacks=lambda x: x["dropbacks"] * 0.5,
                                                        sacks=lambda x: x["sacks"] * 0.5, att=lambda x: x["att"] * 0.5,
                                                        ints=lambda x: x["ints"] * 0.5)])
        t = pd.concat([t, prior["team_games"].assign(dropbacks=lambda x: x["dropbacks"] * 0.5,
                                                     sacks=lambda x: x["sacks"] * 0.5, att=lambda x: x["att"] * 0.5,
                                                     ints=lambda x: x["ints"] * 0.5)])
    dd = d.groupby("team").agg(db=("dropbacks", "sum"), sk=("sacks", "sum"), n=("game_id", "nunique"))
    oo = t.groupby("team").agg(db=("dropbacks", "sum"), sk=("sacks", "sum"), att=("att", "sum"), ints=("ints", "sum"),
                               n=("game_id", "nunique"))
    out = pd.DataFrame({"def_sack_rate": dd["sk"] / dd["db"], "def_games": dd["n"],
                        "off_sack_rate_allowed": oo["sk"] / oo["db"], "off_int_rate": oo["ints"] / oo["att"],
                        "off_games": oo["n"]})
    return out.reset_index()


# -------------------------------------------------------------------------------------------- players
def player_profiles(cur: dict, prior: dict | None, lg: League, params: Params) -> pd.DataFrame:
    hl = float(params.get("shares.share_halflife_games"))
    k_eff = float(params.get("bottomup.efficiency_games_k"))
    k_rz = float(params.get("bottomup.rz_share_k"))
    k_np = float(params.get("bottomup.no_prior_share_k_games"))
    prior_w = float(params.get("bottomup.prior_season_sample_weight"))
    pos_prior = params.get("bottomup.no_prior_share_target")

    def per_game_shares(season: dict) -> pd.DataFrame:
        pg = season["player_games"]
        tg = season["team_games"].set_index(["game_id", "team"])
        x = pg.join(tg[["targets", "rz_targets", "designed", "gl_carries", "dropbacks", "pass_td", "rush_td"]],
                    on=["game_id", "team"], rsuffix="_team")
        x = x[(x["offense_snaps"].fillna(0) > 0) | (x["targets"] + x["carries"] + x["dropbacks"] > 0)]
        sd = lambda a, b: np.where(x[b] > 0, x[a] / x[b].where(x[b] > 0, 1), 0.0)
        x["tgt_share"] = sd("targets", "targets_team")
        x["rz_share"] = sd("rz_targets", "rz_targets_team")
        x["carry_share"] = sd("designed", "designed_team")
        x["gl_share"] = sd("gl_carries", "gl_carries_team")
        x["db_share"] = sd("dropbacks", "dropbacks_team")
        return x

    cx = per_game_shares(cur).sort_values("week")
    px = per_game_shares(prior) if prior else None
    share_cols = ["tgt_share", "rz_share", "carry_share", "gl_share", "db_share", "offense_pct"]
    sums = ["targets", "rec", "rec_yds", "rec_td", "carries", "rush_yds", "rush_td", "dropbacks", "att", "comp",
            "pass_yds", "pass_td", "ints", "sacks", "scrambles", "fumbles_lost", "rz_targets_team", "gl_carries_team",
            "pass_td_team", "rush_td_team", "designed"]
    prior_by = px.groupby("player_id") if px is not None else None
    team_weeks = {t: sorted(g["week"]) for t, g in cur["team_games"].groupby("team")}
    rows = []
    for pid, g in cx.groupby("player_id"):
        w = _recency_weights(len(g), hl)
        last = g.iloc[-1]
        r = {"player_id": pid, "name": last["name"], "position": last["position"], "team": last["team"],
             "games": len(g), "last_week": int(last["week"])}
        # presence: recency-weighted share of the team's games he played. Teammates' recent shares already
        # absorb a long absence, so only presence x share is "vacated" when he is Out.
        tw = team_weeks.get(r["team"], [])
        if tw:
            pw = _recency_weights(len(tw), hl)
            mine = set(g.loc[g["team"] == r["team"], "week"])
            r["presence"] = float(sum(w_ for w_, wk in zip(pw, tw) if wk in mine) / pw.sum())
        else:
            r["presence"] = 1.0
        p = prior_by.get_group(pid) if prior_by is not None and pid in prior_by.groups else None
        wc = current_weight(len(g), params) if p is not None and len(p) >= 4 else 1.0
        for c in share_cols:
            vals = g[c].astype(float)
            ok = vals.notna().to_numpy()
            cval = float(np.average(vals[ok], weights=w[ok])) if ok.any() else np.nan
            pval = float(p[c].mean()) if p is not None and len(p) >= 4 else np.nan
            if pval != pval and c in ("tgt_share", "carry_share") and cval == cval:
                tgt = float(pos_prior.get(r["position"], {}).get(c, cval)) if isinstance(pos_prior.get(r["position"]), dict) else cval
                cval = (len(g) * cval + k_np * tgt) / (len(g) + k_np)
            r[c] = _mix(cval, pval, wc)
            r[f"last_{c}"] = float(last[c]) if last[c] == last[c] else np.nan
        tot = g[sums].sum()
        if p is not None:
            tot = tot + prior_w * p[sums].sum()
        geff = len(g) + (prior_w * len(p) if p is not None else 0)
        we = geff / (geff + k_eff)
        L = lg.pos.get(r["position"], lg.pos.get("WR", {}))
        LQ = lg.pos.get("QB", {})

        def eff(num, den, league):
            v = tot[num] / tot[den] if tot[den] > 0 else league
            return we * v + (1 - we) * league

        r["ypt"] = eff("rec_yds", "targets", L.get("ypt", 7.5))
        r["catch"] = eff("rec", "targets", L.get("catch", 0.65))
        r["ypc"] = eff("rush_yds", "carries", L.get("ypc", 4.2))
        r["fum_per_touch"] = L.get("fum_per_touch", 0.004)
        if tot["dropbacks"] > 0 or r["position"] == "QB":
            r["ypa"] = eff("pass_yds", "att", LQ.get("ypa", lg.ypa))
            r["comp"] = eff("comp", "att", lg.comp)
            r["int_rate"] = eff("ints", "att", LQ.get("int_rate", lg.int_rate))
            r["sack_rate"] = eff("sacks", "dropbacks", LQ.get("sack_rate", lg.sack_rate))
            r["scramble_rate"] = eff("scrambles", "dropbacks", LQ.get("scramble_rate", lg.scramble_rate))
        # TD shares: own share of team TDs (shrunk toward volume share); red-zone shares shrunk toward volume share
        n_rz = tot["rz_targets_team"]
        r["rz_share"] = (n_rz * (r["rz_share"] if r["rz_share"] == r["rz_share"] else 0) + k_rz * r["tgt_share"]) / (n_rz + k_rz)
        n_gl = tot["gl_carries_team"]
        r["gl_share"] = (n_gl * (r["gl_share"] if r["gl_share"] == r["gl_share"] else 0) + k_rz * r["carry_share"]) / (n_gl + k_rz)
        ptd, rtd = tot["pass_td_team"], tot["rush_td_team"]
        r["own_rec_td_share"] = (tot["rec_td"] + k_rz / 4 * r["tgt_share"]) / (ptd + k_rz / 4) if ptd + k_rz > 0 else r["tgt_share"]
        r["own_rush_td_share"] = (tot["rush_td"] + k_rz / 4 * r["carry_share"]) / (rtd + k_rz / 4) if rtd + k_rz > 0 else r["carry_share"]
        rows.append(r)
    # players with last-season data only (missed every game this year / new team): prior-season profile
    if px is not None:
        seen = {r["player_id"] for r in rows}
        people = cur["people"].set_index("player_id")
        for pid, p in px.groupby("player_id"):
            if pid in seen or len(p) < 4:
                continue
            last = p.iloc[-1]
            team = people.at[pid, "team_now"] if pid in people.index else last["team"]
            r = {"player_id": pid, "name": last["name"], "position": last["position"], "team": team,
                 "games": 0, "last_week": 0, "presence": 0.0}
            for c in share_cols:
                r[c] = float(p[c].mean()) * float(params.get("bottomup.prior_only_share_mult"))
                r[f"last_{c}"] = np.nan
            tot = p[sums].sum()
            L = lg.pos.get(r["position"], lg.pos.get("WR", {}))
            we = (prior_w * len(p)) / (prior_w * len(p) + k_eff)
            r["ypt"] = we * (tot["rec_yds"] / tot["targets"] if tot["targets"] else L.get("ypt", 7.5)) + (1 - we) * L.get("ypt", 7.5)
            r["catch"] = we * (tot["rec"] / tot["targets"] if tot["targets"] else L.get("catch", .65)) + (1 - we) * L.get("catch", .65)
            r["ypc"] = we * (tot["rush_yds"] / tot["carries"] if tot["carries"] else L.get("ypc", 4.2)) + (1 - we) * L.get("ypc", 4.2)
            r["fum_per_touch"] = L.get("fum_per_touch", 0.004)
            if tot["dropbacks"] > 0:
                LQ = lg.pos.get("QB", {})
                for key, num, den, lv in (("ypa", "pass_yds", "att", LQ.get("ypa", lg.ypa)), ("comp", "comp", "att", lg.comp),
                                          ("int_rate", "ints", "att", LQ.get("int_rate", lg.int_rate)),
                                          ("sack_rate", "sacks", "dropbacks", lg.sack_rate),
                                          ("scramble_rate", "scrambles", "dropbacks", lg.scramble_rate)):
                    r[key] = we * (tot[num] / tot[den] if tot[den] else lv) + (1 - we) * lv
            r["own_rec_td_share"], r["own_rush_td_share"] = r["tgt_share"], r["carry_share"]
            rows.append(r)
    return pd.DataFrame(rows)


def match_to_slate(slate: pd.DataFrame, prof: pd.DataFrame, sport: SportConfig) -> pd.Series:
    """DK slate index -> nflverse player_id (skill positions only)."""
    cand = prof.rename(columns={"player_id": "id"})[["id", "name", "team", "position"]].reset_index(drop=True)
    cand["position"] = cand["position"].replace({"FB": "RB"})
    dk = slate.loc[slate["position"].isin(SKILL), ["name", "team", "position"]].copy()
    dk["slate_i"] = dk.index
    m = match_players(cand, dk.reset_index(drop=True), sport.team_aliases, set())
    out = {int(r.slate_i): cand.at[int(r.dk_index), "id"] for r in m.itertuples() if r.dk_index >= 0}
    return pd.Series(out, dtype=object)


# ----------------------------------------------------------------------------------------------- model
@dataclass
class ModelResult:
    rows: pd.DataFrame                  # dk_index, source, component, points, stat columns
    teams: pd.DataFrame                 # team volume table (diagnostic)
    dst_inputs: pd.DataFrame
    dropbacks: dict[str, float]
    notes: list[str] = field(default_factory=list)
    unmodeled: list[str] = field(default_factory=list)


def _redistribute(share: dict, out: set, pos: dict, frac_same: float, top_only: bool = False,
                  presence: dict | None = None) -> dict:
    """Move each Out player's share x presence: frac_same to same-position actives (top one if top_only), rest to
    all actives. presence = how much of the team's recent games he played (teammates already absorbed the rest)."""
    act = {k: v for k, v in share.items() if k not in out}
    if not act:
        return act
    for o in out:
        s = share.get(o, 0.0) * (presence.get(o, 1.0) if presence else 1.0)
        if s <= 0:
            continue
        same = {k: v for k, v in act.items() if pos[k] == pos[o]}
        if same and top_only:
            top = max(same, key=same.get)
            act[top] += frac_same * s
        elif same:
            tot = sum(max(v, 1e-3) for v in same.values())
            for k, v in same.items():
                act[k] += frac_same * s * max(v, 1e-3) / tot
        else:
            frac_same = 0.0
        tot = sum(max(v, 1e-3) for v in act.values())
        rest = (1 - frac_same) * s
        for k in list(act):
            act[k] += rest * max(act[k], 1e-3) / tot
    return act


def run_model(slate: pd.DataFrame, env: pd.DataFrame, cur: dict, prior: dict | None, sport: SportConfig,
              params: Params, status: dict[int, str] | None = None, league_avg_total: float | None = None) -> ModelResult:
    status = status or {}
    lg = league_baselines([cur] + ([prior] if prior else []), params)
    teams = team_profiles(cur, prior, lg, params)
    prof = player_profiles(cur, prior, lg, params)
    id_of = match_to_slate(slate, prof, sport)
    P = prof.set_index("player_id")
    excl = {s.upper() for s in sport.status_exclude}
    B = params.get("bottomup.volume")
    lg_itt = (league_avg_total or float(params.get("vegas.league_avg_total"))) / 2
    disp = {"cv": params.get("stat_conversion.bonus_cv"), "pa_sigma": params.get("stat_conversion.pa_sigma")}
    shrink = params.get("bottomup.top_end_shrink")
    E = env.set_index("team")
    rows, trows, notes, dropbacks = [], [], [], {}
    unmodeled = [f"{slate.at[i, 'name']} ({slate.at[i, 'team']})" for i in slate.index
                 if slate.at[i, "position"] in SKILL and i not in id_of.index]

    for team, grp in slate[slate["position"].isin(SKILL)].groupby("team"):
        if team not in E.index or team not in teams.index:
            notes.append(f"{team}: no {'odds' if team not in E.index else 'nflverse history'} — not modeled")
            continue
        T = teams.loc[team]
        itt, spread = float(E.at[team, "team_total"]), float(E.at[team, "spread"])
        idx = [i for i in grp.index if i in id_of.index]
        is_out = {i for i in idx if str(status.get(i, "")).upper() in excl}
        pos = {i: slate.at[i, "position"] for i in idx}
        pr = {i: P.loc[id_of[i]] for i in idx}

        # QB1 = the active QB with the largest recent dropback share
        qbs = [i for i in idx if pos[i] == "QB"]
        def db_key(i):
            v = pr[i]["db_share"]
            last = pr[i]["last_db_share"] if pr[i]["last_db_share"] == pr[i]["last_db_share"] else 0
            return (last + (v if v == v else 0)) * (0.5 + 0.5 * pres_of(i))
        pres_of = lambda i: float(pr[i].get("presence", 1.0))
        qb1_all = max(qbs, key=db_key) if qbs else None
        active_qbs = [i for i in qbs if i not in is_out]
        qb1 = max(active_qbs, key=db_key) if active_qbs else None
        catchers = [i for i in idx if pos[i] in ("RB", "WR", "TE")]
        pres = {i: float(pr[i].get("presence", 1.0)) for i in idx}
        wr1 = max([i for i in catchers if pos[i] == "WR"], key=lambda i: pr[i]["tgt_share"] * pres[i], default=None)

        plays = B["league_plays"] if B.get("league_plays") else lg.plays
        plays = plays * (T["plays_pg"] / lg.plays) * (1 + B["plays_per_itt_pt"] * (itt - lg_itt))
        pass_rate = float(np.clip(lg.db_rate + T["proe"] + B["script_per_spread_pt"] * spread, *B["pass_rate_clip"]))
        db = plays * pass_rate
        if (qb1_all is not None and qb1_all in is_out and pres[qb1_all] >= 0.5) or \
                (wr1 is not None and wr1 in is_out and pres[wr1] >= 0.5):
            db *= 1 - B["key_player_out_dropback_cut"]
            notes.append(f"{team}: QB1/WR1 out -> dropbacks -{B['key_player_out_dropback_cut']:.0%}")
        q = pr[qb1] if qb1 is not None else None
        sack_r = 0.5 * T["sack_rate"] + 0.5 * (q["sack_rate"] if q is not None and q.get("sack_rate") == q.get("sack_rate") else T["sack_rate"])
        scr_r = q["scramble_rate"] if q is not None and q.get("scramble_rate") == q.get("scramble_rate") else T["scramble_rate"]
        att = db * (1 - sack_r - scr_r)
        designed = plays - db
        off_td = B["td_per_itt_pt"] * itt
        pass_td = off_td * T["pass_td_frac"]
        rush_td = off_td - pass_td
        ypa = q["ypa"] if q is not None and q.get("ypa") == q.get("ypa") else lg.ypa
        comp_r = q["comp"] if q is not None and q.get("comp") == q.get("comp") else lg.comp
        pass_yds = att * ypa
        team_tgts = att * T["tgt_per_att"]
        dropbacks[team] = db
        stats = {i: {} for i in idx}

        # targets
        tshare = {i: max(float(pr[i]["tgt_share"]), 0.0) for i in catchers}
        tot = sum(v * (pres[k] if k in is_out else 1.0) for k, v in tshare.items())
        if tot > 1:
            tshare = {k: v / tot for k, v in tshare.items()}
        tact = _redistribute(tshare, is_out & set(catchers), pos, B["vacated_targets_same_pos"], presence=pres)
        s_list = min(sum(tact.values()), 1.0)
        raw_yds = {i: team_tgts * v * pr[i]["ypt"] for i, v in tact.items()}
        raw_rec = {i: team_tgts * v * pr[i]["catch"] for i, v in tact.items()}
        Lw = lg.pos.get("WR", {})
        rest_tg = team_tgts * (1 - s_list)
        f_y = np.clip((pass_yds - rest_tg * Lw.get("ypt", 7.5)) / max(sum(raw_yds.values()), 1e-6), *B["reconcile_clip"])
        f_r = np.clip((att * comp_r - rest_tg * Lw.get("catch", .65)) / max(sum(raw_rec.values()), 1e-6), *B["reconcile_clip"])
        tdw = {i: B["td_from_rz"] * pr[i]["rz_share"] + (1 - B["td_from_rz"]) * pr[i]["own_rec_td_share"]
               for i in tact}
        tdw_tot = sum(tdw.values())
        for i, v in tact.items():
            stats[i].update(targets=team_tgts * v, rec=raw_rec[i] * f_r, rec_yds=raw_yds[i] * f_y,
                            rec_td=pass_td * s_list * tdw[i] / tdw_tot if tdw_tot > 0 else 0.0)

        # carries (designed); QB1 keeps his own designed share, scrambles come from dropbacks
        rushers = [i for i in idx if pos[i] in ("RB", "WR", "TE")]
        cshare = {i: max(float(pr[i]["carry_share"]), 0.0) for i in rushers}
        qb_cs = max(float(q["carry_share"]), 0.0) if q is not None else 0.0
        tot = sum(v * (pres[k] if k in is_out else 1.0) for k, v in cshare.items()) + qb_cs
        if tot > 1:
            cshare = {k: v / tot for k, v in cshare.items()}
            qb_cs /= tot
        out_rb = is_out & {i for i in rushers if pos[i] == "RB"}
        cact = _redistribute(cshare, is_out & set(rushers), pos, B["vacated_carries_next_rb"], top_only=True,
                             presence=pres)
        glw = {i: B["td_from_rz"] * pr[i]["gl_share"] + (1 - B["td_from_rz"]) * pr[i]["own_rush_td_share"] for i in cact}
        if q is not None:
            glw[qb1] = B["td_from_rz"] * q["gl_share"] + (1 - B["td_from_rz"]) * q["own_rush_td_share"]
        listed = min(sum(cact.values()) + qb_cs, 1.0)
        glt = sum(glw.values())
        for i, v in cact.items():
            stats[i].update(rush_att=designed * v, rush_yds=designed * v * pr[i]["ypc"],
                            rush_td=rush_td * listed * glw[i] / glt if glt > 0 else 0.0)
        out_rb = {i for i in out_rb if pres[i] >= 0.5}
        if out_rb:
            notes.append(f"{team}: RB out ({', '.join(slate.loc[list(out_rb), 'name'])}) -> carries 70% to next RB")

        if qb1 is not None:
            qatt = designed * qb_cs + db * scr_r
            stats[qb1].update(pass_att=att, completions=att * comp_r, pass_yds=pass_yds, pass_td=pass_td,
                              int=att * q["int_rate"], rush_att=qatt, rush_yds=qatt * q["ypc"],
                              rush_td=rush_td * listed * glw[qb1] / glt if glt > 0 else 0.0)
        for i in idx:
            if i in is_out or (pos[i] == "QB" and i != qb1):
                rows.append({"dk_index": int(i), "source": "public_model", "component": "model", "points": 0.0})
                continue
            s = stats[i]
            touches = s.get("rush_att", 0) + s.get("rec", 0) + s.get("pass_att", 0)
            s["fumble_lost"] = touches * pr[i]["fum_per_touch"]
            pts = sport.expected_score(s, disp)
            th = shrink.get(pos[i])
            if th:
                start, full, ratio = th
                f = 1 - (1 - ratio) * float(np.clip((pts - start) / (full - start), 0, 1))
                pts *= f
            rows.append({"dk_index": int(i), "source": "public_model", "component": "model",
                         "points": round(pts, 3), **{k: round(v, 3) for k, v in s.items()}})
        trows.append({"team": team, "itt": itt, "spread": spread, "plays": round(plays, 1),
                      "pass_rate": round(pass_rate, 3), "dropbacks": round(db, 1), "pass_att": round(att, 1),
                      "designed_rush": round(designed, 1), "pass_yds": round(pass_yds, 1), "pass_td": round(pass_td, 2),
                      "rush_td": round(rush_td, 2), "proe": round(T["proe"], 3), "listed_target_share": round(s_list, 3),
                      "qb1": slate.at[qb1, "name"] if qb1 is not None else ""})
    cols = ["dk_index", "source", "component", "points"]
    return ModelResult(pd.DataFrame(rows) if rows else pd.DataFrame(columns=cols), pd.DataFrame(trows), defense_inputs(cur, prior, params), dropbacks,
                       notes, unmodeled)
