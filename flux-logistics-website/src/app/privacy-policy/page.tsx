import type { Metadata } from "next";
import { PageHero } from "@/components/ui/PageHero";
import { Section } from "@/components/ui/Section";
import { site } from "@/data/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${site.name} collects, uses and protects information submitted through this website.`,
  alternates: { canonical: "/privacy-policy" },
};

export default function PrivacyPolicyPage() {
  return (
    <>
      <PageHero eyebrow="Legal" title="Privacy Policy" showCtas={false} />
      <Section tone="white">
        <div className="prose prose-brand max-w-3xl space-y-6 text-brand-700">
          <p className="text-sm text-brand-500">Last updated: August 1, 2026</p>

          <div>
            <h2 className="text-xl font-bold text-brand-900">Information we collect</h2>
            <p className="mt-2">
              When you submit a quote request, contact form, or otherwise communicate with {site.name}, we
              collect the information you provide, which may include your name, company, email address,
              phone number, shipment details, and any documents or photos you choose to upload (such as
              bills of lading, dimensions, or delivery-site photos).
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-brand-900">How we use information</h2>
            <p className="mt-2">Information submitted through this website is used to:</p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>Review and respond to freight quote requests</li>
              <li>Source and coordinate transportation capacity for your shipment</li>
              <li>Communicate with you about a shipment, quote, or inquiry</li>
              <li>Maintain records of shipment and customer information</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-bold text-brand-900">Information sharing</h2>
            <p className="mt-2">
              Shipment information is shared with carriers, drivers, and other parties as necessary to
              quote and execute your transportation request. We do not sell personal information to third
              parties.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-brand-900">Data retention and security</h2>
            <p className="mt-2">
              We retain information as needed to provide our services and comply with applicable
              recordkeeping requirements, and take reasonable measures to protect information submitted
              through this website.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-bold text-brand-900">Contact us</h2>
            <p className="mt-2">
              Questions about this policy can be directed to{" "}
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
