import { getPickList, oldestUnpickedOrderAgeMs, formatDuration } from "@/lib/pick";
import { PickLineActions } from "@/components/pick-line-actions";

export default function PickListPage() {
  const lines = getPickList();
  const oldestAgeMs = oldestUnpickedOrderAgeMs();

  const groups = new Map<string, typeof lines>();
  for (const line of lines) {
    const key = line.locationCode ?? "UNRESOLVED";
    const list = groups.get(key) ?? [];
    list.push(line);
    groups.set(key, list);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Pick list</h1>
        {oldestAgeMs != null && (
          <div className="text-sm text-neutral-500">
            Oldest unpicked order: <span className="font-semibold text-neutral-800">{formatDuration(oldestAgeMs)}</span>
          </div>
        )}
      </div>

      {lines.length === 0 && <p className="text-neutral-400">Nothing to pick right now.</p>}

      {[...groups.entries()].map(([locationCode, groupLines]) => (
        <div key={locationCode} className="space-y-2">
          <h2 className="text-sm font-semibold text-neutral-500">
            {locationCode === "UNRESOLVED" ? "Unresolved match — needs manual lookup" : `Location ${locationCode}`}
          </h2>
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 text-left text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-2 py-2">Order</th>
                <th className="px-2 py-2">Card</th>
                <th className="px-2 py-2">Qty</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {groupLines.map((line) => (
                <tr key={line.lineId} className="border-b border-neutral-100">
                  <td className="px-2 py-2">
                    {line.externalOrderId}
                    {line.late && <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-700">LATE</span>}
                  </td>
                  <td className="px-2 py-2">{line.itemName ?? line.rawName}</td>
                  <td className="px-2 py-2">{line.quantityOrdered}</td>
                  <td className="px-2 py-2">
                    <PickLineActions line={line} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
