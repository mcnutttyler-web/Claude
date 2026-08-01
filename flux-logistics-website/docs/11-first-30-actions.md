# First 30 Actions

Ordered, concrete, and scoped to what actually moves the site from "built" to "generating qualified
quote requests." Numbers 1–10 are the minimum to responsibly go live.

1. Read through every page as Tyler McNutt would read it as a customer — flag anything that
   overstates a capability Flux Logistics doesn't actually have yet (cross-reference
   `09-compliance-and-verification.md`).
2. Resolve the "Landstar-related claims" verification items — confirm acceptable language for
   describing the agency relationship before this goes live publicly.
3. Set up production hosting and point `fluxlogistics.co` at it.
4. Set up email sending infrastructure (SPF/DKIM/DMARC) for `fluxlogistics.co`.
5. Connect a real notify adapter so quote/contact submissions actually reach
   `tyler@fluxlogistics.co` (currently logs server-side only — see `07-technical-build-spec.md`).
6. Decide on a CRM (or "email/spreadsheet for now") and either wire the CRM adapter or formally accept
   manual lead handling for the first phase.
7. Run the site through Google's Rich Results Test and Schema Markup Validator for at least the
   homepage, Driver-Assisted Freight, and Carpet Padding pages.
8. Submit the site to Google Search Console and Bing Webmaster Tools; submit `sitemap.xml`.
9. Have Terms and Conditions / Privacy Policy reviewed by an attorney (or explicitly accept the current
   plain-language drafts as sufficient for launch).
10. Do a full end-to-end test of the quote form's driver-assist conditional path as a real user,
    including the file-upload UI, confirm the resulting lead record (console log today) contains
    everything expected.
11. Add analytics (GA4 or alternative) so traffic and conversion data exist from day one.
12. Confirm the phone number and email on every page are correct and click/tap correctly on mobile
    (`tel:`/`mailto:` links).
13. Test the full mobile experience on a real phone, not just a resized browser window, particularly
    the quote form's length and the header's mobile menu.
14. Decide whether to soft-launch to existing contacts before any public promotion (recommended).
15. Identify 3–5 real past shipments (with customer permission) that could become the site's first case
    studies, prioritize a driver-assist or flooring example if one exists.
16. Confirm current hazmat hazard-class coverage with actual carrier relationships so the Hazmat page's
    FAQ can eventually get more specific than "depends on the shipment."
17. Confirm current cross-border Mexico capacity is active, not aspirational, before promoting that page.
18. Set a content-publishing cadence and put the first 2–3 articles from the content calendar on a
    calendar with actual dates (see `src/data/resources.ts` → `contentCalendar`).
19. Re-read the Driver-Assisted Freight and Carpet Padding pages specifically for anything that could be
    read as a guarantee rather than a capability, these are the highest-scrutiny pages given the
    compliance requirements.
20. Set up a simple weekly review of quote-form submissions (even manual, via the server logs) until a
    real CRM is connected, so no lead sits unseen.
21. Test what happens when a customer selects "not sure" for unloading responsibility, confirm the
    follow-up process (a human call) is actually happening, not just flagged and forgotten.
22. Verify the site renders correctly in both light and dark OS-level settings if that matters to the
    brand (current build uses a fixed navy/amber palette, not OS-theme-adaptive, confirm this is fine).
23. Spot-check every internal link on the site (service cross-links, footer nav, breadcrumbs) — a
    broken internal link undermines both UX and the SEO structure this plan depends on.
24. Confirm the domain's WHOIS/registration and business listing (Google Business Profile) name/address/
    phone match the site exactly, an NAP (name/address/phone) mismatch actively hurts local SEO.
25. Create a Google Business Profile for Flux Logistics if one doesn't exist, consistent NAP data matters
    more than most other local-SEO levers.
26. Decide on and implement the presigned-upload flow if real document/photo collection through the
    quote form turns out to matter in practice (watch the first month of submissions for how often
    people try to attach files).
27. Revisit the headline/positioning decision after 60–90 days of real traffic data — Option 3 was the
    documented recommendation, not an untestable final answer (see `02-positioning.md`).
28. Build out 2–3 more templated service pages worth of content depth (real examples, real numbers)
    once there's operating history to draw from, replacing some of the more general placeholder-style
    statements in `src/data/services.ts`.
29. Decide whether the AI quote-intake assistant is worth building based on real customer behavior
    (how often do people call instead of using the form because the form feels like too much for a
    simple question?).
30. Schedule a 90-day retrospective against this entire deliverable set: what got used, what didn't,
    and what should be cut or expanded for the next phase.
