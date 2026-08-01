import type { Metadata } from "next";
import { Hero } from "@/components/home/Hero";
import { ScenarioGrid } from "@/components/home/ScenarioGrid";
import { DriverAssistSection } from "@/components/home/DriverAssistSection";
import { ServicesGrid } from "@/components/home/ServicesGrid";
import { WhyChoose } from "@/components/home/WhyChoose";
import { QuoteProcess } from "@/components/home/QuoteProcess";
import { FaqPreview } from "@/components/home/FaqPreview";
import { CtaBand } from "@/components/home/CtaBand";
import { Section } from "@/components/ui/Section";
import { JsonLd } from "@/components/seo/JsonLd";
import { faqPageSchema } from "@/lib/jsonld";
import { faqs, homepageFaqSlugs } from "@/data/faqs";
import { site } from "@/data/site";

export const metadata: Metadata = {
  title: "Specialized Freight & Driver-Assisted Transportation",
  description: site.tagline,
  alternates: { canonical: "/" },
};

export default function HomePage() {
  const homepageFaqs = homepageFaqSlugs
    .map((q) => faqs.find((f) => f.q === q))
    .filter((f): f is NonNullable<typeof f> => Boolean(f));

  return (
    <>
      <JsonLd data={faqPageSchema(homepageFaqs)} />
      <Hero />
      <Section tone="white">
        <ScenarioGrid />
      </Section>
      <Section tone="muted">
        <DriverAssistSection />
      </Section>
      <Section tone="white">
        <ServicesGrid />
      </Section>
      <Section tone="navy">
        <WhyChoose />
      </Section>
      <Section tone="muted">
        <QuoteProcess />
      </Section>
      <Section tone="white">
        <FaqPreview />
      </Section>
      <CtaBand />
    </>
  );
}
