# 11. Testing Strategy

## 11.1 Test categories and what they cover

| Category | Covers | Tooling |
|---|---|---|
| Unit tests | Risk rules, keyword parser, matching/ranking logic, state-machine transition validity | Vitest |
| Integration tests | Server actions end to end against a real (test) database — e.g., invite → accept → assign | Vitest + test DB |
| Database tests | Constraints, indexes, RLS policies behave as designed | Vitest against a disposable Postgres/Supabase test instance |
| Authorization tests | Role checks reject disallowed actions server-side | Vitest |
| Multi-tenant isolation tests | Cross-org access is impossible via any code path, including direct ID guessing | Vitest, reusable helper from Task 1.3 |
| Messaging tests | Idempotent sends, template rendering, quiet hours, consent/opt-out, frequency caps, kill switch | Vitest, mocked/staging Twilio client |
| Webhook tests | Signature verification, duplicate delivery dedup | Vitest, replayed fixture payloads |
| Background-job tests | Idempotent re-runs, late-run behavior, missed-job detection | Vitest, job harness with controllable clock |
| Risk-rule tests | Each rule fires under its exact condition, rule-version snapshotting is immutable | Vitest |
| End-to-end workflow tests | Full user-facing flows across the UI | Playwright |
| Time-zone tests | Scheduling/display correctness across branch timezones | Vitest with fixed-timezone fixtures |
| Quiet-hour tests | No non-urgent send outside the configured window | Vitest |
| Opt-out tests | STOP suppresses all sends; START resumes | Vitest, staging Twilio sandbox |
| Failure-recovery tests | Cancellation → sourcing → offer → activation, including "no backup available" | Vitest + Playwright |
| Concurrency tests | Race conditions in `03-workflows-state-machine.md` §3.4 | Vitest with simulated concurrent requests |

## 11.2 Critical end-to-end scenarios (all required before pilot launch)

1. **Driver accepts a recurring route and confirms successfully.** Invite → disclosure → accept → committed → checkpoint fires → driver replies YES → confirmed. Assert final coverage status and message thread content.
2. **Driver declines an opportunity.** Invite → disclosure → decline → occurrence returns to `unassigned`, dispatcher notified.
3. **Driver fails to respond to confirmation.** Checkpoint fires → no reply by deadline → `at_risk`, dispatcher alerted, risk assessment recorded with `NO_RESPONSE_CONFIRM`.
4. **Driver cancels before the route.** Confirmed → driver texts cancel keyword → reason code required → `primary_canceled` → recovery flow begins automatically.
5. **Qualified backup accepts a standby offer.** Cancellation → sourcing → offer sent → backup accepts → `backup_accepted`.
6. **Backup replaces the primary driver.** Continuation of #5 → activation → `recovered`, original primary's record shows the correct history entry (not counted as "completed" for them).
7. **No backup is available.** Cancellation → sourcing finds zero eligible drivers → occurrence stays `backup_sourcing` with a clear "no eligible backups" state, dispatcher prompted to widen criteria; if departure passes, auto/manual transition to `failed`.
8. **Driver opts out of SMS.** Driver texts STOP mid-relationship → `consent_records` updated, all subsequent scheduled sends to this driver are suppressed and logged as suppressed (not silently skipped with no record) → dispatcher is notified the driver opted out (operationally significant, since they may have active commitments).
9. **A messaging webhook is received twice.** Replay an identical Twilio inbound payload (same message SID) → assert exactly one `inbound_messages` row and no duplicate state transition.
10. **One organization attempts to access another organization's data.** Authenticated as org A, attempt to fetch org B's driver/occurrence/report by guessing IDs directly against server actions and any API route → assert zero rows returned, not an error revealing existence.
11. **A route crosses time zones.** A branch in one timezone with a route template configured with checkpoint offsets → assert the checkpoint fires at the correct UTC instant relative to the branch's local time, including around a DST transition date.
12. **A scheduled job runs late.** Simulate a delayed job execution (e.g., 2 hours after due) → assert it still fires correctly if still contextually valid, and is suppressed with a distinct logged reason if the delay pushed it past a hard cutoff (e.g., departure already passed).
13. **A scheduled job runs twice.** Force a duplicate execution of the checkpoint-firing job for the same `(job_type, occurrence_id, scheduled_for)` key → assert exactly one message sent and one `scheduled_jobs` row, not two.
14. **A dispatcher manually overrides a risk status.** Dispatcher force-transitions or annotates a risk-flagged occurrence → assert the override is logged with actor, reason, and previous/new state, and does not silently reset the underlying risk_assessments history.
15. **A driver's qualification expires before a route.** Driver has an active assignment; their hard-required qualification's `expires_at` passes before the route date → assert the driver is excluded from future eligible-driver queries and the existing assignment is flagged (not silently left unassigned-but-invalid).
16. **Two dispatchers act on the same route simultaneously.** Fire two near-simultaneous conflicting actions (e.g., both assign a different primary) → assert exactly one succeeds and the other receives a clear conflict response, per §3.4 rule 1.
17. **A backup accepts after the primary has already re-confirmed.** Sequence the events per §3.4 rule 2's two sub-cases (backup not yet activated vs. already activated) → assert the documented winning outcome and correct messages to both parties in each case.
18. **A driver sends an unparseable free-text reply.** Send a reply that doesn't match the keyword set for its open context → assert it lands in the needs-review queue, is visible with full thread context, and triggers zero automatic state changes.
19. **A driver replies to a week-old message thread.** Send a reply referencing an already-resolved checkpoint/offer from days earlier → assert it's logged against that old context, routed to needs-review with a note, and does not affect current occurrence state.

## 11.3 Testing principles for this codebase specifically

- The multi-tenant isolation test (scenario 10) and the state-machine transition tests are the two suites that must never be allowed to go red and stay red — treat any failure in either as a stop-everything issue, not a backlog item.
- Concurrency tests (scenarios 16, 17, and the standby-offer first-accept-wins case) must actually exercise real concurrent execution (parallel requests/promises), not just sequential calls that happen to be written in a suggestive order — a sequential test can pass while the real race condition still exists.
- Job tests must control the clock (inject a fake "now") rather than relying on real sleep/wait, so late-run and duplicate-run scenarios are fast and deterministic.
- Webhook/messaging tests run against Twilio's test credentials or a staging sandbox — never against real driver phone numbers, and never requiring a human to actually receive a text for the automated suite to pass (manual real-phone verification is a separate, smaller "Manual verification" step per task, not part of CI).
