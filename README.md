# RoutePilot

RoutePilot is a reliability-control layer for recurring delivery routes. It is **not** a driver
marketplace, load board, TMS, or route optimizer — it helps delivery operators keep the drivers
they already have committed, prepare qualified backup coverage, recover failed assignments
quickly, and give shippers a clear, plain-language view of whether their routes are covered.

This repository contains a working MVP: **Layer 1 (Operator Reliability Operations)** fully
implemented, **Layer 2 (limited Shipper Reliability Visibility)** fully implemented, and a data
model deliberately shaped so **Layer 3 (Cross-Operator Reliability Infrastructure)** can be added
later without a rewrite — but no cross-operator features are exposed today.

> The unrelated `kitty-kong.html` file at the repo root predates this project and was left in
> place untouched.

## 1. Architecture summary

- **Backend**: Node.js + TypeScript + Express + Prisma ORM, in `server/`.
- **Database**: SQLite for zero-dependency local/dev/CI use (`server/prisma/dev.db`). The schema
  avoids Postgres-only features (see Known limitations) so migrating the `datasource` block to
  Postgres for production is a config change, not a rewrite.
- **Frontend**: React + TypeScript + Vite, in `web/`. Three surfaces in one app: an operator
  console, a shipper console, and a token-based driver page (no native app).
- **Messaging**: A provider-agnostic `SmsProvider` interface (`server/src/messaging/`) with a
  credential-free `FakeSmsProvider` used by default, so the whole product runs without any paid
  SMS account. A real provider (Twilio, etc.) plugs in behind the same interface.
- **Domain logic** lives in `server/src/domain/*.ts` as framework-free, testable modules — the
  Express routes in `server/src/routes/*.ts` are thin wrappers that enforce auth/tenant scope and
  call into domain functions. This is where the actual product rules (full disclosure, adaptive
  checkpoints, the risk-tier engine, backup activation, recovery, cancellation diagnostics,
  metrics) live.

## 2. Product flows implemented

- **Full-disclosure acceptance** (`domain/fullDisclosure.ts`): every route has versioned detail
  snapshots; offers show material details before acceptance; acceptance requires the literal
  language *"I reviewed the route details and want this route."*; a material change after
  acceptance flips the assignment to `ACK_REQUIRED`, notifies the driver, and requires renewed
  acknowledgment — the original acceptance record is never overwritten.
- **Route ownership & continuity** (`domain/ownership.ts`): recurring ownership with a route
  streak, planned time off that never removes ownership, and a temporary-replacement pointer for
  covering only the affected occurrences.
- **Adaptive commitment checkpoints** (`domain/checkpoints.ts`): full sequence
  (T-24 / evening / pre-departure) by default; an established, 8-consecutive-week streak on a
  non-critical route earns down to a single T-24 reconfirmation. Escalation after a grace period
  feeds the risk engine.
- **Explainable commitment-risk engine** (`domain/riskEngine.ts`): four tiers
  (green/yellow/orange/red), each with plain-language reasons, a recommended dispatcher action,
  and a rule version — no numeric score, ever, and never shown to drivers or shippers directly.
- **Shipper-safe state mapping** (`domain/shipperState.ts`): maps internal state to the
  shipper-only vocabulary (`OFFER_PENDING` → … → `READY_FOR_PICKUP`), independent of the internal
  tier vocabulary.
- **Backups & one-action activation** (`domain/backups.ts`): backup offer workflow, and a
  transactional activation that locks the occurrence (preventing a duplicate activation race),
  preserves the original assignment untouched, and creates a new `REPLACEMENT` assignment that
  goes through its own full-disclosure acceptance.
- **Recovery Queue** (`domain/recovery.ts`): auto-opens on a primary cancellation, tracks
  candidates with the full status vocabulary from the spec (never force-disqualifying
  "unavailable today"), and resolves when a replacement accepts.
- **Reason-coded cancellations** (`domain/cancellations.ts`): avoidable/unavoidable classification
  across all required categories (economic, informational, logistical, behavioral, unavoidable
  event), feeding both the risk engine and the streak logic.
- **Reliability metrics & scorecards** (`domain/metrics.ts`): committed-driver retention (the
  primary metric, defined exactly as specified), original-driver start rate, avoidable/unavoidable
  cancellation rates, named-backup coverage, backup activation rate, median recovery time,
  on-time pickup rate, route completion rate, recurring-driver retention, full-disclosure
  acceptance rate — computed for operator reports and shipper scorecards from the same function.
- **Messaging compliance** (`messaging/consent.ts`, `domain/messagingService.ts`): consent
  status/source/timestamp, opt-out via STOP/UNSUBSCRIBE/CANCEL/END/QUIT, re-opt-in via START,
  quiet-hour suppression computed in the driver's local timezone for routine check-ins (route
  offers and urgent operational notices are not deferred to quiet hours — see Assumptions).
- **Dispatcher event suppression**: the Coverage Board and Recovery Queue only surface
  orange/red/at-risk/open items; the Operations Dashboard's "exceptions" list is the alert feed,
  not a wall of green routes.
- **Shipper pilot mode**: `ShipperOrganization.pilotStatus` (`none` / `baseline` /
  `intervention`), toggled via `POST /api/admin/feature-flags/shipper-pilot-mode`.

## 3. Files created or changed

Everything under `server/` and `web/` is new. Top-level: `package.json` (npm workspaces),
`.gitignore`, this `README.md`. `kitty-kong.html` is unrelated pre-existing content and was not
touched.

```
server/
  prisma/schema.prisma        # full data model (see below)
  prisma/seed.ts               # realistic multi-operator seed data
  src/domain/*.ts               # business logic (see section 2)
  src/messaging/*.ts            # SMS provider abstraction + fake provider
  src/auth/*.ts                 # JWT auth, RBAC/tenant middleware, secure driver links
  src/routes/*.ts               # Express routers: auth, operator, shipper, driver, webhooks, admin
  src/app.ts, src/index.ts      # app wiring + checkpoint scheduling tick
  tests/*.test.ts               # vitest suite (see section 8)
web/
  src/pages/operator/*          # Operations Dashboard, Coverage Board, Routes, Drivers,
                                 # Driver Pools, Recovery Queue, Cancellations, Shippers,
                                 # Reports, Incentives, Settings
  src/pages/shipper/*           # Reliability Dashboard, Routes, Providers, Exceptions, Scorecards
  src/pages/DriverLinkPage.tsx  # token-based driver page (no native app)
  src/layouts/*, src/api.ts, src/styles.css
```

## 4. Database schema and migrations

The full model is in `server/prisma/schema.prisma`, covering every entity in the spec's suggested
data model (organizations/branches/shippers/relationships, users, drivers, driver pools &
memberships, credentials, routes, route detail versions, route occurrences, route ownership,
assignments, checkpoints, risk-tier events, versioned risk rules, backup arrangements, recovery
cases & candidates, cancellation events, incentive programs & ledger, messages, shipper commitment
status, shipper scorecards, audit events). One migration exists:
`server/prisma/migrations/20260724025231_init`.

**Note on `Json` columns**: Prisma's SQLite connector has no native JSON type, so every
spec'd "flexible object" field (preferences, compensation, snapshots, metrics, etc.) is stored as
a `String` and (de)serialized at the boundary via `server/src/domain/json.ts`. Moving to Postgres
in production, these should become native `Json` columns — a schema/migration change, not an
application-logic change.

## 5. Setup instructions

Requires Node.js 20+.

```bash
npm install                          # installs both workspaces (server + web)

cd server
cp .env.example .env
npx prisma migrate dev               # creates server/prisma/dev.db and applies the schema
npm run seed                         # populates realistic demo data (see below)
npm run dev                          # API on http://localhost:4000

# in a second terminal
cd web
npm run dev                          # UI on http://localhost:5173 (proxies /api to :4000)
```

Open `http://localhost:5173` and sign in with any seeded account (all use password
`password123`) — see the login screen for a couple of examples, or the seed output for the full
list. Driver secure links are logged to the server console by the fake SMS provider (each looks
like `[fake-sms] -> +1555...: ... http://localhost:5173/r/<token>`); open that URL directly to see
the driver-facing full-disclosure/checkpoint/backup-offer experience.

## 6. Environment variables

`server/.env` (see `server/.env.example`):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | SQLite file, e.g. `file:./dev.db` (resolved relative to `server/prisma/`) |
| `JWT_SECRET` | Signs both session tokens and driver secure-link tokens |
| `PORT` | API port (default 4000) |
| `SMS_PROVIDER` | `fake` (default) — the only provider implemented; see Known limitations |
| `WEB_BASE_URL` | Base URL used when building driver secure links (default `http://localhost:5173`) |

`web/vite.config.ts` proxies `/api` to `http://localhost:4000`; no web-side env vars are required
for local dev.

## 7. Seed instructions

`cd server && npm run seed` (safe to re-run against a fresh migration; it does not delete
existing data first — recreate the DB file if you want a clean reset).

The seed creates: 1 platform org, 2 operators, 3 branches, 2 shippers (one in `pilot_status:
intervention`, one in `baseline`), 3 operator↔shipper relationships (including one shipper served
by both operators, previewing Layer 3), 32 drivers (mixed consent states, timezones, vehicle
types), 7 driver pools, 22 recurring routes across all four criticality levels, a 14-day window of
route occurrences (66 fully simulated through real full-disclosure/checkpoint/risk-engine logic,
plus ~160 additional scheduled-only occurrences to satisfy the volume requirement without an
unreasonable seed runtime), route ownerships with streaks/trial status/planned time
off/temporary replacement, backup arrangements (offered, accepted, activated), recovery cases in
every status, cancellation events across all four categories plus unavoidable events, incentive
programs and ledger entries, and generated shipper scorecards. All four commitment-risk tiers are
guaranteed to appear (verified after seeding).

## 8. Test instructions

```bash
cd server
npm test        # vitest: 8 files, 29 tests, run against an isolated server/prisma/test.db
```

`vitest.config.ts` runs a `globalSetup` that resets and migrates a dedicated SQLite test database,
independent of your dev database. Coverage includes: tenant isolation (cross-operator, branch
scoping, shipper visibility, raw cancellation notes and driver pay never reaching the shipper
API), full-disclosure acceptance and the exact required language, renewed acknowledgment after a
material change preserving original acceptance history, planned time off preserving ownership,
streak reset on avoidable failure, adaptive checkpoint earned-down vs. full sequence, checkpoint
escalation, quiet-hour math in the driver's timezone, STOP/START opt-out handling, risk-tier
transitions and shipper-state mapping, backup activation (original assignment preserved,
duplicate-activation prevention), automatic recovery-case creation on cancellation, metrics
correctness (committed-driver retention denominator, median recovery time), secure-link
expiration, and incentive-ledger tracking without any payment execution path.

Type-checking: `npx tsc -p tsconfig.json --noEmit` in `server/`, `npx tsc -b --noEmit` in `web/`
— both currently pass clean.

## 9. Security notes

- **Tenant isolation** is enforced at the query layer: every operator route scopes by
  `req.auth.operatorId` (and by `branchId` when the caller is a branch-scoped
  dispatcher/branch-manager); every shipper route scopes by `req.auth.shipperId` and additionally
  requires the operator to have explicitly marked the route `shipperVisible`.
- **Shipper responses are shape-limited, not just filtered**: the shipper API never queries
  driver identity, pay, or raw cancellation reason/note fields into the response payload — those
  fields simply aren't selected, rather than being selected and hidden.
- **Driver auth** is a short-lived (3-day), single-purpose signed token embedded in the secure
  link (`purpose: 'DRIVER_LINK'`), distinct in shape from operator/shipper session tokens so one
  can't be replayed as the other. Expired links return `410 Gone`.
- **IDs**: Prisma `cuid()`s are used everywhere instead of sequential integers.
- **Audit log**: material changes (route changes, consent changes, cancellations, backup
  activation, risk-rule updates) write to `AuditEvent` with before/after state.
- **Passwords**: bcrypt-hashed; JWT-based session auth.
- **Timestamps**: stored in UTC (Prisma `DateTime`); the UI renders local time, and quiet-hour and
  T-24 calculations use the driver's/operator's configured timezone rather than server time.

## 10. Known limitations

- **SQLite in dev**: fine for this MVP and for CI, but production should move the Prisma
  `datasource` to Postgres (converting the string-backed "Json" columns to native `Json`, and the
  string-backed shipper-visibility `contains` filter in `routes/shipper.ts` to a proper JSON/boolean
  query — currently a pragmatic substring match that works only because the app itself always
  writes that field in one exact shape).
- **Only the fake SMS provider is implemented.** The `SmsProvider` interface and config plumbing
  (`SMS_PROVIDER` env var) are ready for a Twilio adapter, but no real provider is wired up, and
  inbound webhook signature verification (`verifyWebhookSignature`) is a stub that trusts
  everything in dev — a real provider's implementation must verify the vendor's signature.
  Non-emergency messages are also blocked outright by quiet hours or missing consent, with no
  deferred-retry queue; a production build would want to actually re-attempt suppressed sends in
  the next allowed window rather than only logging why a send was skipped.
- **No real-time scheduler.** Checkpoint sending/escalation runs on a 60-second `setInterval` in
  the dev process (`server/src/index.ts`) plus a manual `/api/operator/tick` endpoint — production
  should replace this with a proper scheduled job (cron/queue).
- **Frontend covers the full nav with working create/read flows**, but some operator settings
  screens (e.g. checkpoint-policy and cancellation-reason-code configuration UI) are read-only or
  minimal; the underlying data model and API support them, but a full CRUD UI wasn't built out for
  every settings sub-screen in this pass.
- **No file/document attachments, CSV import/export, or PDF scorecard export** — scorecards are
  generated and stored as structured JSON snapshots, viewable in the UI, but not exported.
- **Single hardcoded default risk-rule set** (`DEFAULT_RISK_RULES` in `riskEngine.ts`); the
  versioned `RiskRuleVersion` model and settings endpoint exist so operators can override it, but
  only a few rule parameters (streak threshold, cancellation lookback window, pre-departure
  escalation behavior) are actually rule-driven today — the tier logic itself is code, not a fully
  data-driven rule DSL.

## 11. Assumptions

- **Quiet hours apply to routine check-ins, not to the route offer itself.** The spec ties quiet
  hours to messaging compliance broadly but also frames checkpoints specifically as "requests."
  A dispatcher-initiated route/backup offer and a time-sensitive material-change notice are
  treated as operationally necessary and are not deferred to quiet hours; the T-24/evening/
  pre-departure automated check-in *nudges* are.
- **"14+ days of route occurrences"** is satisfied by generating occurrences across a 14-day
  window for every recurring route, but only a bounded subset per route (≤3 near-term occurrences)
  is run through the full acceptance/checkpoint/risk simulation during seeding, to keep seed
  runtime reasonable; the rest exist as scheduled rows. This is a seed-time tradeoff, not a
  product limitation — any occurrence can be fully worked through the real API.
- **Recovery cases created by backup activation or candidate sourcing resolve only once the
  replacement driver actually accepts** (their own full-disclosure flow) — consistent with "no
  overwritten assignments" and "renewed acknowledgment where necessary," but it means some seeded
  recovery cases remain `BACKUP_ACTIVATED`/`SOURCING` rather than `RESOLVED`, which is realistic
  in-progress state rather than a bug.
- **Branch scoping** assumes a dispatcher/branch-manager has at most one `branchId`; multi-branch
  assignment for a single user isn't modeled.
- **Compensation and driver pay** are visible to the operator and to the driver on their own offer
  (as the spec requires for full disclosure) but are never queried in any shipper-facing endpoint.

## 12. Recommended next phase

**Not** a marketplace. The two highest-leverage next steps, in order:

1. **Improved shipper scorecards + pilot comparison reporting.** The data model and metrics
   function already support baseline-vs-intervention comparison (`ShipperOrganization.pilotStatus`
   plus `computeReliabilityMetrics` over arbitrary date ranges); the next phase should build the
   actual baseline/intervention comparison view, CSV export, and a scheduled weekly scorecard job,
   since this is the fastest path to proving ROI with the first pilot shipper.
2. **A second operator serving the same shipper, with consistent scorecards.** The schema
   (`OperatorShipperRelationship` is many-to-many; `computeReliabilityMetrics` already takes an
   `operatorId` and can run per-operator for the same shipper) was deliberately built to support
   this without a rewrite. Turning it on for a second real operator — still with no cross-operator
   driver visibility — is the safest way to validate the Layer 3 data model before ever exposing
   cross-operator driver performance, which explicitly requires legal/consent/dispute/accuracy
   safeguards this MVP does not build.

Driver-controlled portable credentials and operator integrations are reasonable follow-ons after
those two, once there's a second live operator to validate the shared-schema assumptions against.
