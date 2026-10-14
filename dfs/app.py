"""DraftKings DFS lineup generator — Streamlit UI.

Run:  streamlit run app.py
Phase 1: Slate, Projections (column mapping + name matching), Cash Objective A, Export / DKEntries round-trip.
Never auto-submits to DK: you upload the CSV yourself.
"""
from __future__ import annotations

import hashlib
import io
from pathlib import Path

import pandas as pd
import streamlit as st
import yaml

from core.cash import CashResult, describe, objective_a
from core.cash_sim import read_consensus, run_cash
from core.field import fit_field
from core.slate_sim import player_metrics, simulate_slate
from core.contest import break_even_table, load_contest, template_paths
from core.export import ExportError, assign_lineups_to_entries, read_entries, upload_csv, write_entries
from core.lineup import export_ids
import numpy as np
from core.ingest import (PROJECTION_SYNONYMS, REQUIRED, apply_column_mapping, auto_column_mapping, build_slate,
                         read_dk_salaries)
from core.optimizer import InfeasibleError
from sports.base import available_sports, load_sport

ROOT = Path(__file__).resolve().parent
SAMPLE = ROOT / "data" / "sample"
APP_CFG = yaml.safe_load((ROOT / "config" / "app.yaml").read_text())
CALIBRATE = ":orange-badge[default — calibrate]"

st.set_page_config(page_title="DK Lineup Generator", layout="wide")
ss = st.session_state


def badge(label: str) -> None:
    st.markdown(f"{label} {CALIBRATE}")


def file_or_sample(label: str, sample_name: str, key: str):
    up = st.file_uploader(label, type=["csv"], key=key)
    if up is not None:
        return up.getvalue()
    p = SAMPLE / sample_name
    if st.checkbox(f"Use sample {sample_name}", key=f"{key}_sample", value=False) and p.exists():
        return p.read_bytes()
    return None


# ------------------------------------------------------------------ sidebar
with st.sidebar:
    st.header("Setup")
    sport_name = st.selectbox("Sport", available_sports(), index=available_sports().index(APP_CFG["default_sport"]))
    sport = load_sport(sport_name)
    st.caption("NBA arrives in Phase 6 (stub only).")
    st.divider()
    st.caption("Cash break-even rates (net of rake)")
    st.dataframe(break_even_table(), hide_index=True)

tabs = st.tabs(["Slate", "Projections", "Cash", "GPP", "Sims", "Showdown", "Late Swap", "Export", "Tracking"])

# -------------------------------------------------------------------- Slate
with tabs[0]:
    st.subheader("DKSalaries.csv")
    raw = file_or_sample("Upload DKSalaries.csv", "DKSalaries.csv", "sal")
    if raw:
        try:
            sal, mode = read_dk_salaries(io.BytesIO(raw), sport)
            ss["salaries"], ss["mode"], ss["sal_hash"] = sal, mode, hashlib.sha256(raw).hexdigest()[:12]
            c1, c2, c3 = st.columns(3)
            c1.metric("Mode", mode.title())
            c2.metric("Players", len(sal))
            c3.metric("Games", sal["game_id"].nunique())
            games = sal.groupby("game_id").agg(lock=("lock_time", "min"), window=("lock_window", "first"),
                                               players=("id", "count")).reset_index()
            st.dataframe(games, hide_index=True)
            st.dataframe(sal.drop(columns=["positions", "roster_tokens"]), hide_index=True, height=300)
        except Exception as e:  # surface parse problems to the user
            st.error(f"Could not read DKSalaries: {e}")

# -------------------------------------------------------------- Projections
with tabs[1]:
    st.subheader("projections.csv")
    if "salaries" not in ss:
        st.info("Load DKSalaries first.")
    else:
        sample = "projections_showdown.csv" if ss["mode"] == "showdown" else "projections.csv"
        raw = file_or_sample("Upload projections.csv", sample, "proj")
        if raw:
            src = pd.read_csv(io.BytesIO(raw))
            st.markdown("**Column mapping** — required: " + ", ".join(REQUIRED))
            auto = auto_column_mapping(list(src.columns))
            opts = ["(none)"] + list(src.columns)
            mapping = {}
            cols = st.columns(4)
            for k, canon in enumerate(PROJECTION_SYNONYMS):
                default = auto.get(canon, "(none)")
                pick = cols[k % 4].selectbox(canon + (" *" if canon in REQUIRED else ""), opts,
                                             index=opts.index(default), key=f"map_{canon}")
                if pick != "(none)":
                    mapping[canon] = pick
            try:
                proj = apply_column_mapping(src, mapping)
            except ValueError as e:
                st.error(str(e))
                st.stop()
            overrides = ss.setdefault("overrides", {})
            excluded = ss.setdefault("excluded", set())
            b = build_slate(ss["salaries"], ss["mode"], proj, sport, overrides=overrides, excluded_names=excluded)
            ss["build"] = b
            ss["proj_hash"] = hashlib.sha256(raw).hexdigest()[:12]
            for w in b.warnings:
                st.warning(w)
            st.markdown(f"Matched **{(b.matched['dk_index'] >= 0).sum()}** / {len(b.matched)} projection rows "
                        f"→ {len(b.slate)} playable players.")
            if not b.ready:
                st.error("Run blocked: map or exclude every unmatched player projected above 0.")
                st.dataframe(b.unmatched[["name", "team", "position", "median"]], hide_index=True)
                choices = ss["salaries"].assign(label=lambda d: d["name"] + " (" + d["team"] + " " + d["position"]
                                                + ") " + d["id"])
                for _, r in b.unmatched.iterrows():
                    c1, c2 = st.columns([3, 1])
                    pick = c1.selectbox(f"Map '{r['name']}' ({r['team']})", ["—"] + list(choices["label"]),
                                        key=f"ovr_{r['name']}")
                    if pick != "—":
                        overrides[r["name"]] = pick.rsplit(" ", 1)[-1]
                    if c2.button("Exclude", key=f"exc_{r['name']}"):
                        excluded.add(r["name"])
                        st.rerun()
                if st.button("Apply mappings"):
                    st.rerun()
            with st.expander("Match details"):
                st.dataframe(b.matched[["name", "team", "position", "median", "match_method"]], hide_index=True)
            st.dataframe(b.slate[[c for c in ["name", "position", "role", "team", "opp", "salary", "median", "floor",
                                              "ceiling", "ownership", "status", "lock_window"] if c in b.slate]],
                         hide_index=True, height=350)

# --------------------------------------------------------------------- Cash
with tabs[2]:
    st.subheader("Cash — Objective A (highest median)")
    st.caption("Phase 1 ships the practitioner baseline: highest-median team under cash hard rules. The "
               "simulation-driven P(beat cash line) engine (Section 6) arrives in Phase 2 and will be checked "
               "against this.")
    b = ss.get("build")
    if b is None or not b.ready:
        st.info("Load and fully match projections first.")
    else:
        mode = b.mode
        preset = sport.preset("cash")
        c1, c2 = st.columns(2)
        min_sal = c1.number_input("Min salary", 0, sport.mode(mode).salary_cap, int(preset.get("min_salary", 0)),
                                  step=100)
        c1.markdown(CALIBRATE)
        k = c2.slider("Alternatives to show", 1, 10, 5)
        names = b.slate["name"] + " (" + b.slate["team"] + ")"
        locks = st.multiselect("Lock", list(names.index), format_func=lambda i: names[i])
        excl = st.multiselect("Exclude", list(names.index), format_func=lambda i: names[i])
        if st.button("Build cash lineup", type="primary"):
            try:
                res = objective_a(sport, b.slate, mode, k=k, locks=locks, excludes=excl, min_salary=min_sal)
                ss["cash"] = res
            except InfeasibleError as e:
                st.error(str(e))
        res = ss.get("cash")
        if res is not None:
            for w in res.warnings:
                st.warning(w)
            st.dataframe(res.table, hide_index=True)
            st.caption(f"Hard rules: {res.settings}")

        st.divider()
        st.subheader("Sim engine — max P(beat the cash line)")
        st.caption("Runs slate sims (Sims tab) against a fitted cash field. Favored -> share chalk; underdog -> add "
                   "variance. Contest payouts are templates unless you load your own.")
        st.markdown(CALIBRATE)
        tmpl = {p.stem: p for p in template_paths()}
        cash_keys = [k for k in tmpl if load_contest(tmpl[k]).is_cash]
        chosen_c = st.multiselect("Cash contests", cash_keys, default=cash_keys)
        c1, c2, c3 = st.columns(3)
        top_k = c1.number_input("Top-K candidates by median", 10, 800, 150, step=10)
        sharp = c2.checkbox("H2H opponent is sharp")
        do_split = c3.checkbox("Show 2-lineup split")
        cons_up = st.file_uploader("consensus_cash.csv (optional)", type=["csv"], key="cons")
        if st.button("Run sim cash engine", type="primary"):
            if "sims" not in ss:
                ss["sims"] = simulate_slate(b.slate, sport, int(APP_CFG["sims"]["n"]), int(APP_CFG["seed"]), mode)
            spec = sport.mode(mode)
            cons = read_consensus(io.BytesIO(cons_up.getvalue()), b.slate, spec) if cons_up else None
            own_col = "cash_ownership" if "cash_ownership" in b.slate and b.slate["cash_ownership"].notna().any() \
                else "ownership"
            if own_col not in b.slate:
                st.error("Projections need an ownership column for the cash field model.")
                st.stop()
            with st.spinner("Fitting cash field and scoring candidates..."):
                fld = fit_field(b.slate, sport, b.slate[own_col].fillna(0).to_numpy(), 3000, "cash", mode,
                                consensus=cons)
                sharp_fld = fit_field(b.slate, sport, b.slate[own_col].fillna(0).to_numpy(), 1500, "cash", mode,
                                      consensus=cons, cfg={**sport.preset("field")["cash"],
                                                           "consensus_p": sport.preset("field")["cash"].get(
                                                               "sharp_consensus_p", 0.8)}) if (sharp and cons) else None
                rep = run_cash(sport, b.slate, ss["sims"].scores, [load_contest(tmpl[k]) for k in chosen_c], fld,
                               sharp_fld, cons, mode, cand_cfg={"top_k": int(top_k)}, h2h_sharp=sharp,
                               split=do_split, min_salary=min_sal, locks=locks, excludes=excl)
            ss["cash_report"] = rep
            lus = []
            for r in rep.results.values():
                for lu in [r.recommended] + r.alternatives:
                    if lu not in lus:
                        lus.append(lu)
            ss["cash"] = CashResult(lus, describe(lus, b.slate, spec), [], {"source": "sim engine"})
            st.caption(f"Field ownership error {fld.info['max_own_error']:.3f}; candidates {rep.info['n_candidates']}")
        rep = ss.get("cash_report")
        if rep is not None:
            for ctype, r in rep.results.items():
                st.markdown(f"**{r.contest.name}** — break-even {r.contest.cash_rate_needed:.1%}, "
                            f"mean cash line {r.line.mean():.1f}")
                st.dataframe(r.table, hide_index=True)
                cols = st.columns(3)
                if len(r.fade):
                    cols[0].markdown("Fade risk"); cols[0].dataframe(r.fade, hide_index=True)
                if len(r.free_squares):
                    cols[1].markdown("Free squares"); cols[1].dataframe(r.free_squares, hide_index=True)
                if len(r.vs_consensus):
                    cols[2].markdown("vs consensus"); cols[2].dataframe(r.vs_consensus, hide_index=True)
            if rep.split is not None:
                st.markdown("**One lineup vs split**"); st.dataframe(rep.split, hide_index=True)

# ------------------------------------------------------- later-phase tabs
with tabs[4]:
    st.subheader("Slate simulations")
    st.markdown(f"Gaussian copula over the role-pair correlation prior {CALIBRATE}")
    b = ss.get("build")
    if b is None or not b.ready:
        st.info("Load and fully match projections first.")
    else:
        n = st.select_slider("Sims", [2000, 5000, 10000, 20000, 50000], value=int(APP_CFG["sims"]["n"]))
        if st.button("Run slate sims"):
            ss["sims"] = simulate_slate(b.slate, sport, int(n), int(APP_CFG["seed"]), b.mode)
        if "sims" in ss:
            sm = ss["sims"]
            st.caption(f"Run log: {sm.run_log}")
            st.dataframe(player_metrics(b.slate, sm, sport), hide_index=True, height=420)

with tabs[3]:
    st.subheader("GPP — portfolio by simulated ROI vs a simulated field")
    st.markdown(f"Presets, field model and payout templates are heuristics {CALIBRATE}")
    b = ss.get("build")
    if b is None or not b.ready:
        st.info("Load and fully match projections first.")
    elif "ownership" not in b.slate or b.slate["ownership"].isna().all():
        st.error("GPP needs projected ownership (map an ownership column on the Projections tab).")
    else:
        presets = {k: v for k, v in sport.preset("gpp").items() if isinstance(v, dict) and "lambda_log_own" in v}
        if b.mode == "showdown" and sport.preset("showdown").get("gpp"):
            presets = {"showdown": sport.preset("showdown")["gpp"]}
        c1, c2, c3 = st.columns(3)
        pre = c1.selectbox("Preset", list(presets), format_func=lambda k: presets[k].get("label", k),
                           index=min(1, len(presets) - 1))
        tmpl = {p.stem: p for p in template_paths()}
        gpp_keys = [k for k in tmpl if not load_contest(tmpl[k]).is_cash]
        ck = c2.selectbox("Contest", gpp_keys)
        contest = load_contest(tmpl[ck])
        n_lu = c3.number_input("Lineups", 1, int(contest.max_entries), min(20, int(contest.max_entries)))
        c4, c5, c6 = st.columns(3)
        n_cand = c4.number_input("Candidate pool (sim-sampled)", 100, 10000, 1000, step=100)
        max_exp = c5.slider("Max exposure", 0.1, 1.0, float(sport.preset("gpp").get("portfolio", {}).get(
            "max_exposure", 0.6)), 0.05)
        opt_n = c6.number_input("optimal% sims (0 = skip)", 0, 2000, 300, step=100)
        if st.button("Build GPP portfolio", type="primary"):
            from core.gpp import run_gpp
            if "sims" not in ss:
                ss["sims"] = simulate_slate(b.slate, sport, int(APP_CFG["sims"]["n"]), int(APP_CFG["seed"]), b.mode)
            with st.spinner("Generating candidates, fitting the field, selecting the portfolio..."):
                ss["gpp_run"] = run_gpp(sport, b.slate, ss["sims"].scores, contest, int(n_lu), pre, b.mode,
                                        n_candidates=int(n_cand), optimal_sims=int(opt_n), max_exposure=max_exp)
        run = ss.get("gpp_run")
        if run is not None:
            pr = run.portfolio
            st.caption(f"timings {run.info}")
            st.json(pr.report)
            st.dataframe(pr.lineup_table, hide_index=True)
            c1, c2 = st.columns(2)
            c1.markdown("Exposure vs field (vs optimal%)"); c1.dataframe(pr.exposure, hide_index=True, height=300)
            c2.markdown("Stack exposure"); c2.dataframe(pr.stacks, hide_index=True, height=300)
            if run.leverage is not None:
                st.markdown("Leverage (optimal% − ownership)"); st.dataframe(run.leverage.head(30), hide_index=True)

with tabs[6]:
    st.subheader("Late swap")
    st.caption("Locks every player whose game has started as of the time below. Cash entries maximise "
               "P(beat the line | locked) — ahead → lean chalk, behind → add variance; GPP entries maximise "
               "conditional expected payout. Only lineup cells change in the exported DKEntries.csv.")
    b = ss.get("build")
    if b is None or not b.ready:
        st.info("Load and fully match projections first.")
    else:
        from core.lateswap import guess_contest_template, late_swap_entries
        raw = file_or_sample("Upload current DKEntries.csv (download it from DK's Edit Entries page)",
                             "DKEntries.csv", "ls_entries")
        c1, c2 = st.columns(2)
        d = c1.date_input("As of (date, ET)", value=pd.to_datetime(b.slate["lock_time"]).min().date())
        tm = c2.time_input("As of (time, ET)", value=pd.Timestamp("2026-10-18 14:00").time())
        act_up = st.file_uploader("Actual scores so far (optional: id or name, points)", type=["csv"], key="ls_act")
        if raw:
            ef = read_entries(raw)
            ents = ef.entries
            tmpl = {p.stem: p for p in template_paths()}
            cmap = {}
            for cid, name in ents.groupby("Contest ID")["Contest Name"].first().items():
                g = guess_contest_template(name)
                cmap[cid] = st.selectbox(f"{name} ({cid})", list(tmpl), index=list(tmpl).index(g), key=f"ls_{cid}")
            if st.button("Run late swap", type="primary"):
                from zoneinfo import ZoneInfo
                as_of = pd.Timestamp.combine(d, tm).tz_localize(ZoneInfo("America/New_York"))
                actual = None
                if act_up is not None:
                    a = pd.read_csv(io.BytesIO(act_up.getvalue()))
                    a.columns = [c.lower() for c in a.columns]
                    key = "id" if "id" in a else "name"
                    m = b.slate.set_index("name")["id"].astype(str).to_dict()
                    actual = {(str(r[key]) if key == "id" else m.get(r[key], "")): float(r["points"])
                              for _, r in a.iterrows()}
                if "sims" not in ss:
                    ss["sims"] = simulate_slate(b.slate, sport, int(APP_CFG["sims"]["n"]), int(APP_CFG["seed"]),
                                                b.mode)
                own = b.slate["ownership"].fillna(0).to_numpy() if "ownership" in b.slate else None
                if own is None:
                    st.error("Late swap needs projected ownership for the field model.")
                    st.stop()
                with st.spinner("Fitting fields and re-solving open slots..."):
                    fields = {"cash": fit_field(b.slate, sport, own, 2500, "cash", b.mode),
                              "gpp": fit_field(b.slate, sport, own, 3000, "gpp", b.mode)}
                    contests = {cid: load_contest(tmpl[k]) for cid, k in cmap.items()}
                    assign, rep = late_swap_entries(sport, b.slate, ss["sims"].scores, ef, contests, fields, as_of,
                                                    actual, b.mode)
                st.dataframe(rep, hide_index=True)
                st.download_button("Download swapped DKEntries.csv", write_entries(ef, assign),
                                   file_name="DKEntries_lateswap.csv")

with tabs[8]:
    from core import tracking
    st.subheader("Tracking")
    st.caption("Entries are logged from the Export tab (with the model's prediction). Settle them with DK's "
               "contest-history export (My Contests → Download).")
    hist_up = st.file_uploader("DK contest history CSV", type=["csv"], key="hist")
    if hist_up is not None and st.button("Settle results"):
        _, n_set = tracking.settle(tracking.read_contest_history(io.BytesIO(hist_up.getvalue())))
        st.success(f"Settled {n_set} entries")
    log = tracking.load_log()
    oc = tracking.overconfidence(log)
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Settled cash entries", oc["n"])
    c2.metric("Predicted cash rate", "-" if oc["predicted"] is None else f"{oc['predicted']:.1%}")
    c3.metric("Realized cash rate", "-" if oc["realized"] is None else f"{oc['realized']:.1%}")
    c4.metric("Gap", "-" if oc["gap"] is None else f"{oc['gap']:+.1%}")
    if oc["overconfident"]:
        st.error("Cash model is OVERCONFIDENT: realized is more than 5 pp below predicted over 50+ entries. "
                 "Widen distributions / recalibrate before trusting P(win).")
    elif not oc["enough_data"]:
        st.info("Need 50+ settled cash entries before judging calibration.")
    rel = tracking.reliability(log)
    if len(rel):
        st.markdown("Reliability (predicted vs realized cash rate)")
        st.dataframe(rel, hide_index=True)
        st.scatter_chart(rel.assign(bin=rel["bin"].astype(str)), x="predicted", y="realized", size="n")
    roi = tracking.cumulative_roi(log)
    if len(roi):
        st.markdown("Cumulative ROI vs break-even (0%)")
        st.line_chart(roi.set_index("n")[["roi", "breakeven_roi"]])
    with st.expander("Entry log"):
        st.dataframe(log, hide_index=True)

    st.divider()
    st.subheader("Calibration")
    st.markdown(f"Suggestions only — review, then paste into the sport plugin YAML {CALIBRATE}")
    ph = st.file_uploader("Player history CSV (season, week, team, opp, position, median, actual[, role, floor, "
                          "ceiling])", type=["csv"], key="phist")
    if ph is not None:
        from core.calibration import coverage_report, fit_correlations, fit_cv, read_player_history, suggestions_yaml
        h = read_player_history(io.BytesIO(ph.getvalue()))
        cvt, cor = fit_cv(h, sport), fit_correlations(h, sport)
        st.markdown("CV by position"); st.dataframe(cvt, hide_index=True)
        st.markdown("Role-pair correlations"); st.dataframe(cor, hide_index=True)
        cov = coverage_report(h)
        if len(cov):
            st.markdown("Floor / ceiling coverage"); st.dataframe(cov)
        st.download_button("Download suggested YAML", suggestions_yaml(cvt, cor), file_name="calibration.yaml")

    st.subheader("Flashback")
    st.caption("Upload a completed contest's standings export. Your lineups are re-scored by the pre-slate sims "
               "against the REAL field; the field's average sim ROI equals -rake (typical break-even -10% to -16%).")
    b = ss.get("build")
    sd_up = st.file_uploader("DK contest standings CSV", type=["csv"], key="stand")
    if sd_up is not None and b is not None and b.ready:
        from core.calibration import field_params_from_standings, ownership_report
        from core.reports import flashback
        from core.standings import actual_ownership, lineups_from_standings, read_standings
        stnd = read_standings(io.BytesIO(sd_up.getvalue()))
        tmpl = {p.stem: p for p in template_paths()}
        ck = st.selectbox("Contest payout structure", list(tmpl), key="fb_contest")
        mine = st.text_input("Your entry IDs or names (comma separated)")
        if st.button("Run flashback"):
            if "sims" not in ss:
                ss["sims"] = simulate_slate(b.slate, sport, int(APP_CFG["sims"]["n"]), int(APP_CFG["seed"]), b.mode)
            spec = sport.mode(b.mode)
            ids = [x.strip() for x in mine.split(",") if x.strip()]
            ids += list(stnd.entries.loc[stnd.entries["entry_name"].str.split(" ").str[0].isin(ids), "entry_id"])
            fb = flashback(stnd, b.slate, ss["sims"].scores, load_contest(tmpl[ck]), spec, ids)
            st.json({k: v for k, v in fb.items() if k not in ("mine", "table")})
            st.markdown("Your entries"); st.dataframe(fb["mine"], hide_index=True)
            with st.expander("Whole field by sim ROI"):
                st.dataframe(fb["table"].head(200), hide_index=True)
            if "ownership" in b.slate:
                st.markdown("Projected vs actual ownership")
                st.dataframe(ownership_report(b.slate["ownership"].fillna(0), actual_ownership(stnd, b.slate),
                                              b.slate["position"]), hide_index=True)
            st.markdown("Field behaviour (for the field model)")
            st.json(field_params_from_standings(lineups_from_standings(stnd, b.slate, spec), b.slate, spec, sport))
    elif sd_up is not None:
        st.info("Load the slate's DKSalaries + projections first.")

    st.subheader("Bankroll (heuristic)")
    from core.reports import bankroll_warnings
    c1, c2, c3 = st.columns(3)
    br = c1.number_input("Bankroll $", 0.0, 1e7, 0.0, step=50.0)
    fees = c2.number_input("This slate's total entry fees $", 0.0, 1e6, 0.0, step=5.0)
    big = c3.number_input("Largest single GPP total fees $", 0.0, 1e6, 0.0, step=5.0)
    for w in bankroll_warnings(br, fees, big):
        st.warning(w)

with tabs[5]:
    st.subheader("Showdown")
    st.caption("Load a Showdown DKSalaries file on the Slate tab. Cash, GPP and Late Swap then run in Showdown "
               "mode: CPT = 1.5x salary and points, field CPT picks come from cpt_ownership (separate from FLEX).")
    st.markdown(f"Showdown rules {CALIBRATE}")
    st.json(sport.preset("showdown"))

# ------------------------------------------------------------------- Export
with tabs[7]:
    st.subheader("Export")
    b = ss.get("build")
    sources = {}
    if ss.get("cash") is not None:
        sources["Cash"] = ss["cash"].lineups
    if ss.get("gpp_run") is not None:
        sources["GPP portfolio"] = ss["gpp_run"].portfolio.lineups
    if b is None or not sources:
        st.info("Build lineups first.")
    else:
        spec = sport.mode(b.mode)
        src = st.radio("Lineup source", list(sources), horizontal=True)
        res = CashResult(sources[src], pd.DataFrame())
        default = list(range(1, len(res.lineups) + 1)) if src == "GPP portfolio" else [1]
        chosen = st.multiselect("Lineups to export", list(range(1, len(res.lineups) + 1)), default=default)
        lus = [res.lineups[i - 1] for i in chosen]
        contests = {p.stem: p for p in template_paths()}
        cname = st.selectbox("Contest (for max_entries)", ["(none)"] + list(contests))
        max_e = load_contest(contests[cname]).max_entries if cname != "(none)" else None
        try:
            csv_text = upload_csv(lus, b.slate, spec, max_entries=max_e)
            st.download_button("Download DK upload CSV", csv_text, file_name=f"dk_upload_{b.mode}.csv")
            st.code(csv_text)
        except ExportError as e:
            st.error(str(e))
        st.divider()
        st.markdown("**DKEntries.csv round-trip** — only lineup cells change; contest columns stay byte-identical.")
        raw = file_or_sample("Upload DKEntries.csv", "DKEntries.csv", "entries")
        if raw and lus:
            try:
                ef = read_entries(raw)
                ents = ef.entries
                st.dataframe(ents[["Entry ID", "Contest Name", "Contest ID", "Entry Fee"]], hide_index=True)
                by_contest = {cid: lus for cid in ents["Contest ID"].unique()}
                assign = assign_lineups_to_entries(ef, by_contest, b.slate, spec)
                out = write_entries(ef, assign)
                st.download_button("Download edited DKEntries.csv", out, file_name="DKEntries_edited.csv")
                if st.button("Log these entries for tracking"):
                    from core import tracking
                    from core.lateswap import guess_contest_template
                    rep_c, run_g = ss.get("cash_report"), ss.get("gpp_run")
                    rows = []
                    for _, e in ents.iterrows():
                        if e["Entry ID"] not in assign:
                            continue
                        ids = assign[e["Entry ID"]]
                        key = guess_contest_template(e["Contest Name"])
                        c = load_contest(contests[key])
                        lu_ids = "|".join(ids)
                        r = {"entry_id": e["Entry ID"], "contest_id": e["Contest ID"], "contest_name": e["Contest Name"],
                             "contest_type": c.type, "payout_multiple": c.payout_multiple if c.is_cash else np.nan,
                             "entry_fee": float(str(e["Entry Fee"]).replace("$", "") or 0), "lineup_ids": lu_ids,
                             "slate": ss.get("sal_hash")}
                        if c.is_cash and rep_c is not None and c.type in rep_c.results:
                            res_c = rep_c.results[c.type]
                            for lu in [res_c.recommended] + res_c.alternatives:
                                if "|".join(export_ids(lu, b.slate, spec)) == lu_ids:
                                    k = rep_c.candidates.index(lu)
                                    r["pred_p_win"] = float(res_c.metrics.at[k, "p_win"])
                        if not c.is_cash and run_g is not None:
                            for j, lu in enumerate(run_g.portfolio.lineups):
                                if "|".join(export_ids(lu, b.slate, spec)) == lu_ids:
                                    roi = float(run_g.portfolio.lineup_table.at[j, "sim_roi"])
                                    r["pred_exp_payout"] = r["entry_fee"] * (1 + roi)
                        rows.append(r)
                    tracking.log_entries(rows)
                    st.success(f"Logged {len(rows)} entries to data/tracking/entries_log.csv")
            except ExportError as e:
                st.error(str(e))
        st.caption(f"Run log — sport={sport.name} salaries={ss.get('sal_hash')} projections={ss.get('proj_hash')}")
