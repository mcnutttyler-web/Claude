# 5. Screen-by-Screen MVP Interface Plan

Conventions: every screen below lists purpose, primary user, main components, main actions, empty/loading/error states, mobile requirements, and acceptance criteria. Dispatcher-facing screens use operational/dispatcher-friendly language; driver-facing screens use plain, simple language (no jargon like "occurrence," "coverage status," or "risk tier" ever appears to a driver).

## 5.1 Authentication

### Sign in
- Purpose: internal user access.
- Primary user: all internal roles.
- Components: email/password form, "forgot password" link.
- Actions: submit credentials.
- Empty/loading/error: loading spinner on submit; clear error on bad credentials (no distinction between "wrong email" vs "wrong password" in the message, to avoid user enumeration).
- Mobile: usable on a phone browser (dispatchers may check from a phone).
- Acceptance: valid credentials land on the dashboard; invalid show an error without leaking which field was wrong.

### Password reset
- Purpose: self-service recovery.
- Primary user: all internal roles.
- Components: email entry → reset link → new password form.
- Empty/error: generic "if that email exists, a reset link was sent" (no enumeration).
- Acceptance: reset link expires, works once, updates credentials.

### Invitation acceptance
- Purpose: onboarding a new internal user invited by an admin/manager.
- Components: pre-filled email (read-only), name, password set.
- Acceptance: invited user can only set up an account via a valid, unexpired invitation token; role is pre-assigned by the inviter, not chosen by the invitee.

## 5.2 Dispatcher dashboard

- Purpose: the single daily-use screen; everything a dispatcher needs to know this morning.
- Primary user: Dispatcher.
- Main components: Today's coverage list, Tomorrow's coverage list, At-risk routes panel, Unconfirmed drivers panel, Routes needing backups panel, Recent cancellations feed, Needs-review queue (unparseable/out-of-context replies), Recommended-actions list (derived, e.g., "3 routes need backup sourcing").
- Main actions: drill into any route occurrence; jump to needs-review item and resolve; quick-action buttons (send reminder, view backups) inline.
- Empty state: "No routes need attention right now" with a link to the full schedule — not a blank/broken-looking screen.
- Loading state: skeleton rows per panel, not a full-page spinner (so partial data can render as it loads).
- Error state: per-panel error boundary (a failure loading "recent cancellations" doesn't take down the whole dashboard).
- Mobile: must be usable on a phone — dispatchers referenced getting this at home before their shift; panels stack vertically, at-risk/needs-review prioritized at top on small screens.
- Acceptance criteria: every count/status shown matches the underlying coverage-status state machine exactly (tested); needs-review queue shows zero false negatives (every unparsed inbound message appears here).

## 5.3 Program management

### Program list
- Purpose: overview of recurring programs at a branch.
- Primary user: Branch Manager.
- Components: list with route-template count, active driver count per program.
- Empty state: "No programs yet — create your first recurring program" with CTA.
- Acceptance: filtered to the manager's branch only (RLS-enforced, tested).

### Program details
- Components: route templates within the program, quick stats (coverage rate this week).
- Actions: create route template, edit program name.

### Route templates (create/edit)
- Purpose: define a recurring route's fixed shape and disclosure content.
- Components: stops/description, pay, duration, disclosure text, requirements section (linked qualifications, vehicle class), recurrence schedule editor, confirmation-timing config, backup-requirement defaults (desired backup count, default standby compensation).
- Validation: all disclosure fields required before the template can generate occurrences (can't create occurrences from an incomplete template).
- Acceptance: a saved template with full disclosure content produces correctly-formed occurrences per the recurrence rule.

### Schedule configuration
- Purpose: recurrence rule editor (days of week, date range).
- Components: day-of-week picker, start date, optional end date, preview of next 5 generated occurrence dates.
- Acceptance: preview matches what the generation job actually produces (no drift between preview and reality).

### Requirements
- Components: hard requirement toggles (qualification, vehicle class) vs. preference toggles.
- Acceptance: hard requirements are visibly distinguished from preferences in the UI (not just internally).

### Message timing
- Components: checkpoint offset editor (e.g., "day before at 6:00 PM branch time," "same day at 5:00 AM branch time").
- Acceptance: times are stored/scheduled correctly against the branch's timezone (tested with a cross-timezone example route).

### Backup rules
- Components: desired backup count, default standby compensation, auto-activate toggle (dispatcher must approve vs. system auto-activates first acceptance).

## 5.4 Route occurrence details

- Purpose: everything about one specific dated route — the drill-down from the dashboard.
- Primary user: Dispatcher.
- Components: route info (stops, pay, requirements), primary driver card (with confirmation status), backup drivers list, risk factors panel (explained), full two-way message timeline (with a manual-send box), coverage history (state-machine transition log, human-readable), dispatcher action buttons (cancel, reassign, send confirmation now, source backups, override status).
- Empty state: "No backups sourced yet" with a "Find backups" CTA when primary is at risk/canceled.
- Loading/error: standard per-panel handling as in the dashboard.
- Mobile: usable but this is primarily a desktop/tablet screen for a dispatcher at their station; must not break on a phone if the dispatcher checks from home.
- Acceptance: the message timeline shows every outbound and inbound message for this occurrence in order, with clear delivery/read/response indicators; a manual message sent by a dispatcher appears in the same thread and is logged identically to system messages.

## 5.5 Driver management

### Driver list
- Purpose: browse/search/filter drivers.
- Components: search by name/phone, filter by qualification/vehicle class/status.
- Acceptance: filters correctly apply hard-requirement logic consistent with backup-matching logic elsewhere (same filter code path, not a reimplementation).

### Driver profile
- Components: contact info, vehicle, qualifications (with expiration highlighted if near/past due), preferences, availability, commitment list, reliability history (completion rate, cancellation count — computed, not stored redundantly), message history, edit actions.
- Acceptance: expired qualifications are visually flagged, and a driver with an expired hard-required qualification is excluded from eligible lists elsewhere (cross-checked by test).

### CSV import (drivers and routes)
- Purpose: bulk onboarding — the primary way pilot customers get data in.
- Components: file upload, column-mapping step (map CSV headers to fields), validation preview (rows to create, rows with errors listed individually with the specific problem), confirm-import button.
- Empty/error: if the whole file fails to parse (wrong format), a clear message before any row-level detail is attempted.
- Acceptance: a realistic messy CSV (some duplicate phones, some missing fields) shows accurate per-row errors and allows importing the valid rows without blocking on the invalid ones.

## 5.6 Driver-facing mobile web (no login, opened from SMS links)

Design requirements for all four pages below: fast on low-end phones and poor connections (minimal JS, no heavy framework hydration if avoidable, target <2s load on throttled 3G-equivalent), signed expiring links only, no data belonging to any other driver or organization ever reachable from the page, plain driver-friendly language throughout, large touch targets, works without JavaScript for the core accept/decline action where feasible (progressive enhancement).

### Route disclosure page
- Purpose: show a driver full route details before they commit — this is the "full route disclosure" prevention mechanism.
- Components: route stops summary, pay, schedule/recurrence in plain language ("Mondays, Wednesdays, and Fridays, starting [date]"), vehicle/qualification requirements in plain language, accept/decline buttons.
- Empty/error: expired link → "This link has expired. Text your dispatcher if you still want this route."
- Acceptance: accept/decline on this page produces the exact same state transition as the SMS keyword equivalent.

### Confirmation fallback page
- Purpose: for drivers who'd rather tap than text back "YES."
- Components: route reminder (date, time, pay), confirm/can't-make-it buttons.
- Acceptance: same transition guarantees as SMS confirmation reply.

### Standby offer page
- Purpose: show a driver a same-day paid backup opportunity and let them accept.
- Components: route summary, standby pay, accept/decline buttons, expiration countdown/notice.
- Acceptance: if the offer is already filled by the time the driver taps accept, they see "This route was already covered — thanks for responding" (not an error), consistent with the first-accept-wins rule.

### Availability/cancellation page
- Purpose: let a driver cancel an upcoming commitment or report unavailability without needing to phrase it correctly over SMS.
- Components: upcoming commitment list, cancel button per item, reason selector (reason-coded cancellation, driver-facing plain-language options).
- Acceptance: cancellation requires a reason selection before submitting (mirrors the reason-coded requirement in the data model).

## 5.7 Backup sourcing

- Purpose: dispatcher's tool for finding and offering standby coverage after a cancellation.
- Primary user: Dispatcher.
- Components: eligible-drivers list (ranked), qualification-match explanation per candidate ("meets vehicle class, service area; missing: none" or "excluded: expired insurance"), standby compensation input (pre-filled from template default, editable), offer-status tracker (sent/viewed/accepted/declined per candidate), activation control.
- Empty state: "No qualified backups found" with a suggestion to widen the search or source manually.
- Acceptance: the explanation shown matches exactly the hard/soft criteria actually used to filter/rank (no discrepancy between displayed reasoning and actual logic).

## 5.8 Reporting

- Purpose: the metrics that prove the product is working (also feeds pilot success-criteria conversations).
- Primary user: Branch Manager (Dispatcher can view own-branch subset).
- Components: coverage rate, confirmation rate, cancellation rate, recovery rate, no-show rate, time-to-recover, driver retention, route-level trend view.
- Empty state: "Not enough data yet" if under a minimum sample.
- Acceptance: every number reconciles against a manual count from the underlying event log for a test dataset (see testing plan).
