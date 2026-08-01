import { Eyebrow } from "@/components/ui/Section";
import { scenarios } from "@/data/scenarios";

export function ScenarioGrid() {
  return (
    <div>
      <Eyebrow>Is This You?</Eyebrow>
      <h2 className="max-w-2xl text-2xl font-bold text-brand-900 sm:text-3xl">
        Flux Logistics may be a strong fit if your shipment looks like this
      </h2>
      <p className="mt-3 max-w-2xl text-brand-600">
        Not every load needs this level of planning. These are the situations where it usually does.
      </p>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {scenarios.map((s) => (
          <li key={s.title} className="rounded-lg border border-brand-100 bg-white p-5 shadow-sm">
            <p className="font-semibold text-brand-900">{s.title}</p>
            <p className="mt-1.5 text-sm text-brand-600">{s.description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
