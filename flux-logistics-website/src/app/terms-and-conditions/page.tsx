import type { Metadata } from "next";
import { PageHero } from "@/components/ui/PageHero";
import { Section } from "@/components/ui/Section";
import { site } from "@/data/site";

export const metadata: Metadata = {
  title: "Terms and Conditions",
  description: `Terms governing the use of the ${site.name} website and quote request process.`,
  alternates: { canonical: "/terms-and-conditions" },
};

export default function TermsPage() {
  return (
    <>
      <PageHero eyebrow="Legal" title="Terms and Conditions" showCtas={false} />
      <Section tone="white">
        <div className="max-w-3xl space-y-6 text-brand-700">
          <p className="text-sm text-brand-500">Last updated: August 1, 2026</p>

          <div>
            <h2 className="text-xl font-bold text-brand-900">Use of this website</h2>
            <p className="mt-2">
              This website is provided by {site.name}, an independent agency of Landstar, for the purpose
              of sharing information about our transportation services and receiving freight quote
              requests. By using this site, you agree to provide accurate information and use it only for
              legitimate business purposes.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-brand-900">Quote requests are not binding</h2>
            <p className="mt-2">
              Submitting a quote request through this website does not create a binding freight quote,
              contract, or guarantee of capacity. Rates and availability are subject to review of the
              complete shipment, handling, equipment, labor, and delivery requirements. Driver-assisted
              services must be confirmed with the carrier before dispatch. A binding rate and service
              agreement is established only when a quote is confirmed and a shipment is booked.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-brand-900">No guarantee of service</h2>
            <p className="mt-2">
              Descriptions of services on this website, including driver-assisted delivery, oversized
              freight, hazmat transportation, and expedited service, describe capabilities we coordinate
              when arranged and confirmed. They do not guarantee availability, timing, or that a specific
              service will be available for any individual shipment.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-brand-900">Relationship to Landstar</h2>
            <p className="mt-2">
              {site.name} is an independent agency operating within the Landstar network. {site.name} does
              not own Landstar-affiliated equipment, and references to Landstar on this website describe an
              agency relationship, not ownership or employment by Landstar System, Inc.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-brand-900">Limitation of liability</h2>
            <p className="mt-2">
              Information on this website is provided for general informational purposes and is not a
              substitute for confirming shipment-specific details, rates, and requirements directly with{" "}
              {site.name} before a shipment is booked.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-brand-900">Contact</h2>
            <p className="mt-2">
              Questions about these terms can be directed to{" "}
              <a href={site.emailHref} className="font-semibold text-accent-600">
                {site.email}
              </a>{" "}
              or {site.phone}.
            </p>
          </div>
        </div>
      </Section>
    </>
  );
}
