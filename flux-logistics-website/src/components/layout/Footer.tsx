import Link from "next/link";
import { footerNav, site } from "@/data/site";
import { primaryServices } from "@/data/services";

export function Footer() {
  return (
    <footer className="bg-brand-950 text-brand-200">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-4 lg:px-8">
        <div>
          <p className="text-lg font-extrabold text-white">
            Flux <span className="text-accent-500">Logistics</span>
          </p>
          <p className="mt-3 max-w-xs text-sm text-brand-300">
            An independent Landstar agency coordinating specialized, driver-assisted and time-critical
            truckload transportation across the United States.
          </p>
          <div className="mt-4 space-y-1 text-sm">
            <p>
              <a href={site.phoneHref} className="hover:text-white">
                {site.phone}
              </a>
            </p>
            <p>
              <a href={site.emailHref} className="hover:text-white">
                {site.email}
              </a>
            </p>
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-white">Services</p>
          <ul className="mt-3 space-y-2 text-sm">
            {primaryServices.slice(0, 8).map((s) => (
              <li key={s.slug}>
                <Link href={`/services/${s.slug}`} className="hover:text-white">
                  {s.navLabel}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/services" className="font-medium text-accent-500 hover:text-accent-400">
                View all services
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <p className="text-sm font-semibold text-white">Company</p>
          <ul className="mt-3 space-y-2 text-sm">
            {footerNav.company.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="hover:text-white">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-sm font-semibold text-white">Get a Quote</p>
          <p className="mt-3 text-sm text-brand-300">
            Tell us about your shipment and we&apos;ll confirm capacity, equipment and handling before it
            moves.
          </p>
          <Link
            href="/quote"
            className="mt-4 inline-flex items-center justify-center rounded-md bg-accent-500 px-5 py-2.5 text-sm font-semibold text-brand-950 hover:bg-accent-400"
          >
            Request a Freight Quote
          </Link>
        </div>
      </div>

      <div className="border-t border-brand-800">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-6 text-xs text-brand-400 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>
            &copy; {new Date().getFullYear()} {site.name}. An independent agency of Landstar System, Inc.
          </p>
          <div className="flex gap-4">
            {footerNav.legal.map((item) => (
              <Link key={item.href} href={item.href} className="hover:text-white">
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
