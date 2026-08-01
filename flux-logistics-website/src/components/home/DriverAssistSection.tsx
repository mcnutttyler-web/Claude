import Link from "next/link";
import { Eyebrow } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { unloadTerms } from "@/data/glossary";

export function DriverAssistSection() {
  return (
    <div>
      <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
        <div>
          <Eyebrow>A Core Capability</Eyebrow>
          <h2 className="text-2xl font-bold text-brand-900 sm:text-3xl">
            Driver-Assisted Delivery &amp; Specialized Unloading
          </h2>
          <p className="mt-4 text-brand-700">
            A meaningful share of the freight we move, especially carpet padding, flooring materials and
            other bulky building products, doesn&apos;t end at the dock. It ends with the driver helping get
            product off the trailer. That&apos;s not a guarantee we make on every shipment; it&apos;s an
            operational capability we coordinate when it&apos;s needed.
          </p>
          <p className="mt-4 text-brand-700">
            Driver assistance has to be arranged before the truck is booked, not discovered when it shows
            up. That means telling us what the driver would actually be doing, confirming it with the
            carrier, and reflecting it in the rate. Get that sequence right, and the delivery goes smoothly.
            Skip it, and you end up with a driver who declines the job, a delayed delivery, or a dispute
            over pay.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button href="/services/driver-assisted-freight" variant="secondary">
              Driver-Assisted Freight Guide
            </Button>
            <Link
              href="/services/carpet-padding-flooring"
              className="inline-flex items-center justify-center rounded-md border-2 border-brand-900 px-6 py-3.5 text-base font-semibold text-brand-900 hover:bg-brand-50"
            >
              Carpet &amp; Flooring Transportation
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-brand-100 bg-brand-50 p-6">
          <p className="mb-4 text-sm font-semibold tracking-wide text-brand-500 uppercase">
            Four Terms We Never Use Interchangeably
          </p>
          <dl className="space-y-4">
            {unloadTerms.map((term) => (
              <div key={term.term} className="border-b border-brand-200 pb-4 last:border-0 last:pb-0">
                <dt className="font-bold text-brand-900">{term.term}</dt>
                <dd className="mt-1 text-sm text-brand-700">{term.short}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
