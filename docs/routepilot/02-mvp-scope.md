# 2. Strict MVP Scope, and What's Explicitly Excluded

The MVP is the smallest system that delivers the core promise for one branch, one dispatcher, one set of recurring routes: **committed drivers stay on their routes, and when one can't, a paid qualified backup is already lined up before the route fails.** Everything below is evaluated against that bar.

Legend: **E** = essential (MVP ships broken without it), **O** = optional (improves MVP, can be cut under time pressure without breaking the core loop), **P** = post-MVP (explicitly deferred).

## 2.1 Feature-by-feature MVP evaluation

### Organization and branch accounts — **E**
- User problem solved: multi-tenant isolation; a customer's data never mixes with another's.
- User role: Administrator (setup), all roles (implicit boundary).
- Required data: `organizations`, `branches` (see data model).
- Main interface: Admin org/branch settings screen.
- Backend logic: every table below carries an `organization_id` (and often `branch_id`); every query is scoped by it.
- Dependencies: none (foundation).
- Acceptance criteria: two orgs created in the same database; user from org A cannot read/write any record belonging to org B, verified by an automated test (see `11-testing-strategy.md`).

### User authentication — **E**
- Problem solved: only known, authorized humans (admins, branch managers, dispatchers) can act.
- Role: all internal roles. (Drivers do **not** authenticate in the MVP — see driver mobile-web pages below.)
- Data: `users`, managed-auth provider's session/identity tables.
- Interface: sign-in, password reset, invitation acceptance screens.
- Backend logic: delegate to managed auth (see architecture doc) rather than hand-rolling.
- Dependencies: organizations/branches (for invitation scoping).
- Acceptance criteria: a user can be invited, set a password, sign in, sign out, and reset a forgotten password end-to-end.

### Role-based permissions — **E**
- Problem solved: a dispatcher shouldn't be able to change org billing; a branch manager shouldn't need to see other branches.
- Role: Administrator configures; all roles are constrained by it.
- Data: `roles`, role assigned on `users` (or a join table if a user can hold multiple roles across branches).
- Interface: user management screen, role selector on invite.
- Backend logic: authorization check on every server action/API route, not just UI-level hiding.
- Dependencies: authentication.
- Acceptance criteria: a dispatcher account attempting an admin-only action is rejected server-side, verified by test — not just hidden in the UI.

### Driver profiles — **E**
- Problem solved: the driver is the entity everything else attaches to (qualifications, assignments, messages, history).
- Role: Dispatcher/Branch Manager manage; Administrator can also.
- Data: `drivers`, `driver_contact_methods`.
- Interface: driver list, driver profile screen.
- Backend logic: phone number uniqueness/normalization within an org (E.164 format), status (active/inactive).
- Dependencies: branches.
- Acceptance criteria: a driver can be created manually and via CSV import, with a normalized, deduplicated phone number.

### Vehicle profiles — **E** (minimal fields only)
- Problem solved: hard requirement matching (a box truck route can't go to a sedan).
- Role: Dispatcher/Branch Manager.
- Data: `vehicles` (class, capacity, linked to driver).
- Interface: part of driver profile, not a separate module in MVP.
- Backend logic: feeds qualification matching (§10 in `06-risk-engine.md` doc references this).
- Dependencies: drivers.
- Acceptance criteria: vehicle class stored and used as a hard filter in backup search.

### Driver qualifications — **E** (structured but minimal: vehicle class, service area, background-check status, insurance status, expiration date)
- Problem solved: prevents assigning/offering a route to an unqualified driver.
- Role: Branch Manager sets requirements; Dispatcher/Admin record driver qualifications.
- Data: `qualifications` (types), `driver_qualifications` (driver × type × status × expiration).
- Interface: qualifications tab on driver profile; requirements section on route template.
- Backend logic: hard-requirement filter in eligible-backup search; expiration check (a risk signal, see `06-risk-engine.md`).
- Dependencies: drivers, route templates.
- Acceptance criteria: a driver missing a hard-required qualification is excluded from eligible-driver and eligible-backup lists, and this is explainable in the UI ("excluded: expired background check").

### Route templates — **E**
- Problem solved: a recurring route's fixed characteristics (stops, pay, vehicle/qualification requirements, disclosure text) shouldn't be re-entered for every occurrence.
- Role: Branch Manager creates.
- Data: `route_templates`, `route_requirements`.
- Interface: template creation/edit screen.
- Backend logic: template is the parent of recurrence rules and occurrences.
- Dependencies: delivery programs, branches.
- Acceptance criteria: a template with full disclosure fields (stops, pay, duration, vehicle/qualification requirements) can be created and later generates occurrences that inherit those fields.

### Recurring schedules (recurrence rules) — **E**
- Problem solved: this is the "recurring" in recurring-route; occurrences must be generated automatically, not hand-created daily.
- Role: Branch Manager.
- Data: `route_recurrence_rules` (days of week, start date, end date/ongoing).
- Interface: schedule configuration on route template.
- Backend logic: a scheduled job materializes future `route_occurrences` from the rule on a rolling window (e.g., always 3–4 weeks out).
- Dependencies: route templates.
- Acceptance criteria: creating a weekly Mon/Wed/Fri rule produces correctly-dated occurrences for the next N weeks, and re-running the generation job is idempotent (no duplicates).

### Route occurrences — **E**
- Problem solved: the actual unit of work — "this specific route, on this specific date" — is what gets assigned, confirmed, and covered.
- Role: system-generated; Dispatcher acts on them.
- Data: `route_occurrences`.
- Interface: occurrence detail screen (§`05-interface-plan.md`).
- Backend logic: carries current coverage status (state machine, `03-workflows-state-machine.md`).
- Dependencies: recurrence rules.
- Acceptance criteria: every occurrence has exactly one coverage status at all times, sourced from the state machine.

### Driver commitments — **E**
- Problem solved: distinguishes "we think this driver will show up" from "this driver explicitly agreed to this recurring route."
- Role: Dispatcher initiates; Driver accepts/declines via SMS/web.
- Data: `driver_commitments` (driver × route template or specific occurrences, scope of recurrence agreed to).
- Interface: commitment/invitation flow, driver disclosure web page.
- Backend logic: an accepted commitment creates/updates an `assignment`.
- Dependencies: route templates, drivers.
- Acceptance criteria: a driver who accepts is recorded with what they agreed to (which dates/recurrence), timestamped, and this record is what "commitment tracking" reports against.

### Primary-driver assignments — **E**
- Problem solved: someone has to be the driver of record for a given occurrence.
- Role: Dispatcher.
- Data: `assignments` (role = primary).
- Interface: occurrence detail screen.
- Backend logic: exactly one primary per occurrence at a time; changing it is a logged state transition.
- Dependencies: commitments.
- Acceptance criteria: an occurrence always resolves to zero or one primary driver, never two.

### Backup-driver pools — **E** (simple: a list of qualified drivers per route/program, not a separate scheduling system)
- Problem solved: the "Recovery" layer needs a pre-vetted candidate list, not a cold search, when a primary cancels.
- Role: Branch Manager curates/approves; Dispatcher uses.
- Data: `backup_pools` (or derived query against qualifications + availability, see architecture doc for the MVP simplification).
- Interface: backup sourcing screen.
- Backend logic: hard-requirement filter (qualifications, vehicle) + soft-preference ranking (§10).
- Dependencies: qualifications, driver preferences.
- Acceptance criteria: for any occurrence, the system can produce a ranked, explainable list of eligible backups within the same request that shows the cancellation.

### Confirmation requests / checkpoints — **E**
- Problem solved: this is "Prevention" — catching a no-show risk before departure, not after.
- Role: system-scheduled per Branch Manager's timing config; Driver responds.
- Data: `confirmation_checkpoints`, `confirmation_responses`.
- Interface: SMS + driver web fallback page.
- Backend logic: scheduled job fires at configured offsets (day-before, same-day); response updates state machine.
- Dependencies: assignments, messaging.
- Acceptance criteria: a checkpoint fires exactly once per (occurrence, checkpoint type) even if the job runs twice (idempotency key), and a response before the deadline changes status; no response by the deadline triggers the "at risk" path.

### SMS responses (inbound handling) — **E**
- Problem solved: this is the confirmation and commitment channel; without reliable inbound handling, the whole loop is one-directional.
- Role: Driver sends; system parses.
- Data: `inbound_messages`, `webhook_events` (raw provider payloads, for dedup).
- Interface: none for driver (native SMS); dispatcher sees the thread in occurrence detail.
- Backend logic: keyword-first parser; unparseable → needs-review queue (never auto-guess on commitment-affecting replies).
- Dependencies: messaging provider, outbound messages (for context/threading).
- Acceptance criteria: YES/NO/1/2 and common variants correctly update state; anything else lands in needs-review with the full thread visible, and zero automatic state change occurs from an unparsed reply.

### Driver mobile-web pages — **E** (route disclosure, accept/decline, confirmation fallback, standby offer)
- Problem solved: some responses (full route disclosure, terms acceptance) are too detailed for SMS alone; some drivers prefer tapping a link to texting back.
- Role: Driver, no login.
- Data: reads from route occurrence/template/offer via a signed, expiring token — no separate driver-content tables beyond what's already modeled.
- Interface: 4 lightweight pages (disclosure, confirmation fallback, standby offer, availability/cancellation) — see `05-interface-plan.md`.
- Backend logic: token validates org/driver/occurrence scope and expiry; action taken on the page writes the same event the SMS reply would.
- Dependencies: assignments, standby offers, signed-link infrastructure.
- Acceptance criteria: page loads in <2s on a throttled mobile connection, expired/invalid tokens show a clear error with no data leakage, and an action taken on the page produces the identical state transition as the SMS equivalent.

### CSV import for drivers and routes — **E** (treated as first-class, not an afterthought)
- Problem solved: every pilot customer already has this data in a spreadsheet; without import, the founder becomes manual data-entry labor for every pilot.
- Role: Branch Manager/Administrator.
- Data: bulk insert into `drivers`, `vehicles`, `route_templates` (and recurrence) from CSV.
- Interface: import screen with column-mapping, validation preview, and per-row error reporting.
- Backend logic: validate before commit (phone format, required fields, duplicate detection); nothing is partially imported silently — show exactly what will be created/skipped before committing.
- Dependencies: drivers, route templates.
- Acceptance criteria: a realistic 100-row driver CSV and a 20-row route CSV import with a clear preview, and rows with errors are reported individually without blocking the valid rows (founder/customer decides commit-anyway vs. fix-and-retry).

### Dispatcher dashboard — **E** (minimal: today/tomorrow coverage, at-risk, needs-review)
- Problem solved: the single screen a dispatcher checks every morning — this is the product's daily habit loop.
- Role: Dispatcher.
- Data: reads across occurrences/checkpoints/risk assessments; writes nothing itself.
- Interface: `05-interface-plan.md`.
- Backend logic: all figures derived from the state machine, never a separately-maintained status.
- Dependencies: everything above.
- Acceptance criteria: an occurrence's dashboard status always matches its underlying state-machine status (no drift), verified by test.

### Coverage statuses — **E** (the state machine itself; see `03-workflows-state-machine.md`)

### Cancellation logging (reason-coded) — **E**
- Problem solved: without a reason code, "why do drivers cancel" (needed for risk signals and reporting) is unanswerable.
- Role: Dispatcher records (driver-given reason via SMS keyword or dispatcher note).
- Data: `cancellation_reasons` (reference list), reason recorded on the relevant `coverage_events`/assignment record.
- Dependencies: assignments, state machine.
- Acceptance criteria: every cancellation transition requires a reason code (dispatcher-entered if the driver didn't provide one), and reason distribution is reportable.

### Risk flags — **E** (rules-based, per `06-risk-engine.md`)

### Standby offers — **E**
- Problem solved: this is the mechanism that actually gets a backup to say yes — a concrete, paid offer, not a vague "can you cover this?"
- Role: Dispatcher triggers (or system auto-suggests); Driver accepts/declines.
- Data: `standby_offers` (occurrence, driver, compensation, expiry, status).
- Interface: standby offer SMS + driver web page; backup sourcing screen for dispatcher.
- Backend logic: first-accept-wins concurrency rule (`03-workflows-state-machine.md`); offer expiry.
- Dependencies: backup pools, messaging.
- Acceptance criteria: sending the same standby offer to 3 drivers and having 2 accept results in exactly one activated backup and two "already filled" notifications, logged.

### Backup activation — **E**
- Problem solved: converts an accepted standby offer into an actual assignment.
- Role: Dispatcher (one click) or automatic-on-accept if configured.
- Data: updates `assignments`, emits a `coverage_events` transition to Recovered.
- Dependencies: standby offers.
- Acceptance criteria: activation is a single, auditable, idempotent action.

### Audit history — **E** (append-only log of every state change and who/what triggered it)
- Problem solved: dispatchers and the founder need to answer "what happened to this route" after the fact, including for disputes with drivers/customers.
- Data: `audit_logs`, `coverage_events`.
- Acceptance criteria: every coverage-status transition and every manual override is reconstructable from the log alone.

### Basic reporting — **E** (coverage rate, confirmation rate, cancellation rate, recovery rate — the metrics in `14-metrics-pricing-ops-budget.md`)
- Interface: simple reporting screen, CSV export acceptable in place of charts if time is tight.
- Acceptance criteria: numbers on the report match a manual count against the underlying event log for a test dataset.

## 2.2 Optional-in-MVP (cut first under time pressure, without breaking the core loop)

- **O** — Attendance streak display (nice-to-have gamification-adjacent signal; the underlying reliability data should still be captured, just not surfaced as a "streak").
- **O** — Weekly schedule reminder message (helpful, not load-bearing; day-before/same-day confirmation are load-bearing).
- **O** — Route-level trend charts (vs. flat numbers/table).
- **O** — Driver preferences beyond the minimum (preferred stop count, preferred distance) — keep only what's needed for backup ranking (service area, max distance, min compensation).
- **O** — Multiple confirmation checkpoints beyond day-before + same-day (e.g., an additional pre-departure check-in) — valuable, added in Phase 6 if time allows, not required for the walking skeleton or even full MVP v1.

## 2.3 Explicitly excluded from MVP (post-MVP, roadmap in `15-timelines-gates-roadmap.md`)

- **P** — Machine-learning risk prediction (rules-based only for v1).
- **P** — LLM-assisted free-text reply parsing (decision gate, not a default; keyword parsing + needs-review queue ships first).
- **P** — Native driver mobile app (link-based mobile-web only).
- **P** — Driver login/authentication (mobile-web pages use signed expiring links, no accounts).
- **P** — Direct customer/TMS/marketplace/telematics integrations (CSV import is the integration layer for the pilot).
- **P** — Route optimization or route planning (RoutePilot manages *commitment and coverage* of routes that already exist; it does not design routes).
- **P** — Driver payments/payroll processing (standby compensation is *tracked and disclosed*, not disbursed by RoutePilot, unless later validated as essential — most pilot customers will pay standby drivers through their existing payroll/1099 process).
- **P** — Voice, WhatsApp, or app-push messaging channels (SMS only).
- **P** — Automated sourcing campaigns / driver recruiting.
- **P** — Advanced/dynamic standby pricing.
- **P** — Document verification / automated onboarding (background-check and insurance *status* is recorded; verifying the underlying documents is a manual/manager step in MVP).
- **P** — Customer-facing APIs.
- **P** — Automated billing/invoicing (manual invoicing during pilot; see `14-metrics-pricing-ops-budget.md` for when to automate).

The line to hold: if a feature does not sit directly on the path "route exists → driver committed → driver confirmed → (if canceled) backup recovered → outcome logged," it is not in the MVP.
