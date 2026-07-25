# 14. Metrics, Pricing Hypothesis, Ultra-Lean Operating Model, Budget

## 14.1 Metrics (with formulas)

### Product metrics
- **Initial coverage rate** = (occurrences with a confirmed primary at T-24h) / (total occurrences), measured in the first week, as the baseline.
- **Final coverage rate** = (occurrences that ran with any driver — primary or recovered backup) / (total occurrences), measured across the full pilot.
- **Commitment acceptance rate** = accepted commitments / total commitment invitations sent.
- **Confirmation rate** = confirmed responses / total confirmation checkpoints fired.
- **Late-decline rate** = declines/cancellations received after the day-before checkpoint / total assignments.

### Operational metrics
- **Cancellation rate** = canceled primary assignments / total assignments.
- **No-show rate** = occurrences with no response and no driver arrival / total occurrences.
- **Backup acceptance rate** = accepted standby offers / total standby offers sent.
- **Recovery rate** = occurrences reaching `recovered` after a `primary_canceled` event / total `primary_canceled` events.
- **Average time to recover** = mean(time from `primary_canceled` timestamp to `recovered` timestamp) across recovered occurrences.
- **Routes recovered before dispatch intervention** = recoveries where the standby offer was sent automatically (risk-triggered or auto-sourcing) before a dispatcher manually acted / total recoveries.
- **Dispatcher actions per route** = count of manual dispatcher actions (assign, override, manual message, activate) / total occurrences — a proxy for how much manual effort the product still requires.
- **Messages per route** = total outbound + inbound messages / total occurrences.

### Customer-value metrics
- **Driver response rate** = inbound responses received / outbound messages requiring a response.
- **Median driver response time** = median(time from message sent to reply received).
- **Driver opt-out rate** = drivers who send STOP / total active drivers, over the pilot period.
- **Needs-review replies per 100 inbound messages** = (unparsed/out-of-context inbound messages / total inbound messages) × 100 — the key metric for the "is keyword parsing sufficient" decision gate (see `15-timelines-gates-roadmap.md`).
- **Driver retention** = drivers still actively committed to at least one recurring route at the end of the pilot / drivers committed at the start.
- **Primary-driver consistency** = occurrences completed by the originally-committed primary (no cancellation) / total completed occurrences.

### Business metrics
- **Cost per recovered route** = (messaging cost + standby compensation paid, if tracked + founder time valued, optional) / total recovered routes.
- **Customer-estimated avoided failure cost** = customer's own stated cost-per-uncovered-route (from validation interviews, `01-validation.md`) × (routes recovered that would otherwise have failed) — this is the number that justifies price, gathered qualitatively in the weekly customer review, not purely computed.

## 14.2 Pricing hypothesis (validate, do not treat as final)

Models evaluated: per-branch, per-dispatcher, per-recurring-route, per-active-driver, per-covered-occurrence, platform fee + messaging usage, platform fee + recovery fee, tiered subscription.

**Recommendation: a platform fee per branch that includes a route-count tier, plus messaging as a modest included allotment with overage — not a per-seat (per-dispatcher) model.** Reasoning: the beachhead customer has very few dispatchers (1–3) so per-dispatcher pricing caps revenue too low and creates a perverse incentive against adding dispatcher seats; the value scales with route/driver volume, not headcount, so tying price to routes matches the value delivered while remaining simple enough for a small buyer to understand.

| | Pilot price | Early production price |
|---|---|---|
| Structure | Flat monthly platform fee, or free, in exchange for feedback and a case study | Platform fee per branch, tiered by route count (e.g., a base tier up to 25 recurring routes, a higher tier up to 50) |
| Included | Full feature set, SMS included up to a generous pilot allotment | Full feature set, SMS included allotment scaled to route-count tier |
| SMS treatment | Absorbed by RoutePilot during pilot (small enough volume to not matter, and removes a friction point from the pilot conversation) | Included allotment + metered overage — pass-through at a modest markup once volume is significant enough to matter |
| Onboarding fee | None during pilot | Optional small one-time fee post-pilot to cover CSV cleanup/import support time, waived for design partners |
| Discount | Pilot itself is the discount | First 90 days of paid service discounted (e.g., 25–50% off) as a pilot-to-paid transition incentive |
| Annual plan | Not offered during pilot | Offer an annual discount once pricing is validated across 3+ paying customers, not before |
| Higher-tier reservations | N/A | Multi-branch support, reporting exports/API access, and (much later) any ML-based prediction features are natural higher-tier reservations post-MVP |

**This entire pricing structure is a hypothesis.** The number itself (a specific dollar figure) should come out of the willingness-to-pay interview data (`01-validation.md` §1.2 Q10) rather than being invented here — validate a specific number against at least 3–5 real willingness-to-pay conversations before quoting it as a standard rate.

**Manual invoicing is fine through the pilot and into early paid service.** Wire up automated billing (Stripe) once there are 2 or more paying customers, or once manual invoicing is consuming more than roughly an hour a month of founder time, whichever comes first — don't build billing automation for a single customer.

## 14.3 Ultra-lean operating model (one founder + AI assistance)

| Function | Founder handles | AI assists with | Automate | Outsource | Manual during pilot |
|---|---|---|---|---|---|
| Product development | Direction, review, decisions | Claude Code implementation | CI/tests | — | — |
| Customer research | Interviews, synthesis | Drafting interview scripts, summarizing transcripts | — | — | All of it |
| Sales outreach | Relationship, closing | Drafting outreach messages, researching prospects | — | — | All of it |
| Onboarding | Configuration review, training call | CSV cleanup scripting, import validation messaging | Import preview/validation UI | — | Training delivery |
| Customer support | All responses during pilot | Drafting responses, triaging needs-review items | Automated alerts (job-health, delivery failures) | — | All direct customer contact |
| Documentation | Review/approval | First drafts (help copy, onboarding one-pagers) | — | — | — |
| Billing | Sending invoices | Drafting invoice text | Stripe, once justified (§14.2) | — | Manual invoicing |
| Marketing | Strategy, voice | Drafting content, case-study copy | Scheduling posts (a simple scheduler) | — | — |
| Content creation | Review/approval | Drafting (blog posts, case studies once available) | — | — | — |
| Analytics | Interpreting | Building/adjusting PostHog dashboards | Dashboard refresh | — | — |
| Incident response | Decisions, customer communication | Drafting incident-log entries, root-cause investigation help | Alerting (Sentry, messaging observability) | — | All customer-facing incident communication |
| Product feedback | Synthesis, prioritization | Summarizing weekly feedback forms/calls | Feedback form itself | — | — |
| Legal administration | Decisions, counsel relationship | Drafting first-pass agreement language for counsel review | — | Actual legal review (counsel) | — |
| Bookkeeping | Review | Categorizing transactions (with a tool like a bookkeeping AI assistant) | Bank/expense sync | A bookkeeper/accountant once revenue justifies it | Pilot-stage manual tracking |

## 14.4 Estimated monthly budget

All figures are plausible ranges for a solo founder at small scale, not quotes.

### Pre-revenue development (Phase 0–10, before any pilot)

| Item | Range |
|---|---|
| Hosting (Vercel) | $0–20 |
| Database (Supabase) | $0–25 |
| Auth (Supabase, bundled) | $0 |
| Messaging (Twilio number + A2P 10DLC registration fees) | $50–150 (mostly the one-time/monthly registration fees; usage is near-zero pre-pilot) |
| Email (Resend) | $0 |
| Background jobs (Trigger.dev) | $0–25 |
| Monitoring (Sentry) | $0 |
| Analytics (PostHog) | $0 |
| Domain | $1–2/mo (annual purchase) |
| Legal review | $0–500 (one-time, if a first pass at disclosure/terms language is reviewed early) |
| Insurance | $0 (not yet needed pre-revenue) |
| Accounting | $0 (founder-managed) |
| Customer support | $0 (no customers yet) |
| AI development tools (Claude Code usage) | $20–200 depending on plan/usage |
| **Total** | **roughly $100–900/month** |

### One-customer pilot

| Item | Range |
|---|---|
| Hosting | $20–40 |
| Database | $25–50 |
| Messaging (real SMS volume for 25–150 drivers, moderate cadence) | $50–300 |
| Email | $0–20 |
| Background jobs | $10–25 |
| Monitoring | $0–26 |
| Analytics | $0 |
| Domain | $1–2 |
| Legal review | $0–1,000 (one-time, worker-classification/consent language review before real drivers are messaged) |
| Insurance | $0–150 (general liability/tech E&O consideration begins here) |
| Accounting | $0–100 |
| Customer support | $0 (founder time) |
| AI development tools | $20–200 |
| **Total** | **roughly $150–1,900/month**, with the wide range driven mostly by whether one-time legal/insurance costs land in a given month |

### Five-customer early production stage

| Item | Range |
|---|---|
| Hosting | $40–100 |
| Database | $50–150 (likely a paid tier for point-in-time recovery) |
| Messaging | $250–1,500 (scales with driver count and message cadence across 5 customers) |
| Email | $10–30 |
| Background jobs | $25–75 |
| Monitoring | $26–80 |
| Analytics | $0–100 |
| Domain | $1–2 |
| Legal review | $0–500 (ongoing, as-needed) |
| Insurance | $100–300 |
| Accounting | $100–300 (likely a bookkeeper by this stage) |
| Customer support | $0 (still founder-handled, but time is now the real constraint, not cost) |
| AI development tools | $50–300 |
| Billing (Stripe, once wired up) | ~2.9% + $0.30 per transaction |
| **Total** | **roughly $650–3,400/month** |

No unnecessary enterprise software at any stage — every tool above is a self-serve, usage-based product appropriate for a pre-Series-A solo operation.
