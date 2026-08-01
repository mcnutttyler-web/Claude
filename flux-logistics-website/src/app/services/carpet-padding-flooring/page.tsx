import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/ui/PageHero";
import { Section, Eyebrow } from "@/components/ui/Section";
import { CtaBand } from "@/components/home/CtaBand";
import { FaqAccordion } from "@/components/faq/FaqAccordion";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbSchema, faqPageSchema, serviceSchema } from "@/lib/jsonld";
import { getServiceBySlug } from "@/data/services";

const service = getServiceBySlug("carpet-padding-flooring")!;

export const metadata: Metadata = {
  title: service.metaTitle.replace(" | Flux Logistics", ""),
  description: service.metaDescription,
  alternates: { canonical: "/services/carpet-padding-flooring" },
};

const productTypes = [
  "Carpet padding",
  "Carpet rolls",
  "Flooring materials (vinyl, laminate, engineered wood)",
  "Underlayment",
  "Rolled goods",
  "Foam products",
  "Building materials",
];

const customerTypes = [
  "Floor-covering distributors",
  "Flooring manufacturers",
  "Retail flooring locations",
  "Installation companies",
  "Distribution centers",
];

const challenges = [
  "Freight that may be floor loaded rather than palletized",
  "Bulky or awkward products relative to their weight",
  "Limited dock labor at delivery locations",
  "Deliveries requiring the driver to help unload",
  "Multiple-stop routes across retail or distributor locations",
  "Retail or job-site deliveries without a loading dock",
  "Strict appointment times at distribution centers",
  "Recurring distribution lanes that need consistent handling",
  "Trailer-capacity planning for high-volume, lower-weight freight",
  "Requirements for dry, clean trailers",
  "Potential product damage from poor loading or handling",
  "Longer unloading times than palletized freight",
  "Detention exposure when unloading takes longer than planned",
];

const infoForQuote = [
  "Commodity and packaging (rolls, bundles, cartons)",
  "Approximate piece, roll or unit count",
  "Total weight and, if known, cubic volume",
  "Floor-loaded or palletized",
  "Who will unload: receiver, driver assistance, driver unload, or lumper",
  "Estimated unloading time, if known",
  "Delivery location type: distribution center, retail store, or job site",
  "Appointment requirements at pickup and delivery",
];

export default function CarpetPaddingFlooringPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", url: "/" },
          { name: "Services", url: "/services" },
          { name: "Carpet Padding & Flooring", url: "/services/carpet-padding-flooring" },
        ])}
      />
      <JsonLd
        data={serviceSchema({
          name: "Carpet Padding, Flooring & Rolled-Goods Transportation",
          description: service.metaDescription,
          url: "/services/carpet-padding-flooring",
        })}
      />
      <JsonLd data={faqPageSchema(flooringFaqs)} />

      <PageHero
        eyebrow="Flooring & Building Materials"
        title="Transportation for Carpet Padding, Flooring and Rolled Goods"
        dek="Flooring freight does not always move like a standard palletized truckload. Carpet padding, carpet rolls, underlayment and other bulky materials may be floor loaded, delivered to facilities with limited dock labor, or require the driver to help unload. Flux Logistics coordinates the equipment, capacity and delivery requirements before the shipment moves."
      />

      {/* Carpet-padding transportation / Carpet and rolled-goods freight */}
      <Section tone="white">
        <div className="max-w-3xl">
          <Eyebrow>What We Move</Eyebrow>
          <h2 className="mb-4 text-2xl font-bold text-brand-900 sm:text-3xl">
            Carpet padding, carpet rolls and rolled-goods freight
          </h2>
          <p className="mb-4 text-lg text-brand-700">
            Carpet padding and rolled goods are bulky relative to their weight, which means trailer space,
            not weight capacity, is usually the limiting factor. That single difference changes how the
            shipment should be quoted, loaded and delivered compared to a standard palletized truckload.
          </p>
          <p className="text-lg text-brand-700">
            We coordinate transportation for the full range of products in this category:
          </p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {productTypes.map((item) => (
              <li key={item} className="flex gap-2 text-brand-800">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-500" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* Who we serve */}
      <Section tone="muted">
        <Eyebrow>Who We Work With</Eyebrow>
        <h2 className="mb-6 text-2xl font-bold text-brand-900 sm:text-3xl">
          Built around how flooring freight actually moves
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {customerTypes.map((item) => (
            <div key={item} className="rounded-lg bg-white p-4 text-center shadow-sm">
              <p className="font-semibold text-brand-900">{item}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Floor-loaded products */}
      <Section tone="white">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
          <div>
            <Eyebrow>Loading Method</Eyebrow>
            <h2 className="mb-4 text-2xl font-bold text-brand-900">Floor-loaded products</h2>
            <p className="text-brand-700">
              Carpet padding and similar products are often floor loaded, stacked directly on the trailer
              floor rather than palletized, to maximize how much fits per load. Floor-loaded freight
              generally takes longer to unload than palletized freight of the same weight, which affects
              both carrier selection and delivery scheduling. We confirm the loading method before sourcing
              the trailer so it isn&apos;t a surprise at either end.
            </p>
          </div>
          <div>
            <Eyebrow>Trailer Requirements</Eyebrow>
            <h2 className="mb-4 text-2xl font-bold text-brand-900">Dry and clean trailer requirements</h2>
            <p className="text-brand-700">
              Carpet padding, underlayment and similar materials are moisture- and odor-sensitive. We
              confirm that the trailer sourced for the shipment is dry, clean, and free of prior residue or
              odor, and communicate any product-specific handling instructions to the carrier before the
              load is dispatched to help reduce the risk of damage from poor loading or handling.
            </p>
          </div>
        </div>
      </Section>

      {/* Driver-assisted unloading */}
      <Section tone="muted">
        <div className="max-w-3xl">
          <Eyebrow>Delivery</Eyebrow>
          <h2 className="mb-4 text-2xl font-bold text-brand-900 sm:text-3xl">Driver-assisted unloading</h2>
          <p className="mb-4 text-lg text-brand-700">
            Flooring and building-product deliveries range from large distribution centers with full
            unloading crews to retail stores and job sites with little or no dock labor. Where the receiving
            location has limited help, driver-assisted unloading is often the practical solution, and it&apos;s
            one of the operational capabilities we coordinate most often for this category of freight.
          </p>
          <p className="text-lg text-brand-700">
            As with any shipment, driver assistance must be disclosed before booking, confirmed with the
            carrier, and reflected in the rate. It is not assumed by default. Read our full breakdown on the{" "}
            <Link href="/services/driver-assisted-freight" className="font-semibold text-accent-600 hover:text-accent-500">
              Driver-Assisted Freight
            </Link>{" "}
            page, including the distinctions between driver assist, driver unload, lumper service and
            customer unload.
          </p>
        </div>
      </Section>

      {/* Operational challenges */}
      <Section tone="white">
        <Eyebrow>What Makes This Freight Different</Eyebrow>
        <h2 className="mb-6 text-2xl font-bold text-brand-900 sm:text-3xl">
          Operational challenges we plan around
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {challenges.map((item) => (
            <div key={item} className="flex gap-3 rounded-lg border border-brand-100 bg-white p-4">
              <span className="mt-0.5 text-accent-600" aria-hidden="true">
                ✓
              </span>
              <span className="text-sm text-brand-800">{item}</span>
            </div>
          ))}
        </div>
        <p className="mt-6 max-w-3xl text-brand-700">
          We confirm the actual unloading expectations, product handling requirements, and delivery
          conditions before sourcing the truck, not after it&apos;s already en route.
        </p>
      </Section>

      {/* Retail/distributor + job-site + recurring + multi-stop + drop trailer */}
      <Section tone="muted">
        <Eyebrow>Delivery Programs</Eyebrow>
        <h2 className="mb-6 text-2xl font-bold text-brand-900 sm:text-3xl">
          Retail, job-site and recurring distribution
        </h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg bg-white p-6 shadow-sm">
            <h3 className="font-bold text-brand-900">Retail &amp; distributor deliveries</h3>
            <p className="mt-2 text-sm text-brand-700">
              Coordinated around each location&apos;s dock access, appointment requirements and unloading
              capacity.
            </p>
          </div>
          <div className="rounded-lg bg-white p-6 shadow-sm">
            <h3 className="font-bold text-brand-900">Job-site delivery coordination</h3>
            <p className="mt-2 text-sm text-brand-700">
              For installation companies and contractors receiving flooring materials directly at an active
              job site.
            </p>
          </div>
          <div className="rounded-lg bg-white p-6 shadow-sm">
            <h3 className="font-bold text-brand-900">Recurring distribution lanes</h3>
            <p className="mt-2 text-sm text-brand-700">
              Consistent capacity and handling instructions for manufacturers and distributors running the
              same lanes repeatedly. See{" "}
              <Link href="/services/dedicated-transportation" className="font-semibold text-accent-600 hover:text-accent-500">
                Dedicated Transportation
              </Link>
              .
            </p>
          </div>
          <div className="rounded-lg bg-white p-6 shadow-sm">
            <h3 className="font-bold text-brand-900">Multi-stop delivery programs</h3>
            <p className="mt-2 text-sm text-brand-700">
              Routing across several retail or distributor locations on a single, coordinated schedule.
            </p>
          </div>
          <div className="rounded-lg bg-white p-6 shadow-sm">
            <h3 className="font-bold text-brand-900">Drop trailer opportunities</h3>
            <p className="mt-2 text-sm text-brand-700">
              For high-volume distribution points, staged trailers can reduce live-unload bottlenecks. See{" "}
              <Link href="/services/drop-trailer-programs" className="font-semibold text-accent-600 hover:text-accent-500">
                Drop Trailer Programs
              </Link>
              .
            </p>
          </div>
          <div className="rounded-lg bg-white p-6 shadow-sm">
            <h3 className="font-bold text-brand-900">Appointment scheduling</h3>
            <p className="mt-2 text-sm text-brand-700">
              Strict receiving windows at distribution centers are confirmed and built into the carrier&apos;s
              operating instructions.
            </p>
          </div>
        </div>
      </Section>

      {/* Info needed for quote */}
      <Section tone="white">
        <div className="max-w-3xl">
          <Eyebrow>Before You Quote</Eyebrow>
          <h2 className="mb-4 text-2xl font-bold text-brand-900 sm:text-3xl">
            Information needed for a quote
          </h2>
          <p className="mb-6 text-brand-700">
            We confirm the actual unloading expectations before sourcing the truck. Having the following
            ready speeds up an accurate quote:
          </p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {infoForQuote.map((item) => (
              <li key={item} className="flex gap-3 text-brand-700">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* FAQ */}
      <Section tone="muted">
        <Eyebrow>FAQ</Eyebrow>
        <h2 className="mb-6 text-2xl font-bold text-brand-900 sm:text-3xl">
          Carpet padding &amp; flooring transportation FAQ
        </h2>
        <FaqAccordion items={flooringFaqs} />
      </Section>

      <CtaBand
        headline="Shipping carpet padding, flooring or rolled goods?"
        supporting="Tell us the loading method and unloading expectations and we'll confirm the right equipment and capacity before the truck moves."
      />
    </>
  );
}

const flooringFaqs = [
  {
    q: "How do you transport carpet padding?",
    a: "Carpet padding typically moves in a dry, clean dry van trailer, either floor loaded or palletized depending on the shipper's preference. Because it's bulky relative to its weight, trailer cubic capacity is usually the limiting factor rather than weight.",
  },
  {
    q: "What type of trailer is used for carpet padding?",
    a: "A standard dry van trailer is most common, sourced for cleanliness and dryness given the product's sensitivity to moisture and odor. Trailer selection also accounts for the cubic volume needed to fit the shipment.",
  },
  {
    q: "How is floor-loaded freight unloaded?",
    a: "Floor-loaded freight is typically unloaded by hand or with non-powered equipment like a pallet jack, and generally takes longer than palletized freight. Whether the receiver, the driver, or a lumper handles the unload should be confirmed before the shipment is booked.",
  },
  {
    q: "Who can transport carpet rolls?",
    a: "Carriers equipped with clean, dry dry-van trailers and experience handling bulky, rolled freight. We source this capacity through Landstar's network and confirm handling requirements before dispatch.",
  },
  {
    q: "How do I ship bulky, lightweight flooring products?",
    a: "Start with the cubic volume and piece count, not just the weight, since trailer space is usually the constraint. Then confirm loading method (floor loaded or palletized) and who will unload at delivery. Those three details drive most of the planning.",
  },
  {
    q: "How do I arrange job-site freight delivery for flooring materials?",
    a: "Share the job-site address, access conditions, and who will be available to help unload. If the site has no loading dock, driver-assisted delivery may be arranged and confirmed as part of the shipment plan.",
  },
];
