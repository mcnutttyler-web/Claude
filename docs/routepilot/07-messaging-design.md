# 7. Messaging Design (SMS-First) and Worker-Classification Guardrails

Messaging is the operational heart of RoutePilot — treat its reliability requirements with the same rigor as the database. A dropped or duplicated message is a driver missing a route or getting confused about whether they're covered, which is the exact failure the product exists to prevent.

## 7.1 Message templates

For each message: trigger, recipient, timing, response options, action after each response, follow-up, escalation, suppression rules.

| Message | Trigger | Recipient | Timing | Response options | Action after response | Follow-up | Escalation | Suppression |
|---|---|---|---|---|---|---|---|---|
| Initial route opportunity | Dispatcher invites driver | Candidate driver | On invite | Link to disclosure page (no SMS keyword decision yet) | Opens disclosure page | Reminder if unopened after 24h | If unopened after 48h, dispatcher prompted to try another candidate | Suppressed if driver already committed/declined this template |
| Full route disclosure (web link) | Same as above (bundled) | Same | Same | Accept / Decline on page | `acceptCommitment`/`declineCommitment` | — | — | — |
| Commitment request (recurrence terms) | Driver accepts disclosure | Driver | Immediately after accept | Confirm recurrence scope (e.g., "Reply YES to confirm Mon/Wed/Fri starting [date]") | Commitment finalized | Reminder after 24h if unanswered | Dispatcher notified if no response after 48h | — |
| Weekly schedule reminder (optional, §2 O-tier) | Scheduled, weekly | Committed driver | Sunday evening, branch-local time | None required (informational) | None | — | — | Suppressed during quiet hours/opt-out |
| Day-before confirmation | Checkpoint scheduled job | Assigned driver | Configured offset (e.g., 6:00 PM day before, branch-local) | YES / NO / (reply with reason if NO) | Transition per §3.2 | If no response, same-day checkpoint still fires as scheduled | No response by day-before deadline → `at_risk` | Suppressed if occurrence already canceled/completed |
| Same-day confirmation | Checkpoint scheduled job | Assigned driver | Configured offset (e.g., 5:00 AM same day, branch-local) | YES / NO | Transition per §3.2 | Missed-response follow-up (below) | No response by deadline → escalate to dispatcher, occurrence `at_risk`/`primary_canceled` per timing | Suppressed if already confirmed via day-before and program doesn't require double-confirm |
| Pre-departure check-in (optional) | Scheduled job, close to departure | Assigned driver | e.g., 60–90 min before departure | On my way / Running late / Can't make it | Transition/alert accordingly | — | "Running late" or no response triggers dispatcher alert | Suppressed if not enabled by program |
| Missed-response follow-up | No response by first internal reminder threshold (before hard deadline) | Driver | Partway through the response window | Same as the checkpoint it follows | Same | One follow-up only, then wait for deadline | At deadline, occurrence → `at_risk`, dispatcher notified | Never sent twice for the same checkpoint |
| Cancellation acknowledgment | Driver cancels (SMS or web) | Driver | Immediately | None required | None | — | — | — |
| Standby offer | Dispatcher/system sources backups | Eligible backup candidate(s) | Immediately on sourcing | Accept / Decline | First accept wins (§3.4); others superseded | Expiry reminder if offer has a window and is unanswered | If no acceptance before expiry, dispatcher notified to widen search | Suppressed once an offer is superseded/filled |
| Backup activation | Backup accepts and is activated | Activated backup driver | Immediately on activation | None required (confirmation only) | None | — | — | — |
| Route update | Dispatcher edits route details after commitment | Affected committed driver(s) | On edit | Acknowledge (optional) | Logs acknowledgment | — | If a change affects a hard requirement the driver no longer meets, dispatcher alerted | — |
| Driver removal from recurring assignment | Dispatcher/manager removes driver from a program | Driver | On removal | None required | None | — | — | — |
| Opt-out confirmation | Driver texts STOP | Driver | Immediately | None (terminal) | All future messaging suppressed for this driver until resubscribe | — | Dispatcher notified that an active driver opted out (this is operationally significant) | N/A — this message itself is exempt from suppression rules |

## 7.2 Inbound response handling

### Keyword-first parsing

- Normalize: strip whitespace, lowercase, strip punctuation.
- Match a small canonical keyword set per context: `YES`/`Y`/`1`/`CONFIRM`/`OK`/`OKAY` → affirmative; `NO`/`N`/`2`/`CANCEL`/`CAN'T`/`CANT` → negative; `STOP`/`UNSUBSCRIBE`/`END`/`QUIT` → opt-out (handled globally, highest priority, before context matching); `START`/`YES` after a prior STOP → resubscribe (only in that specific context).
- Match is scoped to the specific open context (the most recent unanswered outbound message to that phone number) — the same keyword means different things depending on what was asked, which is why context matching happens before keyword interpretation, not after.

### Ambiguous or free-text replies

- **Never guess on a commitment-affecting reply.** If the message doesn't match the canonical keyword set for its open context, it is *not* interpreted — it is stored as-is and routed to the dispatcher's needs-review queue with the full message thread visible, and the occurrence's state does not change.
- The needs-review queue is a first-class dashboard panel (§`05-interface-plan.md`), not a buried log — every unparsed reply must be resolvable by a dispatcher within the same day.

### Should an LLM assist with parsing free-text replies? (Decision point, not a default)

This is explicitly **not** part of the MVP. Present it as a decision to revisit post-pilot, not a default:

| | Pros | Cons / failure modes |
|---|---|---|
| Using an LLM to interpret free-text replies | Could reduce needs-review volume; could parse genuinely ambiguous but clear-to-a-human replies ("can't make it today, car trouble") | Cost per message at scale; a wrong auto-interpretation on a commitment-affecting reply is worse than a delayed manual review — false confidence is the actual risk, not latency; adds a new failure mode (model unavailability, prompt injection via driver-supplied text) to the most safety-critical path in the product; regulatory/legal exposure if an LLM misreads a cancellation as a confirmation and a route fails as a result |
| Decision gate | Only revisit this if pilot data shows the needs-review queue volume is operationally unsustainable (see `12-metrics` "needs-review replies per 100 inbound messages" — a concrete threshold is defined there) **and** a founder-reviewed sample of those messages shows they'd genuinely be interpretable reliably by an LLM. Even then, start with LLM-assisted *drafting of a suggested interpretation for dispatcher one-tap approval*, not autonomous state-changing action. |

### Replies received out of context

- Reply to an old/resolved message thread: logged, routed to needs-review with a note, no automatic transition (detailed race-condition rule in `03-workflows-state-machine.md` §3.4).
- Reply after opt-out: any inbound message from an opted-out number is logged but never triggers a state change or an automatic reply, except the resubscribe keyword path.
- Reply from an unknown phone number: logged in `inbound_messages` with no matched driver; surfaced in needs-review distinctly ("unknown number") since it might be a wrong number, a new driver, or a driver texting from a different phone.

## 7.3 Delivery reliability and safety rails

- **Idempotent sending:** every outbound send first writes an `outbound_messages` row with a unique idempotency key of `(recipient_phone, trigger_type, occurrence_id or offer_id)`; the send function checks for an existing row with that key before calling the provider. A retried job or a duplicate cron tick finds the existing row and no-ops instead of sending again.
- **Outbox pattern:** the state change that triggers a message (e.g., an occurrence entering `confirmation_pending`) and the creation of the corresponding `outbound_messages` row happen in the same database transaction; a separate dispatcher process reads unsent outbox rows and calls the provider, marking them sent — so a crash between "decide to send" and "actually sent" can't silently drop the message, and a crash after sending but before marking-sent is caught by the idempotency key on the next attempt.
- **Webhook deduplication:** every inbound webhook (message received, delivery status callback) is checked against `webhook_events` by the provider's unique event/message SID before any processing; a duplicate delivery (which providers explicitly document as possible) is recorded but not reprocessed.
- **Per-driver frequency caps:** a hard cap (e.g., no more than N messages to one driver per rolling 24 hours, configurable) prevents a bug (a job loop, a misconfigured recurrence) from burying a driver in texts; messages beyond the cap queue or drop with an internal alert rather than send.
- **Global kill switch:** a single organization-wide (and a single platform-wide, for the founder) toggle that immediately halts all outbound sending, checked at the point of actual provider call — not just at job-scheduling time — so it takes effect even for already-queued sends.
- **Spend guardrails:** a daily SMS budget per organization (and platform-wide) with an alert at e.g. 75% and automatic throttling (non-critical message types paused first) at 100%, checked before each send — this exists specifically to prevent an unforeseen message loop from running up cost overnight while the founder is asleep.
- **Failed delivery, invalid numbers, landlines, carrier filtering:** delivery-status webhooks update `outbound_messages.status`; a hard failure (invalid number, landline, carrier-filtered) is surfaced distinctly from "no response" so a driver isn't unfairly risk-scored for a message that never reached them, and is flagged for a dispatcher to get an alternate contact method.

## 7.4 Consent, opt-outs, quiet hours, time zones, logging, manual intervention

- **Consent capture:** a `consent_records` row is created before the first message is ever sent to a driver — capturing method (e.g., "verbal consent obtained by dispatcher during onboarding, recorded on [date]" or "driver texted in to opt in"), timestamp, and who recorded it. No first message goes out without this record existing.
- **Opt-outs:** STOP (and standard variants) is handled by the messaging provider's built-in compliance layer where available (Twilio auto-handles STOP/START at the carrier level for a Messaging Service) **and** mirrored into `consent_records`/driver status in the app, so the app's own state agrees with what the carrier is enforcing. Resubscribe (START) is accepted and re-enables messaging, logged with a timestamp.
- **Quiet hours:** no non-urgent message is sent outside a configured local window (e.g., 8:00 AM–8:00 PM branch-local time) regardless of when the triggering event occurred; a job computed to fire during quiet hours queues until the window opens, except for messages the driver directly and immediately requested a reply to within an already-open conversation.
- **Time zones:** all timestamps are stored in UTC; every branch has a stored timezone; driver-facing message scheduling always computes against the *route's* local time (branch timezone, or the route's own timezone if it differs from the branch — flag this explicitly if a customer ever runs cross-timezone routes, uncommon at MVP scale); dispatcher-facing displays render in the branch's timezone.
- **Message logging:** every outbound and inbound message is retained in full (`outbound_messages`, `inbound_messages`) and rendered as a complete thread on the occurrence detail screen — this is also the record a founder needs if a driver disputes what they were told.
- **Manual dispatcher intervention:** a dispatcher can send a free-text manual message from the occurrence's thread at any time; it goes through the same outbox/idempotency/quiet-hours/frequency-cap machinery as system messages (a manual message is not an exception to the safety rails), and is visually distinguished in the thread as dispatcher-authored vs. system-generated.

## 7.5 Carrier registration and testing

- **A2P 10DLC brand and campaign registration is a critical-path item with real lead time (days to weeks).** Start this during Phase 0 (founder preparation), immediately after choosing Twilio — not during pilot prep. Unregistered/unverified sending is unreliable (heavy carrier filtering) and will look like a product bug to early users if it's actually a compliance gap.
- **SMS testing approach:** use the provider's test credentials/magic numbers (Twilio provides test SIM/number equivalents that don't hit real carriers) for automated tests; maintain a staging Messaging Service pointed at a small set of the founder's own real phones (or a second Twilio subaccount) for manual end-to-end verification without texting real drivers; end-to-end tests (Playwright + a test webhook trigger) should be able to run the full schedule→send→webhook→state-change→dashboard loop against the staging sandbox with no real SMS involved, so the suite runs in CI without cost or side effects.

## 7.6 Worker-classification guardrails (not legal advice — flagged for counsel review)

RoutePilot's customers work with independent contractors; the product's design should help them avoid creating employee-like control through the software itself, since misclassification risk often comes from behavioral-control patterns baked into day-to-day tools, not just contracts.

Guardrails to build in:

- **Full route disclosure** before any commitment — supports "the worker had full information and chose to accept," a factor courts/regulators look at.
- **Voluntary route acceptance and ability to decline** — every invitation has a real decline path with no penalty mechanic attached in the product (no scoring language that reads as discipline).
- **No guarantee of future work** — recurring commitment language describes agreed dates/recurrence the driver opted into, not an ongoing employment-like obligation; template disclosure text should avoid implying indefinite guaranteed work.
- **Clear commitment to accepted dates specifically**, not open-ended availability — a driver commits to "Mon/Wed/Fri starting [date]," not to "being available whenever needed."
- **Avoid employee-style attendance language** in all driver-facing copy — no "attendance record," no "write-up," no "performance review" phrasing; reliability history is framed operationally ("completion history for scheduling purposes"), never as a disciplinary record. This extends to the product's own naming: internal analytics can say "completion rate," driver-facing copy never should frame it evaluatively.
- **Avoid disciplinary scoring language** — the risk engine's tiers and dashboard are described in the docs and UI as *dispatcher decision support for coverage planning*, never as a driver "score" or "rating" shown to the driver, and never as a basis for penalty within the product.
- **Avoid mandatory availability outside accepted commitments** — nothing in the product should message or imply a driver must respond to opportunities/checkpoints beyond routes they've already accepted; declining a *new* opportunity must never be logged/treated identically to canceling an *accepted* commitment.
- **Customer-configurable legal language** — disclosure text, cancellation terms, and standby-offer terms should be editable per organization (not hardcoded), since the correct contractor-relationship language varies by jurisdiction and by each customer's own legal setup.
- **Audit trails** — every disclosure shown, every acceptance, every term change is logged with timestamp and content shown at the time (§4.8 `audit_logs`), so a customer can reconstruct exactly what a driver saw and agreed to if ever challenged.
- **Market-specific legal review** — worker classification rules vary significantly by state/country (e.g., ABC test jurisdictions vs. others); this cannot be solved generically by software and needs review per market the product sells into.

**This section is not legal advice.** Recommend qualified employment/labor counsel review: (1) the standard disclosure and commitment template language before the first pilot, (2) the standby-offer/compensation mechanic specifically (paying for standby time has its own classification implications in some jurisdictions), and (3) any jurisdiction-specific customization needed before selling into a new state/region.
