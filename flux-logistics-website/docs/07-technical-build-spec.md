# Technical Build Specification

## Stack (as built)

- **Next.js 16** (App Router, TypeScript, Turbopack build)
- **Tailwind CSS v4** (via `@theme inline` tokens in `src/app/globals.css` — brand navy + amber accent)
- **React Hook Form** + **Zod 4** (`@hookform/resolvers/zod`) for the quote and contact forms
- **Server Actions** (`"use server"`) for form handling — no separate API routes needed for the current
  scope
- Content lives in typed data files under `src/data/*.ts` (services, industries, FAQs, resources,
  scenarios, glossary, site config), not hardcoded into page components, so non-engineers can edit copy
  without touching layout code, and so the same content can later be migrated to a real CMS with minimal
  churn

Verified before hand-off: `npx tsc --noEmit` (clean), `npx eslint .` (0 errors), `npm run build`
(all 34 routes prerender successfully as static content), and a `next start` smoke test hitting every
top-level route plus representative dynamic routes (all 200 OK, JSON-LD present in server-rendered HTML).

## Project structure

```
src/
  app/                     Route segments (App Router)
    layout.tsx             Root layout: fonts, metadata defaults, Header/Footer, Org+LocalBusiness JSON-LD
    page.tsx                Home
    about/, industries/, faq/, contact/, privacy-policy/, terms-and-conditions/
    services/
      page.tsx              Services index
      driver-assisted-freight/page.tsx    Bespoke page (full custom copy)
      carpet-padding-flooring/page.tsx    Bespoke page (full custom copy)
      [slug]/page.tsx        Templated page for the other 12 primary services
    quote/
      page.tsx, actions.ts   Quote page + server action
    resources/
      page.tsx, [slug]/page.tsx, (articles)
    sitemap.ts, robots.ts
  components/
    layout/                Header, Footer
    home/                   Hero, ScenarioGrid, DriverAssistSection, ServicesGrid, WhyChoose,
                            QuoteProcess, FaqPreview, CtaBand
    services/               ServicePageTemplate (shared template for the 12 non-bespoke service pages)
    quote/                  QuoteForm, FormField primitives
    contact/                ContactForm
    faq/                    FaqAccordion (accessible, single-open accordion)
    seo/                    JsonLd (sanitized <script type="application/ld+json">)
    ui/                     Container, Section, Button, PageHero
  data/                     services.ts, industries.ts, faqs.ts, resources.ts, scenarios.ts,
                            glossary.ts, site.ts — the single source of truth for all copy/content
  lib/
    quote-schema.ts          Zod schema + option lists for the quote form
    contact-schema.ts         Zod schema for the contact form
    jsonld.ts                 Schema.org builders (Organization, LocalBusiness, Service, FAQPage,
                              BreadcrumbList, Article)
    integrations/
      types.ts                NotifyAdapter / CrmAdapter interfaces, QuoteLead type
      tagging.ts               Deterministic lead tagging + flagging (shared by form and future AI intake)
      notify.ts                 Console-log adapter (swap for a real provider — see below)
      crm.ts                     No-op adapter (swap for a real CRM — see below)
docs/                        This specification set
```

## Data model — quote leads

`QuoteLead` (`src/lib/integrations/types.ts`):

```ts
type QuoteLead = {
  id: string;
  submittedAt: string;
  source: "quote-form" | "ai-intake";
  values: QuoteFormValues;   // full shipment record, see below
  tags: LeadTag[];           // driver-assist | carpet-flooring | hazmat | oversized | expedited | review-recommended
  flags: string[];           // human-readable review flags, e.g. detention risk, powered-equipment risk
};
```

`QuoteFormValues` (`src/lib/quote-schema.ts`) stores every field the brief's quote-form spec requires,
grouped as: route info, freight info, unloading responsibility + the full conditional driver-labor block
(physical tasks, unit count, estimated time, facility assistance, pallet jack/forklift availability,
equipment operation expectation, stairs/ramps, inside delivery, delivery point type, lifting/PPE/safety
requirements, unloading appointment, additional labor availability), contact info, and attachment
metadata. This is the same shape the AI intake assistant should output (see
[`06-ai-quote-intake-workflow.md`](./06-ai-quote-intake-workflow.md)) so both paths feed one pipeline.

## Integration adapters — what's real vs. stubbed

The site uses an adapter pattern specifically so real integrations can be dropped in without touching
form or page code:

| Adapter | File | Current behavior | To go live |
|---|---|---|---|
| Notify (team + customer email) | `src/lib/integrations/notify.ts` | Logs to server console | Implement with Resend/Postmark/SES; set `RESEND_API_KEY` (or equivalent) as an env var; swap the class body only |
| CRM | `src/lib/integrations/crm.ts` | No-op, returns the lead id | Implement HubSpot/Salesforce/other API client; set API key env var |
| File uploads | `src/components/quote/QuoteForm.tsx` (file input) | Captures file **names** into the lead record only; binary is not transmitted | Server Actions have a 1MB default body limit — unsuitable for real documents/photos. Add a presigned-URL upload flow (S3/R2/Cloudinary): client requests a signed URL from a new Route Handler, uploads directly to storage, then submits the resulting object keys with the form |
| AI quote intake | Not built | N/A | See `06-ai-quote-intake-workflow.md`; wire to the Claude API using the existing `QuoteFormValues` schema as the structured output contract |

This is a deliberate choice, not an oversight: none of these require secrets that exist yet, and no page
copy claims they're live (see [`09-compliance-and-verification.md`](./09-compliance-and-verification.md)).

## Quote form — design notes {#quote-form}

- Single page, sectioned via `<fieldset>` (Route / Freight / Unloading Requirements / Contact /
  Documents), matching the brief's field list field-for-field.
- Conditional driver-labor block only renders when `unloadResponsibility` is `driver-assist` or
  `driver-unload` (`unloadRequiresDriverLabor()` helper), and its fields are enforced as required via
  `zod`'s `.superRefine` only in that branch, so the base case (customer unload) doesn't force
  irrelevant fields.
- Hazmat/oversized/temperature detail fields conditionally appear and become required only when their
  parent yes/no/unsure question is "yes."
- The exact disclaimer text from the brief is rendered verbatim above the submit button.
- On success, the confirmation view echoes back any review flags (e.g., "long estimated unload time")
  so the customer understands why a human will be following up rather than an instant rate.

## Environment variables (to add as integrations go live)

None are required to run the site today. Reserve these names for the integrations above:

```
RESEND_API_KEY=            # or SMTP_* — email delivery for notify.ts
CRM_API_KEY=                # CRM adapter
CRM_BASE_URL=
FILE_STORAGE_BUCKET=        # presigned upload adapter
FILE_STORAGE_REGION=
ANTHROPIC_API_KEY=          # AI quote-intake assistant, if built
```

## Accessibility

- Semantic landmarks (`header`, `main`, `footer`, `nav` with `aria-label`)
- `FaqAccordion` uses `aria-expanded`/`aria-controls`/`role="region"` and heading-wrapped buttons
- Form fields use associated `<label htmlFor>`, and required fields are marked both visually and via
  the `required` prop path (validated by Zod, errors announced via visible text adjacent to the field)
- Color contrast: navy (`brand-900`/`950`) on white/amber meets WCAG AA for body text at the sizes used

## What a follow-up engineering pass should prioritize

1. Real analytics (GA4 or a privacy-respecting alternative) — not included, since no property/ID exists
   yet
2. The presigned-upload flow described above
3. Wiring `notify.ts` and `crm.ts` to real providers once accounts exist
4. Contact form + quote form should probably converge on a shared lead pipeline (`CrmAdapter`) once a
   real CRM is chosen, they already share the adapter interfaces
5. A lightweight CMS (or Wix-style structured collections, if this were rebuilt in Wix as the brief's
   alternate platform track describes) for services/industries/FAQs/resources if content will be
   edited by non-engineers day to day, today those are typed `.ts` files requiring a PR to edit
