import { notFound } from "next/navigation";
import Link from "next/link";
import { getInventoryItemDetail } from "@/lib/inventoryQueries";
import { getItemHistory } from "@/lib/history";
import { formatCents } from "@/lib/money";
import ItemEditPanel from "./ItemEditPanel";

export default async function InventoryDetailPage({ params }: PageProps<"/inventory/[id]">) {
  const { id } = await params;
  const itemId = Number(id);
  const detail = getInventoryItemDetail(itemId);
  if (!detail) notFound();
  const { item, lot } = detail;
  const history = getItemHistory(itemId);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold">
          {item.name} <span className="text-slate-400 font-normal">#{item.id}</span>
        </h1>
        <p className="text-sm text-slate-500">
          {item.setName} {item.cardNumber ? `· ${item.cardNumber}` : ""} · {item.condition} {item.printing}
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 text-sm">
        <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-1">
          <div>
            Market price: {formatCents(item.marketPriceCents)}{" "}
            {item.marketPriceAsof && <span className="text-slate-400">(as of {item.marketPriceAsof})</span>}
          </div>
          <div>Sell price: {formatCents(item.sellPriceCents)}</div>
          <div>
            Location:{" "}
            {lot?.locationCode ? (
              <Link className="underline" href={`/locations/${lot.locationCode}`}>
                {lot.locationCode}
              </Link>
            ) : (
              "—"
            )}
          </div>
          <div>Quantity: {lot?.quantity ?? 0}</div>
          <div>Status: {item.status}</div>
          <div>SKU: {item.tcgplayerSkuId ?? "—"}</div>
        </div>

        <ItemEditPanel
          itemId={item.id}
          sellPriceCents={item.sellPriceCents}
          status={item.status}
          quantity={lot?.quantity ?? 0}
        />
      </div>

      <div>
        <h2 className="font-medium mb-2">History</h2>
        <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Field</th>
                <th className="px-3 py-2">Old</th>
                <th className="px-3 py-2">New</th>
                <th className="px-3 py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-t">
                  <td className="px-3 py-2 whitespace-nowrap">{new Date(h.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2">
                    {h.action}
                    {h.reversedAt && <span className="text-slate-400"> (reversed)</span>}
                  </td>
                  <td className="px-3 py-2">{h.field ?? "—"}</td>
                  <td className="px-3 py-2">{h.oldValue ?? "—"}</td>
                  <td className="px-3 py-2">{h.newValue ?? "—"}</td>
                  <td className="px-3 py-2">{h.notes ?? "—"}</td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td className="px-3 py-4 text-slate-400" colSpan={6}>
                    No history yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
