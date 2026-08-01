import type { Metadata } from "next";
import { PageHero } from "@/components/ui/PageHero";
import { Section } from "@/components/ui/Section";
import { QuoteForm } from "@/components/quote/QuoteForm";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbSchema } from "@/lib/jsonld";
import { site } from "@/data/site";

export const metadata: Metadata = {
  title: "Request a Freight Quote",
  description:
    "Request a freight quote from Flux Logistics. Tell us your route, freight details and unloading requirements, including driver-assisted and hand-unload deliveries.",
  alternates: { canonical: "/quote" },
};

export default function QuotePage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: "Home", url: "/" }, { name: "Request a Quote", url: "/quote" }])} />

      <PageHero
        eyebrow="Request a Quote"
        title="Tell us about your shipment"
        dek="The more we know about how your freight needs to be handled, especially who's unloading it, the faster and more accurately we can quote it."
        showCtas={false}
      >
        <p className="mt-6 max-w-2xl text-sm text-brand-300">
          Prefer to talk it through? Call {site.owner} directly at{" "}
          <a href={site.phoneHref} className="font-semibold text-white underline">
            {site.phone}
          </a>{" "}
          or email{" "}
          <a href={site.emailHref} className="font-semibold text-white underline">
            {site.email}
          </a>
          .
        </p>
      </PageHero>

      <Section tone="white">
        <div className="mx-auto max-w-4xl">
          <QuoteForm />
        </div>
      </Section>
    </>
  );
}
