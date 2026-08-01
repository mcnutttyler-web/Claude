# Flux Logistics Website — Deliverables Index

This `/docs` folder plus the Next.js site in this repository together make up the full deliverable
package requested for the Flux Logistics website project. Where a deliverable is code/content rather
than a standalone document, this index points to its location.

| # | Deliverable | Where to find it |
|---|---|---|
| 1 | Market and competitor findings | [`01-market-competitor-findings.md`](./01-market-competitor-findings.md) |
| 2 | Flux Logistics positioning | [`02-positioning.md`](./02-positioning.md) |
| 3 | Core value proposition | [`02-positioning.md`](./02-positioning.md) |
| 4 | Final homepage headline and subheadline | [`02-positioning.md`](./02-positioning.md#headline-decision) |
| 5 | Recommended sitemap | [`03-sitemap.md`](./03-sitemap.md) (implemented as the site's actual route tree) |
| 6 | Complete homepage copy | `src/app/page.tsx` + `src/components/home/*` (live copy, not a duplicate doc) |
| 7 | Driver-Assisted Freight page | `src/app/services/driver-assisted-freight/page.tsx` |
| 8 | Carpet Padding and Flooring page | `src/app/services/carpet-padding-flooring/page.tsx` |
| 9 | Remaining service-page copy | `src/data/services.ts` (content) + `src/app/services/[slug]/page.tsx` (template) |
| 10 | Quote-form design | [`07-technical-build-spec.md`](./07-technical-build-spec.md#quote-form) + `src/components/quote/QuoteForm.tsx` (built) |
| 11 | AI quote-intake workflow | [`06-ai-quote-intake-workflow.md`](./06-ai-quote-intake-workflow.md) |
| 12 | SEO keyword map | [`04-seo-keyword-map.md`](./04-seo-keyword-map.md) |
| 13 | AI-search optimization plan | [`05-ai-search-optimization-plan.md`](./05-ai-search-optimization-plan.md) |
| 14 | Technical build specification | [`07-technical-build-spec.md`](./07-technical-build-spec.md) |
| 15 | CRM and email workflow | [`08-crm-email-workflow.md`](./08-crm-email-workflow.md) |
| 16 | Compliance and verification checklist | [`09-compliance-and-verification.md`](./09-compliance-and-verification.md) |
| 17 | Launch roadmap | [`10-launch-roadmap.md`](./10-launch-roadmap.md) |
| 18 | First 30 actions | [`11-first-30-actions.md`](./11-first-30-actions.md) |

## What's actually built vs. what's specified

**Built and working** (in this repository, verified with `npm run build`):
- Full Next.js 16 / TypeScript / Tailwind CSS site, 20+ pages, all listed in the sitemap brief
- Complete publish-ready copy for the homepage, Driver-Assisted Freight, and Carpet Padding &
  Flooring pages, plus substantive unique copy for the other 12 primary service pages, About,
  Industries, FAQ, Contact, Privacy Policy and Terms
- Conditional multi-section quote form (React Hook Form + Zod) matching the spec's field list,
  including the driver-assist conditional block
- 5 full SEO articles plus a content calendar for the rest
- Organization / LocalBusiness / Service / FAQPage / BreadcrumbList / Article JSON-LD, `sitemap.xml`,
  `robots.txt`
- Lead tagging logic (driver-assist, carpet/flooring, hazmat, oversized, review-recommended) and a
  pluggable integration-adapter layer for notifications/CRM

**Specified but not wired to a live third-party service** (deliberately — no credentials exist yet):
- Actual email/SMS delivery of leads (adapter stubbed, logs server-side — see
  [`07-technical-build-spec.md`](./07-technical-build-spec.md))
- CRM persistence (adapter stubbed)
- Real document/photo upload to cloud storage (UI captures file names today; binary upload needs a
  presigned-URL storage adapter — see build spec)
- A live conversational AI intake assistant (the workflow, prompts and guardrails are fully specified
  in [`06-ai-quote-intake-workflow.md`](./06-ai-quote-intake-workflow.md), ready to wire to the Claude
  API once this becomes a priority)

None of this is faked in the UI — no page claims these integrations are live.
