# Recommended Sitemap

Implemented as the actual Next.js route tree (App Router). URLs use `/services/<slug>` for every
service so breadcrumbs, internal linking, and topical clustering work the way Google and AI answer
engines expect (a `/services` hub linking out to focused, single-topic pages beats 14 flat top-level
URLs).

```
/                                          Home
/about                                     About Flux Logistics
/services                                  Services (hub/index)
  /services/driver-assisted-freight        Driver-Assisted Freight  (bespoke page)
  /services/carpet-padding-flooring        Carpet Padding & Flooring Transportation  (bespoke page)
  /services/hazmat-freight                 Hazmat Freight Transportation
  /services/oversized-freight              Oversized & Over-Dimensional Freight
  /services/heavy-haul                     Heavy Haul Transportation
  /services/flatbed-specialized-transportation   Flatbed & Specialized Transportation
  /services/expedited-freight              Expedited & Time-Critical Freight
  /services/just-in-time-transportation    Just-in-Time Transportation
  /services/drop-trailer-programs          Drop Trailer Programs
  /services/dedicated-transportation       Dedicated Transportation & Recurring Lanes
  /services/dry-van-truckload              Dry Van Truckload
  /services/high-value-freight             High-Value & Sensitive Freight
  /services/cross-border-mexico-freight    Cross-Border & Mexico Transportation
  /services/project-freight                Project Freight & Multi-Stop Shipments
/industries                                Industries
/quote                                     Request a Quote
/resources                                 Resources (hub)
  /resources/<article-slug>                Individual guides/articles
/faq                                       Frequently Asked Questions
/contact                                   Contact
/privacy-policy                            Privacy Policy
/terms-and-conditions                      Terms and Conditions
/sitemap.xml                               Auto-generated XML sitemap (src/app/sitemap.ts)
/robots.txt                                Auto-generated (src/app/robots.ts)
```

## Why nested service URLs instead of flat top-level pages

The brief's page list reads as a flat set ("Driver-Assisted Freight," "Hazmat Freight," etc. all listed
alongside "Home" and "About"). We implemented these as `/services/<slug>` rather than `/driver-assisted-
freight` at the root for three reasons:

1. **BreadcrumbList schema** (explicitly requested) only makes sense with real hierarchy — Home →
   Services → [Service]. A flat structure has nothing to build a breadcrumb from.
2. **Topical authority**: a `/services` hub that links to every service page, and every service page
   that links back and to related services, is a stronger internal-linking signal for both Google and
   AI crawlers than 14 disconnected top-level URLs.
2. **Zero content collision risk**: nothing at the root competes with `/services/*` for the same query
   intent.

Every primary nav item the brief lists is still one click away — `/services` is in the main nav, and the
homepage links directly to the highest-priority service pages (driver-assisted freight and carpet
padding first).

## Deliberately excluded from primary navigation

Secondary services (team-driver transportation, liftgate service, port/airport freight, temperature-
controlled, partial truckload, multi-stop truckload, drop-and-hook, lumper coordination, customer-unload
shipments) are listed on `/services` under "Additional Capabilities" rather than given dedicated pages,
per the brief's instruction not to give every service equal weight. Promote any of these to a full page
once there's demonstrated search volume or sales demand, see the launch roadmap for the review cadence.
