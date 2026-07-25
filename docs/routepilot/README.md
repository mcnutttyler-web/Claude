# RoutePilot: Idea → MVP → Pilot → Paying Customers

This is the complete execution plan for RoutePilot, an AI-first, ultra-lean SaaS company that keeps committed drivers on recurring delivery routes and secures qualified, paid backup coverage before a route fails.

**Core promise:** RoutePilot keeps committed drivers on recurring routes—and has a paid, qualified backup ready before coverage fails.

This plan is written for a non-expert founder who will use **Claude Code** as the primary development environment. It follows the structure requested in the planning brief (Section 30, "Final Output Structure"). Read the documents in order the first time; after that, use this index to jump to the section you need.

## How to use this plan

1. Read `00-overview.md` through `03-workflows-state-machine.md` before touching any code. These establish the product, the customer, and the rules everything else depends on.
2. Do **not** start the Claude Code task backlog (`09-task-backlog.md`) until the validation plan (`01-validation.md`) has produced a real design partner and the decision gates in `15-timelines-gates-roadmap.md` say "proceed."
3. `10-ai-workflow.md` contains the actual CLAUDE.md, hooks, and slash command file contents — set these up in the repo before running Task 1.
4. Treat every number in this plan (pricing, timelines, budget) as a **hypothesis** until the pilot proves or disproves it. That labeling is repeated throughout rather than caveated once, because founders skim.

## Table of contents

| # | File | Covers (planning-brief sections) |
|---|------|-----------------------------------|
| 0 | `00-overview.md` | Executive summary, key assumptions, recommended customer segment (§1–3) |
| 1 | `01-validation.md` | Product validation plan, interview scripts, go/no-go evidence (§4) |
| 2 | `02-mvp-scope.md` | Strict MVP feature list + explicitly excluded features (§5–6) |
| 3 | `03-workflows-state-machine.md` | Core workflows, concurrency/race rules, coverage-status state machine (§7–8) |
| 4 | `04-architecture-data-api.md` | Technical architecture, data model, API/service design (§9, 13–15) |
| 5 | `05-interface-plan.md` | Screen-by-screen UI plan incl. driver mobile-web pages (§16) |
| 6 | `06-risk-engine.md` | Rules-based risk engine design (§10) |
| 7 | `07-messaging-design.md` | SMS workflow, inbound parsing, reliability rails, worker-classification guardrails (§11–12) |
| 8 | `08-development-phases.md` | Phase 0–10 build sequence (§17) |
| 9 | `09-task-backlog.md` | Ordered, Claude-Code-sized task backlog (§18) |
| 10 | `10-ai-workflow.md` | Claude Code workflow: CLAUDE.md, hooks, slash commands, task prompt template (§19) |
| 11 | `11-testing-strategy.md` | MVP testing plan + 19 critical E2E scenarios (§20) |
| 12 | `12-security-checklist.md` | Security/privacy checklist by launch stage (§21) |
| 13 | `13-pilot-plan.md` | Pilot launch plan + daily founder runbook (§22) |
| 14 | `14-metrics-pricing-ops-budget.md` | Metrics, pricing hypothesis, ultra-lean ops model, budget (§23–26) |
| 15 | `15-timelines-gates-roadmap.md` | Conservative/standard/aggressive timelines, decision gates, post-MVP roadmap (§27–29) |
| 16 | `16-first-actions-first-task.md` | Next 10 actions + first Claude Code coding task prompt (§31–32) |

## Non-negotiable constraints (repeated from the brief, load-bearing for every phase)

- Smallest useful product first; one thin end-to-end slice (schedule → SMS → reply → state change → dashboard) before broadening any layer.
- No machine learning in the MVP. Rules-based risk engine only.
- No LLM conversational agent in the MVP. Keyword parsing + human needs-review queue is the default; LLM-assisted parsing is a post-MVP decision gate, not a default.
- No native mobile app. Link-based mobile-web pages only.
- No full TMS, no route optimization, no driver payments unless later validated as essential.
- No direct customer integrations for the pilot — CSV import is the integration layer.
- The coverage-status state machine is the single source of truth. No component (messaging, risk engine, dashboard) maintains its own copy of route status.
- All outbound messaging is idempotent, budget-capped, and has a kill switch from message #1.
- Everything is scoped to a single founder operating ultra-lean, assisted by AI tools — not a funded team.
