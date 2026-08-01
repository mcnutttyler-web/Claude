import type { Metadata } from "next";
import { PageHero } from "@/components/ui/PageHero";
import { Section } from "@/components/ui/Section";
import { ContactForm } from "@/components/contact/ContactForm";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbSchema } from "@/lib/jsonld";
import { site } from "@/data/site";

export const metadata: Metadata = {
  title: "Contact Flux Logistics",
  description: `Reach ${site.owner} directly at ${site.phone} or ${site.email} for freight quotes and logistics questions.`,
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: "Home", url: "/" }, { name: "Contact", url: "/contact" }])} />

      <PageHero
        eyebrow="Contact"
        title="Talk to a logistics contact, not a call center"
        dek={`Reach ${site.owner} directly. For shipment-specific pricing, the Request a Quote form gets you the fastest, most accurate response.`}
        showCtas={false}
      />

      <Section tone="white">
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <h2 className="mb-4 text-xl font-bold text-brand-900">Send a message</h2>
            <ContactForm />
          </div>
          <div className="space-y-6">
            <div className="rounded-xl border border-brand-100 bg-brand-50 p-6">
              <h2 className="mb-4 text-xl font-bold text-brand-900">Direct contact</h2>
              <dl className="space-y-4 text-sm">
                <div>
                  <dt className="font-semibold text-brand-500 uppercase">Owner &amp; Primary Contact</dt>
                  <dd className="mt-1 text-lg font-semibold text-brand-900">{site.owner}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-brand-500 uppercase">Phone</dt>
                  <dd className="mt-1 text-lg font-semibold text-brand-900">
                    <a href={site.phoneHref}>{site.phone}</a>
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-brand-500 uppercase">Email</dt>
                  <dd className="mt-1 text-lg font-semibold text-brand-900">
                    <a href={site.emailHref}>{site.email}</a>
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-brand-500 uppercase">Service Area</dt>
                  <dd className="mt-1 text-brand-800">United States and cross-border Mexico freight</dd>
                </div>
              </dl>
            </div>
            <div className="rounded-xl border border-brand-100 bg-white p-6">
              <h2 className="mb-2 text-lg font-bold text-brand-900">Have a shipment to quote?</h2>
              <p className="mb-4 text-sm text-brand-700">
                Use the Request a Quote form so we can gather route, freight and unloading details in one
                pass, it&apos;s the fastest way to get an accurate quote.
              </p>
              <a
                href="/quote"
                className="inline-flex items-center justify-center rounded-md bg-brand-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
              >
                Request a Freight Quote
              </a>
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
