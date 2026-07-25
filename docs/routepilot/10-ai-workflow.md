# 10. AI-Assisted Development Workflow (Claude Code)

This is how the founder should actually operate Claude Code day to day — not generic prompt-engineering advice, but the specific native features (CLAUDE.md, plan mode, hooks, subagents, slash commands, checkpoints) applied to this project.

## 10.1 CLAUDE.md as the project constitution

Bootstrap with `/init` on the first coding task (see `16-first-actions-first-task.md`), then replace/extend the generated content with the version below. Update it whenever a task changes a convention, adds a command, or makes an architectural decision — this is what makes every new session start with correct context instead of the founder re-explaining the project from scratch.

**Recommended starting `CLAUDE.md` content** (place at repo root; adjust filenames as the real project structure solidifies):

```markdown
# RoutePilot — Project Constitution

## What this is
RoutePilot keeps committed drivers on recurring delivery routes and secures
paid, qualified backup coverage before a route fails. Full plan: docs/routepilot/.

## Stack
- Next.js (App Router) + TypeScript + React, Tailwind + shadcn/ui
- PostgreSQL via Supabase; Drizzle ORM
- Supabase Auth (managed) — never hand-roll auth
- Twilio for SMS (outbound + inbound webhooks)
- Resend for email, Stripe for billing (post-pilot), Trigger.dev for background jobs
- Vercel hosting, Sentry error monitoring, PostHog analytics

## Commands
- `npm run dev` — local dev server
- `npm run lint` — ESLint
- `npm run typecheck` — tsc --noEmit
- `npm test` — Vitest unit/integration tests
- `npm run test:e2e` — Playwright end-to-end tests
- `npm run db:migrate` — apply Drizzle migrations
- `npm run db:seed:demo` — seed the persistent demo environment (idempotent)

Run lint, typecheck, and test before reporting any task complete.

## Hard rules (never violate these without explicit founder approval)
1. The coverage-status state machine (docs/routepilot/03-workflows-state-machine.md)
   is the single source of truth for route status. No other component —
   messaging, risk engine, dashboard, reporting — maintains its own copy of
   status. All status reads come from `route_occurrences.coverage_status`
   as written by `lib/state-machine/transition.ts`; all status writes go
   through that function.
2. Every outbound message send is idempotent: write an `outbound_messages`
   row with a unique `(recipient_phone, trigger_type, occurrence_id)` key
   BEFORE calling the provider. Never call Twilio directly from anywhere
   except `lib/messaging/send.ts`.
3. No cross-tenant queries. Every tenant-owned table has RLS enabled.
   Every query must work correctly even if an application-level
   `organization_id` filter were accidentally omitted — RLS is the real
   boundary, app-level filtering is a second layer, not the only one.
4. No machine learning and no LLM-based reply interpretation in the
   product itself. The risk engine is rules-based and explainable
   (docs/routepilot/06-risk-engine.md). Inbound SMS parsing is keyword-first;
   anything unparseable goes to the needs-review queue, never guessed.
5. Migrations, messaging logic, auth, and tenancy changes always go through
   plan mode. Explore and propose a plan; wait for approval before writing
   code.
6. Make the smallest reasonable change. Do not refactor unrelated code,
   rename unrelated things, or "improve" adjacent files while completing a
   task. If you notice something that should change, say so — don't do it
   silently as part of an unrelated task.
7. Every mutating action does three things: a role/permission check, a
   business-rule validation, and an audit-log write — in that order,
   inside one transaction with the actual state change.
8. Secrets live in environment variables only. Never write a credential,
   API key, or token into a file that gets committed, including CLAUDE.md
   itself.

## Conventions
- Server Actions for internal mutations; API routes only for webhooks and
  signed driver-link pages (drivers never authenticate).
- Drizzle schema lives in `db/schema/`, one file per entity, matching the
  data model in docs/routepilot/04-architecture-data-api.md.
- Tests live alongside the code they test where practical
  (`*.test.ts`), E2E tests in `test/e2e/`.
- All timestamps stored in UTC; local-time display/scheduling always goes
  through the branch's stored timezone, never the server's local time.

## Where to find the plan
The full execution plan is in `docs/routepilot/`. Read
`docs/routepilot/09-task-backlog.md` for the current ordered task list and
`docs/routepilot/08-development-phases.md` for the phase this task belongs to
before starting unfamiliar work.

## Decision log
See `docs/routepilot/decision-log.md`. Append an entry whenever a task
changes a convention, a schema design choice, or an architectural decision
described in this file or the plan documents.
```

## 10.2 Plan mode for every non-trivial task

Have Claude Code explore the relevant code and present a plan before writing any code, for every task — not just the ones flagged `[PLAN MODE]` in the backlog. Migrations, messaging logic, auth changes, and tenancy changes are **required** to go through plan mode and wait for explicit founder approval before implementation; other tasks may move faster at the founder's discretion, but defaulting to plan mode is the safer habit for a non-expert founder to build.

## 10.3 One task per session

Give exactly one task from `09-task-backlog.md` per Claude Code session. Complete it, review the diff, commit, then run `/clear` before starting the next task. This keeps context clean and behavior predictable — a session that accumulates five tasks' worth of context is more likely to make an inconsistent or scope-creeping change on the sixth.

## 10.4 Permission configuration

Allowlist safe, frequent, read-only or side-effect-free commands in project settings (`.claude/settings.json`) so approval prompts are reserved for consequential actions:

```json
{
  "permissions": {
    "allow": [
      "Bash(npm run lint)",
      "Bash(npm run typecheck)",
      "Bash(npm test)",
      "Bash(npm run test:e2e)",
      "Bash(git status)",
      "Bash(git diff)",
      "Bash(git log*)",
      "Bash(npm run db:migrate -- --dry-run*)"
    ],
    "ask": [
      "Bash(git push*)",
      "Bash(npm run db:migrate)",
      "Bash(git commit*)"
    ]
  }
}
```

Never disable permission checks entirely, especially once real Twilio/Supabase/Stripe credentials exist in any environment the agent can reach.

## 10.5 Hooks as guardrails

Two starter hooks, both important given a non-expert founder is reviewing the diffs:

**Post-edit hook** — run type checker, linter, and formatter automatically after any file edit, so problems surface immediately rather than at the end of a task:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "npm run lint -- --fix \"$CLAUDE_FILE_PATH\" 2>&1 | tail -n 20"
          },
          {
            "type": "command",
            "command": "npx tsc --noEmit 2>&1 | tail -n 30"
          }
        ]
      }
    ]
  }
}
```

**Pre-tool-use guard** — block obviously dangerous commands and scan writes for secrets before they happen:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "scripts/hooks/block-dangerous-commands.sh"
          }
        ]
      },
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "scripts/hooks/scan-for-secrets.sh"
          }
        ]
      }
    ]
  }
}
```

`scripts/hooks/block-dangerous-commands.sh` should reject (non-zero exit, with a clear stderr message) commands matching patterns like `rm -rf`, `git push --force`, `git reset --hard`, `DROP TABLE`, `DROP DATABASE`, or direct `psql`/`supabase db reset` against anything that isn't clearly the local dev database.

`scripts/hooks/scan-for-secrets.sh` should reject a write whose content matches common secret patterns (Twilio auth tokens, Stripe keys, anything matching `AKIA[0-9A-Z]{16}`, a raw `postgres://` connection string with a password, etc.) — a fast regex pass is sufficient at this scale; it's a backstop, not a full secret-scanning product.

## 10.6 Subagents: when they help, when they just hide context

- **Explore agent** (read-only): use for "how does X currently work" questions before starting a task that touches unfamiliar code — e.g., "how does the eligible-backup query currently filter by qualification?" before extending it. This protects the main session's context from a long file-reading detour.
- **Code-review subagent**: worth setting up to check a completed task's diff against its acceptance criteria before commit, especially for concurrency-sensitive tasks (standby offers, primary assignment) where a human founder may not spot a subtle race condition just by reading the diff.
- **When subagents just hide context:** don't delegate a task's actual implementation to a subagent and then approve its summary without reading the diff — the founder must still review every change personally (§10.9). Subagents are for research and pre-commit checking, not for making decisions on the founder's behalf about what ships.

## 10.7 Custom slash commands

Create these in `.claude/commands/`.

**`.claude/commands/task.md`** — wraps the Section 9 task template:

```markdown
---
description: Start a task from the RoutePilot backlog using the standard template
---

Read the task titled "$ARGUMENTS" from docs/routepilot/09-task-backlog.md.

Before writing any code:
1. Explore the files listed in "Files likely affected" plus anything else
   relevant, and summarize the current state.
2. State your assumptions explicitly.
3. Present a plan covering: what you'll change, why, and how it satisfies
   every item in the task's Validation, Tests, and Acceptance criteria
   sections.
4. If this task touches migrations, messaging, auth, or tenancy, wait for
   my explicit approval before implementing. Otherwise you may proceed
   after presenting the plan unless I say to wait.

When implementing:
- Make the smallest reasonable change that satisfies the task. Do not
  refactor or touch files outside its stated scope.
- Add the tests specified in the task.
- Run `npm run lint`, `npm run typecheck`, and `npm test` yourself and
  report the results before declaring the task done.
- Report exactly what changed, file by file.
- Note any unresolved risks or follow-up needed.
- If this task changed a convention or architectural decision, update
  CLAUDE.md and append an entry to docs/routepilot/decision-log.md.
- Propose the commit message from the task's "Commit message" field
  (adjust only if the actual change diverged from the task description).
```

**`.claude/commands/review.md`** — pre-commit review:

```markdown
---
description: Review the current diff before committing
---

Review the uncommitted changes (`git diff` and `git status`) against:
1. Does this match the smallest reasonable change needed, with no
   unrelated refactors or drive-by edits?
2. Are there any cross-tenant query risks (missing organization scoping)?
3. If this touches messaging: is every send idempotent, and does it
   respect quiet hours / consent / frequency caps / the kill switch?
4. If this touches coverage status: does every write go through the
   state-machine transition function, with no component maintaining its
   own status copy?
5. Are tests included and passing?
6. Any secrets, credentials, or API keys accidentally included?

Report findings as a short list, ranked by severity. Do not fix anything
automatically — just report, so I can decide what to address before
committing.
```

**`.claude/commands/migrate.md`** — migration checklist:

```markdown
---
description: Enforce the migration checklist for schema changes
---

You are about to write or modify a database migration. Before doing so:

1. Explain in plain language what schema change is needed and why.
2. Show the proposed table/column changes, including any new indexes,
   constraints, and RLS policies.
3. Confirm: does every new tenant-owned table have organization_id and an
   RLS policy scoping it? If not, add one — do not skip this "for now."
4. Confirm: does this migration have a working rollback?
5. Wait for my explicit approval before running the migration against
   anything other than the local dev database.
6. After applying locally, run the multi-tenant isolation test suite and
   report the result.
```

## 10.8 Tests required with every feature

Every task in the backlog specifies its own tests; Claude Code should run them itself (via the allowlisted `npm test`/`npm run test:e2e` commands) and report pass/fail before declaring a task complete — never report success without having actually run the suite.

## 10.9 Review every diff

The founder reads every diff before committing, even for small tasks. Claude Code proposes; the founder approves. This is non-negotiable specifically because the founder is a non-expert — the review doesn't need to catch every subtlety, but it must catch "this touched files I didn't expect" or "this doesn't match what I asked for."

## 10.10 Branches, commits, PRs, CI

Small commits per task; Claude Code can create branches, commits, and pull requests; the founder merges. CI (lint, typecheck, test) runs on every branch/PR — a PR should not be merged with a red check.

## 10.11 Checkpoints and rollback

When an implementation goes sideways (the diff doesn't make sense, tests are failing in a way that's hard to reason about, or the approach clearly diverged from the plan), revert rather than patching a bad direction: `git checkout -- .` or reset to the last good commit, `/clear`, and re-run the task with a corrected prompt that addresses what went wrong. Patching a wrong foundation costs more time than restarting cleanly.

## 10.12 Preventing scope creep

Explicitly instruct Claude Code, in every task (the `/task` command already does this), to make the smallest reasonable change and not refactor unrelated code. If a diff touches files outside the task's stated scope, treat that as a reason to reject and re-run the task with a tighter prompt, not something to wave through because "it's probably fine."

## 10.13 Secrets

Environment variables only — `.env.local` (gitignored) locally, the hosting platform's secret store in staging/production. CLAUDE.md and every other committed file must never contain a real credential; the pre-tool-use secret-scan hook (§10.5) is the backstop, not the primary control.

## 10.14 Decision log

Maintain `docs/routepilot/decision-log.md` as a running append-only file. Each task that changes a convention or makes an architectural call gets an entry:

```markdown
## 2026-08-03 — Standby offer concurrency enforced via partial unique index
Considered: application-level check-then-write vs. DB-level constraint.
Chose DB-level partial unique index because near-simultaneous webhook
deliveries make application-level ordering unreliable. See Task 8.2.
```

## 10.15 Headless/CI usage — worth it before or after the pilot?

**Recommendation: after the pilot, not before.** Automated PR review via GitHub Actions (e.g., a headless Claude Code pass on every PR) adds real value once there's enough commit volume and enough at stake (real customer data, real messaging spend) to justify the added complexity of a second automated reviewer. Before the pilot, the founder's own review of every diff (§10.9) plus the `/review` command is sufficient and simpler to reason about. Revisit this once the pilot is live and the founder's time is the binding constraint rather than the review process itself.

## 10.16 Reusable Claude Code task prompt template

Use this verbatim (or via the `/task` command above) for any task not already in the Section 9 backlog — e.g., a bug fix or a small change during the pilot:

```
Task: [one-line description]

Start in plan mode. Explore the relevant code first:
- [list the files/areas you believe are relevant, or ask Claude Code to
  find them]

Before writing any code:
1. State your assumptions explicitly.
2. Identify every file you expect to change.
3. If this touches migrations, messaging, auth, or tenancy, present the
   plan and wait for my explicit approval before implementing anything.

When implementing:
- Make the smallest reasonable change that accomplishes the task.
- Preserve existing behavior in everything not directly in scope.
- Add tests covering the new/changed behavior.
- Run the project's lint, typecheck, and test commands (from CLAUDE.md)
  yourself, and report the actual results — not an assumption that they
  would pass.

When reporting back:
- State exactly what changed, file by file.
- Identify any unresolved risks or edge cases you didn't handle.
- If this changed a convention, architecture decision, or added a new
  command, update CLAUDE.md and append an entry to
  docs/routepilot/decision-log.md.
```
