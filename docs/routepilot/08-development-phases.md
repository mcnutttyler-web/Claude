# 8. Development Phases (Build Sequence)

Each phase lists objective, deliverables, detailed tasks, dependencies, testing requirements, definition of done, common mistakes, and what not to build yet. The granular Claude-Code-sized tasks that implement each phase are in `09-task-backlog.md`; this document is the phase-level map.

## Phase 0: Founder preparation

**Objective:** get the non-software prerequisites and the Claude Code working environment in place before any product code is written.

**Deliverables:** completed validation interviews (per `01-validation.md`), a chosen customer segment, a repo with CLAUDE.md and Claude Code scaffolding, provisioned environments, A2P 10DLC registration started.

**Tasks:**
- Complete ≥15 validation interviews; document findings.
- Select the beachhead segment (confirm or revise `00-overview.md`'s recommendation based on real interview evidence).
- Create the git repository; run `/init` to bootstrap CLAUDE.md, then refine it (full content in `10-ai-workflow.md`).
- Set up Supabase (dev project), Vercel project, Twilio account, Sentry, PostHog accounts.
- **Begin A2P 10DLC brand + campaign registration immediately** — this has multi-week lead time and must not be deferred.
- Define a security baseline (see `12-security-checklist.md` "before internal testing" tier).
- Establish local, staging, and production environment configs (secrets in environment variables only, never committed).

**Dependencies:** none.

**Testing requirements:** none yet (no product code).

**Definition of done:** repo exists with CLAUDE.md, hooks, and slash commands configured; all accounts provisioned; 10DLC registration submitted; ≥15 interviews documented with a segment decision recorded in the decision log.

**Common mistakes:** starting to code before any interviews are done; delaying 10DLC registration until "closer to launch" (this is the single most common self-inflicted pilot delay in SMS products); skipping CLAUDE.md setup and losing context-consistency from session one.

**Do not build yet:** any product feature at all.

---

## Phase 1: Product foundation

**Objective:** the multi-tenant skeleton every later feature attaches to.

**Deliverables:** working auth, organizations/branches, users/roles, navigation shell, database foundation with RLS, audit logging.

**Tasks:** managed-auth integration (sign in, password reset, invitation); `organizations`, `branches`, `users`, `roles` tables + RLS policies; basic app shell/navigation; `audit_logs` table and a helper used by all future mutations.

**Dependencies:** Phase 0 environments.

**Testing requirements:** multi-tenant isolation test (two orgs, cross-access attempt must fail) — this test is written now and re-run in CI forever after, since it's the single most important regression to catch early.

**Definition of done:** a user can be invited, sign in, see an empty dashboard shell scoped to their org/branch; RLS isolation test passes.

**Common mistakes:** hand-rolling auth instead of using managed auth; skipping RLS "for now" with a plan to add it later (retrofitting RLS onto an app with dozens of unscoped queries is much harder than starting with it).

**Do not build yet:** programs, routes, drivers, messaging, risk engine.

---

## Phase 2: Walking skeleton (build this as early as possible)

**Objective:** prove the riskiest technical path end-to-end — schedule → outbound SMS → inbound webhook → state change → dashboard — for one organization, one route occurrence, one driver.

**Deliverables:** a single hardcoded-ish route occurrence, one driver, one scheduled confirmation checkpoint, a real outbound SMS via Twilio, a real inbound webhook handling a real reply, a coverage-status change visible on a minimal dashboard, and an end-to-end test of the full loop running against the staging sandbox.

**Tasks:** minimal `route_occurrences` + `confirmation_checkpoints` tables (a stripped early version, refined in Phase 4); a scheduled job that fires one checkpoint; Twilio outbound send with idempotency key; Twilio inbound webhook handler with dedup; a minimal state-machine transition function (`unassigned → committed → confirmation_pending → confirmed`, a small early subset of the full table in `03-workflows-state-machine.md`); a bare-bones dashboard showing that one occurrence's status.

**Dependencies:** Phase 1 (auth/org scoping), Twilio account provisioned, 10DLC registration far enough along to send test traffic (or use Twilio test credentials if registration isn't complete yet — do not block the skeleton on registration completing, only the pilot launch).

**Testing requirements:** one Playwright/integration test that runs the full loop against the staging sandbox (schedule fires → message "sent" → simulated webhook reply → status updates → dashboard reflects it) and asserts on the final dashboard state, not just intermediate steps.

**Definition of done:** the test in the paragraph above passes reliably (run it 3 times in a row — flakiness here means a job/idempotency bug that must be fixed before building anything on top of it), and a human can watch it happen against real (or sandboxed) Twilio infrastructure.

**Common mistakes:** treating this phase as optional or skippable "since we'll build the real thing later" — this is the actual point of the phase, not a throwaway; building it against mocked messaging instead of real Twilio sandbox infrastructure (which hides exactly the integration risk this phase exists to surface); over-building the state machine/dashboard here instead of keeping both intentionally minimal.

**Do not build yet:** the full state-machine table, risk engine, backup sourcing, CSV import, full message template set.

---

## Phase 3: Drivers and qualifications

**Objective:** widen the "driver" side of the skeleton into the real data model.

**Deliverables:** driver profiles, vehicle profiles, qualification records, preferences (minimal set), driver search, CSV import for drivers.

**Tasks:** `drivers`, `vehicles`, `qualifications`, `driver_qualifications`, `driver_preferences` (minimal) tables; driver list/profile screens; CSV import flow (upload → column-map → validation preview → commit) for drivers specifically.

**Dependencies:** Phase 1.

**Testing requirements:** CSV import tests with a realistic messy file (duplicate phones, missing fields); qualification-expiration logic unit tests.

**Definition of done:** a 100-row driver CSV imports with an accurate per-row validation preview; a driver profile shows qualifications with expiration flags.

**Common mistakes:** building a full driver-availability calendar (not needed for MVP — only service area / max distance / min compensation preferences are essential); treating CSV import as a "later" feature (it must land here, before programs/routes need real drivers to attach to).

**Do not build yet:** route templates, programs, backup pools, messaging beyond the skeleton.

---

## Phase 4: Programs and recurring routes

**Objective:** widen the "route" side — full recurring-program modeling.

**Deliverables:** delivery programs, route templates (full disclosure fields), recurrence rules, route occurrence generation (idempotent), route requirements.

**Tasks:** `delivery_programs`, `route_templates`, `route_requirements`, `route_recurrence_rules` tables; template create/edit screen with full disclosure fields; occurrence-generation scheduled job (idempotent, rolling window); CSV import for routes.

**Dependencies:** Phases 1, 3 (requirements reference qualifications).

**Testing requirements:** occurrence-generation idempotency test (run the job twice, assert no duplicates); timezone test (a recurrence rule with a branch in a specific timezone generates checkpoints at the correct UTC instants).

**Definition of done:** a recurrence rule produces correct future occurrences repeatably; a route CSV import creates templates + recurrence correctly.

**Common mistakes:** allowing occurrence generation to run non-idempotently "since it's just a cron job" — this is exactly the kind of bug that causes duplicate driver messages later; skipping the full disclosure-field requirement (a template must be complete before it can generate occurrences, per the MVP scope doc).

**Do not build yet:** commitments/assignments (Phase 5), full messaging (Phase 6).

---

## Phase 5: Commitments and assignments

**Objective:** connect real drivers to real recurring routes through the disclosure/commitment/assignment flow.

**Deliverables:** route disclosure (SMS + driver web page), driver invitations, acceptance/decline handling, primary assignments, backup pools (as a query, per data-model note).

**Tasks:** `driver_commitments`, `assignments` tables; invitation flow (dispatcher selects candidate → disclosure sent); driver disclosure mobile-web page; accept/decline handling wired to the (still-minimal) state machine; primary-assignment logic (one active primary per occurrence, enforced at the DB level); eligible-backup query (hard filter + soft ranking, per `06-risk-engine.md` §6.4).

**Dependencies:** Phases 2 (messaging skeleton), 3 (drivers/qualifications), 4 (templates/occurrences).

**Testing requirements:** concurrency test — two dispatchers assigning conflicting primaries simultaneously (per `03-workflows-state-machine.md` §3.4 rule 1); eligible-backup filter test (hard requirements correctly exclude).

**Definition of done:** a driver can be invited, view full disclosure on the mobile-web page, accept, and become the assigned primary — end to end, with the correct coverage-status transitions.

**Common mistakes:** allowing more than one active primary per occurrence without a DB-level constraint (application-level-only checks race under concurrency); building a full driver mobile app instead of the lightweight disclosure page.

**Do not build yet:** full risk engine, standby offers/backup activation, reporting.

---

## Phase 6: Confirmation and messaging at full depth

**Objective:** expand the messaging skeleton into the complete, production-grade messaging system.

**Deliverables:** full message template set (§`07-messaging-design.md` §7.1), scheduled confirmations at configured offsets, response handling with the needs-review queue, opt-outs, quiet hours, idempotency/outbox/frequency-caps/spend-guardrails, message logs.

**Tasks:** full `confirmation_checkpoints`/`confirmation_responses` model (day-before + same-day, configurable); keyword-first parser with context matching; needs-review queue (dashboard panel + resolution flow); `consent_records`, opt-out/resubscribe handling (provider-level + app-level); quiet-hours enforcement; outbox pattern completion; per-driver frequency caps; global + per-org kill switch; daily spend budget + throttling; full message-thread UI on occurrence detail with manual-send capability.

**Dependencies:** Phase 2 skeleton, Phase 5 (assignments to attach checkpoints to).

**Testing requirements:** webhook-duplicate-delivery test; idempotent-resend test (retry a send, assert no duplicate); quiet-hours test; opt-out test (STOP suppresses all future sends until resubscribe); out-of-context-reply test (§3.4 rule 3).

**Definition of done:** every scenario in `07-messaging-design.md` §7.1's template table is implemented and covered by at least one automated test; the needs-review queue has zero false negatives on a test set of ambiguous replies.

**Common mistakes:** building the kill switch/spend guardrail as an afterthought instead of from message #1 (it must exist before the first real driver ever receives a text); allowing quiet-hours logic to live in multiple places (message templates, jobs) instead of one shared check.

**Do not build yet:** risk engine scoring (Phase 7), backup/recovery flow beyond what Phase 5 already has (Phase 8).

---

## Phase 7: Risk and action queues

**Objective:** build the rules-based risk engine and surface it operationally.

**Deliverables:** risk rules (§`06-risk-engine.md`), tiers, explanation engine, at-risk dashboard section, dispatcher action queue.

**Tasks:** `risk_assessments`, `risk_factors` tables with rule-version snapshotting; rule-evaluation function triggered on relevant events (checkpoint response/no-response, cancellation, qualification expiration); at-risk panel on dashboard; recommended-action derivation ("3 routes need backup sourcing").

**Dependencies:** Phase 6 (confirmation events are a primary input), Phase 3 (driver history).

**Testing requirements:** unit tests per rule (each rule code fires under its exact trigger condition and only that condition); rule-version snapshot test (changing thresholds doesn't alter historical assessments).

**Definition of done:** every risk tier shown on the dashboard is traceable, in the UI, to the specific rule(s) that produced it.

**Common mistakes:** recalculating historical scores when thresholds change (breaks the audit/versioning guarantee); building scoring logic in more than one place (must be one function, called everywhere a score is needed).

**Do not build yet:** any ML component; dynamic/automated standby pricing.

---

## Phase 8: Recovery

**Objective:** build the full cancellation → backup sourcing → standby offer → activation loop.

**Deliverables:** cancellation logging (reason-coded), backup matching, standby offers, backup acceptance, backup activation, recovery tracking.

**Tasks:** `cancellation_reasons`, `standby_offers` tables; cancellation flow (reason required); backup-sourcing screen (ranked eligible list with explanations); standby-offer send (SMS + mobile-web offer page) with first-accept-wins DB-level enforcement; activation flow (manual or auto per program config); recovery-status tracking through to `recovered`.

**Dependencies:** Phase 5 (assignments), Phase 6 (messaging), Phase 7 (risk engine can pre-trigger sourcing before an explicit cancellation).

**Testing requirements:** first-accept-wins concurrency test (§3.4 rule 5) — send the same offer to 3 simulated drivers, accept from 2 near-simultaneously, assert exactly one winner and correct messages to the rest; "no backup available" path test.

**Definition of done:** a canceled primary results in a ranked backup list, a sent offer, an accepted offer, and an activated backup, all visible on the occurrence timeline with correct coverage-status transitions at each step.

**Common mistakes:** enforcing first-accept-wins only in application code (must be a DB-level constraint given real concurrency risk from near-simultaneous webhook deliveries); forgetting to notify non-winning drivers immediately rather than at the end of a batch process.

**Do not build yet:** dynamic pricing, automated sourcing campaigns.

---

## Phase 9: Reporting

**Objective:** make the value of the product visible in numbers.

**Deliverables:** coverage/confirmation/cancellation/recovery metrics (formulas in `14-metrics-pricing-ops-budget.md`), basic exports.

**Tasks:** reporting screen with the core metric set; CSV export; reconciliation check (a script/test that recomputes each metric directly from the event log and compares to the displayed number).

**Dependencies:** Phases 6, 7, 8 (data sources for the metrics).

**Testing requirements:** the reconciliation check above, run against a seeded test dataset with known expected values.

**Definition of done:** every metric on the reporting screen matches an independent manual calculation from raw events.

**Common mistakes:** computing and caching metrics in a way that can drift from the underlying event log (prefer computed-on-read or an explicitly-invalidated cache, never a value that silently goes stale).

**Do not build yet:** advanced trend charts, benchmarking, predictive analytics.

---

## Phase 10: Pilot readiness

**Objective:** everything needed to safely run this with a real paying-eventually customer.

**Deliverables:** security review complete, full test suite green, seed/demo data, onboarding materials, founder support runbook, pilot configuration, feedback collection mechanism.

**Tasks:** run the full security checklist (`12-security-checklist.md` "before design-partner testing" and "before paid production use" tiers); build the persistent seeded demo environment; write the founder's daily runbook (`13-pilot-plan.md`); configure the first real organization/branch; import the first real driver/route CSVs; confirm A2P 10DLC registration is fully complete (not just submitted); set up a feedback-collection mechanism (a simple form or scheduled check-in, not new product surface).

**Dependencies:** all prior phases.

**Testing requirements:** full regression run of every test in `11-testing-strategy.md`, plus a manual walkthrough of every screen in `05-interface-plan.md` by the founder acting as each role.

**Definition of done:** the go/no-go checklist in `13-pilot-plan.md` is fully green.

**Common mistakes:** launching the pilot before 10DLC registration is confirmed complete (messages get carrier-filtered right when it matters most); skipping the manual full-screen walkthrough because automated tests pass (automated tests verify correctness, not that the experience makes sense to a first-time dispatcher).

**Do not build yet:** anything on the post-MVP roadmap (`15-timelines-gates-roadmap.md`).
