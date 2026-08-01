# Launch Roadmap

## Phase 0 — Pre-launch (this deliverable)

- [x] Full site built, content written, forms functional (client-side + server action validation)
- [x] SEO infrastructure in place (schema, sitemap, robots, metadata)
- [x] Build/lint/typecheck verified clean
- [ ] Legal review of Privacy Policy / Terms
- [ ] Domain, hosting, and DNS confirmed for `fluxlogistics.co`

## Phase 1 — Technical launch prep (1–2 weeks)

- [ ] Deploy to production hosting (Vercel is the lowest-friction fit for this Next.js App Router stack)
- [ ] Point `fluxlogistics.co` DNS at the deployment; confirm HTTPS
- [ ] Set up email sending domain (SPF/DKIM/DMARC) — required before `notify.ts` goes live with real
  outbound email, otherwise messages risk landing in spam
- [ ] Add analytics (GA4 or a privacy-respecting alternative) — not present in the current build
- [ ] Connect a real notify adapter (Resend/Postmark/etc.) — see `07-technical-build-spec.md`
- [ ] Connect a real CRM adapter, or decide to run leads through email/console logs manually for the
  first stretch while volume is low
- [ ] Submit sitemap to Google Search Console and Bing Webmaster Tools
- [ ] Verify Organization/LocalBusiness schema resolves correctly in Google's Rich Results Test

## Phase 2 — Soft launch (weeks 2–4)

- [ ] Share the live site with a small set of existing customers/contacts before any paid promotion;
  confirm the quote form produces the leads Tyler expects to see (test the driver-assist conditional
  path specifically, since it's the site's core differentiator)
- [ ] Monitor early Search Console data for indexing issues
- [ ] Complete the "Items Requiring Verification" checklist items that block specific claims (see
  `09-compliance-and-verification.md`) before any paid ad spend references those claims

## Phase 3 — Content & SEO ramp (months 1–3)

- [ ] Publish from the content calendar (`src/data/resources.ts` → `contentCalendar`) on a fixed
  cadence, at least one guide every 1–2 weeks
- [ ] Track keyword rankings for the Tier 1 cluster (driver-assist, carpet padding) specifically —
  these are the terms the whole content strategy is built around
- [ ] Add real case studies once available (the brief explicitly calls for "original case studies" —
  none exist yet; this needs actual completed shipments to write about honestly)
- [ ] Re-test AI-assistant visibility for the key questions listed in
  `05-ai-search-optimization-plan.md`

## Phase 4 — Feature expansion (months 2–6, prioritize by actual demand)

- [ ] Presigned-URL document/photo upload (replaces the current filename-only capture)
- [ ] AI quote-intake assistant, if the volume of "who's unloading this?" back-and-forth justifies
  building the conversational version described in `06-ai-quote-intake-workflow.md`
- [ ] Dedicated pages for any secondary service that starts showing real search or sales demand,
  promote from `secondaryServices` in `src/data/services.ts` to a full page + entry in `services.ts`
- [ ] Evaluate whether a lightweight CMS is worth adding if content updates become frequent enough that
  editing `.ts` files via PR is a bottleneck

## Explicitly not in scope for initial launch

- Ocean/air/intermodal/customs brokerage services — deliberately excluded per the positioning decision
  to stay focused on truckload and avoid diluting the differentiator (see
  `01-market-competitor-findings.md`)
- A live AI chat widget — the workflow is specified, not built, until there's a clear decision to invest
  in it
- Paid advertising strategy — out of scope for this deliverable set; the SEO/content plan is the
  primary organic acquisition channel specified here
