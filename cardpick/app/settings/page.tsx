import { listSnapshots } from "@/lib/backup";
import { getLateThresholdHours } from "@/lib/pick";
import { setLateThresholdAction } from "@/lib/actions/backup";
import { getTcgplayerExportSettings } from "@/lib/export";
import { BackupPanel } from "@/components/backup-panel";
import { TcgplayerExportPanel } from "@/components/tcgplayer-export-panel";
import { saveTcgplayerExportHeadersAction } from "@/lib/actions/export-settings";

export default async function SettingsPage() {
  const snapshots = listSnapshots();
  const lateThresholdHours = getLateThresholdHours();
  const exportSettings = getTcgplayerExportSettings();

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Data safety</h2>
        <BackupPanel initialSnapshots={snapshots} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Pick list</h2>
        <form action={setLateThresholdAction} className="flex items-center gap-2 text-sm">
          <label>LATE flag threshold (hours):</label>
          <input name="hours" type="number" defaultValue={lateThresholdHours} className="w-20 rounded border border-neutral-300 px-2 py-1" />
          <button className="rounded-md bg-neutral-900 px-3 py-2 text-white">Save</button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">TCGplayer upload export</h2>
        <form action={saveTcgplayerExportHeadersAction} className="max-w-xl space-y-2 rounded-lg border border-neutral-200 bg-white p-4 text-sm">
          <p className="text-neutral-500">
            TCGplayer&apos;s exact upload template hasn&apos;t been provided yet — these header names are placeholders. Update them once
            you have the real template so the export matches exactly.
          </p>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs text-neutral-500">SKU column header</label>
              <input name="skuHeader" defaultValue={exportSettings.skuHeader} className="w-full rounded border border-neutral-300 px-2 py-1" />
            </div>
            <div>
              <label className="block text-xs text-neutral-500">Price column header</label>
              <input name="priceHeader" defaultValue={exportSettings.priceHeader} className="w-full rounded border border-neutral-300 px-2 py-1" />
            </div>
            <div>
              <label className="block text-xs text-neutral-500">Quantity column header</label>
              <input name="quantityHeader" defaultValue={exportSettings.quantityHeader} className="w-full rounded border border-neutral-300 px-2 py-1" />
            </div>
          </div>
          <button className="rounded-md bg-neutral-900 px-3 py-2 text-white">Save headers</button>
        </form>
        <TcgplayerExportPanel initial={exportSettings} />
      </section>
    </div>
  );
}
