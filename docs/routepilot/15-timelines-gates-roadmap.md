# 15. Timelines, Decision Gates, Post-MVP Roadmap

## 15.1 Timelines

All three timelines assume the same phase sequence (`08-development-phases.md`); they differ only in elapsed calendar time given weekly hours available. None of them compress security review, testing, or the walking-skeleton milestone — those are treated as fixed-scope, not compressible.

### Conservative (~10 hrs/week)

| Milestone | Elapsed time |
|---|---|
| Validation (15+ interviews) | Weeks 1–6 |
| Design period (finalize MVP scope, architecture decisions locked) | Weeks 6–8 |
| Phase 0 (founder prep, incl. starting 10DLC registration) | Weeks 7–9 (overlaps design) |
| Phase 1 (foundation) | Weeks 9–12 |
| **Walking skeleton (Phase 2) — explicit early milestone** | Weeks 12–15 |
| Phases 3–5 (drivers, programs, commitments) | Weeks 15–22 |
| Phase 6 (full messaging) | Weeks 22–27 |
| Phases 7–9 (risk, recovery, reporting) | Weeks 27–34 |
| Internal testing (full regression pass) | Weeks 34–36 |
| Pilot preparation (incl. confirming 10DLC fully approved — should already be done, this is confirmation, not the start) | Weeks 36–38 |
| Pilot launch | Week 38 |
| Pilot evaluation (6-week pilot) | Weeks 38–44 |
| Paid launch decision | Week 45 |

**Total: roughly 10–11 months to a paid-launch decision.**

### Standard (~20 hrs/week)

| Milestone | Elapsed time |
|---|---|
| Validation | Weeks 1–4 |
| Design period | Weeks 4–5 |
| Phase 0 | Weeks 4–6 (overlaps design; 10DLC registration starts here) |
| Phase 1 | Weeks 6–7 |
| **Walking skeleton** | Weeks 7–9 |
| Phases 3–5 | Weeks 9–13 |
| Phase 6 | Weeks 13–16 |
| Phases 7–9 | Weeks 16–20 |
| Internal testing | Weeks 20–21 |
| Pilot preparation | Weeks 21–22 |
| Pilot launch | Week 22 |
| Pilot evaluation (6 weeks) | Weeks 22–28 |
| Paid launch decision | Week 29 |

**Total: roughly 6–7 months to a paid-launch decision.**

### Aggressive (full-time)

| Milestone | Elapsed time |
|---|---|
| Validation | Weeks 1–3 |
| Design period | Week 3 |
| Phase 0 | Weeks 3–4 (10DLC registration starts here — this is the one item that does *not* compress with more hours, since it's an external approval process, not founder labor) |
| Phase 1 | Week 4–5 |
| **Walking skeleton** | Week 5–6 |
| Phases 3–5 | Weeks 6–9 |
| Phase 6 | Weeks 9–11 |
| Phases 7–9 | Weeks 11–13 |
| Internal testing | Week 13–14 |
| Pilot preparation | Week 14 |
| Pilot launch | Week 15 |
| Pilot evaluation (6 weeks) | Weeks 15–21 |
| Paid launch decision | Week 22 |

**Total: roughly 5 months to a paid-launch decision.**

Note common to all three: security review and the full test suite are never cut to hit a date. If the aggressive timeline is at risk of skipping testing to hit week 13, the correct response is to slip the pilot date, not to launch under-tested against real driver phone numbers and real (even if pilot-priced) customer money.

## 15.2 Decision gates

| Gate | Evidence required | Passing criteria | Warning signs | If it fails |
|---|---|---|---|---|
| Is the customer problem sufficiently painful? | ≥15 validation interviews | ≥70% describe recurring, costly coverage failures (per `01-validation.md` §1.6) | Vague "yeah that'd be nice" reactions with no concrete cost example | Revise or narrow the segment before writing code |
| Will a customer participate in a pilot? | Verbal/written pilot commitment | ≥1 signed design-partner agreement before Phase 5 | Interest without a scheduling commitment ("call us when it's ready") | Keep interviewing; do not build past the walking skeleton without this |
| Does the workflow require software? | Interview evidence on current workarounds | Dispatchers describe the current process as effortful/error-prone, not "fine on a spreadsheet" | Dispatchers seem satisfied with existing tools/process | Reconsider whether this segment/problem is real |
| Is SMS the correct interaction channel? | Driver interview responses (§1.3 Q6–8) | ≥70% of drivers confirm they'd respond to SMS confirmations | Drivers say they ignore dispatch texts already | Revisit interaction channel before building the messaging system |
| Can inbound replies be handled reliably with keyword parsing plus a needs-review queue, or is LLM parsing required? | Pilot data: needs-review replies per 100 inbound messages (`14-metrics-pricing-ops-budget.md`) | Needs-review rate stays low enough for the founder/dispatcher to clear same-day (a concrete pilot-specific threshold, e.g., under ~15% of inbound messages, tune to observed dispatcher capacity) | Needs-review queue consistently backs up, or dispatchers report frequent frustration with "why didn't it understand that" | Consider the LLM-assist decision gate in `07-messaging-design.md` §7.2 — only after this evidence exists |
| Can the MVP improve final coverage rate? | Pilot metrics: initial vs. final coverage rate | Statistically/practically meaningful improvement over the customer's baseline | No measurable change, or improvement attributable to something else (e.g., a seasonal lull in demand) | Investigate whether risk thresholds/backup sourcing are actually working as designed before concluding the product doesn't help |
| Can backups be sourced early enough? | Pilot metric: average time to recover, routes recovered before dispatch intervention | Majority of recoveries happen before scheduled departure | Recoveries consistently happen late or not at all | Re-tune risk thresholds, review backup-pool sizing with the customer, or reconsider standby compensation levels |
| Will drivers respond to the workflow at acceptable rates before opt-outs become a problem? | Pilot metrics: driver response rate, opt-out rate | High response rate, low opt-out rate over the pilot period | Rising opt-out rate week over week | Review message frequency/tone/timing before assuming the channel itself has failed |
| Will dispatchers consistently use the system? | Pilot usage data + weekly review qualitative feedback | Dispatchers use the dashboard as primary tool by week 2–3, not reverting to the old process | Continued parallel use of spreadsheets/group texts past the agreed transition window | Investigate specific UX friction points directly with the dispatcher, don't assume it's a training issue alone |
| Will customers pay enough to support the business? | Willingness-to-pay interviews + actual pilot-to-paid conversion | At least one customer converts at or near the hypothesized price | Repeated "we'd use it for free but not pay" signals | Revisit pricing model (§14.2) and/or the value proposition itself |
| Is machine learning justified by available data? | Post-MVP: sufficient volume of structured outcome data (assignments, responses, cancellations, risk assessments) across multiple customers | Enough labeled outcomes to meaningfully beat the rules-based baseline, and a concrete decision to invest in it | Data volume still thin, or rules-based scoring is already performing acceptably | Do not build ML; continue refining rule thresholds instead |

## 15.3 Post-MVP roadmap (ranked, not chronological — pick based on actual pilot signal)

| Feature | Customer value | Revenue potential | Dev difficulty | Data requirements | Operational risk | Strategic value | Notes |
|---|---|---|---|---|---|---|---|
| Driver-route compatibility scoring (beyond MVP's simple preference ranking) | High | Medium | Medium | Low (uses existing structured data) | Low | Medium | Natural next step once basic matching is proven; still rules-based, just richer |
| Automated driver onboarding / document verification | High | Medium | Medium | Low | Medium (compliance-sensitive) | Medium | Reduces founder's manual onboarding time significantly at scale |
| Customer TMS/integration connectors | High (removes CSV friction) | High (unlocks larger customers) | High | Low | Medium | High | Only pursue once ≥2 customers request the *same* integration — don't build speculative integrations |
| Predictive risk modeling (ML) | Medium–High (eventually) | Medium | High | High (needs real multi-customer historical outcome volume) | Medium (explainability trade-off) | Medium | Gate explicitly per §15.2's ML decision gate; do not pursue early |
| Automated sourcing campaigns (proactively recruiting backups before shortages) | Medium | Medium | Medium | Medium | Low | Medium | Valuable once backup-pool sizing is understood as a recurring pain point |
| Dynamic standby pricing | Medium | Medium | High | High (needs acceptance-rate-vs-price data) | Medium | Low–Medium | Needs real pilot data on backup acceptance vs. compensation before this is even well-specified |
| Driver mobile application | Low–Medium (SMS already works) | Low | High | Low | Low | Low | Only justified if SMS response rates or driver feedback specifically point to a need beyond the mobile-web pages |
| Multi-channel messaging (voice, WhatsApp, app push) | Medium (some drivers may prefer alternates) | Low–Medium | Medium | Low | Low | Medium | WhatsApp specifically worth revisiting if selling into markets where it's the dominant channel |
| LLM-assisted reply handling and driver Q&A | Medium | Low–Medium | Medium | Medium | Medium–High (per §7.2 decision gate) | Low | Only after the needs-review-volume decision gate fails, and only as dispatcher-approved suggestions initially, not autonomous action |
| Customer-facing APIs | Low (pilot-stage customers don't need this) | Medium (unlocks larger/more technical customers later) | Medium | Low | Low | Medium | Revisit once selling upmarket |
| Route completion verification (e.g., geofence/photo proof) | Medium | Low–Medium | Medium | Low | Low | Low–Medium | Nice trust-building feature, not core to the coverage-assurance promise |
| Telematics integrations | Low (at this customer size) | Low | High | Medium | Low | Low | More relevant for larger fleet operators than the beachhead segment |
| Marketplace integrations | Low (beachhead avoids marketplace-mediated drivers) | Low | High | Low | Medium | Low | Relevant only if expanding into segments explicitly excluded from the beachhead |
| Advanced analytics / benchmarking across customers | Medium | Medium | Medium | High (needs multi-customer scale) | Low | High (network-effect potential) | Real strategic value once there are enough customers for benchmarks to mean anything |
| Network-wide driver pools (drivers shared/discoverable across RoutePilot customers) | Medium–High | High | High | High | High (classification/competitive-sensitivity concerns) | High | Long-horizon, needs real customer trust and scale first; flag for legal review given cross-customer driver data sharing |

Do not build any feature on this list simply because it uses AI — every entry above is ranked on customer value, revenue, difficulty, data needs, operational risk, and strategic value, in that order of weight, not on novelty.
