import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/ui/PageHero";
import { Section, Eyebrow } from "@/components/ui/Section";
import { CtaBand } from "@/components/home/CtaBand";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbSchema } from "@/lib/jsonld";
import { articles, contentCalendar } from "@/data/resources";

export const metadata: Metadata = {
  title: "Freight Shipping Resources & Guides",
  description:
    "Guides on driver-assisted freight, carpet and flooring transportation, and truckload quoting from Flux Logistics.",
  alternates: { canonical: "/resources" },
};

export default function ResourcesPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: "Home", url: "/" }, { name: "Resources", url: "/resources" }])} />

      <PageHero
        eyebrow="Resources"
        title="Guides for shippers"
        dek="Straight explanations of the freight terminology and planning decisions that affect driver-assisted, flooring and specialized shipments."
        showCtas={false}
      />

      <Section tone="white">
        <div className="grid gap-6 sm:grid-cols-2">
          {articles.map((article) => (
            <Link
              key={article.slug}
              href={`/resources/${article.slug}`}
              className="flex flex-col rounded-xl border border-brand-100 bg-white p-6 transition-shadow hover:shadow-md"
            >
              <p className="text-xs font-semibold tracking-wide text-accent-600 uppercase">{article.category}</p>
              <h2 className="mt-2 text-lg font-bold text-brand-900">{article.title}</h2>
              <p className="mt-2 flex-1 text-sm text-brand-600">{article.dek}</p>
              <span className="mt-4 text-sm font-semibold text-accent-600">Read guide &rarr;</span>
            </Link>
          ))}
        </div>
      </Section>

      <Section tone="muted">
        <Eyebrow>Coming Soon</Eyebrow>
        <h2 className="mb-4 text-2xl font-bold text-brand-900">More guides in the works</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {contentCalendar.map((title) => (
            <li key={title} className="text-brand-700">
              {title}
            </li>
          ))}
        </ul>
      </Section>

      <CtaBand />
    </>
  );
}
