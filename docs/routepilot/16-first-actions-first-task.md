# 16. Immediate Next 10 Actions and First Claude Code Coding Task

## 16.1 First 10 actions

These are ordered by dependency and lead time, not strictly by calendar sequence — several run in parallel from day one.

1. **Build the target list and start outreach for validation interviews.**
   - Deliverable: a list of 30–50 candidate companies/contacts in the beachhead segment (regional/dedicated-route/medical courier operators), plus outreach sent to the first 10–15.
   - Effort: ~4–6 hours.
   - Required input: LinkedIn/local business directory access, the ICP in `00-overview.md`.
   - Completion criteria: at least 5 interviews scheduled.
   - Before or after coding: **before**.

2. **Conduct and document the first 15 validation interviews.**
   - Deliverable: completed interview docs per `01-validation.md` §1.4's template, plus a summary against the §1.6 evidence thresholds.
   - Effort: ~15–20 hours spread over 3–4 weeks.
   - Required input: the scripts in `01-validation.md` §1.2/§1.3.
   - Completion criteria: 15 interviews logged, a proceed/revise/narrow/stop determination written down.
   - Before or after coding: **before** full MVP development; the walking skeleton (action 8 below) may start once 5–6 dispatcher interviews are done.

3. **Begin A2P 10DLC brand and campaign registration with Twilio.**
   - Deliverable: registration submitted (brand + campaign), tracking number for approval status.
   - Effort: ~2–3 hours of form-filling, then a multi-week wait.
   - Required input: a registered business entity (or a plan for one), Twilio account.
   - Completion criteria: registration submitted and in-process (approval is the later completion criterion, tracked as a pilot-readiness gate, not this action's own).
   - Before or after coding: **before** — this has the longest external lead time in the entire plan and must start immediately, in parallel with interviews.

4. **Recruit 2–3 design partners from the interview pool.**
   - Deliverable: verbal or written commitment from at least one company to pilot.
   - Effort: folded into the interview process, ~2–4 additional follow-up hours.
   - Required input: completed interviews showing willingness to pilot (action 2).
   - Completion criteria: at least one signed or clearly-committed design partner.
   - Before or after coding: **before** Phase 5 (real commitment/messaging features); can be in progress while the walking skeleton is built.

5. **Set up the founder's own core accounts.**
   - Deliverable: Supabase project, Vercel project, Twilio account, Sentry project, PostHog project all created (dev-tier).
   - Effort: ~2 hours.
   - Required input: a business email, a payment method for any paid tiers needed.
   - Completion criteria: all five accounts exist and their dev/free tiers are confirmed working.
   - Before or after coding: **before** (technically a setup action, not itself coding).

6. **Create the git repository and run the first Claude Code task (below).**
   - Deliverable: scaffolded Next.js project, CLAUDE.md, hooks, slash commands, CI, decision log.
   - Effort: ~2–4 hours including review.
   - Required input: the task prompt in §16.2, accounts from action 5.
   - Completion criteria: `npm run dev`/`lint`/`typecheck`/`test` all pass locally and in CI; CLAUDE.md reviewed and approved by the founder.
   - Before or after coding: **this is the first coding action.**

7. **Draft the one-page pilot agreement template.**
   - Deliverable: a simple written pilot agreement (scope, duration, price/free, mutual commitments).
   - Effort: ~2 hours drafting, plus time for a design partner to review/sign later.
   - Required input: the pilot plan in `13-pilot-plan.md` §13.1.
   - Completion criteria: template ready to send to the first committed design partner.
   - Before or after coding: **before** (can be drafted in parallel with early development).

8. **Build and prove the walking skeleton (Phase 2).**
   - Deliverable: the schedule → SMS → reply → state change → dashboard loop, working end-to-end, per Tasks 2.1–2.6 in `09-task-backlog.md`.
   - Effort: the single largest chunk of early engineering effort — plan for several Claude Code sessions across 1–3 weeks depending on the founder's chosen timeline pace.
   - Required input: Phase 1 foundation complete, Twilio staging credentials.
   - Completion criteria: the Task 2.6 end-to-end test passes reliably (3 consecutive runs) and one fully manual real-phone pass has been done.
   - Before or after coding: **this is coding** — the first major engineering milestone.

9. **Schedule a first-pass legal review of worker-classification and consent language.**
   - Deliverable: a scheduled consultation (even brief) with employment/labor counsel, or at minimum, identification of who that counsel will be.
   - Effort: ~1–2 hours to find/schedule; the review itself is external.
   - Required input: the guardrails in `07-messaging-design.md` §7.6.
   - Completion criteria: a scheduled review date, ideally before Phase 5's disclosure/commitment language is finalized for real drivers.
   - Before or after coding: **before** real driver-facing language ships to a pilot, can be scheduled in parallel with early development.

10. **Set up the persistent decision log and pilot incident log.**
    - Deliverable: `docs/routepilot/decision-log.md` initialized (empty, ready for entries per `10-ai-workflow.md` §10.14), and a placeholder pilot incident-log doc/spreadsheet for later use.
    - Effort: ~30 minutes.
    - Required input: none beyond this plan.
    - Completion criteria: both documents exist and are referenced from CLAUDE.md.
    - Before or after coding: **before**, and it's part of the first coding task's deliverables below.

## 16.2 First Claude Code coding task — exact prompt

Run this in **plan mode**. Review the plan Claude Code proposes before approving execution — this task touches project structure, CI, and security baseline conventions that everything else will build on.

```
Objective: Set up a clean, secure Next.js + TypeScript project foundation
for RoutePilot — a recurring-delivery-route coverage-assurance SaaS
product. Do NOT build any product feature yet (no drivers, routes,
messaging, etc.). This task is purely the scaffold: project structure,
tooling, CI, security baseline, and the Claude Code working environment
itself.

Recommended stack:
- Next.js (App Router) + TypeScript + React
- Tailwind CSS + shadcn/ui
- PostgreSQL via Supabase, Drizzle ORM
- Supabase Auth (managed — do not scaffold any custom auth)
- Vitest for unit/integration tests, Playwright for end-to-end tests
- ESLint + Prettier
- Vercel-compatible project structure
- Sentry (error monitoring) and PostHog (analytics) SDKs installed but
  not yet wired to any real feature — just confirm they initialize
  without error

Repository requirements:
- Initialize (or use the existing) git repository.
- Run `/init` first to bootstrap an initial CLAUDE.md from the codebase,
  then REPLACE its content with the CLAUDE.md content specified in
  docs/routepilot/10-ai-workflow.md section 10.1 (read that file for the
  exact content) — adjust only where the actual scaffolded structure
  differs from what's described there, and note any such adjustment.
- Add a .gitignore covering node_modules, .env*, build artifacts, and
  editor files.
- Add .env.example listing every environment variable the app will need
  (Supabase URL/keys, Twilio credentials, Resend key, Sentry DSN,
  PostHog key) with placeholder values only — never real values.

Project structure:
- `app/` — Next.js App Router structure with a placeholder root page
- `db/schema/` — empty, ready for Drizzle schema files (do not create any
  entity schema yet — that starts at Task 1.2 in the backlog)
- `lib/` — empty, ready for shared logic
- `test/` — Vitest config and one trivial passing test
- `test/e2e/` — Playwright config and one trivial passing test (e.g.,
  loading the placeholder root page)
- `docs/routepilot/decision-log.md` — initialize as an empty, ready-to-append
  file per the format shown in docs/routepilot/10-ai-workflow.md section 10.14
- `.claude/settings.json` — permission allowlist per
  docs/routepilot/10-ai-workflow.md section 10.4
- `.claude/commands/task.md`, `.claude/commands/review.md`,
  `.claude/commands/migrate.md` — exact content from
  docs/routepilot/10-ai-workflow.md section 10.7
- `scripts/hooks/block-dangerous-commands.sh` and
  `scripts/hooks/scan-for-secrets.sh` — implement per the description in
  docs/routepilot/10-ai-workflow.md section 10.5, and wire them into
  `.claude/settings.json` hooks configuration exactly as shown there

Environment configuration:
- Local dev should run against a local or free-tier Supabase project
  (document the exact setup steps in a README).
- No secrets committed anywhere, including CLAUDE.md, settings files, or
  example env files (placeholders only).

Code-quality standards:
- Strict TypeScript (`strict: true` in tsconfig).
- ESLint configured with a standard Next.js + TypeScript ruleset.
- Prettier configured and integrated with ESLint (no conflicting rules).

Testing setup:
- Vitest configured and runnable via `npm test`.
- Playwright configured and runnable via `npm run test:e2e`, using the
  pre-installed Chromium at /opt/pw-browsers/chromium if that's the
  environment's convention — check for an existing Playwright config
  pattern in this environment before assuming defaults.

Continuous-integration setup:
- A GitHub Actions workflow that runs lint, typecheck, and both test
  suites on every push and pull request.

Security expectations:
- No hardcoded secrets anywhere in the repository.
- .gitignore correctly excludes all local secret files.
- The pre-tool-use secret-scanning hook must actually reject a test write
  containing a fake API-key-shaped string, as a smoke test of the hook
  itself (verify this, then remove the test file).

Documentation requirements:
- A top-level README with: project one-line description, setup
  instructions (clone, install, environment variables needed, how to run
  dev/test/lint/typecheck), and a pointer to docs/routepilot/ for the full
  plan.
- CLAUDE.md as specified above.

Commands you should run yourself before reporting completion:
- npm install
- npm run lint
- npm run typecheck
- npm test
- npm run test:e2e
- A test run of the pre-tool-use secret-scan hook against a deliberately
  fake-secret-containing string, confirming it blocks

Acceptance criteria:
- `npm run dev` boots a working blank Next.js app locally.
- `npm run lint`, `npm run typecheck`, `npm test`, and `npm run test:e2e`
  all pass with zero errors.
- CI workflow file is present and would run the same four checks on push.
- CLAUDE.md, .claude/settings.json, .claude/commands/*, the two hook
  scripts, and docs/routepilot/decision-log.md all exist with the content
  described above.
- No secrets anywhere in the committed tree.

Before implementing: explore whether any existing project structure or
conventions are already present in this repository (there may be
unrelated existing files — check first and do not delete or disrupt
anything not related to this scaffold). State your assumptions about
package manager (npm vs. pnpm vs. yarn — default to npm unless something
in the repo suggests otherwise) and Node version before proceeding.
Present your full plan and wait for my approval before creating or
modifying any files, since this task establishes conventions every future
task will follow.

Expected final report:
- Exactly what was created/changed, file by file.
- The actual output of each command you ran (lint/typecheck/test/e2e/hook
  smoke test), not a summary claiming they passed.
- Any assumption you made that I should confirm or correct.
- Confirmation that CLAUDE.md and the decision log are ready for the next
  task (Task 1.2 in docs/routepilot/09-task-backlog.md: database schema for
  organizations, branches, users, roles).
```
