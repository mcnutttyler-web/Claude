import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/ui/PageHero";
import { Section, Eyebrow } from "@/components/ui/Section";
import { CtaBand } from "@/components/home/CtaBand";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbSchema } from "@/lib/jsonld";
import { primaryServices, secondaryServices } from "@/data/services";

export const metadata: Metadata = {
  title: "Freight Transportation Services",
  description:
    "Specialized truckload transportation services from Flux Logistics: driver-assisted freight, carpet and flooring transportation, hazmat, oversized, expedited, dedicated capacity and more.",
  alternates: { canonical: "/services" },
};

export default function ServicesIndexPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: "Home", url: "/" }, { name: "Services", url: "/services" }])} />

      <PageHero
        eyebrow="What We Move"
        title="Freight Transportation Services"
        dek="We focus on freight that requires more planning, communication and hands-on execution than a standard dock-to-dock shipment. Below are the capabilities we're built around."
      />

      <Section tone="white">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {primaryServices.map((service) => (
            <Link
              key={service.slug}
              href={`/services/${service.slug}`}
              className="flex flex-col rounded-lg border border-brand-100 bg-white p-6 transition-shadow hover:shadow-md"
            >
              <p className="text-lg font-bold text-brand-900">{service.navLabel}</p>
              <p className="mt-2 flex-1 text-sm text-brand-600">{service.shortDescription}</p>
              <span className="mt-4 text-sm font-semibold text-accent-600">Learn more &rarr;</span>
            </Link>
          ))}
        </div>
      </Section>

      <Section tone="muted">
        <Eyebrow>Additional Capabilities</Eyebrow>
        <h2 className="mb-6 text-2xl font-bold text-brand-900 sm:text-3xl">
          Also available, coordinated as part of a larger shipment or program
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {secondaryServices.map((service) => (
            <div key={service.name} className="rounded-lg bg-white p-5 shadow-sm">
              <p className="font-semibold text-brand-900">{service.name}</p>
              <p className="mt-1.5 text-sm text-brand-600">{service.description}</p>
            </div>
          ))}
        </div>
      </Section>

      <CtaBand />
    </>
  );
}
