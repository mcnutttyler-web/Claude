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
        c1, c2, c3 = st.columns(3)
        pre = c1.selectbox("Preset", list(presets), format_func=lambda k: presets[k].get("label", k), index=1)
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

for t, text in ((6, "Late swap (cash 6.4 + GPP) — Phase 4."),
                (8, "Tracking, calibration and flashback — Phase 5.")):
    with tabs[t]:
        st.info(text)

with tabs[5]:
    st.subheader("Showdown")
    st.caption("Load a Showdown DKSalaries file on the Slate tab — the Cash tab then builds CPT + 5 FLEX lineups "
               "(CPT = 1.5x salary and points). Showdown-specific stacking rules arrive in Phase 4.")

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
            except ExportError as e:
                st.error(str(e))
        st.caption(f"Run log — sport={sport.name} salaries={ss.get('sal_hash')} projections={ss.get('proj_hash')}")
