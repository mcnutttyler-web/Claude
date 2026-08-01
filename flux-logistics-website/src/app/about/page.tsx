import type { Metadata } from "next";
import { PageHero } from "@/components/ui/PageHero";
import { Section, Eyebrow } from "@/components/ui/Section";
import { CtaBand } from "@/components/home/CtaBand";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbSchema } from "@/lib/jsonld";
import { site } from "@/data/site";

export const metadata: Metadata = {
  title: "About Flux Logistics",
  description:
    "Flux Logistics is an independent Landstar agency owned and operated by Tyler McNutt, focused on specialized, driver-assisted and time-critical truckload freight.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: "Home", url: "/" }, { name: "About", url: "/about" }])} />

      <PageHero
        eyebrow="About Flux Logistics"
        title="An independent agency, built around freight that needs a real logistics partner"
        dek="Flux Logistics is owned and operated by Tyler McNutt, an independent agent of Landstar, one of the largest transportation networks in North America."
      />

      <Section tone="white">
        <div className="max-w-3xl space-y-5 text-lg text-brand-700">
          <p>
            Most freight moves fine without much intervention: a truck picks it up, drives it, and drops it
            at a dock. Flux Logistics exists for the freight that doesn&apos;t work that way, shipments that
            need specialized equipment, driver-assisted unloading, exact appointment coordination, hazmat
            compliance, oversized permitting, or simply a level of communication that a large call-center
            brokerage isn&apos;t built to provide.
          </p>
          <p>
            As an independent agency of Landstar, Flux Logistics combines the reach of a large, established
            transportation network with the responsiveness of a small, owner-led operation. You get access
            to a broad, vetted carrier base, without losing a direct line to the person managing your
            shipment.
          </p>
        </div>
      </Section>

      <Section tone="muted">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <Eyebrow>The Owner</Eyebrow>
            <h2 className="mb-4 text-2xl font-bold text-brand-900 sm:text-3xl">{site.owner}</h2>
            <p className="text-brand-700">
              {site.owner} owns and operates Flux Logistics, working directly with shippers on freight that
              requires hands-on planning: coordinating unloading requirements with carriers and drivers,
              managing oversized and hazmat compliance, and staying engaged with a shipment from quote
              through delivery.
            </p>
            <p className="mt-4 text-brand-700">
              When you contact Flux Logistics, you&apos;re reaching {site.owner} directly, not a general
              inbox routed through a large call center.
            </p>
          </div>
          <div className="rounded-xl border border-brand-100 bg-white p-6">
            <dl className="space-y-4 text-sm">
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
                <dd className="mt-1 text-brand-800">United States, plus cross-border capacity to and from Mexico</dd>
              </div>
              <div>
                <dt className="font-semibold text-brand-500 uppercase">Network</dt>
                <dd className="mt-1 text-brand-800">
                  Independent agency of{" "}
                  <a href={site.agencyOfUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent-600">
                    Landstar
                  </a>
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </Section>

      <Section tone="white">
        <Eyebrow>What Sets Flux Logistics Apart</Eyebrow>
        <h2 className="mb-6 text-2xl font-bold text-brand-900 sm:text-3xl">
          Built for freight that needs more than a truck
        </h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="rounded-lg bg-brand-50 p-6">
            <h3 className="font-bold text-brand-900">A large call center doesn&apos;t coordinate this well</h3>
            <p className="mt-2 text-sm text-brand-700">
              Freight that needs driver-assisted unloading, exact appointment windows, or oversized
              permitting requires someone who understands the shipment, not a rotating queue of dispatchers.
            </p>
          </div>
          <div className="rounded-lg bg-brand-50 p-6">
            <h3 className="font-bold text-brand-900">Landstar&apos;s network, without losing personal service</h3>
            <p className="mt-2 text-sm text-brand-700">
              Access to a large, established carrier base is paired with a single point of contact who
              stays engaged with your shipment from quote to delivery.
            </p>
          </div>
          <div className="rounded-lg bg-brand-50 p-6">
            <h3 className="font-bold text-brand-900">Specialized freight is the focus, not the exception</h3>
            <p className="mt-2 text-sm text-brand-700">
              Driver-assisted delivery, carpet and flooring transportation, hazmat, oversized freight and
              recurring lanes are core capabilities, not edge cases handled reluctantly.
            </p>
          </div>
          <div className="rounded-lg bg-brand-50 p-6">
            <h3 className="font-bold text-brand-900">Clear expectations before a load moves</h3>
            <p className="mt-2 text-sm text-brand-700">
              Handling, equipment, and delivery requirements are confirmed with the carrier before dispatch,
              not discovered on arrival.
            </p>
          </div>
        </div>
      </Section>

      <CtaBand />
    </>
  );
}
