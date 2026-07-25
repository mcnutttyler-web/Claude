# 13. Pilot Launch Plan and Daily Founder Runbook

Assumed pilot shape: one customer, one branch, 1–3 dispatchers, 10–50 recurring routes, 25–150 drivers, SMS-based confirmations, manual founder support. **Recommended pilot length: 6 weeks** (4 weeks minimum to see a full weekly cycle repeat several times and gather enough cancellation/recovery events to be meaningful; 6 weeks gives a buffer for the first week's inevitable data/onboarding friction without eating into the evaluation window).

## 13.1 Pre-launch sequence

1. **Pilot agreement** — a short written agreement (even one page): scope (one branch, route/driver count range), duration, price (or free, per `14-metrics-pricing-ops-budget.md`'s pilot pricing recommendation), what the customer commits to (timely CSV data, a point of contact, willingness to give weekly feedback), what RoutePilot commits to (support responsiveness, data handling).
2. **A2P 10DLC registration confirmed complete** — not just submitted; confirm the campcampaign is approved and sending is unfiltered. This must be true before any real driver receives a message, and given multi-week lead time, this should have started in Phase 0.
3. **Data collection** — get the customer's actual driver and route spreadsheets (even if messy) as early as possible, ideally 1–2 weeks before go-live, to leave time for cleanup and import-preview iteration.
4. **Configuration** — create the org/branch, set the branch timezone, set checkpoint timing defaults, set the messaging kill switch to a safe state, confirm spend budget/alerts are configured for this customer's expected volume.
5. **Driver import (CSV)** — import via the Task 3.3 flow; review the validation preview with the customer before committing (catches misread columns, formatting issues).
6. **Route import (CSV)** — import via the Task 4.3 flow; verify a sample of generated occurrences against the customer's actual known schedule.
7. **Dispatcher training** — a single 60–90 minute session (screen-share is fine): walk the dashboard, the occurrence detail screen, backup sourcing, and the needs-review queue; give them a one-page cheat sheet, not a manual.
8. **Messaging consent** — before the first automated message goes to any real driver, the customer must inform their drivers (a short announcement — call, text, or in-person — that they'll now receive route texts from RoutePilot on the customer's behalf) and this is recorded per driver in `consent_records` (bulk-recorded at import time with a note on how consent was obtained, e.g., "verbal notice given by [manager] during onboarding meeting on [date]").
9. **Parallel operation** — for the first few days to a week, keep the customer's existing process (phone calls, group texts) running alongside RoutePilot rather than cutting it over cold, so a gap in the new system doesn't cause a real missed route while trust is being built.

## 13.2 Daily founder runbook

### Morning checklist (before the customer's dispatch day starts)
1. Check the messaging-observability dashboard: any delivery failures overnight? Any job-health/heartbeat alerts (a checkpoint that should have fired but didn't)?
2. Check the needs-review queue: any unresolved items from overnight/early morning replies that need the founder's attention before the dispatcher logs in (or confirm the dispatcher is handling it themselves once trained)?
3. Check at-risk routes for today: does anything look wrong (e.g., a route flagged at-risk that clearly shouldn't be, suggesting a rule miscalibration)?
4. Check overnight failures: any occurrence that moved to `failed` — understand why before the customer asks.
5. Confirm the kill switch and spend budget are in a normal, expected state (not accidentally triggered).

### Evening checklist
1. Review the day's coverage outcomes: how many routes ran as planned vs. needed recovery vs. failed.
2. Log any incident (a bug, a confusing UX moment, a support question) in a running pilot log.
3. Note anything for the weekly customer review.
4. Confirm tomorrow's confirmation checkpoints are correctly scheduled (spot-check, not a full audit every day).

## 13.3 Incident logging

Keep a simple running log (a doc or spreadsheet is fine) of: date/time, what happened, customer-visible impact (if any), root cause (once known), fix status. This becomes both the founder's own quality record and, later, real content for a support/reliability track record with future customers.

## 13.4 Feedback collection

- A short weekly async form (3–5 questions: what's working, what's frustrating, any missed/failed routes they attribute to the tool, would they pay X per month) sent to the dispatcher(s).
- The weekly customer review call (below) is the primary qualitative channel — don't rely on the form alone.

## 13.5 Weekly customer review

A 20–30 minute call each week of the pilot: walk through the metrics (`14-metrics-pricing-ops-budget.md`) for that week, ask directly what was frustrating, confirm whether the customer's own informal read ("did this actually help this week") matches what the data shows.

## 13.6 Success criteria (agree on these with the design partner during recruitment, not after)

- **Coverage improvement:** final coverage rate meaningfully higher than the customer's baseline (measured or estimated during validation interviews) — e.g., a specific percentage-point improvement agreed with the customer in advance.
- **Adoption:** dispatchers are using the dashboard as their primary tool by week 2–3, not reverting to the old phone/spreadsheet process in parallel past the agreed transition window.
- **Response behavior:** driver SMS response rate stays acceptable and opt-out rate stays low (specific thresholds in `14-metrics-pricing-ops-budget.md`).
- **Recovery effectiveness:** a meaningful share of cancellations are recovered before the scheduled departure, not after.
- **Customer sentiment:** the customer would say yes to converting to paid, specifically and explicitly asked, not inferred.

## 13.7 Go/no-go decision

At the end of the pilot period, make an explicit go/no-go call against the criteria above:
- **Go (convert to paid):** success criteria substantially met, customer explicitly says yes to paying.
- **Extend:** signal is positive but incomplete (e.g., adoption is real but coverage-rate improvement isn't yet statistically meaningful due to low route-failure volume) — extend 2–4 weeks with the same customer rather than starting a second pilot cold.
- **No-go:** adoption never happened, or the customer explicitly declines to pay — treat this as validation-plan feedback (revisit `01-validation.md`'s "revise/narrow/stop" framework) rather than purely a product bug list.

## 13.8 Conversion to paid service

Manual invoicing is fine at this stage (see `14-metrics-pricing-ops-budget.md` for exactly when to automate). Convert with a simple follow-on agreement referencing the pricing hypothesis, and treat the first 60–90 days of paid service as still semi-pilot in terms of founder attentiveness — the daily runbook doesn't stop just because payment started.
