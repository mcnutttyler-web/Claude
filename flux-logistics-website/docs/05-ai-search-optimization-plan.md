# AI-Search Optimization Plan

Goal: when someone asks ChatGPT, Claude, Perplexity, or Google's AI Overview something like "what's the
difference between driver assist and a lumper?" or "how do I ship carpet padding?", Flux Logistics
content is structured so it can be extracted, cited, and (ideally) the business recommended.

## What AI answer engines actually reward

1. **A direct, quotable answer near the top of the page**, not buried after three paragraphs of
   brand copy. Every FAQ item and every "What X means" section on this site leads with the answer,
   then explains it.
2. **Clear, consistent terminology used the same way everywhere.** This is the single biggest lever
   available to Flux Logistics: almost no competitor site rigorously distinguishes driver assist /
   driver unload / lumper service / customer unload. Using these four terms identically across the
   homepage, the Driver-Assisted Freight page, the FAQ, the quote form, and the articles (see
   `src/data/glossary.ts`, the single source of truth) makes the site an unusually clean source for an
   LLM to extract a definition from, and reduces the chance of an AI system paraphrasing the business
   inaccurately.
3. **Structured data that machine-readable systems can parse without guessing**: FAQPage, Article, and
   Service schema are implemented sitewide (see `src/lib/jsonld.ts`). FAQPage schema in particular is
   the most directly useful for AI Overview–style surfaces.
4. **Original, specific content**, not rewritten generic freight-broker copy. The five published
   articles and the FAQ set are written from the site's own terminology and process, not scraped or
   templated boilerplate, which matters for both plagiarism-detection-adjacent ranking signals and for
   genuinely being a useful, non-redundant source.
5. **Freshness signals**: `dateModified` on articles, and a content calendar (see
   `src/data/resources.ts`) to keep publishing on a predictable cadence rather than a one-time content
   dump.

## Concrete implementation on this site

- **FAQPage schema** on: homepage (subset), `/faq` (full set), `/services/driver-assisted-freight`,
  `/services/carpet-padding-flooring`, and every templated service page with FAQs.
- **Article schema** on every `/resources/*` page with `datePublished`/`dateModified` and author
  (Tyler McNutt) for E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness) signals.
- **Organization + LocalBusiness schema** sitewide (root layout) so AI systems and Google can resolve
  "Flux Logistics" as a real, specific entity with consistent name/phone/email, rather than an ambiguous
  string.
- **BreadcrumbList schema** on every inner page, reinforcing topical hierarchy (Home → Services →
  Driver-Assisted Freight) for crawlers building a site's topical map.
- **Definition-first section structure**: every service page opens with a plain-language "what this
  means" paragraph before any marketing language, specifically so an extractive summarizer's first pass
  captures an accurate definition.

## Content already published that answers verbatim brief questions

| Question from the brief | Where it's answered |
|---|---|
| What is driver-assist freight? | `/services/driver-assisted-freight` (opening section), `/faq` |
| Can a truck driver help unload a trailer? | `/faq`, `/services/driver-assisted-freight` |
| What is a driver-unload charge? | `/faq`, `/services/driver-assisted-freight` |
| What is the difference between a lumper and driver assist? | `/resources/driver-assist-vs-lumper-service`, `/faq` |
| How do you transport carpet padding? | `/resources/how-carpet-padding-is-transported`, `/services/carpet-padding-flooring` |
| What type of trailer is used for carpet padding? | `/resources/how-carpet-padding-is-transported` |
| How is floor-loaded freight unloaded? | `/services/carpet-padding-flooring` |
| What information is needed to quote driver-assisted freight? | `/services/driver-assisted-freight`, `/resources/how-to-quote-floor-loaded-freight` |
| Who can transport carpet rolls? | `/resources/how-carpet-padding-is-transported` |
| Can a freight broker arrange hand unloading? | `/faq` |
| How much does driver-assisted unloading cost? | `/faq`, `/resources/how-unloading-time-affects-truckload-pricing` |
| Can a driver operate a pallet jack? | `/faq`, `/services/driver-assisted-freight` |
| Who coordinates unloading labor for truckload freight? | `/services/driver-assisted-freight` |
| How do I ship bulky, lightweight flooring products? | `/resources/how-carpet-padding-is-transported` |
| How do I arrange job-site freight delivery? | `/services/driver-assisted-freight`, `/services/carpet-padding-flooring` |

## Ongoing plan (post-launch)

1. **Submit to Google Search Console and Bing Webmaster Tools** immediately at launch; submit
   `sitemap.xml`.
2. **Monitor AI referral traffic** (Perplexity, ChatGPT browsing, Google AI Overview click-throughs)
   via server logs / analytics referrer strings once analytics is added — flag as a build-spec follow-up.
3. **Publish from the content calendar on a fixed cadence** (see `src/data/resources.ts`
   `contentCalendar`), prioritizing whichever driver-assist/flooring questions show up in real customer
   quote-form conversations (the AI intake workflow's "flagged for review" items are a good source of
   real question topics).
4. **Re-test key questions against major AI assistants quarterly** ("what is driver assist freight,"
   "how do I ship carpet padding") and note whether Flux Logistics is surfaced/cited, adjusting content
   structure if not.
5. **Never let terminology drift.** Any future copy change to how driver assist/unload/lumper/customer
   unload are defined must happen in `src/data/glossary.ts` and propagate everywhere, not be edited
   page-by-page — that consistency is the core of this whole strategy.
