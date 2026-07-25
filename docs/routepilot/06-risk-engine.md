# 6. Risk Engine Design (Rules-Based, Explainable)

No machine learning in the MVP. Every score must be traceable to specific rules with specific point values, and every historical score must remain interpretable even after the rules change later (rule-versioning, §6.5).

## 6.1 Risk signals evaluated

| Signal | Category |
|---|---|
| No response to confirmation checkpoint | Behavioral |
| Late response to confirmation (responded, but after a soft warning threshold before the hard deadline) | Behavioral |
| Recent cancellation (within last N days) | Historical |
| Previous no-show (ever, or within a lookback window) | Historical |
| Low completion rate (below a threshold over trailing N routes) | Historical |
| New driver with limited history (fewer than N completed routes) | Historical/uncertainty |
| Route outside driver's preferred service area | Compatibility |
| Route outside driver's preferred time window | Compatibility |
| Compensation below driver's stated minimum preference | Compatibility |
| Route length above driver's stated preference | Compatibility |
| Vehicle mismatch (soft preference, not hard requirement, mismatch) | Compatibility |
| Expired qualification (this is normally a **hard block**, not a risk signal — see §6.2 note) | Compliance |
| Multiple overlapping commitments (driver committed to two occurrences with conflicting windows) | Scheduling |
| Long time since last completed route (driver has gone quiet/inactive) | Behavioral |
| Repeated dispatcher overrides on this driver (dispatcher has manually overridden risk status for this driver multiple times, suggesting the rules are miscalibrated for them specifically — surfaced as a meta-signal, not scored) | Meta |

**Important distinction:** an *expired hard-required qualification* is not a "risk flag" — it's a hard eligibility block. The driver simply cannot be assigned/offered this route at all until it's resolved. Risk scoring only applies to drivers who are eligible in the first place.

## 6.2 Rule structure

Each rule is expressed as: `IF <condition> THEN <points> with <explanation template>`. Points accumulate into a single score per assignment/occurrence; the score maps to a tier.

### Example rules and point values

| Rule code | Condition | Points | Dispatcher-facing explanation |
|---|---|---|---|
| `NO_RESPONSE_CONFIRM` | No response to a confirmation checkpoint within its deadline | +30 | "Driver did not respond to the [day-before/same-day] confirmation by [deadline]." |
| `LATE_RESPONSE_CONFIRM` | Responded, but after 80% of the response window had elapsed | +10 | "Driver confirmed, but close to the deadline ([time] before cutoff)." |
| `RECENT_CANCELLATION` | ≥1 cancellation by this driver in the last 14 days | +20 | "Driver has canceled [N] time(s) in the last 14 days." |
| `PREVIOUS_NO_SHOW` | ≥1 no-show on record (lookback 90 days) | +35 | "Driver has a no-show on record within the last 90 days." |
| `LOW_COMPLETION_RATE` | Completion rate < 85% over trailing 10 routes | +25 | "Driver's completion rate over their last 10 routes is [X]%." |
| `NEW_DRIVER_LIMITED_HISTORY` | Fewer than 3 completed routes ever | +15 | "This driver has completed fewer than 3 routes — limited track record." |
| `OUTSIDE_SERVICE_AREA` | Route falls outside driver's stated service area | +10 | "This route is outside [driver]'s preferred service area." |
| `OUTSIDE_TIME_PREFERENCE` | Route start time outside driver's stated availability window | +10 | "This route's start time is outside [driver]'s stated availability." |
| `BELOW_MIN_COMPENSATION` | Route pay is below driver's stated minimum | +15 | "Route pay ($[X]) is below [driver]'s stated minimum ($[Y])." |
| `ABOVE_LENGTH_PREFERENCE` | Route duration/distance exceeds driver's stated preference | +10 | "Route is longer than [driver] typically prefers." |
| `VEHICLE_SOFT_MISMATCH` | Vehicle meets hard minimum but not the preferred class | +5 | "Vehicle is acceptable but not [driver]'s preferred class." |
| `OVERLAPPING_COMMITMENT` | Driver has another assignment with an overlapping time window | +25 | "Driver has another route assignment that overlaps this one." |
| `LONG_INACTIVITY` | No completed route in the last 30 days | +15 | "Driver hasn't completed a route in over 30 days." |

Points are additive and uncapped per rule but the total score is clamped for display purposes; the raw score and every contributing rule are always shown, never just a tier label.

## 6.3 Tiers, thresholds, and recommended actions

| Tier | Score range | Definition | Recommended dispatcher action |
|---|---|---|---|
| Low | 0–14 | No meaningful risk signals present | None — business as usual |
| Medium | 15–39 | One or two moderate signals (e.g., new driver, or a single soft-preference mismatch) | Keep an eye on it; no action required yet, but don't treat confirmation as a formality |
| High | 40–69 | Multiple signals or one severe signal (e.g., a recent cancellation plus a late response) | Proactively check in with the driver before the next checkpoint; consider pre-sourcing a backup candidate now rather than waiting for a cancellation |
| Critical | 70+ | Severe/compounding signals (e.g., no-show history + no response to current checkpoint) | Begin backup sourcing immediately; do not wait for an explicit cancellation — treat as functionally uncovered |

These thresholds are starting points, not fixed — expect to tune them after the first 2–3 weeks of pilot data once real score distributions are visible (see `13-pilot-plan.md`).

## 6.4 Matching drivers to routes without machine learning

The MVP matches on **explicit, structured rules**, in two passes:

1. **Hard-requirement filter (eligibility):** vehicle class, required qualifications (unexpired), service-area boundary if defined as a hard constraint by the program, cargo/commodity restrictions. Anything failing a hard requirement is excluded outright, with the specific failing requirement shown.
2. **Soft-preference ranking (ordering among eligible drivers):** score eligible candidates by how well they match preferences (service area centrality, compensation vs. stated minimum, route length vs. preference, vehicle class preference, historical reliability) using a simple weighted-points ranking — the same point-based approach as the risk engine, just applied to "fit" rather than "risk." Highest-fit eligible drivers are shown first, each with a one-line explanation of why they rank where they do.

This is a transparent scoring table, not a model — every ranking is traceable to the same rule list a dispatcher can read.

## 6.5 Explainability and rule versioning

- Every `risk_assessments` row stores: the `rule_version` active at computation time, a JSON snapshot of the specific inputs used (e.g., "completion rate at time of scoring: 82%, based on 10 routes"), and the list of `risk_factors` (rule code, points, rendered explanation) that produced the score.
- Because rules and thresholds will be tuned after pilot data comes in, **historical scores are never recalculated retroactively** — a score computed under rule version 1 stays interpretable as "this is what version 1 said, given these inputs," even after version 2 changes point values. This is what makes trend reporting over time honest rather than silently rewritten.
- The dispatcher-facing risk panel always renders from `risk_factors`, never from the score alone — "why is this at-risk" must always be answerable by reading the screen, not by asking the founder to explain the algorithm.
