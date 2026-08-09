import { getPricingSettings } from "@/lib/pricing";
import { savePricingSettingsAction } from "@/lib/actions/pricing";
import { RepricePanel } from "@/components/reprice-panel";

export default async function PricingPage() {
  const settings = getPricingSettings();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Pricing rules</h1>
        <p className="text-sm text-neutral-500">Bands are evaluated top to bottom; the first match wins.</p>
      </div>

      <form action={savePricingSettingsAction} className="max-w-xl space-y-3 rounded-lg border border-neutral-200 bg-white p-4 text-sm">
        <Row label="Flat floor (market < $0.49)" name="flatFloor" defaultValue={(settings.flatFloorCents / 100).toFixed(2)} prefix="$" />
        <Row label="Markup: $0.49 ≤ market < $2.00 (p1)" name="p1" defaultValue={(settings.p1 * 100).toFixed(1)} suffix="%" />
        <Row label="Markup: $2.00 ≤ market < $10.00 (p2)" name="p2" defaultValue={(settings.p2 * 100).toFixed(1)} suffix="%" />
        <Row label="Markup: market ≥ $10.00 (p3)" name="p3" defaultValue={(settings.p3 * 100).toFixed(1)} suffix="%" />
        <div>
          <label className="block text-xs text-neutral-500">Rounding mode</label>
          <select name="roundingMode" defaultValue={settings.roundingMode} className="rounded border border-neutral-300 px-2 py-1">
            <option value="none">None (floor to whole cent)</option>
            <option value="nearest_cent">Nearest cent</option>
            <option value="up_to_x9">Up to nearest $0.X9 (default)</option>
          </select>
        </div>
        <Row label="Hard floor (applied after all rules)" name="hardFloor" defaultValue={(settings.hardFloorCents / 100).toFixed(2)} prefix="$" />
        <Row label="Staleness guard (days)" name="stalenessDays" defaultValue={String(settings.stalenessDays)} />
        <button className="rounded-md bg-neutral-900 px-4 py-2 text-white">Save settings</button>
      </form>

      <div>
        <h2 className="mb-2 text-lg font-semibold">Reprice preview</h2>
        <RepricePanel />
      </div>
    </div>
  );
}

function Row({ label, name, defaultValue, prefix, suffix }: { label: string; name: string; defaultValue: string; prefix?: string; suffix?: string }) {
  return (
    <div>
      <label className="block text-xs text-neutral-500">{label}</label>
      <div className="flex items-center gap-1">
        {prefix && <span>{prefix}</span>}
        <input name={name} defaultValue={defaultValue} step="0.01" className="w-28 rounded border border-neutral-300 px-2 py-1" />
        {suffix && <span>{suffix}</span>}
      </div>
    </div>
  );
}
