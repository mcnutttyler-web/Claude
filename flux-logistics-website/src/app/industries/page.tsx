import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/ui/PageHero";
import { Section } from "@/components/ui/Section";
import { CtaBand } from "@/components/home/CtaBand";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbSchema } from "@/lib/jsonld";
import { industries } from "@/data/industries";

export const metadata: Metadata = {
  title: "Industries We Serve",
  description:
    "Flux Logistics coordinates specialized truckload transportation for flooring and building materials, manufacturing, retail distribution, construction, hazmat shippers and more.",
  alternates: { canonical: "/industries" },
};

export default function IndustriesPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: "Home", url: "/" }, { name: "Industries", url: "/industries" }])} />

      <PageHero
        eyebrow="Industries"
        title="Industries we serve"
        dek="The industries below share a common thread: freight that needs more coordination than a standard dock-to-dock shipment."
      />

      <Section tone="white">
        <div className="grid gap-6 lg:grid-cols-2">
          {industries.map((industry) => (
            <div key={industry.slug} className="rounded-xl border border-brand-100 bg-white p-6">
              <h2 className="text-xl font-bold text-brand-900">{industry.name}</h2>
              <p className="mt-2 text-brand-700">{industry.description}</p>
              <p className="mt-4 text-sm font-semibold text-brand-500 uppercase">Common needs</p>
              <ul className="mt-2 space-y-1.5">
                {industry.needs.map((need) => (
                  <li key={need} className="flex gap-2 text-sm text-brand-700">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-500" aria-hidden="true" />
                    {need}
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex flex-wrap gap-2">
                {industry.relatedServices.map((slug) => (
                  <Link
                    key={slug}
                    href={`/services/${slug}`}
                    className="rounded-full border border-brand-200 px-3 py-1 text-xs font-semibold text-brand-700 hover:border-accent-500 hover:text-accent-600"
                  >
                    {slug.replace(/-/g, " ")}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <CtaBand />
    </>
  );
}
