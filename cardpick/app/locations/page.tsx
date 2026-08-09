import Link from "next/link";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { inventoryLot, location } from "@/lib/db/schema";
import { BulkAssignForm } from "@/components/bulk-assign-form";
import { createLocationAction } from "@/lib/actions/locations";

export default async function LocationsPage() {
  const locations = db.select().from(location).where(eq(location.active, true)).all();

  const withCounts = locations.map((loc) => {
    const stats = db
      .select({ skuCount: sql<number>`count(*)`, totalQty: sql<number>`coalesce(sum(${inventoryLot.quantity}), 0)` })
      .from(inventoryLot)
      .where(eq(inventoryLot.locationId, loc.id))
      .get()!;
    return { ...loc, ...stats };
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Locations</h1>

      <form action={createLocationAction} className="flex flex-wrap items-end gap-2 rounded-lg border border-neutral-200 bg-white p-4 text-sm">
        <div>
          <label className="block text-xs text-neutral-500">Code</label>
          <input name="code" placeholder="A01, OLD-B, BOX-03…" className="rounded border border-neutral-300 px-2 py-1" required />
        </div>
        <div>
          <label className="block text-xs text-neutral-500">Kind</label>
          <select name="kind" className="rounded border border-neutral-300 px-2 py-1">
            <option value="GRANULAR">Granular (max 60 SKUs / 300 qty)</option>
            <option value="LEGACY">Legacy (no limits)</option>
          </select>
        </div>
        <button className="rounded-md bg-neutral-900 px-3 py-2 text-white">Add location</button>
      </form>

      <table className="w-full text-sm">
        <thead className="border-b border-neutral-200 text-left text-xs uppercase text-neutral-500">
          <tr>
            <th className="px-2 py-2">Code</th>
            <th className="px-2 py-2">Kind</th>
            <th className="px-2 py-2">SKUs</th>
            <th className="px-2 py-2">Qty</th>
            <th className="px-2 py-2">Capacity</th>
          </tr>
        </thead>
        <tbody>
          {withCounts.map((loc) => {
            const overSkus = loc.maxSkus != null && loc.skuCount > loc.maxSkus;
            const overQty = loc.maxQuantity != null && loc.totalQty > loc.maxQuantity;
            return (
              <tr key={loc.id} className="border-b border-neutral-100">
                <td className="px-2 py-2">
                  <Link href={`/locations/${loc.code}`} className="text-blue-600 hover:underline">
                    {loc.code}
                  </Link>
                </td>
                <td className="px-2 py-2">{loc.kind}</td>
                <td className={`px-2 py-2 ${overSkus ? "font-semibold text-red-600" : ""}`}>{loc.skuCount}</td>
                <td className={`px-2 py-2 ${overQty ? "font-semibold text-red-600" : ""}`}>{loc.totalQty}</td>
                <td className="px-2 py-2 text-neutral-500">
                  {loc.maxSkus != null ? `${loc.maxSkus} SKUs / ${loc.maxQuantity} qty` : "none"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <BulkAssignForm locations={locations.map((l) => ({ id: l.id, code: l.code, kind: l.kind }))} />
    </div>
  );
}
