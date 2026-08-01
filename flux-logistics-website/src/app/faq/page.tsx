import type { Metadata } from "next";
import { PageHero } from "@/components/ui/PageHero";
import { Section } from "@/components/ui/Section";
import { FaqAccordion } from "@/components/faq/FaqAccordion";
import { CtaBand } from "@/components/home/CtaBand";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbSchema, faqPageSchema } from "@/lib/jsonld";
import { faqs } from "@/data/faqs";

export const metadata: Metadata = {
  title: "Frequently Asked Questions",
  description:
    "Answers to common questions about driver-assisted freight, carpet and flooring transportation, hazmat, oversized freight, and how the Flux Logistics quote process works.",
  alternates: { canonical: "/faq" },
};

const categoryLabels: Record<string, string> = {
  "driver-assist": "Driver-Assisted Freight",
  flooring: "Carpet & Flooring Transportation",
  quote: "Quoting & Booking",
  general: "General",
};

export default function FaqPage() {
  const grouped = Object.entries(categoryLabels).map(([key, label]) => ({
    label,
    items: faqs.filter((f) => f.category === key),
  }));

  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: "Home", url: "/" }, { name: "FAQ", url: "/faq" }])} />
      <JsonLd data={faqPageSchema(faqs)} />

      <PageHero
        eyebrow="FAQ"
        title="Frequently asked questions"
        dek="Straight answers about driver-assisted freight, flooring transportation, and how we quote and book shipments."
      />

      <Section tone="white">
        <div className="space-y-14">
          {grouped.map((group) => (
            <div key={group.label}>
              <h2 className="mb-4 text-xl font-bold text-brand-900">{group.label}</h2>
              <FaqAccordion items={group.items} />
            </div>
          ))}
        </div>
      </Section>

      <CtaBand />
    </>
  );
}
