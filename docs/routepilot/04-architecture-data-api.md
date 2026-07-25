# 4. Technical Architecture, Data Model, and API Design

## 4.1 Recommended stack (final decision)

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js (App Router) + TypeScript + React | One codebase for UI and server logic (via Server Actions/Route Handlers), huge training data for Claude Code to work with correctly, easy deploy to Vercel |
| Styling/components | Tailwind CSS + shadcn/ui | Fast to build dispatcher-dense screens; shadcn components are copied into the repo (not a black-box dependency), so Claude Code can read and modify them directly |
| Database | PostgreSQL, managed via **Supabase** | Relational integrity for a state-machine-driven domain; Supabase gives managed Postgres + built-in row-level security + auth in one place, appropriate for a solo founder |
| ORM | **Drizzle** | Type-safe, SQL-transparent (you can see and reason about the actual queries, important for a founder who isn't a DB expert and for Claude Code to generate correct migrations), lighter runtime than Prisma |
| Auth | **Supabase Auth** (managed) | Do not hand-roll auth. Managed auth handles password hashing, session/JWT management, invitation flows, and password reset with a fraction of the custom code and risk. Custom auth is not justified at this stage — no requirement in this plan needs anything Supabase Auth doesn't provide (email/password + invitations is sufficient; drivers never authenticate at all). |
| Authorization | Application-layer role checks **and** Postgres RLS (see §4.3) | Defense in depth suited to a solo founder who can't rely on perfect application-code discipline alone |
| Messaging | **Twilio** (SMS + Messaging Service for A2P 10DLC) | Market-standard, well-documented, webhook-based inbound, good test/sandbox tooling |
| Email | **Resend** | Simple transactional email (invitations, password reset, internal alert digests) — not a driver-facing channel in MVP |
| Payments (SaaS billing) | **Stripe**, wired up post-pilot (see budget doc for timing) | Manual invoicing during pilot is fine and recommended; Stripe added once there are ≥2 paying customers |
| Hosting | **Vercel** (app) + Supabase (DB/auth) | Zero-ops deploys, preview environments per PR, generous free/low tier for pilot scale |
| Background jobs/scheduling | **Trigger.dev** (or Vercel Cron + a durable queue if simplicity is preferred — see §4.5 for the explicit recommendation) | Recurring-route checkpoints, message sends, and job retries are the operational heart of this product; needs a real job system, not ad hoc cron |
| Error monitoring | **Sentry** | Free tier sufficient at pilot scale; catches both frontend and background-job errors |
| Product analytics | **PostHog** (self-serve, generous free tier) | Track dispatcher usage patterns (which screens, which actions) without building custom analytics |
| File storage | **Supabase Storage** | Only needed for documents like insurance/background-check attachments; same provider as DB, avoids adding another vendor |

This stack is intentionally boring and widely-documented — every piece of it is something Claude Code has seen thousands of times in training and can generate idiomatic, correct code for, which matters more than any marginal technical advantage of a fancier alternative.

## 4.2 Frontend architecture

- Next.js App Router, Server Components for data-heavy dispatcher screens (dashboard, occurrence detail), Client Components only where interactivity requires it (forms, the message thread, real-time-ish status updates).
- Server Actions for internal mutations (create program, assign driver, send confirmation) instead of a separate REST layer for the internal app — reduces surface area. A small number of true API routes are needed for: Twilio inbound webhooks, and signed driver mobile-web page actions (see §4.6, these must be callable without an authenticated session).
- Driver mobile-web pages are a distinct, lightweight route group (`/d/[token]/...`) with no shared layout/nav from the dispatcher app, minimal JS, and no auth — validated purely by the signed token.
- State: server state via React Server Components + revalidation; no heavy client state library needed at MVP scale.

## 4.3 Multi-tenancy: RLS vs. application-layer scoping

**Recommendation: Postgres Row-Level Security (RLS) as the enforced boundary, with application-layer scoping as a second, redundant layer — not either/or.**

Comparison:

| | Application-layer scoping only | Postgres RLS |
|---|---|---|
| Enforcement point | Every query must remember to add `WHERE organization_id = ?` | Enforced by the database itself, regardless of the query |
| Failure mode | A single missed `WHERE` clause in one query anywhere in the codebase is a cross-tenant data leak | A bug in application code still can't leak data, because the DB rejects/filters rows the connection's role isn't entitled to see |
| Solo-founder risk | High — no code reviewer to catch every query; Claude Code will very occasionally miss a scope clause on a new query, especially under time pressure | Low — the leak is prevented even when a query forgets to scope, because RLS filters at the database level |
| Cost | None beyond code discipline | Slightly more setup (policies per table), and app must set the tenant context per request (Supabase supports this via the authenticated session's JWT claims) |

Given a solo founder with no second reviewer, RLS is the right default: it converts "a missed WHERE clause" from a data breach into a non-issue. Application-layer scoping is kept as well (every query still explicitly filters by `organization_id`) purely for query performance and clarity, but RLS is what actually prevents a leak.

**How it's enforced:**
- Every tenant-owned table has an `organization_id` column and an RLS policy: `USING (organization_id = current_setting('app.current_org_id')::uuid)` (or the equivalent using Supabase's `auth.jwt()` claims if the org id is embedded in the session claim).
- The app sets the tenant context at the start of each request from the authenticated user's session before any query runs.
- Service-role/background-job connections (which need cross-tenant access, e.g., the occurrence-generation job running for all orgs) use a separate, explicitly-audited path that bypasses RLS deliberately — never the same connection used to serve user requests.

**How it's tested:** a required test (see `11-testing-strategy.md`) creates two organizations, seeds data in each, authenticates as a user in org A, and asserts that every list/detail query returns zero rows belonging to org B, including by directly attempting to fetch org B's record IDs by guessing/enumerating them.

## 4.4 Background jobs and scheduling

This product lives on time-based triggers, so this is treated with the same rigor as the database.

- **Scheduler:** a durable job/queue system (Trigger.dev, or Supabase's `pg_cron` + a queue table if minimizing vendor count is preferred for the pilot) rather than a single Vercel Cron function directly performing the work — occurrence generation, checkpoint firing, and message sending all need retry, idempotency, and observability that raw cron doesn't give you.
- **Job idempotency:** every job run is keyed (e.g., `(job_type, target_id, scheduled_for)`) and checks/writes a `scheduled_jobs` row before doing work, inside the same transaction as its side effect where possible, so a duplicate run (retry, redeploy racing a cron tick, manual re-trigger) is a no-op rather than a double-send.
- **Retry policy:** transient failures (provider timeout, DB contention) retry with exponential backoff, capped (e.g., 5 attempts over ~30 minutes); a job still failing after that is marked `failed` and surfaced on an internal job-health dashboard/alert — never retried forever silently.
- **Late-run behavior:** if a checkpoint job runs later than scheduled (e.g., a provider outage delayed it by 2 hours), it should still fire correctly rather than skip — but if it's so late that firing would violate quiet hours or the route has already departed, the job checks current context (not just "was I supposed to run") before sending, and logs a distinct "late/suppressed" event rather than sending a nonsensical message.
- **Missed-job detection:** a lightweight heartbeat check (e.g., a scheduled job that asserts "every checkpoint due in the last hour has a corresponding attempt") feeds the messaging-observability dashboard (§4.9) so a silently-stuck scheduler is caught quickly, not discovered when a customer complains no one got texted.

## 4.5 Messaging, webhooks, file storage — architecture summary (full design in `07-messaging-design.md`)

- Twilio Messaging Service for outbound/inbound SMS; a single webhook endpoint receives inbound messages and delivery-status callbacks.
- Every outbound send is preceded by writing an `outbound_messages` row with a unique idempotency key `(recipient_phone, trigger_type, occurrence_id or offer_id)` — the send function checks for an existing row before calling Twilio, so retries can't double-send (outbox pattern, detailed in `07-messaging-design.md`).
- Webhook handler deduplicates using the provider's message SID recorded in `webhook_events` before processing — a duplicate delivery is logged but not reprocessed.
- File storage (Supabase Storage) holds driver-uploaded documents (insurance, background-check proof) if collected; access is via signed URLs scoped to the org, never public buckets.

## 4.6 Signed, expiring driver links

- Driver mobile-web pages are addressed by a signed token (e.g., a JWT or HMAC-signed opaque token) encoding `{organization_id, driver_id, occurrence_id or offer_id, purpose, expires_at}`.
- Verified server-side on every request; expired or tampered tokens return a generic "This link has expired — please contact your dispatcher" page, never a stack trace or data.
- Tokens are single-purpose (a disclosure-page token can't be replayed against the standby-offer endpoint) and short-lived relative to their purpose (e.g., a confirmation link expires at the checkpoint deadline).
- No page ever exposes another driver's or another organization's data — enforced by the token's scope plus a server-side re-check against current DB state (not just trusting the token's claims blindly, in case underlying data changed).

## 4.7 Logging, monitoring, analytics, testing, deployment, environments, backups, security controls

- **Logging:** structured application logs (request id, org id, user id where applicable) shipped to the hosting platform's log viewer; `audit_logs`/`coverage_events` are the durable business-event log, separate from operational logs.
- **Monitoring:** Sentry for errors (frontend + background jobs) with alerting; a messaging-observability view (delivery-failure alerts, undelivered-message counts, job-health/heartbeat status) as a first-class internal dashboard, not an afterthought — see §4.9.
- **Analytics:** PostHog for internal usage (which dispatcher screens/actions are used) — never tracks driver-identifying behavior beyond what's operationally needed.
- **Testing:** Vitest/Jest for unit tests, Playwright for end-to-end (including the driver mobile-web flow), a dedicated suite for multi-tenant isolation and state-machine transitions (full plan in `11-testing-strategy.md`).
- **Deployment:** Vercel, auto-deploy previews per pull request; Claude Code opens PRs, founder reviews and merges (per `10-ai-workflow.md`).
- **Environments:** local (Docker/local Supabase), staging (real Twilio test/sandbox credentials, seeded test org), production, and a **persistent seeded demo environment** (fixed demo org with realistic-looking routes/drivers/history) kept stable for sales conversations — never the same environment as staging, so a bug fix in staging doesn't accidentally reset the demo.
- **Backups:** Supabase automated daily Postgres backups (point-in-time recovery on the paid tier, budgeted for once a paying customer exists) with a periodic **restore test** (quarterly at minimum) — an untested backup is not a backup.
- **Security controls:** see `12-security-checklist.md` for the full, staged checklist.

## 4.8 Data model

Notes before the table: all tenant-owned tables carry `organization_id` (and usually `branch_id`); all carry `created_at`/`updated_at`; primary keys are UUIDs. "MVP" column marks whether the table is essential for MVP (E) or can wait (P = post-MVP).

| Entity | MVP | Purpose | Key fields | Relationships | Indexes | Constraints | Sensitive data |
|---|---|---|---|---|---|---|---|
| `organizations` | E | Tenant root | name, plan, status | has many branches | — | — | Billing contact info |
| `branches` | E | Operating location/unit | org_id, name, timezone | belongs to org; has many programs/users | `(organization_id)` | timezone required (drives local-time scheduling) | — |
| `users` | E | Internal humans (admin/manager/dispatcher) | org_id, branch scope, email, role | via managed auth identity | `(organization_id, email unique)` | — | Email |
| `roles` | E | Role definitions | name, permission set | assigned to users | — | fixed enum acceptable for MVP (admin/branch_manager/dispatcher) | — |
| `drivers` | E | Driver entity | org_id, branch_id, name, phone (E.164), status | has vehicles, qualifications, commitments, assignments | `(organization_id, phone unique)` | phone normalized/validated | Phone (PII) |
| `driver_contact_methods` | O (fold into `drivers.phone` for MVP; separate table if multiple numbers/email needed) | Alternate contact channels | driver_id, type, value, is_primary | belongs to driver | `(driver_id)` | — | Phone/email (PII) |
| `vehicles` | E | Vehicle capability data | driver_id, class, capacity, dimensions | belongs to driver | `(driver_id)` | — | — |
| `qualifications` | E | Qualification type catalog | org_id, name, requires_expiration | referenced by driver_qualifications, route_requirements | — | — | — |
| `driver_qualifications` | E | Driver's status per qualification | driver_id, qualification_id, status, expires_at | driver × qualification | `(driver_id, qualification_id)` | expiration checked by risk engine | Background-check status (sensitive) |
| `driver_availability` | O | Days/times driver is generally available | driver_id, days, time windows | belongs to driver | `(driver_id)` | — | — |
| `driver_preferences` | O (minimal set E: service area, max distance, min compensation) | Soft-match preferences | driver_id, service_area, max_distance, min_compensation, commodity_exclusions | belongs to driver | `(driver_id)` | — | — |
| `delivery_programs` | E | Recurring program container | org_id, branch_id, name | has route templates | `(branch_id)` | — | — |
| `route_templates` | E | Recurring route's fixed shape | program_id, stops (json/structured), pay, duration, disclosure_text | has requirements, recurrence rules, occurrences | `(program_id)` | — | Customer-specific contract terms (confidential to org) |
| `route_requirements` | E | Hard/soft requirements for a template | route_template_id, qualification_id or vehicle_class, is_hard | belongs to template | `(route_template_id)` | — | — |
| `route_recurrence_rules` | E | Recurrence definition | route_template_id, days_of_week, start_date, end_date, checkpoint_offsets | belongs to template | `(route_template_id)` | — | — |
| `route_occurrences` | E | Specific dated instance | route_template_id, date, local_departure_time (UTC-stored), coverage_status | belongs to template; has assignments, checkpoints, events | `(route_template_id, date)` unique, `(coverage_status)` | status only mutated via transition function | — |
| `driver_commitments` | E | Driver's agreement to a recurring route | driver_id, route_template_id, scope (dates/recurrence agreed), status | driver × template | `(driver_id, route_template_id)` | — | — |
| `assignments` | E | Driver assigned to a specific occurrence | occurrence_id, driver_id, role (primary/backup), status | occurrence × driver | `(occurrence_id, role)` partial unique on active primary | at most one active primary per occurrence | — |
| `confirmation_checkpoints` | E | Scheduled confirmation checkpoint | occurrence_id, type (day_before/same_day), due_at (UTC) | belongs to occurrence | `(occurrence_id, type)` unique, `(due_at)` for job scans | idempotent per occurrence+type | — |
| `confirmation_responses` | E | Driver's response to a checkpoint | checkpoint_id, response_type, received_at, source (sms/web) | belongs to checkpoint | `(checkpoint_id)` | — | — |
| `coverage_events` | E | State-machine transition log (source of truth history) | occurrence_id, from_status, to_status, trigger, actor, accepted (bool), rejection_reason | belongs to occurrence | `(occurrence_id, created_at)` | append-only | — |
| `cancellation_reasons` | E | Reference list of reason codes | org_id (or global), code, label | referenced by assignments/events | — | — | — |
| `backup_pools` | O (can be a derived query for MVP rather than a materialized table — see note below) | Curated eligible-backup list per program/template | program_id or template_id, driver_id | — | `(template_id, driver_id)` | — | — |
| `standby_offers` | E | Offer sent to a backup candidate | occurrence_id, driver_id, compensation, status, expires_at | occurrence × driver | `(occurrence_id)` partial unique on accepted winner | first-accept-wins enforced here | — |
| `outbound_messages` | E | Every outbound SMS attempt | recipient_phone, trigger_type, occurrence_id/offer_id, idempotency_key (unique), status, provider_sid | — | `(idempotency_key)` unique | prevents double-send | Phone (PII) |
| `inbound_messages` | E | Every inbound SMS, raw + parsed | from_phone, body, parsed_intent, matched_context_id, received_at | — | `(from_phone, received_at)` | — | Phone, message content (PII) |
| `webhook_events` | E | Raw provider webhook payloads | provider_event_id (unique), payload, processed_at | — | `(provider_event_id)` unique | dedup source | — |
| `scheduled_jobs` | E | Job run records for idempotency/observability | job_type, target_id, scheduled_for, status, attempts | — | `(job_type, target_id, scheduled_for)` unique | idempotency enforcement point | — |
| `risk_assessments` | E | Computed risk score + explanation snapshot | occurrence_id or assignment_id, tier, score, rule_version, inputs_snapshot (json), computed_at | belongs to occurrence/assignment | `(occurrence_id, computed_at)` | immutable snapshot per computation | — |
| `risk_factors` | E | Individual rule hits contributing to a score | risk_assessment_id, rule_code, points, explanation | belongs to assessment | `(risk_assessment_id)` | — | — |
| `route_outcomes` | E | Final outcome of a completed occurrence | occurrence_id, outcome (completed/failed/canceled/no_show), recorded_by | belongs to occurrence | `(occurrence_id)` unique | — | — |
| `audit_logs` | E | General admin/config audit trail | org_id, actor, action, entity, before/after (json) | — | `(organization_id, created_at)` | — | May contain any field changed |
| `notification_preferences` | O | Dispatcher/manager alert preferences | user_id, channel, thresholds | belongs to user | `(user_id)` | — | — |
| `consent_records` | E | SMS consent capture | driver_id, consented_at, method, opted_out_at | belongs to driver | `(driver_id)` | required before first send | Consent evidence (compliance-relevant) |

Note on `backup_pools`: for MVP, recommend **not** materializing a separate pool table; instead compute eligible backups on demand from `driver_qualifications` + `driver_preferences` + `route_requirements` (a query, not a stored list). Introduce a materialized/curated pool table post-MVP if branch managers want to hand-curate a specific short list beyond what qualification-matching produces.

### Tables essential for MVP vs. can wait

**Essential (build in MVP):** organizations, branches, users, roles, drivers, vehicles, qualifications, driver_qualifications, driver_preferences (minimal), delivery_programs, route_templates, route_requirements, route_recurrence_rules, route_occurrences, driver_commitments, assignments, confirmation_checkpoints, confirmation_responses, coverage_events, cancellation_reasons, standby_offers, outbound_messages, inbound_messages, webhook_events, scheduled_jobs, risk_assessments, risk_factors, route_outcomes, audit_logs, consent_records.

**Can wait (post-MVP):** driver_contact_methods (start with a single phone field on `drivers`), driver_availability (start with preferences only), backup_pools (start as a query), notification_preferences (start with one fixed alert behavior).

## 4.9 API and service design

Internal actions are Server Actions (Next.js) unless noted as an API route (needed for webhooks and unauthenticated driver pages). Each entry: method/path pattern, required role, input, output, validation, side effects, audit events, likely failure conditions.

| Action | Role | Input | Output | Side effects | Failure conditions |
|---|---|---|---|---|---|
| `createProgram` | Branch Manager | name, branch_id | program record | audit log entry | duplicate name (soft warning, not blocked) |
| `createRouteTemplate` | Branch Manager | program_id, disclosure fields, requirements | template record | audit log entry | missing required disclosure fields |
| `generateRouteOccurrences` (job, not user-invoked) | System | recurrence_rule_id, window | inserted occurrences | none beyond insert | duplicate generation (must be no-op) |
| `importDriversCsv` | Branch Manager/Admin | CSV file | preview: rows to create/update/skip with errors | (on confirm) bulk insert/update | malformed rows, duplicate phone numbers, missing required columns |
| `importRoutesCsv` | Branch Manager | CSV file | preview + (on confirm) templates+recurrence created | audit log entry | malformed recurrence pattern, missing disclosure fields |
| `recordDriverQualification` | Dispatcher/Manager | driver_id, qualification_id, status, expires_at | updated record | recalculates eligible-backup queries live (no stored cache to invalidate) | invalid/past expiration date |
| `inviteDriverToRoute` | Dispatcher | driver_id, route_template_id, occurrence scope | commitment record (proposed), outbound message queued | occurrence → `primary_proposed`; `POST /api/webhooks/twilio` will later resolve | driver already committed elsewhere in conflicting slot (warn, don't block) |
| `acceptCommitment` (driver-facing, via SMS parse or signed web action) | Driver (no auth — token/reply) | token or matched inbound message | commitment accepted, assignment created | occurrence → `committed`; coverage_event written | expired token, occurrence no longer in a state that accepts this (see §3.2 invalid transitions) |
| `declineCommitment` | Driver | token or inbound message | commitment declined | occurrence → `unassigned`; dispatcher notified | same as above |
| `assignPrimaryDriver` | Dispatcher | occurrence_id, driver_id | assignment record | coverage_event | driver not qualified (hard block), occurrence already has an active primary (must supersede explicitly, not silently) |
| `addBackupCandidate` | Dispatcher | occurrence_id or template_id, driver_id | assignment (role=backup) | audit log entry | driver not qualified (hard block) |
| `sendConfirmation` (mostly job-invoked; also a manual "send now" action) | Dispatcher (manual) / System (scheduled) | occurrence_id, checkpoint_type | outbound_message queued, checkpoint marked sent | occurrence → `confirmation_pending` | idempotency key collision (must no-op, not error loudly) |
| `recordSmsResponse` (webhook handler, `POST /api/webhooks/twilio/inbound`) | System (Twilio) | Twilio webhook payload | inbound_message stored, intent parsed, transition attempted or routed to needs-review | coverage_event (if valid transition) or needs-review entry | duplicate webhook delivery (dedup via provider event id), out-of-context reply (§3.4) |
| `cancelAssignment` | Dispatcher (or Driver via SMS/web) | occurrence_id, driver_id, reason_code | assignment canceled | occurrence → `primary_canceled`; coverage_event | missing reason code (must be required, not optional) |
| `findEligibleBackups` | Dispatcher | occurrence_id | ranked list with explanations | none (read) | zero eligible backups (return empty with explanation, not an error) |
| `sendStandbyOffers` | Dispatcher | occurrence_id, driver_ids[], compensation | standby_offers created, messages queued | occurrence → `backup_offered` | sending to a driver already offered/active elsewhere at an overlapping time (warn) |
| `activateBackup` (also auto-invoked on accept if program configured for auto-activate) | Dispatcher / System | standby_offer_id | assignment updated, other offers superseded | occurrence → `recovered`; coverage_event; supersede messages sent | race with a second acceptance (DB-level first-wins enforcement, §3.4) |
| `updateRouteOutcome` | Dispatcher | occurrence_id, outcome | route_outcomes record | occurrence → terminal status; driver reliability recalculated on read | outcome recorded twice (must be idempotent/upsert) |
| `calculateRisk` (system, triggered on relevant events; also a manual "recalculate" for debugging) | System / Dispatcher (view only) | occurrence_id or assignment_id | risk_assessment + risk_factors | none beyond insert (assessments are immutable snapshots) | stale rule version mismatch (must record rule_version used) |
| `loadDashboard` | Dispatcher | branch_id, date range | today/tomorrow coverage, at-risk list, needs-review queue | none (read) | — |
| `getDriverPage` (API route, signed token) | Driver (token) | signed token | disclosure/confirmation/offer/availability page data | logs page view | expired/invalid/tampered token (generic error page, no data leak) |

Every mutating action performs: (1) role/permission check, (2) tenant-scope check (redundant with RLS), (3) input validation, (4) the domain write inside a transaction that also writes the relevant `coverage_events`/`audit_logs` row, so state and audit trail can never drift apart.
