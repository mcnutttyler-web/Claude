import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/ui/PageHero";
import { Section, Eyebrow } from "@/components/ui/Section";
import { CtaBand } from "@/components/home/CtaBand";
import { FaqAccordion } from "@/components/faq/FaqAccordion";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbSchema, faqPageSchema, serviceSchema } from "@/lib/jsonld";
import { unloadTerms } from "@/data/glossary";
import { getServiceBySlug } from "@/data/services";

const service = getServiceBySlug("driver-assisted-freight")!;

export const metadata: Metadata = {
  title: service.metaTitle.replace(" | Flux Logistics", ""),
  description: service.metaDescription,
  alternates: { canonical: "/services/driver-assisted-freight" },
};

const commonProducts = [
  "Carpet padding, carpet rolls and underlayment",
  "Flooring materials and rolled goods",
  "Foam and insulation products",
  "Building materials and construction supplies",
  "Furniture and bulky home goods",
  "Retail fixtures and point-of-sale displays",
  "Packaged goods delivered to job sites without dock access",
];

const infoNeeded = [
  "What the driver would physically be expected to do",
  "Approximately how many pieces, rolls or units are involved",
  "Whether anyone at the receiving facility will help",
  "What equipment is available on-site (pallet jack, forklift, ramp)",
  "Estimated unloading time",
  "Whether the delivery point is a dock, curb, job site or final placement area",
  "Any lifting, stair, ramp or long-carry requirements",
  "Any site-specific safety rules or required PPE",
];

const laborEquipmentExpectations = [
  {
    title: "Approved, non-powered tasks are the default",
    body: "Carrying, stacking, hand-trucking, or moving product with non-powered equipment like a pallet jack are the kinds of tasks that can typically be arranged, when disclosed and approved in advance.",
  },
  {
    title: "Powered equipment requires specific authorization",
    body: "A driver cannot be assumed to operate a forklift or other powered equipment. That only happens when it has been specifically authorized, the driver is qualified and approved to do it, and the carrier has agreed to it.",
  },
  {
    title: "Tasks are scoped, not open-ended",
    body: "Driver assistance is limited to the tasks that were disclosed and confirmed, not whatever comes up on-site. Unplanned scope (extra stairs, an unexpected long carry, additional units) needs to be flagged and re-confirmed.",
  },
  {
    title: "The receiving location is part of the plan",
    body: "Facility rules, safety requirements, and available equipment at the delivery point are coordinated ahead of time, not discovered by the driver on arrival.",
  },
];

const safetyLimitations = [
  "Driver assistance is subject to carrier approval. Not every carrier or driver accepts unloading responsibility.",
  "Powered equipment operation (forklifts, pallet jacks with powered lift, etc.) requires specific authorization, qualification and approval. It is never assumed.",
  "Drivers are not obligated to perform tasks outside what was disclosed and confirmed before dispatch.",
  "Insurance coverage for driver-assisted labor should be confirmed as part of the arrangement, not assumed to be automatic.",
  "Site-specific safety requirements (PPE, safety briefings, hazard zones) must be communicated in advance so the carrier can confirm the driver can meet them.",
];

export default function DriverAssistedFreightPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", url: "/" },
          { name: "Services", url: "/services" },
          { name: "Driver-Assisted Freight", url: "/services/driver-assisted-freight" },
        ])}
      />
      <JsonLd
        data={serviceSchema({
          name: "Driver-Assisted Freight & Specialized Delivery",
          description: service.metaDescription,
          url: "/services/driver-assisted-freight",
        })}
      />
      <JsonLd data={faqPageSchema(driverAssistFaqs)} />

      <PageHero
        eyebrow="Specialized Delivery Requirements"
        title="Driver-Assisted Freight & Specialized Delivery"
        dek="Coordinated driver-assisted unloading, hand-unload delivery, and tailored unloading arrangements for freight that needs more than a dock and a pallet jack."
      />

      {/* 1. What driver-assisted freight means */}
      <Section tone="white">
        <div className="max-w-3xl">
          <Eyebrow>What It Means</Eyebrow>
          <h2 className="mb-4 text-2xl font-bold text-brand-900 sm:text-3xl">
            What driver-assisted freight means
          </h2>
          <p className="mb-4 text-lg text-brand-700">
            Most truckload freight moves dock-to-dock: the receiving location has its own labor and
            equipment, the driver drops the trailer or backs into a dock, and someone else unloads it.
            Driver-assisted freight is different. It refers to shipments where the truck driver is asked to
            provide some level of hands-on help getting the freight off the trailer, coordinated in advance
            as part of how the load is planned and priced.
          </p>
          <p className="text-lg text-brand-700">
            This is an operational capability we coordinate regularly, not a feature promised on every
            shipment. Whether a driver can assist depends on the carrier, the driver, the specific tasks
            involved, and whether it was arranged before the truck was dispatched.
          </p>
        </div>
      </Section>

      {/* 2. When a driver assist may be needed */}
      <Section tone="muted">
        <Eyebrow>When It Comes Up</Eyebrow>
        <h2 className="mb-6 text-2xl font-bold text-brand-900 sm:text-3xl">
          When a driver assist may be needed
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            "The receiving facility has limited or no dock labor",
            "The delivery is to a job site, retail location, or residence without a loading crew",
            "The freight is floor loaded and needs to be carried, not just palletized off a dock",
            "The shipment is bulky or awkward relative to its weight (carpet padding, rolled goods, foam)",
            "The receiver can unload most of the load but needs help with part of it",
            "The delivery window is tight and waiting for facility labor isn't an option",
          ].map((item) => (
            <div key={item} className="flex gap-3 rounded-lg bg-white p-4 shadow-sm">
              <span className="mt-0.5 text-accent-600" aria-hidden="true">
                ✓
              </span>
              <span className="text-brand-800">{item}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* 3. Terminology */}
      <Section tone="white">
        <Eyebrow>Terminology</Eyebrow>
        <h2 className="mb-3 text-2xl font-bold text-brand-900 sm:text-3xl">
          Driver assist, driver unload, lumper service and customer unload are not the same thing
        </h2>
        <p className="mb-8 max-w-3xl text-brand-700">
          These four terms describe four different arrangements. Using them interchangeably is how
          shipments end up mispriced, mis-staffed, or delayed at the dock. Here&apos;s how we define each
          one and use them consistently across every quote and every operating instruction.
        </p>
        <div className="grid gap-5 sm:grid-cols-2">
          {unloadTerms.map((term) => (
            <div key={term.term} className="rounded-lg border border-brand-100 bg-white p-6">
              <h3 className="text-lg font-bold text-brand-900">{term.term}</h3>
              <p className="mt-1 text-sm font-semibold text-accent-600">{term.short}</p>
              <p className="mt-3 text-sm text-brand-700">{term.description}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* 4. Common products */}
      <Section tone="muted">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <Eyebrow>Common Products</Eyebrow>
            <h2 className="mb-4 text-2xl font-bold text-brand-900">
              Products that commonly require assistance
            </h2>
            <ul className="space-y-3">
              {commonProducts.map((item) => (
                <li key={item} className="flex gap-3 text-brand-700">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-500" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-5 text-sm text-brand-600">
              Carpet padding, flooring materials and similar rolled or bulky products are among the most
              frequent reasons we coordinate driver assistance. See our{" "}
              <Link href="/services/carpet-padding-flooring" className="font-semibold text-accent-600 hover:text-accent-500">
                Carpet Padding &amp; Flooring Transportation
              </Link>{" "}
              page for details specific to that freight.
            </p>
          </div>

          {/* 5. Info needed before quoting */}
          <div>
            <Eyebrow>Before You Quote</Eyebrow>
            <h2 className="mb-4 text-2xl font-bold text-brand-900">Information we need before quoting</h2>
            <ul className="space-y-3">
              {infoNeeded.map((item) => (
                <li key={item} className="flex gap-3 text-brand-700">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-5 text-sm text-brand-600">
              Our{" "}
              <Link href="/quote" className="font-semibold text-accent-600 hover:text-accent-500">
                quote form
              </Link>{" "}
              asks these questions directly whenever driver assistance is selected.
            </p>
          </div>
        </div>
      </Section>

      {/* 6. Labor and equipment expectations */}
      <Section tone="white">
        <Eyebrow>Labor &amp; Equipment</Eyebrow>
        <h2 className="mb-6 text-2xl font-bold text-brand-900 sm:text-3xl">
          Labor and equipment expectations
        </h2>
        <div className="grid gap-5 sm:grid-cols-2">
          {laborEquipmentExpectations.map((item) => (
            <div key={item.title} className="rounded-lg border border-brand-100 bg-white p-6">
              <h3 className="font-bold text-brand-900">{item.title}</h3>
              <p className="mt-2 text-sm text-brand-700">{item.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* 7. Safety and carrier limitations */}
      <Section tone="muted">
        <Eyebrow>Safety &amp; Limitations</Eyebrow>
        <h2 className="mb-6 text-2xl font-bold text-brand-900 sm:text-3xl">
          Safety and carrier limitations
        </h2>
        <ul className="space-y-3">
          {safetyLimitations.map((item) => (
            <li key={item} className="flex gap-3 rounded-lg bg-white p-4 text-brand-800 shadow-sm">
              <span className="mt-0.5 text-brand-500" aria-hidden="true">
                &#9888;
              </span>
              {item}
            </li>
          ))}
        </ul>
      </Section>

      {/* 8 & 9. Pricing and detention */}
      <Section tone="white">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <Eyebrow>Pricing</Eyebrow>
            <h2 className="mb-4 text-2xl font-bold text-brand-900">How this affects pricing</h2>
            <p className="text-brand-700">
              Driver-assisted unloading is not included in a standard linehaul rate. It reflects the
              driver&apos;s time and labor, so it&apos;s priced based on what&apos;s actually expected: how much
              needs to be unloaded, how long it will take, and whether any special equipment or conditions
              are involved. This is confirmed with the carrier and included in the quote before the shipment
              is booked, additional charges may apply once the full scope is known.
            </p>
          </div>
          <div>
            <Eyebrow>Detention</Eyebrow>
            <h2 className="mb-4 text-2xl font-bold text-brand-900">
              Detention and unloading-time concerns
            </h2>
            <p className="text-brand-700">
              Hand-unload and driver-assisted deliveries generally take longer than a standard palletized
              dock unload. Underestimating that time is one of the most common causes of detention charges
              and driver frustration. Sharing a realistic unloading-time estimate up front helps us plan the
              driver&apos;s schedule and avoid delays on both ends.
            </p>
          </div>
        </div>
      </Section>

      {/* 10. How Flux coordinates */}
      <Section tone="muted">
        <Eyebrow>Our Process</Eyebrow>
        <h2 className="mb-6 text-2xl font-bold text-brand-900 sm:text-3xl">
          How Flux Logistics coordinates the shipment
        </h2>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            "Confirm exactly what unloading assistance is needed and by whom",
            "Communicate the requirements to a carrier and driver willing and approved to take it on",
            "Reflect the labor and equipment requirements in the operating instructions and rate",
            "Coordinate delivery-point details with the receiving facility",
          ].map((step, index) => (
            <li key={step} className="rounded-lg bg-white p-5 shadow-sm">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-900 text-sm font-bold text-white">
                {index + 1}
              </span>
              <p className="mt-3 text-sm text-brand-700">{step}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* 11. FAQ */}
      <Section tone="white">
        <Eyebrow>FAQ</Eyebrow>
        <h2 className="mb-6 text-2xl font-bold text-brand-900 sm:text-3xl">
          Driver-assisted freight FAQ
        </h2>
        <FaqAccordion items={driverAssistFaqs} />
      </Section>

      {/* 12. CTA */}
      <CtaBand
        headline="Need a driver-assisted or hand-unload delivery quoted right?"
        supporting="Tell us what the driver would be expected to do and we'll confirm what's realistically available before the truck is booked."
      />
    </>
  );
}

const driverAssistFaqs = [
  {
    q: "Can a truck driver help unload a trailer?",
    a: "Sometimes, when it is disclosed before booking, confirmed with the carrier and driver, and reflected in the rate. It is never assumed as a default part of transportation.",
  },
  {
    q: "What is a driver-unload charge?",
    a: "It's an additional charge that reflects the time and labor required when a driver is expected to unload some or all of a shipment. It's confirmed with the carrier before dispatch based on the actual scope of work.",
  },
  {
    q: "What is the difference between a lumper and driver assist?",
    a: "A lumper is a separate, third-party worker hired to unload the trailer. Driver assist means the truck driver personally helps with the unload. They use different labor sources and are arranged differently.",
  },
  {
    q: "Can a freight broker or agency arrange hand unloading?",
    a: "Yes, an agency can help arrange it by identifying a carrier and driver willing to take on the unloading responsibility, confirming the scope of work, and reflecting it in the rate. It still requires carrier and driver agreement.",
  },
  {
    q: "How much does driver-assisted unloading cost?",
    a: "It depends on how much labor is involved: the number of pieces, the estimated time, and any special handling requirements. There's no flat rate; it's confirmed once the scope of work is known.",
  },
  {
    q: "Can a driver operate a pallet jack?",
    a: "A standard, non-powered pallet jack is a common piece of equipment for approved driver-assist tasks. Powered equipment, including electric pallet jacks and forklifts, requires specific authorization and a qualified, approved operator.",
  },
  {
    q: "Is driver-assisted unloading included in the freight rate by default?",
    a: "No. It's a separate consideration from linehaul transportation and must be identified and priced before the shipment is booked.",
  },
  {
    q: "What happens if the driver arrives and the unloading scope is bigger than expected?",
    a: "The driver is not obligated to perform work beyond what was disclosed and confirmed. This is exactly why an accurate description of the unloading requirements before booking matters, unplanned scope creates delays and disputes.",
  },
];
