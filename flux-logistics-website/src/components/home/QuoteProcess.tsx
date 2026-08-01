import { Eyebrow } from "@/components/ui/Section";

const steps = [
  {
    title: "Submit the shipment details",
    description: "Tell us the route, freight, and unloading requirements through our quote form.",
  },
  {
    title: "We review the freight and delivery requirements",
    description: "We look at handling, equipment, and delivery conditions, not just origin and destination.",
  },
  {
    title: "Missing information is confirmed",
    description: "If something is unclear (unloading responsibility, dimensions, appointment needs), we ask before we quote.",
  },
  {
    title: "Capacity and equipment are sourced",
    description: "We match the shipment with a carrier and driver qualified and willing to handle it.",
  },
  {
    title: "A quote is provided for approval",
    description: "You review and approve the rate before the shipment is booked.",
  },
  {
    title: "The shipment is monitored through delivery",
    description: "We stay engaged through pickup, transit, and delivery confirmation.",
  },
];

export function QuoteProcess() {
  return (
    <div>
      <Eyebrow>How It Works</Eyebrow>
      <h2 className="max-w-2xl text-2xl font-bold text-brand-900 sm:text-3xl">The quote process</h2>
      <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title} className="rounded-lg bg-white p-5 shadow-sm">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-900 text-sm font-bold text-white">
              {index + 1}
            </span>
            <p className="mt-3 font-semibold text-brand-900">{step.title}</p>
            <p className="mt-1.5 text-sm text-brand-600">{step.description}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
