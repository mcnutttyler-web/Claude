# CRM & Email Workflow

## Current state

Every quote and contact submission is captured, validated, tagged, and logged server-side today. What's
missing is the *last mile*: an actual outbound email/SMS and a real CRM record. Both are stubbed behind
adapters specifically so this workflow can go live by swapping implementation files, not by redesigning
the form or the lead pipeline. See [`07-technical-build-spec.md`](./07-technical-build-spec.md) for the
adapter file locations.

## Target workflow (once adapters are connected)

1. **Customer submits the quote form** (or completes the AI intake, once built).
2. **Validation** (`quote-schema.ts`) runs; anything invalid is rejected with inline errors before it
   ever reaches this workflow.
3. **Tagging** (`tagging.ts`) runs deterministically:
   - `driver-assist` — unloading responsibility is driver-assist or driver-unload
   - `carpet-flooring` — commodity text matches carpet/padding/underlayment/flooring/rolled goods/rug
   - `hazmat` — hazmat = yes
   - `oversized` — oversized = yes
   - `review-recommended` — hazmat or oversized (always), plus any flag condition below
4. **Flagging** runs alongside tagging and produces human-readable review notes:
   - Full driver unload requested
   - Driver expected to operate powered equipment with no forklift confirmed
   - Estimated unload time ≥ 3 hours (detention risk)
   - Unloading responsibility unknown
5. **Customer confirmation email** — auto-sent, acknowledging receipt and setting expectations
   (mirrors the disclaimer: this is not a binding quote). *Not yet live — `notify.ts` logs only.*
6. **Internal notification to `tyler@fluxlogistics.co`** — includes the full structured lead, tags, and
   flags, so a flagged shipment (e.g., hazmat + long unload time) is visually distinct from a routine
   dry van dock-to-dock request. *Not yet live — `notify.ts` logs only.*
7. **CRM save** — the lead, with tags and flags as CRM properties/labels (not just free text), so lists
   and views can be built (e.g., "all open driver-assist leads," "all flooring leads this month").
   *Not yet live — `crm.ts` is a no-op.*

## Wix-track equivalent (if the site is instead built/maintained in Wix Studio)

The brief's Wix instructions ask for automations that: send a confirmation to the customer, notify
`tyler@fluxlogistics.co`, tag driver-assist/carpet-flooring/hazmat/oversized requests, and save the lead
in Wix Contacts. That is functionally identical to the adapter workflow above — the same five tags, the
same two notification targets. If this project is rebuilt in Wix rather than continued in this Next.js
codebase, port the tagging rules in `tagging.ts` directly into Wix Automations' condition logic; don't
redesign the taxonomy. Do not attempt an uncontrolled instant-rate automation in Wix — the same "no
uncontrolled AI/automated freight rates" constraint applies regardless of platform.

## Recommended CRM shape (provider-agnostic)

Whichever CRM is chosen, structure it so a lead record has:

- Standard contact fields (name, company, email, phone, preferred contact method)
- The full shipment record (route, freight, unloading responsibility, and the driver-labor sub-fields
  when applicable) — don't flatten this into a single "notes" blob; keep it queryable
- Tags as a multi-select/label field, not free text
- Flags as a separate field from tags (tags describe *what* the shipment is; flags describe *why a
  human should look at it*)
- Source (`quote-form` vs `ai-intake`) so intake-channel performance can be compared later

## Email content guidance

- **Customer confirmation**: friendly, sets expectations, restates the disclaimer language ("this does
  not create a binding quote..."), gives a direct way to reach Tyler for anything urgent.
- **Internal notification**: lead-with-tags-and-flags, not a wall of raw form data. A driver-assist +
  hazmat lead should be visually distinguishable from a routine one at a glance in the inbox subject
  line, e.g. `[Driver-Assist][Hazmat] New quote request — Acme Flooring, Columbus OH → Nashville TN`.

## What to verify before going live with real email/CRM

See [`09-compliance-and-verification.md`](./09-compliance-and-verification.md) — specifically: sender
domain/SPF/DKIM setup for `fluxlogistics.co` before sending customer-facing email, and a data-retention
policy consistent with the published Privacy Policy.
