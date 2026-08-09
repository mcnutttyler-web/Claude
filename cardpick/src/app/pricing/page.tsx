import { getPricingSettingsAction } from "./actions";
import PricingClient from "./PricingClient";

export default async function PricingPage() {
  const settings = await getPricingSettingsAction();
  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="text-xl font-semibold">Pricing Rules</h1>
      <p className="text-sm text-slate-500">
        Bands are evaluated top to bottom: under $0.49 floors to the hard floor; $0.49–$2.00 uses p1; $2.00–$10.00
        uses p2; $10.00+ uses p3. Repricing always previews before it applies anything.
      </p>
      <PricingClient initialSettings={settings} />
    </div>
  );
}
