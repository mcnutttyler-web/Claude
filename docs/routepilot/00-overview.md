# 0. Executive Summary, Key Assumptions, Recommended Customer Segment

## Executive summary

RoutePilot is a coverage-assurance layer for recurring delivery routes. Dispatchers at small-to-midsize delivery operators lose hours every week firefighting last-minute driver cancellations on routes that repeat 3–7 days a week — grocery/pharmacy/medical courier runs, dedicated B2B delivery lanes, regional last-mile contracts. The failure mode is always the same: a driver who was "confirmed" doesn't show, and there's no qualified, already-vetted backup ready to go, so the dispatcher scrambles, the route runs late or fails, and the customer complains.

RoutePilot's MVP is deliberately narrow: it disclosure-and-commits drivers to specific recurring routes, runs SMS-based confirmation checkpoints before each occurrence, and — when a driver cancels — automatically identifies and offers the route to a pre-qualified backup pool, so recovery happens before the scheduled departure instead of after a missed delivery. Everything is rules-based and explainable; no ML is required for v1, though the data model is built from day one to support prediction later.

The plan below sequences the build so that the riskiest technical path — a scheduled job firing an outbound SMS, a driver replying, a webhook landing, and a dashboard updating — is proven end-to-end (the "walking skeleton") before any feature is broadened. It also front-loads the two external dependencies with real lead time: A2P 10DLC carrier registration (days–weeks) and design-partner recruitment (weeks), so they aren't accidentally on the pilot's critical path.

The founder is assumed to be non-expert in software engineering but will use Claude Code as the primary build tool, working from a CLAUDE.md project constitution, plan-mode reviews, hooks, and a backlog of small, individually-reviewable tasks (Section 9/10).

## Key product assumptions (all require pilot validation)

| # | Assumption | Why it matters | How it gets tested |
|---|-----------|-----------------|---------------------|
| 1 | Recurring-route coverage failure is frequent and costly enough that operators will pay to reduce it | This is the entire value proposition | Discovery interviews (§4); cost-of-uncovered-route math |
| 2 | Drivers will reliably respond to SMS (not app, not email, not phone calls) | SMS-first is the whole interaction model | Pilot response-rate and opt-out-rate metrics |
| 3 | A rules-based (non-ML) risk engine produces "at risk" flags dispatchers trust and act on | ML is explicitly out of scope for v1 | Dispatcher feedback during pilot; false-positive/negative rate |
| 4 | Keyword parsing + a human needs-review queue is sufficient for inbound SMS replies, without an LLM | Avoids building conversational AI prematurely | % of inbound replies landing in needs-review during pilot |
| 5 | Dispatchers will adopt a new tool inside their existing workflow without a large training investment | Ultra-lean support model depends on this | Time-to-first-independent-use during onboarding |
| 6 | A single branch with 10–50 recurring routes and 25–150 drivers is representative of the target segment's real operating scale | Sizes every architecture and pricing decision | Confirmed during design-partner recruitment |
| 7 | Paid standby/backup compensation (not just backup *availability*) is what gets backups to actually show up | Central to the "Recovery" layer | Backup acceptance rate vs. offer compensation, measured in pilot |
| 8 | Customers will tolerate CSV import (not live integrations) as the onboarding method for the pilot | Keeps integration scope at zero for MVP | Time-to-import and data-quality issues during onboarding |
| 9 | A single founder, using AI-assisted workflows, can build, launch, and operate the pilot without hiring | This is the entire operating model (§14 in the numbered budget/ops doc) | Founder's actual weekly hours tracked during build + pilot |

## Recommended initial customer segment (detail in §1 body; assumptions flagged)

**Recommended beachhead: independent regional last-mile / dedicated-route delivery operators running recurring B2B or medical-adjacent routes with independent-contractor drivers**, specifically small operators (1 branch, 10–50 recurring routes, 1–3 dispatchers, 25–150 drivers) — e.g., a regional courier company running dedicated grocery-distribution or pharmacy/medical-specimen routes under contract, using a mix of owner-operators and 1099 drivers.

Why this segment over the alternatives evaluated:

- **Final-mile delivery companies (large, e.g. parcel subcontractors)** — route volume is high but often centrally dispatched through a marketplace platform (e.g., a gig-economy platform) that already owns the driver relationship and confirmation flow; RoutePilot would be competing with the platform, not augmenting a dispatcher's own tool. Rejected for beachhead, viable later.
- **Meal-kit / grocery delivery providers** — routes are recurring but frequently optimized/re-routed daily by an internal TMS; qualification requirements are simpler (fewer vehicle-class constraints) so the "prevention" layer has less to do. Weaker fit.
- **Retail delivery providers** — recurring commitment is weaker (loads vary daily); less of a "recurring route" problem, more of a daily-dispatch problem. Poor fit for a recurring-commitment product.
- **Regional logistics brokers** — sit between shippers and carriers, often don't own the driver relationship directly, longer sales cycle, more stakeholders. Too complex for a first pilot.
- **Medical courier companies and dedicated B2B route operators** — routes are contractually recurring (same stops, same days, same customer), coverage failure has an outsized, visible cost (a missed medical specimen pickup or a broken B2B delivery contract), qualification requirements are non-trivial (chain-of-custody, vehicle type, service area) which is exactly what the "prevention" layer is for, and the company is small enough that 1–3 dispatchers make every decision personally. **This is the recommended beachhead.**
- **Fleet operators using independent contractors generally** — this describes the *driver relationship*, not the route type, and applies across several of the above; it's a supporting characteristic of the beachhead, not a segment on its own.

### Beachhead customer profile (label: **assumption, validate in interviews**)

| Attribute | Assumption |
|---|---|
| Company size | 10–50 employees total; 1 operating branch |
| Recurring routes | 10–50 active recurring routes |
| Dispatchers | 1–3 |
| Driver type | Mostly independent contractors (1099), some owner-operators; 25–150 active drivers |
| Current workflow | Spreadsheet or whiteboard route roster; confirmation by phone call or group text; backups sourced ad hoc by calling around when someone cancels |
| Primary pain point | Last-minute cancellations with no ready backup, causing missed pickups/deliveries and customer-facing SLA breaches |
| Buying decision-maker | Owner/GM or Operations Manager (at this size, often the same person who dispatches) |
| Pricing sensitivity | High on a per-seat basis, more tolerant of a per-route or outcome-based fee tied directly to avoided failure cost |
| Implementation difficulty | Low-to-moderate — CSV import of an existing spreadsheet, no integration required |
| Expected sales cycle | 2–6 weeks from first conversation to signed pilot agreement, given the small buying committee |

Everything in the table above is an assumption to be confirmed or corrected during the validation interviews in `01-validation.md` — do not treat it as settled before at least 12–15 completed interviews (see that document for the exact count and reasoning).
