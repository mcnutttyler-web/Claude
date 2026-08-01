# Compliance & Verification Checklist

## Compliance rules applied throughout the site

Every page touching driver-assisted freight, unloading, equipment, safety, insurance, capacity, or
pricing was written against this checklist. Confirmed patterns actually used in the copy:

- ✅ Never states a driver *will* unload — always "may be arranged," "subject to carrier and driver
  approval," "confirmed before dispatch"
- ✅ Never claims driver unloading is available on every shipment — framed as "a core operational
  capability," never a guarantee
- ✅ Never includes unloading labor in a quoted rate without noting confirmation is required —
  "additional charges may apply," "reflected in the rate" after confirmation
- ✅ Never suggests every carrier permits driver unloading — "subject to carrier approval," "not every
  carrier or driver accepts unloading responsibility" (stated explicitly on the FAQ and Driver-Assisted
  Freight page)
- ✅ Never suggests drivers can automatically operate forklifts/powered equipment — every mention pairs
  this with "requires specific authorization," "a qualified, approved operator," "never assumed"
- ✅ Never promises inside delivery without confirmation — "when arranged and confirmed," "if approved"
- ✅ Never guarantees exact delivery times without qualification — JIT/expedited pages use "managed
  closely," "confirmed, not guaranteed without qualification," "subject to road, weather and route
  conditions"
- ✅ Never promises capacity before shipment review — quote form disclaimer states this explicitly, and
  every service page's "considerations" block reiterates it
- ✅ Never describes Flux Logistics as owning Landstar equipment — About and Terms pages use "independent
  agency of Landstar," explicitly disclaim equipment ownership in the Terms
- ✅ No scraping or access to private Landstar systems — nothing in this codebase touches Landstar
  systems at all; the AI intake spec explicitly states it only produces a lead record for Flux
  Logistics' own use
- ✅ No uncontrolled instant AI freight rates — the quote form never returns a price; the AI intake spec
  explicitly forbids it as a hard constraint

## Terminology discipline

`driver assist`, `driver unload`, `lumper service`, and `customer unload` are defined once
(`src/data/glossary.ts`) and referenced, not redefined, everywhere they appear: homepage, Driver-
Assisted Freight page, FAQ, quote form, and the two comparison articles. This was a specific ask in the
brief ("do not use these terms interchangeably") and is enforced structurally (single data source)
rather than by copyediting vigilance alone.

## Items Requiring Verification

This is the running list the brief asked for. Nothing below is published as a hard factual claim without
qualification, each is phrased in the live copy as a capability, not a guarantee, but the underlying
facts should be confirmed against real operating history before any more specific claims are added.

### Landstar-related claims
- [ ] Confirm current, exact language Landstar permits independent agencies to use when describing the
  agency relationship (the site currently says "an independent agency of Landstar" — verify this matches
  Landstar's own brand/trademark usage guidelines for agents)
- [ ] Confirm whether Flux Logistics may link to landstar.com and in what context (currently linked from
  the About page as "the Landstar network")
- [ ] Verify the "1,000+ agents / thousands of BCOs" network-scale figures referenced in
  `01-market-competitor-findings.md` before using any specific number in customer-facing copy — the
  current site copy deliberately avoids citing a specific number

### Driver labor & equipment claims
- [ ] Confirm with Tyler McNutt what specific unloading tasks Flux Logistics has actually arranged
  historically (the site currently describes categories — carrying, stacking, hand-trucking — as
  examples of "approved, non-powered tasks," not a guaranteed list)
- [ ] Confirm insurance/liability treatment when a driver performs unloading labor — the site states
  "insurance coverage for driver-assisted labor should be confirmed as part of the arrangement, not
  assumed to be automatic" as a placeholder-safe statement; replace with specific guidance once
  confirmed with Landstar/carrier insurance terms
- [ ] Confirm whether any current carrier relationships have standing driver-unload capability, or
  whether this is negotiated per-load (affects how confidently the site can describe "coordinating"
  vs. "sourcing" this capacity)

### Safety claims
- [ ] Confirm PPE/safety-briefing expectations Flux Logistics can realistically coordinate vs. what must
  be handled directly between the receiving facility and the carrier

### Capacity & service-area claims
- [ ] Confirm cross-border Mexico capacity is a current, active capability vs. an aspirational one —
  the site presents it as coordinated capacity, verify against actual carrier relationships
- [ ] Confirm hazmat hazard-class coverage — the site deliberately avoids claiming "all hazard classes"
  and instead says capacity depends on classification; confirm which classes have reliable carrier
  coverage today so FAQ answers can be more specific over time

### Pricing claims
- [ ] No specific dollar figures, rate ranges, or "starting at" pricing appear anywhere on the site —
  confirm this remains correct as the business matures; do not add pricing language without a specific
  review of what can legally/competitively be disclosed

### Brand/legal
- [ ] Confirm final legal business name/registration matches "Flux Logistics" as used sitewide
- [ ] Confirm `fluxlogistics.co` domain and email deliverability/DNS (SPF/DKIM/DMARC) before relying on
  the site's email as the primary lead channel
- [ ] Legal review of Privacy Policy and Terms and Conditions — the versions in this repo are
  reasonable, plain-language drafts, not attorney-reviewed documents; note the file locations:
  `src/app/privacy-policy/page.tsx`, `src/app/terms-and-conditions/page.tsx`

### API / integration claims
- [ ] Nothing on the site currently claims a live AI assistant, live CRM sync, or live file storage —
  keep it that way until those integrations are actually connected (see build spec); if any of these
  go live, update this checklist and remove the corresponding item from
  `07-technical-build-spec.md`'s "not yet wired" list
