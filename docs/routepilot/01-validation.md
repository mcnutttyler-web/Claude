# 1. Product Validation Plan (Do This Before Writing Code)

Goal: prove that recurring-route coverage failure is painful and costly enough that a small delivery operator will pay for software to reduce it, using SMS as the interaction channel with drivers, and that at least one operator will commit to a real pilot.

## 1.1 Step-by-step validation sequence

1. **Define the ideal customer profile (ICP)** using the beachhead profile in `00-overview.md`. Write it down as a one-page document: company size, route count, driver type, current tools. Update it after every 3–4 interviews.
2. **Select the first logistics niche.** Start with dedicated/contract route operators and medical courier companies specifically (not "last-mile" broadly). Source a target list of 30–50 companies from local business directories, LinkedIn (operations managers/dispatch leads at regional couriers), industry Facebook/LinkedIn groups for owner-operators and courier companies, and referrals from any existing network.
3. **Interview dispatchers and operations leaders** (target 10–12 of the 15 total interviews). Use the script in §1.2.
4. **Interview independent delivery drivers** (target 5–8 of the 15). Use the script in §1.3. Recruit through the same companies (ask the ops leader to introduce 1–2 drivers) and through owner-operator Facebook groups.
5. **Document current recurring-route workflows** after every interview using the template in §1.4 — how routes are assigned today, how confirmation happens today, and what tool (if any) is used.
6. **Identify why drivers cancel or fail to appear** — capture verbatim reasons from both sides (dispatcher-reported and driver-reported) — these become the seed list for reason-coded cancellations (§7) and risk signals (§10).
7. **Measure the cost of uncovered routes.** Ask directly for a number (see §1.2 question set); if the operator can't produce one, help them estimate it live in the interview (missed-delivery penalty, overtime/emergency-driver premium, customer-retention risk, dispatcher hours spent firefighting per week).
8. **Identify existing tools and workarounds** — spreadsheets, group texts, GPS/dispatch software, paper logs, a VA making phone calls. This tells you what RoutePilot must be *better than*, not just "have."
9. **Test the RoutePilot value proposition** using the pitch in §1.2 (question 9) — describe the product in one paragraph and gauge reaction before showing anything.
10. **Test willingness to pay** explicitly (§1.2, questions 10–11) — do not accept "that sounds useful" as a signal; ask for a number and a commitment.
11. **Recruit design partners.** Target 2–3 companies willing to be a paid or discounted pilot in exchange for input into the build. Get a verbal or written pilot commitment before development begins in earnest (Phase 2 walking skeleton can start in parallel, since it needs no customer-specific configuration).
12. **Define pilot success criteria** with the design partner directly — see `13-pilot-plan.md` §13.6 for the full framework; agree on this during recruitment, not after the pilot starts.

## 1.2 Interview script — Dispatchers / Operations Leaders (45 minutes)

**Warm-up / context**
1. Walk me through a typical week for you as a dispatcher — what are you doing hour to hour?
2. How many recurring routes does your branch run? How many drivers do you rely on regularly?

**Current workflow**
3. How do you currently assign a driver to a recurring route? Walk me through it step by step, from "this route needs a driver" to "the driver shows up."
4. How do you confirm a driver is actually going to show up before the route runs? Do you do this every time, or only sometimes?
5. What tool(s) do you use for this today — spreadsheet, texting app, dispatch software, paper, whiteboard? Can you share your screen and show me?

**Pain point discovery**
6. Tell me about the last time a committed driver canceled or didn't show up. What happened next, step by step? How long did it take you to recover?
7. How often does this happen — daily, weekly, monthly? For roughly what percentage of your routes?
8. When it happens, what does it cost you — in dollars, in customer relationship, in your own time? (Push for a number: "If you had to put a dollar figure on one uncovered route, what would it be?")

**Value proposition test**
9. *[Describe RoutePilot in one paragraph: "Imagine a system that discloses full route details to a driver before they commit, tracks their confirmation automatically by text message, and — the moment a driver cancels — instantly finds you a qualified, already-vetted backup driver and offers them paid standby, so you have a replacement lined up before the route is even due to leave."]* — What's your gut reaction? What would worry you about this?

**Willingness to pay**
10. If this cut your uncovered-route rate significantly, what would that be worth to you per month? (Let them answer unprompted first, then anchor: "Some companies might expect to pay $X–$Y per month for something like this — does that sound in the right range, too high, or too low?")
11. Would you be willing to run a real pilot — actual routes, actual drivers — for 4–6 weeks, at a reduced or free rate in exchange for your feedback shaping the product?

**Closing**
12. Who else, besides you, would need to sign off on bringing in a tool like this?
13. Can I follow up with you in [X weeks] once we have something to show?

## 1.3 Interview script — Independent Drivers (20–25 minutes)

1. How do you usually find out about a route or shift you're committing to? Text, call, app, in person?
2. When you commit to a recurring route, how much detail do you get up front — pay, stops, hours, vehicle requirements?
3. Has a route ever turned out different from what you expected once you started it? What happened?
4. How does the dispatcher confirm with you that you're actually coming, the day before or day of?
5. Tell me about a time you had to cancel or couldn't make a route. Why? How did you let the dispatcher know? What happened after?
6. Would you respond to a text message asking you to confirm "yes/no" the night before a route? Would you rather do that than get a phone call?
7. If a route you were on fell through and you were offered a same-day paid backup/standby shift by text, would you take it? What would make you say no?
8. Do you ever ignore texts from dispatch? Why?

## 1.4 Post-interview documentation template

For every interview, capture in a shared doc (spreadsheet is fine):
- Company/driver name, segment, date
- Current route-assignment process (numbered steps)
- Current confirmation process (numbered steps)
- Tools/workarounds used today
- Top 3 cancellation/no-show reasons mentioned
- Estimated cost of one uncovered route (their number, or the number you helped them estimate)
- Reaction to the value proposition (verbatim quote if possible)
- Willingness-to-pay signal (number given, range, or "no")
- Willingness to pilot (yes / maybe / no + why)

## 1.5 How many interviews before development begins

- **Minimum 15 total interviews before starting Phase 1** (product foundation): 10–12 dispatchers/ops leaders + 5–8 drivers. This is enough to see repeated patterns without stalling for months — a solo founder should be able to complete this in 3–4 weeks of part-time outreach.
- **The walking skeleton (Phase 2) may begin in parallel once 5–6 dispatcher interviews are done**, since it requires no customer-specific configuration decisions, only proof that the technical path works. Do not build past the walking skeleton until validation is complete.
- **Do not sign a real pilot agreement until at least one design partner has been interviewed AND has independently stated a cost estimate and a "yes" to piloting** — a design partner recruited without going through the interview is a weaker commitment and often churns.

## 1.6 Evidence thresholds: proceed / revise / narrow / stop

**Proceed to MVP development** if, across ≥15 interviews:
- ≥70% of dispatchers describe uncovered recurring routes as a recurring (weekly-or-more) problem, not a rare one.
- At least half can name or estimate a real cost per failure (even roughly).
- At least 2 companies say yes to piloting and at least 1 signs a pilot agreement (verbal is acceptable to start Phase 2; written before Phase 5).
- Drivers broadly confirm they'd respond to SMS confirmations (≥70% say yes or "probably").
- No fundamental blocker surfaces (e.g., "we're contractually required to use platform X for all driver communication").

**Revise the product** if:
- The pain is real but the proposed shape is wrong — e.g., dispatchers care far more about *finding* new drivers than about *keeping* committed ones, or the backup/standby-pay mechanic gets consistent pushback ("we'd never pay someone to just be on standby").
- Action: adjust which layer (Prevention/Recovery/Prediction) gets emphasis in the MVP; do not restart validation from zero, just re-run the value-proposition question (§1.2 Q9) with the revised pitch against 3–5 more interviewees.

**Narrow the target customer** if:
- Signal is strong in one sub-segment (e.g., medical courier) and weak/mixed in others (e.g., meal-kit). Pick the strong sub-segment and re-run §1.5's threshold against it specifically before proceeding.

**Stop development** if:
- Fewer than 30% of dispatchers see this as a recurring, costly problem.
- No company will name a cost estimate or agree to pilot after 20+ attempted interviews.
- Drivers overwhelmingly say they ignore dispatch texts already (this invalidates the core interaction channel, not just a feature).
- If this happens, the correct move is to revisit the segment (go back to the customer-segment evaluation in `00-overview.md`) before touching the current MVP design further — do not "build it anyway and see."
