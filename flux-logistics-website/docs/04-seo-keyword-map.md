# SEO Keyword Map

Keyword clusters are assigned by page to avoid cannibalization, one primary intent per URL. Volume/
difficulty estimates are **not included** because no live keyword-tool data was pulled for this
engagement — treat the groupings and priority tiers as directional, based on query-pattern logic, and
verify with Google Search Console / a keyword tool (Ahrefs, Semrush, etc.) once the site has been live
long enough to have its own Search Console data.

## Tier 1 — Primary differentiator (highest priority)

| Page | Primary target | Supporting terms |
|---|---|---|
| `/services/driver-assisted-freight` | driver-assisted freight, driver-assist freight | driver-assisted unloading, driver-unload trucking, hand-unload freight, freight with unloading assistance, truck driver unloading service, assisted freight delivery, specialized delivery service |
| `/services/carpet-padding-flooring` | carpet padding transportation, carpet padding shipping | flooring freight transportation, carpet roll shipping, underlayment freight, floor-loaded freight transportation, rolled goods trucking |
| `/` (home) | specialized freight shipping | hands-on freight service, freight requiring driver assist, owner-led freight agency |
| `/faq`, `/resources/*` | driver assist vs driver unload, driver assist vs lumper | (see AI-search plan — these are answer-engine targets as much as Google targets) |

## Tier 2 — High-intent specialized freight (strong priority)

| Page | Primary target | Supporting terms |
|---|---|---|
| `/services/hazmat-freight` | hazmat freight transportation | hazmat trucking, hazardous materials carrier, DOT hazmat shipping, placarded freight |
| `/services/oversized-freight` | oversized freight shipping | over-dimensional trucking, oversize permit trucking, wide load shipping, superload transportation |
| `/services/heavy-haul` | heavy haul trucking | heavy equipment transport, RGN trailer shipping, machinery transport |
| `/services/expedited-freight` | expedited freight shipping | hot shot trucking, time critical freight, rush truckload shipping |
| `/services/drop-trailer-programs` | drop trailer program | trailer pool, drop and hook freight, spotted trailer service |
| `/services/dedicated-transportation` | dedicated trucking capacity | recurring freight lanes, contract trucking capacity |

## Tier 3 — Core truckload / supporting service pages

| Page | Primary target | Supporting terms |
|---|---|---|
| `/services/dry-van-truckload` | dry van truckload shipping | full truckload trucking, FTL shipping, nationwide truckload capacity |
| `/services/flatbed-specialized-transportation` | flatbed trucking | step deck trailer, open deck freight, specialized trucking services |
| `/services/just-in-time-transportation` | just in time freight | JIT trucking, appointment critical freight, manufacturing freight scheduling |
| `/services/high-value-freight` | high value freight shipping | secure truckload transportation, sensitive cargo trucking |
| `/services/cross-border-mexico-freight` | cross border trucking | Mexico freight shipping, US Mexico truckload, nearshoring freight transportation |
| `/services/project-freight` | project freight logistics | multi stop truckload, project cargo shipping, construction freight logistics |

## Long-tail / question-based content (Resources)

These map directly to the brief's "Develop content that answers" list and to the 5 articles already
published, plus the content calendar for the rest:

- what is driver-assist freight → `/services/driver-assisted-freight` (definition section) +
  `/resources/driver-assist-vs-driver-unload`
- can a truck driver help unload a trailer → `/faq`, `/services/driver-assisted-freight`
- what is a driver-unload charge → `/faq`, `/services/driver-assisted-freight`
- what is the difference between a lumper and driver assist →
  `/resources/driver-assist-vs-lumper-service`
- how do you transport carpet padding → `/resources/how-carpet-padding-is-transported`,
  `/services/carpet-padding-flooring`
- what type of trailer is used for carpet padding → `/resources/how-carpet-padding-is-transported`
- how is floor-loaded freight unloaded → `/services/carpet-padding-flooring`,
  `/resources/how-carpet-padding-is-transported`
- what information is needed to quote driver-assisted freight →
  `/services/driver-assisted-freight`, `/resources/how-to-quote-floor-loaded-freight`
- who can transport carpet rolls → `/resources/how-carpet-padding-is-transported`
- can a freight broker arrange hand unloading → `/faq`, `/resources/driver-assist-vs-driver-unload`
- how much does driver-assisted unloading cost → `/faq`,
  `/resources/how-unloading-time-affects-truckload-pricing`
- can a driver operate a pallet jack → `/faq`, `/services/driver-assisted-freight`
- who coordinates unloading labor for truckload freight → `/services/driver-assisted-freight`
- how do I ship bulky, lightweight flooring products → `/resources/how-carpet-padding-is-transported`
- how do I arrange job-site freight delivery → `/services/driver-assisted-freight`,
  `/services/carpet-padding-flooring`

## On-page SEO conventions used sitewide

- One `<h1>` per page, matching the page's primary keyword target
- Meta title/description written per-page (`generateMetadata` / `metadata` export), no duplicated
  boilerplate across service pages
- Every service page interlinks to 2–3 related services (`related` field in `src/data/services.ts`)
- FAQ content is deduplicated across pages by pointing to a single canonical answer set
  (`src/data/faqs.ts`) rather than rewriting the same Q&A with different wording, which would create
  near-duplicate content
- Canonical URLs set on every page via `alternates.canonical`

## Priority order for content investment (next 90 days)

1. Driver-assisted freight cluster (already fully built — monitor and expand with more articles)
2. Carpet padding / flooring cluster (already fully built)
3. Hazmat + oversized (highest compliance/trust bar, but strong commercial intent)
4. Dedicated/recurring lanes + drop trailer (best fit for repeat-business content, e.g. case studies
   once available)
5. Remaining Tier 3 pages, only after the above are indexed and showing initial impressions in Search
   Console
