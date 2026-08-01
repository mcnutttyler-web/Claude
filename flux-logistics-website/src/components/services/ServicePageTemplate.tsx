import Link from "next/link";
import { PageHero } from "@/components/ui/PageHero";
import { Section, Eyebrow } from "@/components/ui/Section";
import { CtaBand } from "@/components/home/CtaBand";
import { FaqAccordion } from "@/components/faq/FaqAccordion";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbSchema, faqPageSchema, serviceSchema } from "@/lib/jsonld";
import type { Service } from "@/data/services";
import { getServiceBySlug } from "@/data/services";

export function ServicePageTemplate({ service }: { service: Service }) {
  const related = service.related
    .map((slug) => getServiceBySlug(slug))
    .filter((s): s is Service => Boolean(s));

  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", url: "/" },
          { name: "Services", url: "/services" },
          { name: service.navLabel, url: `/services/${service.slug}` },
        ])}
      />
      <JsonLd
        data={serviceSchema({
          name: service.title,
          description: service.metaDescription,
          url: `/services/${service.slug}`,
        })}
      />
      {service.faqs.length > 0 && <JsonLd data={faqPageSchema(service.faqs)} />}

      <PageHero eyebrow="Specialized Freight Service" title={service.title} dek={service.shortDescription} />

      <Section tone="white">
        <div className="max-w-3xl">
          {service.intro.map((p) => (
            <p key={p} className="mb-4 text-lg text-brand-700">
              {p}
            </p>
          ))}
        </div>
      </Section>

      <Section tone="muted">
        <Eyebrow>Good Fit</Eyebrow>
        <h2 className="mb-6 text-2xl font-bold text-brand-900 sm:text-3xl">
          This service may be a fit if&hellip;
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {service.goodFit.map((item) => (
            <li key={item} className="flex gap-3 rounded-lg bg-white p-4 shadow-sm">
              <span className="mt-0.5 text-accent-600" aria-hidden="true">
                ✓
              </span>
              <span className="text-brand-800">{item}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section tone="white">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <Eyebrow>Capabilities</Eyebrow>
            <h2 className="mb-4 text-2xl font-bold text-brand-900">What we coordinate</h2>
            <ul className="space-y-3">
              {service.capabilities.map((item) => (
                <li key={item} className="flex gap-3 text-brand-700">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-500" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <Eyebrow>Process</Eyebrow>
            <h2 className="mb-4 text-2xl font-bold text-brand-900">How Flux Logistics handles it</h2>
            <ol className="space-y-3">
              {service.process.map((item, index) => (
                <li key={item} className="flex gap-3 text-brand-700">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-900 text-xs font-bold text-white">
                    {index + 1}
                  </span>
                  {item}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Section>

      <Section tone="muted">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <Eyebrow>Before We Quote</Eyebrow>
            <h2 className="mb-4 text-2xl font-bold text-brand-900">Information we need</h2>
            <ul className="space-y-3">
              {service.needToQuote.map((item) => (
                <li key={item} className="flex gap-3 text-brand-700">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-accent-500/30 bg-white p-6">
            <h2 className="mb-3 text-lg font-bold text-brand-900">Good to know</h2>
            <ul className="space-y-2 text-sm text-brand-700">
              {service.considerations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      {service.faqs.length > 0 && (
        <Section tone="white">
          <Eyebrow>FAQ</Eyebrow>
          <h2 className="mb-6 text-2xl font-bold text-brand-900 sm:text-3xl">
            Common questions about {service.navLabel.toLowerCase()}
          </h2>
          <FaqAccordion items={service.faqs} />
        </Section>
      )}

      {related.length > 0 && (
        <Section tone="muted">
          <Eyebrow>Related</Eyebrow>
          <h2 className="mb-6 text-2xl font-bold text-brand-900 sm:text-3xl">Related services</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {related.map((r) => (
              <Link
                key={r.slug}
                href={`/services/${r.slug}`}
                className="rounded-lg border border-brand-100 bg-white p-5 transition-shadow hover:shadow-md"
              >
                <p className="font-semibold text-brand-900">{r.navLabel}</p>
                <p className="mt-1 text-sm text-brand-600">{r.shortDescription}</p>
              </Link>
            ))}
          </div>
        </Section>
      )}

      <CtaBand />
    </>
  );
}
