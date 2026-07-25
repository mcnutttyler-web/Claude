# 9. Ordered Claude Code Task Backlog

Give these to Claude Code **one at a time**, in this order. Run `/clear` between tasks. Each task is sized to complete, review, test, and commit independently within one focused session. Tasks that touch migrations, auth, tenancy, or messaging must go through plan mode (see `10-ai-workflow.md`) before implementation — this is marked explicitly per task.

Numbering matches the phases in `08-development-phases.md` (Task 1.x = Phase 1, etc.). Phase 0 has no coding tasks (see that phase's task list in the phases document).

---

## Task 1.1 — Project scaffold, CLAUDE.md, and CI baseline

**Objective:** Establish the Next.js + TypeScript + Supabase + Drizzle project skeleton with linting, formatting, testing, and CI wired up.

**Context:** Nothing exists yet; every later task depends on a consistent, working baseline and a CLAUDE.md that describes it accurately.

**Files likely affected:** `package.json`, `tsconfig.json`, `next.config.ts`, `.eslintrc`, `.prettierrc`, `CLAUDE.md`, `.github/workflows/ci.yml`, `drizzle.config.ts`, `app/` skeleton.

**Implementation instructions:** This is Task 1 of the whole project and is spelled out in full, with plan-mode instructions, in `16-first-actions-first-task.md` — use that exact prompt.

**Data changes:** none yet (no schema).

**Validation:** N/A.

**Tests:** a trivial passing test to prove the test runner works; CI runs lint + typecheck + test on push.

**Acceptance criteria:** `npm run dev` boots a blank Next.js app; `npm run lint`, `npm run typecheck`, `npm test` all pass locally and in CI.

**Manual verification:** open the deployed preview URL, confirm a blank page loads with no console errors.

**Commit message:** `chore: scaffold Next.js/TypeScript/Drizzle project with CI baseline`

---

## Task 1.2 — Database schema: organizations, branches, users, roles [PLAN MODE — migration]

**Objective:** Create the foundational multi-tenant tables.

**Context:** Every other table hangs off `organizations`/`branches`; this must be right before anything else is built.

**Files likely affected:** `db/schema/organizations.ts`, `db/schema/branches.ts`, `db/schema/users.ts`, `db/schema/roles.ts`, `db/migrations/0001_*.sql`.

**Implementation instructions:** Explore the data model in `04-architecture-data-api.md` §4.8. Define Drizzle schema for `organizations` (id, name, plan, status, timestamps), `branches` (id, organization_id FK, name, timezone, timestamps), `users` (id, organization_id FK, email, role, timestamps — auth identity itself lives in Supabase Auth, this table stores app-level profile/role), `roles` as a fixed enum (`admin`, `branch_manager`, `dispatcher`) rather than a table for MVP simplicity. Generate and review the migration before applying.

**Data changes:** new tables as above; unique index on `(organization_id, email)` for users; `branches.timezone` required (IANA timezone string).

**Validation:** timezone must be a valid IANA string; email format validated.

**Tests:** schema-level test that a branch cannot be created without an organization; a users row cannot be created without a valid role enum value.

**Acceptance criteria:** migration applies cleanly to a fresh database; rollback works.

**Manual verification:** run the migration locally, inspect the tables in Supabase Studio, confirm columns/types/constraints match the schema doc.

**Commit message:** `feat(db): add organizations, branches, users, roles schema`

---

## Task 1.3 — Row-level security policies and tenant-scoping test harness [PLAN MODE — tenancy]

**Objective:** Enforce tenant isolation at the database layer for every table added so far, and establish the reusable two-org isolation test pattern used for every future table.

**Context:** Per `04-architecture-data-api.md` §4.3, RLS is the enforced tenant boundary; this must be in place before any data-bearing feature is added, not retrofitted later.

**Files likely affected:** `db/migrations/0002_*.sql` (RLS policies), `test/helpers/tenant-isolation.ts`, `test/tenant-isolation.test.ts`.

**Implementation instructions:** Add `ENABLE ROW LEVEL SECURITY` and a `USING (organization_id = current_setting('app.current_org_id')::uuid)` policy to `branches` and `users`. Add a request-scoped helper that sets `app.current_org_id` from the authenticated session at the start of each server action. Build a reusable test helper that creates two orgs with data and asserts cross-org reads return zero rows.

**Data changes:** RLS policies only, no new tables.

**Validation:** N/A (this is the validation layer itself).

**Tests:** the two-org isolation test, plus a negative test that a request with no tenant context set returns zero rows (fail-closed, not fail-open).

**Acceptance criteria:** a user authenticated in org A cannot read org B's branch or user records via any code path, including by directly guessing an ID.

**Manual verification:** in Supabase Studio, run a query as the anon/authenticated role with org A's context set and confirm org B's rows are invisible.

**Commit message:** `feat(security): enforce RLS tenant isolation and add isolation test harness`

---

## Task 1.4 — Managed auth integration (sign in, invite, password reset)

**Objective:** Wire Supabase Auth into the app for the three internal-user auth flows.

**Context:** Per architecture decision, auth is managed, not hand-rolled.

**Files likely affected:** `app/(auth)/sign-in/`, `app/(auth)/reset-password/`, `app/(auth)/invite/[token]/`, `lib/auth.ts`.

**Implementation instructions:** Integrate Supabase Auth's email/password flow. Sign-in page posts to Supabase Auth, establishes a session, sets `app.current_org_id` for subsequent requests from the user's `users` row. Invitation flow: an admin action creates a Supabase Auth invite + a pending `users` row; the invited user lands on `/invite/[token]`, sets a password, and the `users` row activates. Password reset uses Supabase Auth's built-in reset-email flow.

**Data changes:** none beyond existing `users` table (add a `status` column: `invited`/`active`/`disabled` if not already present).

**Validation:** invitation tokens single-use and expiring; generic error messages (no user enumeration) on sign-in/reset failures.

**Tests:** integration tests for sign-in success/failure, invite-accept, password-reset request+completion.

**Acceptance criteria:** a new user can be invited by an admin, accept the invite, sign in, and sign out; a forgotten password can be reset.

**Manual verification:** manually invite a test email, walk through accept → sign in → sign out → forgot password → reset, in a browser.

**Commit message:** `feat(auth): integrate managed auth for sign-in, invitations, and password reset`

---

## Task 1.5 — Role-based authorization checks + audit log foundation

**Objective:** Add a shared authorization-check utility used by every mutation, and the `audit_logs` table + helper.

**Context:** Per MVP scope, permission checks must be server-side, not UI-only, and every mutation must be auditable from day one.

**Files likely affected:** `lib/authorize.ts`, `db/schema/audit-logs.ts`, `lib/audit.ts`.

**Implementation instructions:** Build `requireRole(session, allowedRoles[])` used at the top of every server action. Build `writeAuditLog({orgId, actorId, action, entity, before, after})` and call it from the auth-related mutations added so far (invite, role change).

**Data changes:** `audit_logs` table (organization_id, actor_id, action, entity_type, entity_id, before jsonb, after jsonb, created_at).

**Validation:** a server action invoked by a role not in its allowlist returns a 403-equivalent, never a silent no-op.

**Tests:** a dispatcher-role session attempting an admin-only action is rejected; an audit log row is created for an invite and a role change.

**Acceptance criteria:** every mutating action added in Tasks 1.4+ has both a role check and an audit log entry.

**Manual verification:** attempt an admin action while signed in as a lower-privileged test user, confirm rejection; inspect `audit_logs` after an invite.

**Commit message:** `feat(auth): add server-side authorization checks and audit logging foundation`

---

## Task 2.1 — Minimal route occurrence + checkpoint schema (walking skeleton) [PLAN MODE — migration]

**Objective:** Create the smallest possible schema needed to schedule one confirmation for one route occurrence.

**Context:** This is the start of the walking skeleton (Phase 2) — deliberately minimal, will be widened in Phase 4/6.

**Files likely affected:** `db/schema/route-occurrences.ts`, `db/schema/confirmation-checkpoints.ts`, migration file.

**Implementation instructions:** Create a stripped `route_occurrences` (id, organization_id, branch_id, label text, occurrence_date, departure_at_utc, coverage_status text) and `confirmation_checkpoints` (id, occurrence_id, type, due_at_utc, status). No templates/recurrence yet — occurrences are created directly for this phase.

**Data changes:** two new tables, RLS applied per Task 1.3's pattern.

**Validation:** `coverage_status` constrained to a small enum subset for now (`unassigned`, `committed`, `confirmation_pending`, `confirmed`).

**Tests:** RLS isolation test extended to the new tables (reuse the Task 1.3 helper).

**Acceptance criteria:** a route occurrence and a checkpoint can be created and are tenant-isolated.

**Manual verification:** insert a test occurrence via a seed script, confirm it's visible only within its own org's session.

**Commit message:** `feat(db): add minimal route occurrence and checkpoint schema for walking skeleton`

---

## Task 2.2 — Minimal driver + assignment schema (walking skeleton)

**Objective:** Add just enough driver/assignment structure to attach one driver to one occurrence.

**Context:** Full driver modeling is Phase 3; this task only needs a phone number and a link to an occurrence.

**Files likely affected:** `db/schema/drivers.ts`, `db/schema/assignments.ts`.

**Implementation instructions:** Minimal `drivers` (id, organization_id, name, phone E.164, status) and `assignments` (id, occurrence_id, driver_id, role, status).

**Data changes:** two tables; unique index on `(organization_id, phone)`.

**Validation:** phone stored/validated in E.164 format.

**Tests:** phone-format validation test; RLS isolation test.

**Acceptance criteria:** a driver can be created and assigned to the occurrence from Task 2.1.

**Manual verification:** seed one driver, assign to the occurrence, confirm via a DB query.

**Commit message:** `feat(db): add minimal driver and assignment schema for walking skeleton`

---

## Task 2.3 — Twilio outbound send with idempotency [PLAN MODE — messaging]

**Objective:** Send one real SMS confirmation checkpoint message via Twilio, safely.

**Context:** This is the riskiest external integration in the product; must be correct from the first message.

**Files likely affected:** `lib/messaging/send.ts`, `db/schema/outbound-messages.ts`, `lib/messaging/twilio-client.ts`.

**Implementation instructions:** State assumptions about which Twilio credentials/test mode to use before writing code (staging sandbox only, no real driver numbers). Create `outbound_messages` (id, organization_id, recipient_phone, trigger_type, occurrence_id, idempotency_key unique, status, provider_sid, created_at). `sendMessage()` writes the row first (unique constraint on idempotency_key), then calls Twilio, then updates status — if a row already exists for the key, no-op.

**Data changes:** `outbound_messages` table.

**Validation:** idempotency key required and unique; recipient phone validated.

**Tests:** calling `sendMessage()` twice with identical arguments results in exactly one Twilio API call (mock the client and assert call count).

**Acceptance criteria:** a real SMS is received on a staging test phone when the function is invoked manually.

**Manual verification:** run the send function against Twilio staging credentials pointed at the founder's own phone; confirm exactly one text arrives even if the function is invoked twice in a row.

**Commit message:** `feat(messaging): add idempotent Twilio outbound send`

---

## Task 2.4 — Twilio inbound webhook with dedup [PLAN MODE — messaging]

**Objective:** Receive and record a real inbound SMS reply.

**Files likely affected:** `app/api/webhooks/twilio/inbound/route.ts`, `db/schema/inbound-messages.ts`, `db/schema/webhook-events.ts`.

**Context:** Inbound handling is the other half of the walking skeleton's riskiest path.

**Implementation instructions:** Verify the Twilio webhook signature. Write the raw payload to `webhook_events` keyed by provider message SID (unique) before any processing — if the SID already exists, return 200 immediately without reprocessing. Otherwise, insert into `inbound_messages` and hand off to a (still-minimal) keyword parser.

**Data changes:** `webhook_events`, `inbound_messages` tables.

**Validation:** webhook signature must verify or the request is rejected.

**Tests:** posting the same webhook payload twice results in exactly one `inbound_messages` row; an invalid signature is rejected.

**Acceptance criteria:** texting "YES" from a staging test phone produces one `inbound_messages` row with the raw body.

**Manual verification:** send a real text from a personal phone to the staging Twilio number, confirm it lands in the DB exactly once.

**Commit message:** `feat(messaging): add inbound Twilio webhook with signature verification and dedup`

---

## Task 2.5 — Minimal state machine + scheduled checkpoint job [PLAN MODE — migration touches status logic]

**Objective:** Implement the small state-machine subset needed for the walking skeleton and a job that fires a checkpoint.

**Files likely affected:** `lib/state-machine/transition.ts`, `db/schema/coverage-events.ts`, `jobs/fire-checkpoint.ts`.

**Implementation instructions:** Implement `transition(occurrenceId, event)` validating against a small transition table (`unassigned→committed→confirmation_pending→confirmed`) and writing a `coverage_events` row for every attempt (accepted or rejected). Build a scheduled job (Trigger.dev task or equivalent) that, for checkpoints due now, calls `sendMessage` (Task 2.3) and transitions the occurrence to `confirmation_pending`; keyed by `(job_type, occurrence_id, scheduled_for)` in a `scheduled_jobs` table so re-runs are no-ops.

**Data changes:** `coverage_events`, `scheduled_jobs` tables.

**Validation:** an invalid transition attempt is logged with `accepted: false`, status unchanged.

**Tests:** running the checkpoint job twice sends exactly one message; an out-of-order event (e.g., "confirm" before "committed") is rejected and logged.

**Acceptance criteria:** the job fires once, sends once, and a subsequent "YES" webhook reply transitions the occurrence to `confirmed`.

**Manual verification:** manually trigger the job against a seeded occurrence, then reply "YES" from a real phone, and check the occurrence's status updated.

**Commit message:** `feat(state-machine): implement minimal transition function and scheduled checkpoint job`

---

## Task 2.6 — Minimal dashboard + full walking-skeleton E2E test

**Objective:** Show the occurrence's live status on a screen, and prove the entire loop end-to-end automatically.

**Files likely affected:** `app/dashboard/page.tsx`, `test/e2e/walking-skeleton.spec.ts`.

**Implementation instructions:** Build a bare dashboard listing occurrences with their current `coverage_status`. Write a Playwright test that: seeds one org/branch/driver/occurrence/checkpoint, triggers the job, simulates the Twilio inbound webhook with a "YES" payload, and asserts the dashboard shows `confirmed`.

**Data changes:** none.

**Validation:** N/A.

**Tests:** the E2E test above; run it 3 consecutive times to confirm no flakiness.

**Acceptance criteria:** the walking skeleton (schedule → SMS → reply → state change → dashboard) is proven end-to-end by an automated test that runs in CI.

**Manual verification:** watch the E2E test run; separately, do one fully manual pass (real phone, real staging Twilio number) and confirm the dashboard updates within a few seconds of replying.

**Commit message:** `test: add end-to-end walking skeleton test and minimal dashboard`

---

*(Walking skeleton complete. Everything below widens one layer at a time.)*

---

## Task 3.1 — Full driver profile schema (vehicles, qualifications, preferences)

**Objective:** Widen the driver model from the walking-skeleton minimum to the full MVP shape.

**Files likely affected:** `db/schema/vehicles.ts`, `db/schema/qualifications.ts`, `db/schema/driver-qualifications.ts`, `db/schema/driver-preferences.ts`.

**Implementation instructions:** Add `vehicles` (driver_id, class, capacity), `qualifications` (org-level catalog: name, requires_expiration), `driver_qualifications` (driver_id, qualification_id, status, expires_at), `driver_preferences` (driver_id, service_area, max_distance, min_compensation). Extend the existing `drivers` table with any missing fields (address/service-area anchor) rather than creating a duplicate table.

**Data changes:** four new tables as above.

**Validation:** `expires_at` required when the qualification type `requires_expiration`.

**Tests:** a driver with an expired hard-required qualification is excluded from an eligibility query (stub the query now, full version in Task 5.x).

**Acceptance criteria:** a driver profile can carry a vehicle, one or more qualifications with expiration dates, and preferences.

**Manual verification:** create a test driver with an expiring qualification, confirm the expiration displays correctly.

**Commit message:** `feat(drivers): add vehicle, qualification, and preference schema`

---

## Task 3.2 — Driver list and profile screens

**Objective:** Build the dispatcher-facing driver management UI.

**Files likely affected:** `app/drivers/page.tsx`, `app/drivers/[id]/page.tsx`.

**Implementation instructions:** List screen with search/filter by qualification and vehicle class. Profile screen showing contact info, vehicle, qualifications (expiring/expired visually flagged), preferences, and (empty for now) commitment/message history sections to be filled in by later tasks.

**Data changes:** none.

**Validation:** filters use the same underlying query logic that will be reused for backup matching (avoid duplicating filter logic).

**Tests:** component test that an expired qualification renders a visible warning state.

**Acceptance criteria:** a dispatcher can find a driver by qualification and view their full profile.

**Manual verification:** browse to the driver list, filter by a qualification, open a profile.

**Commit message:** `feat(drivers): add driver list and profile screens`

---

## Task 3.3 — Driver CSV import (validation preview + commit)

**Objective:** Bulk-import drivers from a spreadsheet, treated as a first-class MVP feature.

**Files likely affected:** `app/drivers/import/page.tsx`, `lib/import/drivers-csv.ts`.

**Implementation instructions:** Upload → parse → column-mapping UI → per-row validation (required fields, phone format, duplicate detection against existing drivers) → preview table showing create/update/error per row → explicit commit step. Errors on individual rows must not block importing the valid rows.

**Data changes:** none beyond existing `drivers`/`vehicles`/`driver_qualifications` inserts.

**Validation:** duplicate phone numbers within the file and against existing records are flagged, not silently merged or silently duplicated.

**Tests:** import a fixture CSV with 100 valid rows + 10 deliberately broken rows (missing phone, bad format, duplicate); assert exactly 100 succeed and 10 are reported individually with the right error message.

**Acceptance criteria:** a realistic messy CSV imports correctly with an accurate preview before commit.

**Manual verification:** import a real (anonymized/synthetic) sample spreadsheet shaped like what a pilot customer would provide.

**Commit message:** `feat(import): add driver CSV import with validation preview`

---

## Task 4.1 — Delivery program and route template schema [PLAN MODE — migration]

**Objective:** Model the recurring-program container and the route template's full disclosure fields.

**Files likely affected:** `db/schema/delivery-programs.ts`, `db/schema/route-templates.ts`, `db/schema/route-requirements.ts`.

**Implementation instructions:** `delivery_programs` (org/branch, name). `route_templates` (program_id, stops description, pay, duration, disclosure_text, checkpoint offsets config). `route_requirements` (route_template_id, qualification_id or vehicle_class, is_hard boolean).

**Data changes:** three tables.

**Validation:** a template cannot be marked "ready to generate occurrences" without all disclosure fields populated.

**Tests:** attempting to generate occurrences from an incomplete template is rejected with a clear error.

**Acceptance criteria:** a complete template with hard and soft requirements can be created.

**Manual verification:** create a template in the UI (built next task) end to end.

**Commit message:** `feat(programs): add delivery program and route template schema`

---

## Task 4.2 — Route recurrence rules + idempotent occurrence generation job [PLAN MODE — migration + job]

**Objective:** Turn a recurrence rule into real, correctly-dated `route_occurrences`, safely re-runnable.

**Files likely affected:** `db/schema/route-recurrence-rules.ts`, `jobs/generate-occurrences.ts`.

**Implementation instructions:** `route_recurrence_rules` (route_template_id, days_of_week, start_date, end_date nullable). Widen `route_occurrences` (from the Task 2.1 minimal version) to reference `route_template_id` and inherit disclosure fields. Generation job computes the rolling window (e.g., next 4 weeks) and inserts occurrences keyed by `(route_template_id, occurrence_date)` unique — re-running is a no-op for already-generated dates.

**Data changes:** new `route_recurrence_rules` table; `route_occurrences` gets `route_template_id`, unique constraint on `(route_template_id, occurrence_date)`.

**Validation:** recurrence rule requires at least one day of week.

**Tests:** running the generation job twice for the same rule produces no duplicate occurrences; a cross-timezone branch generates checkpoints at correct UTC instants.

**Acceptance criteria:** creating a Mon/Wed/Fri rule produces the correct next-4-weeks occurrence dates, idempotently.

**Manual verification:** create a rule, run the job, inspect generated occurrences' dates and times.

**Commit message:** `feat(programs): add recurrence rules and idempotent occurrence generation`

---

## Task 4.3 — Program/template management UI + route CSV import

**Objective:** Give branch managers the screens to configure programs/templates, and bulk-import routes.

**Files likely affected:** `app/programs/`, `app/programs/[id]/templates/[templateId]/page.tsx`, `lib/import/routes-csv.ts`.

**Implementation instructions:** Program list/detail, template create/edit (disclosure fields, requirements, recurrence, checkpoint timing, backup defaults), and a CSV import flow for routes mirroring Task 3.3's pattern (preview, per-row errors, explicit commit).

**Data changes:** none beyond existing tables.

**Validation:** same disclosure-completeness rule as Task 4.1 enforced in the UI, not just the API.

**Tests:** route CSV import fixture test (mirrors Task 3.3).

**Acceptance criteria:** a branch manager can create a full program/template by hand, and separately bulk-import routes from a spreadsheet.

**Manual verification:** create one program manually and import a second one from a sample CSV; confirm both generate occurrences correctly.

**Commit message:** `feat(programs): add program/template management UI and route CSV import`

---

## Task 5.1 — Driver commitments + invitation flow [PLAN MODE — tenancy/state touches]

**Objective:** Let a dispatcher invite a driver to a recurring route and record their commitment.

**Files likely affected:** `db/schema/driver-commitments.ts`, `lib/actions/invite-driver.ts`.

**Implementation instructions:** `driver_commitments` (driver_id, route_template_id, scope jsonb — which dates/days agreed, status). Invitation action sends the "initial route opportunity" + disclosure message (per `07-messaging-design.md` templates) with a signed link (Task 5.2 builds the page itself).

**Data changes:** `driver_commitments` table.

**Validation:** cannot invite a driver who fails a hard requirement (surfaced as a blocking warning, not silently allowed).

**Tests:** inviting a driver missing a hard-required qualification is rejected with a clear reason.

**Acceptance criteria:** an invitation creates a commitment record in `proposed` status and queues the disclosure message.

**Manual verification:** invite a seeded test driver, confirm the commitment row and the queued message.

**Commit message:** `feat(commitments): add driver commitment schema and invitation flow`

---

## Task 5.2 — Signed link infrastructure + driver disclosure mobile-web page [PLAN MODE — auth/tenancy pattern]

**Objective:** Build the signed, expiring token system and the first driver-facing page.

**Files likely affected:** `lib/signed-links.ts`, `app/d/[token]/disclosure/page.tsx`.

**Implementation instructions:** State assumptions about token format (recommend a signed JWT with `{org_id, driver_id, occurrence_id or template_id, purpose, exp}`) before implementing. Build token issue/verify helpers. Build the disclosure page: server-verifies token, re-checks current DB state (not just token claims), renders route details in plain language, accept/decline buttons call the same commitment-transition logic as an SMS reply would.

**Data changes:** none (token is stateless + verified against existing tables).

**Validation:** expired/invalid/tampered tokens show a generic error page with zero data exposure.

**Tests:** an expired token is rejected; a token scoped to driver A cannot be replayed to view driver B's data (attempt this explicitly in a test, not just trust the claim).

**Acceptance criteria:** a driver can open the link from a text, see full disclosure, and accept/decline, producing the identical state transition as the SMS path.

**Manual verification:** on a real phone with throttled network (Chrome DevTools network throttling), load the page and confirm it's fast and legible; attempt to tamper with the token and confirm graceful rejection.

**Commit message:** `feat(driver-web): add signed link infrastructure and disclosure page`

---

## Task 5.3 — Primary assignment logic + eligible-backup query [PLAN MODE — concurrency-sensitive]

**Objective:** Enforce one active primary per occurrence and build the reusable eligible-driver query.

**Files likely affected:** `lib/actions/assign-primary.ts`, `lib/matching/eligible-drivers.ts`, migration adding a partial unique index.

**Implementation instructions:** Add a DB-level partial unique index enforcing at most one active primary assignment per occurrence (do not rely on application-level checks alone, per the concurrency rules in `03-workflows-state-machine.md`). Build `findEligibleDrivers(occurrenceId)`: hard-filter (qualifications unexpired, vehicle class, service area if hard) then soft-rank (service area centrality, compensation fit, length fit, historical reliability) with a rendered explanation per candidate.

**Data changes:** partial unique index on `assignments (occurrence_id) WHERE role = 'primary' AND status = 'active'`.

**Validation:** assigning a second active primary is rejected at the DB layer even under simulated concurrent requests.

**Tests:** concurrency test — fire two simultaneous `assignPrimary` calls for the same occurrence with different drivers, assert exactly one succeeds; eligible-drivers test confirms hard-requirement exclusions match displayed explanations exactly.

**Acceptance criteria:** the walking-skeleton flow now runs against the full assignment/matching logic instead of the Phase-2 stub.

**Manual verification:** attempt (via two browser tabs or a script) to assign two different primaries to the same occurrence at once; confirm only one wins and the other sees a clear conflict message.

**Commit message:** `feat(assignments): enforce single-primary constraint and add eligible-driver matching`

---

## Task 6.1 — Full checkpoint model + keyword-first inbound parser [PLAN MODE — messaging]

**Objective:** Replace the walking-skeleton's minimal checkpoint/parsing logic with the full day-before/same-day model and real keyword parsing.

**Files likely affected:** `lib/messaging/parse-reply.ts`, `jobs/fire-checkpoint.ts` (widen), template content per `07-messaging-design.md`.

**Implementation instructions:** Widen `confirmation_checkpoints.type` to support configurable offsets from the template. Build `parseReply(inboundMessage, openContext)`: normalize text, match against the canonical keyword set scoped to the specific open context (most recent unanswered outbound message to that phone), return a typed intent or `unparseable`. Unparseable replies never trigger a transition.

**Data changes:** none beyond what Task 2.1/2.5 already added (widen enum values).

**Validation:** matching is scoped to context — the same keyword must resolve differently depending on what was asked.

**Tests:** table-driven test of the full keyword variant list (YES/Y/1/CONFIRM/OK vs NO/N/2/CANCEL, case/punctuation variations) against each context type; a free-text reply ("can't make it, car broke down") is correctly classified as unparseable, not guessed.

**Acceptance criteria:** every message type in `07-messaging-design.md` §7.1 has a working scheduled/triggered send and, where applicable, a working reply parse.

**Manual verification:** text a variety of phrasings from a real phone and confirm correct classification, including at least one genuinely ambiguous message landing in needs-review.

**Commit message:** `feat(messaging): implement full checkpoint scheduling and keyword-first reply parsing`

---

## Task 6.2 — Needs-review queue

**Objective:** Give dispatchers a first-class screen to resolve unparsed/out-of-context replies.

**Files likely affected:** `app/dashboard/needs-review/`, `lib/actions/resolve-needs-review.ts`.

**Implementation instructions:** List unparsed/out-of-context `inbound_messages` with full thread context; dispatcher can manually apply an interpretation (which calls the same transition functions a correct auto-parse would) or send a manual reply.

**Data changes:** add a `needs_review` boolean/status field to `inbound_messages` (or derive from `parsed_intent IS NULL`).

**Validation:** resolving an item requires an explicit dispatcher action; nothing here auto-resolves.

**Tests:** an unparsed reply appears in the queue; resolving it as "confirm" produces the same transition as a correctly-parsed "YES" would have.

**Acceptance criteria:** zero false negatives on a test set of ambiguous messages (every one appears in the queue).

**Manual verification:** send an ambiguous text, confirm it appears on the dashboard, resolve it manually, confirm the occurrence updates.

**Commit message:** `feat(messaging): add needs-review queue for unparsed and out-of-context replies`

---

## Task 6.3 — Consent, opt-out/resubscribe, quiet hours

**Objective:** Add compliance and safety behavior around every send.

**Files likely affected:** `db/schema/consent-records.ts`, `lib/messaging/quiet-hours.ts`, `lib/messaging/opt-out.ts`.

**Implementation instructions:** `consent_records` created before first send to any driver (backfill a "recorded during onboarding" record as part of driver creation/import). STOP/START handled at both the Twilio Messaging Service compliance layer and mirrored into app state. `sendMessage` (Task 2.3) extended to check quiet hours (branch-local time window) and consent/opt-out status before sending, queuing non-urgent sends until the window opens.

**Data changes:** `consent_records` table; `drivers` gets an `opted_out_at` field (or derive from consent records).

**Validation:** no send proceeds without a consent record; an opted-out driver receives zero messages except the resubscribe path.

**Tests:** a send attempted outside quiet hours queues instead of sending; STOP followed by a normal message attempt results in zero sends; START after STOP re-enables sending.

**Acceptance criteria:** the safety rails in `07-messaging-design.md` §7.4 are enforced by code, not just documented.

**Manual verification:** text STOP from a real phone, confirm no further messages arrive; text START, confirm messaging resumes.

**Commit message:** `feat(messaging): add consent capture, opt-out handling, and quiet hours enforcement`

---

## Task 6.4 — Frequency caps, spend guardrails, and kill switch [PLAN MODE — messaging safety-critical]

**Objective:** Add the hard safety limits that must exist before any real driver receives a message.

**Files likely affected:** `lib/messaging/guardrails.ts`, `app/admin/messaging-settings/page.tsx`.

**Implementation instructions:** Per-driver rolling-24h message count check before send. Org-wide and platform-wide kill-switch flags checked at the point of actual provider call. Daily spend counter per org with alert threshold and automatic throttling of non-critical message types at the cap.

**Data changes:** a `messaging_settings` table or fields (kill_switch_enabled, daily_budget_cents) per org and a platform-level equivalent; a `message_spend_log` or derived count from `outbound_messages`.

**Validation:** the kill switch, once enabled, blocks sends even for already-queued outbox rows.

**Tests:** exceeding the per-driver frequency cap blocks the Nth+1 send; enabling the kill switch mid-test blocks a send that was about to fire; exceeding the daily budget throttles non-critical sends but (per design) can still allow a configured critical-only allowance if that's the chosen policy — assert whatever policy was decided in plan mode.

**Acceptance criteria:** every guardrail in `07-messaging-design.md` §7.3 is enforced and independently testable.

**Manual verification:** flip the kill switch in the admin UI and confirm a manual send attempt is blocked with a clear message.

**Commit message:** `feat(messaging): add frequency caps, spend guardrails, and kill switch`

---

## Task 6.5 — Full message thread UI + manual dispatcher send

**Objective:** Show the complete two-way thread on the occurrence detail screen, with manual send capability.

**Files likely affected:** `app/occurrences/[id]/page.tsx`, `app/occurrences/[id]/thread/`.

**Implementation instructions:** Render `outbound_messages` + `inbound_messages` for the occurrence in chronological order, visually distinguishing system vs. dispatcher-authored messages. Manual-send box routes through the same `sendMessage` function (and therefore the same guardrails) as system messages.

**Data changes:** none.

**Validation:** manual sends are subject to the same quiet-hours/frequency-cap/kill-switch checks as system sends — no bypass path.

**Tests:** a manual send during quiet hours is queued, not sent immediately, same as a system message would be.

**Acceptance criteria:** the full history of a route occurrence's communication is visible in one place, and a dispatcher can intervene manually within the same safety rails.

**Manual verification:** send a manual message from the UI, confirm it appears in the thread and that a real text is delivered (in staging).

**Commit message:** `feat(occurrences): add full message thread UI with manual send`

---

## Task 7.1 — Risk rule engine + rule-version snapshotting [PLAN MODE — touches many event triggers]

**Objective:** Implement the rules-based risk engine from `06-risk-engine.md`.

**Files likely affected:** `lib/risk/rules.ts`, `db/schema/risk-assessments.ts`, `db/schema/risk-factors.ts`.

**Implementation instructions:** Implement each rule in §6.2 as a pure function taking a snapshot of relevant inputs and returning points + explanation. `calculateRisk(occurrenceId)` runs all applicable rules, sums points, maps to a tier (§6.3), and writes an immutable `risk_assessments` row (with `rule_version`) plus its `risk_factors`. Trigger recalculation on: checkpoint response/no-response, cancellation, qualification expiration crossing, and on a periodic sweep for time-based rules (long inactivity).

**Data changes:** `risk_assessments`, `risk_factors` tables.

**Validation:** historical assessments are never mutated when rule thresholds change later — a rule-version bump creates new assessments going forward only.

**Tests:** one test per rule code confirming it fires under its exact condition and only that condition (no false-positive bleed between rules); a test that changing a threshold doesn't alter a previously-stored assessment.

**Acceptance criteria:** every risk tier displayed anywhere in the product is backed by a `risk_assessments` row whose `risk_factors` fully explain it.

**Manual verification:** manufacture a test driver with a recent cancellation and a missed confirmation, confirm the resulting tier and explanation match the rule table exactly.

**Commit message:** `feat(risk): implement rules-based risk engine with explainable, versioned assessments`

---

## Task 7.2 — At-risk dashboard panel + action queue

**Objective:** Surface risk tiers and recommended actions operationally.

**Files likely affected:** `app/dashboard/page.tsx` (extend), `app/dashboard/at-risk/`.

**Implementation instructions:** Add an at-risk panel sorted by tier/score, each entry showing the top contributing `risk_factors` inline; derive a simple recommended-action list ("N routes need backup sourcing," "N drivers unresponsive").

**Data changes:** none.

**Validation:** displayed explanation must match the stored `risk_factors` exactly (render directly from them, don't re-derive text elsewhere).

**Tests:** a component test asserting the rendered explanation text matches the underlying `risk_factors` records for a fixture assessment.

**Acceptance criteria:** a dispatcher can see, for any at-risk route, exactly why it's flagged without leaving the dashboard.

**Manual verification:** browse the dashboard with seeded at-risk data and confirm the panel reads clearly to someone unfamiliar with the rule internals.

**Commit message:** `feat(dashboard): add at-risk panel and recommended-action queue`

---

## Task 8.1 — Reason-coded cancellation flow [PLAN MODE — state machine]

**Objective:** Require a reason code on every cancellation and log it.

**Files likely affected:** `db/schema/cancellation-reasons.ts`, `lib/actions/cancel-assignment.ts`.

**Implementation instructions:** Seed a `cancellation_reasons` reference list. `cancelAssignment` requires a reason code (driver-supplied via SMS keyword mapped to a reason, or dispatcher-entered) before the transition to `primary_canceled` is allowed.

**Data changes:** `cancellation_reasons` table; reason linked from the relevant `coverage_events`/assignment record.

**Validation:** a cancellation transition without a reason code is rejected.

**Tests:** attempting to cancel without a reason fails; canceling with a reason succeeds and is queryable for reporting.

**Acceptance criteria:** every `primary_canceled` transition in the system has an associated reason code, with no exceptions.

**Manual verification:** cancel a test assignment from the UI, confirm the reason prompt is mandatory.

**Commit message:** `feat(recovery): add reason-coded cancellation flow`

---

## Task 8.2 — Standby offers with first-accept-wins enforcement [PLAN MODE — concurrency-critical]

**Objective:** Implement the standby-offer send/accept/supersede flow with database-enforced first-accept-wins.

**Files likely affected:** `db/schema/standby-offers.ts`, `lib/actions/send-standby-offers.ts`, `lib/actions/accept-standby-offer.ts`.

**Implementation instructions:** `standby_offers` (occurrence_id, driver_id, compensation, status, expires_at) with a partial unique index enforcing at most one `accepted` offer per occurrence. `acceptStandbyOffer` is a single transaction: attempt to set this offer to `accepted` (constrained by the unique index), and if it succeeds, atomically set every other offer for the occurrence to `superseded` and queue the "already filled" message to those drivers; if the unique constraint blocks it (another offer already won), return the "already filled" outcome to this driver too.

**Data changes:** `standby_offers` table with the partial unique index.

**Validation:** the win condition is enforced by the database constraint, not application-level ordering.

**Tests:** the exact concurrency scenario from `03-workflows-state-machine.md` §3.4 rule 5 — simulate 3 near-simultaneous accept calls, assert exactly one winner and two "already filled" outcomes, both fired immediately (not batched).

**Acceptance criteria:** no code path can result in two accepted standby offers for the same occurrence, even under real concurrent load.

**Manual verification:** using a script or multiple terminals, fire near-simultaneous accept requests and confirm only one wins.

**Commit message:** `feat(recovery): add standby offers with database-enforced first-accept-wins`

---

## Task 8.3 — Backup sourcing screen + activation flow

**Objective:** Give dispatchers the UI to find, offer, and activate backups.

**Files likely affected:** `app/occurrences/[id]/backups/page.tsx`, `lib/actions/activate-backup.ts`.

**Implementation instructions:** Reuse `findEligibleDrivers` (Task 5.3) for the ranked candidate list with per-candidate explanations; compensation input pre-filled from template default; send-offer button; offer-status tracker; activation button (or auto-activate if program configured) that finalizes the assignment and transitions the occurrence to `recovered`.

**Data changes:** none beyond existing.

**Validation:** activation only allowed from `backup_accepted` status (state-machine enforced).

**Tests:** full recovery-path integration test: cancel primary → source backups → send offers → accept → activate → assert `recovered` status and correct audit trail.

**Acceptance criteria:** the entire Recovery workflow (`03-workflows-state-machine.md`) runs end-to-end through the UI.

**Manual verification:** cancel a seeded test occurrence's primary, walk through sourcing/offering/accepting (simulate the driver side via a test script or a second phone), confirm recovery.

**Commit message:** `feat(recovery): add backup sourcing screen and activation flow`

---

## Task 9.1 — Reporting screen with reconciled metrics

**Objective:** Build the core metrics screen and prove every number reconciles against raw events.

**Files likely affected:** `app/reporting/page.tsx`, `lib/reporting/metrics.ts`, `test/reporting/reconciliation.test.ts`.

**Implementation instructions:** Implement the metric formulas from `14-metrics-pricing-ops-budget.md` (coverage rate, confirmation rate, cancellation rate, recovery rate, no-show rate, time-to-recover). Compute on read from `coverage_events`/`route_outcomes`, not a separately-maintained cache.

**Data changes:** none beyond `route_outcomes` (add if not already present from Task 8.x).

**Validation:** N/A (read-only).

**Tests:** seed a dataset with known expected values for each metric; assert the displayed numbers match an independently-computed expectation in the test.

**Acceptance criteria:** every number on the reporting screen is provably correct against the underlying event log for the test dataset.

**Manual verification:** manually count outcomes in a small seeded dataset and compare by hand to the displayed metrics.

**Commit message:** `feat(reporting): add core metrics screen with reconciliation tests`

---

## Task 10.1 — Seed script + persistent demo environment

**Objective:** Build a realistic seed dataset usable for both testing and sales demos.

**Files likely affected:** `scripts/seed-demo.ts`.

**Implementation instructions:** Generate a fictional org with a realistic branch, ~15 route templates, ~40 drivers with varied qualification/reliability profiles, a mix of coverage statuses across occurrences, and some historical outcomes so reporting isn't empty. Idempotent (safe to re-run against the demo environment without duplicating).

**Data changes:** none (data only).

**Validation:** re-running the seed script against an already-seeded demo environment does not duplicate records.

**Tests:** a test asserting the seed script is idempotent.

**Acceptance criteria:** the persistent demo environment looks like a real, small delivery operator's data at a glance.

**Manual verification:** run the seed script against the staging/demo project, browse the dashboard and reporting screens as if giving a live demo.

**Commit message:** `chore: add idempotent demo seed script`

---

## Task 10.2 — Full security checklist pass and go/no-go review

**Objective:** Work through `12-security-checklist.md`'s pre-production tier and close every open item.

**Files likely affected:** varies — likely small fixes across auth, rate limiting, error messages, webhook verification.

**Implementation instructions:** Go through the checklist item by item; for each unmet item, make the smallest change that satisfies it (e.g., add rate limiting to the webhook endpoint, scrub stack traces from user-facing error responses). Do not add unrelated hardening beyond the checklist's actual items.

**Data changes:** none expected.

**Validation:** N/A.

**Tests:** any new tests implied by a fixed item (e.g., a rate-limit test if one was added).

**Acceptance criteria:** every item in the "before paid production use" tier of the security checklist is checked off with a note on how it was verified.

**Manual verification:** the founder walks the checklist manually against the running staging environment before pilot launch.

**Commit message:** `fix(security): close pre-production security checklist items`

---

Beyond Task 10.2, remaining pilot-readiness work (dispatcher training materials, the founder runbook, real customer configuration) is operational, not coding — see `13-pilot-plan.md`.
