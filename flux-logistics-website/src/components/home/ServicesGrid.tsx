import Link from "next/link";
import { Eyebrow } from "@/components/ui/Section";
import { primaryServices } from "@/data/services";

const FEATURED_SLUGS = [
  "driver-assisted-freight",
  "carpet-padding-flooring",
  "hazmat-freight",
  "oversized-freight",
  "expedited-freight",
  "dedicated-transportation",
  "drop-trailer-programs",
  "dry-van-truckload",
];

export function ServicesGrid() {
  const featured = FEATURED_SLUGS.map((slug) => primaryServices.find((s) => s.slug === slug)).filter(
    (s): s is NonNullable<typeof s> => Boolean(s)
  );

  return (
    <div>
      <Eyebrow>What We Move</Eyebrow>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="text-2xl font-bold text-brand-900 sm:text-3xl">Core capabilities</h2>
        <Link href="/services" className="text-sm font-semibold text-accent-600 hover:text-accent-500">
          View all services &rarr;
        </Link>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {featured.map((service) => (
          <Link
            key={service.slug}
            href={`/services/${service.slug}`}
            className="flex flex-col rounded-lg border border-brand-100 bg-white p-5 transition-shadow hover:shadow-md"
          >
            <p className="font-semibold text-brand-900">{service.navLabel}</p>
            <p className="mt-2 flex-1 text-sm text-brand-600">{service.shortDescription}</p>
            <span className="mt-4 text-sm font-semibold text-accent-600">Learn more &rarr;</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
