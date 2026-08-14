import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { history, inventoryItem, inventoryLot, location } from "@/lib/db/schema";
import { centsToDollarsString } from "@/lib/money";
import { AssignLocation } from "@/components/assign-location";

export default async function InventoryItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const itemId = Number(id);
  const item = db.select().from(inventoryItem).where(eq(inventoryItem.id, itemId)).get();
  if (!item) notFound();

  const lot = db
    .select({ id: inventoryLot.id, quantity: inventoryLot.quantity, locationCode: location.code })
    .from(inventoryLot)
    .leftJoin(location, eq(location.id, inventoryLot.locationId))
    .where(eq(inventoryLot.inventoryItemId, itemId))
    .get();

  const activeLocations = db.select({ id: location.id, code: location.code }).from(location).where(eq(location.active, true)).all();

  const itemHistory = db.select().from(history).where(eq(history.entityId, itemId)).all().filter((h) => h.entityType === "inventory_item");
  const lotHistory = lot ? db.select().from(history).where(eq(history.entityId, lot.id)).all().filter((h) => h.entityType === "inventory_lot") : [];
  const historyRows = [...itemHistory, ...lotHistory].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{item.name}</h1>
        <p className="text-neutral-500">
          {item.setName} · #{item.cardNumber} · {item.printing} · {item.condition}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field label="Status" value={item.status} />
        <Field label="Market price" value={`${centsToDollarsString(item.marketPriceCents)} (as of ${item.marketPriceAsof ?? "—"})`} />
        <Field label="Sell price" value={centsToDollarsString(item.sellPriceCents)} />
        <Field label="Location / Qty" value={lot ? `${lot.locationCode ?? "—"} · ${lot.quantity}` : "unassigned"} />
        <Field label="SKU / Product ID" value={`${item.tcgplayerSkuId ?? "—"} / ${item.tcgplayerProductId ?? "—"}`} />
        <Field label="Match key" value={item.matchKey} mono />
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-3">
        <div className="mb-2 text-xs uppercase tracking-wide text-neutral-500">Assign / move location</div>
        <AssignLocation itemId={item.id} locations={activeLocations} />
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold">History</h2>
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-2 py-1">When</th>
              <th className="px-2 py-1">Action</th>
              <th className="px-2 py-1">Reason</th>
              <th className="px-2 py-1">Before → After</th>
            </tr>
          </thead>
          <tbody>
            {historyRows.map((h) => (
              <tr key={h.id} className="border-b border-neutral-100">
                <td className="px-2 py-1 text-neutral-500">{h.createdAt}</td>
                <td className="px-2 py-1">{h.action}</td>
                <td className="px-2 py-1">{h.reason ?? "—"}</td>
                <td className="px-2 py-1 font-mono text-xs">
                  {h.beforeJson ?? "—"} → {h.afterJson ?? "—"}
                </td>
              </tr>
            ))}
            {historyRows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-2 py-4 text-center text-neutral-400">
                  No history yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3">
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className={`mt-1 text-sm ${mono ? "font-mono text-xs" : ""}`}>{value}</div>
    </div>
  );
}
