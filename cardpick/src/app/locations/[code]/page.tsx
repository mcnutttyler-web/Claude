import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocationByCode } from "@/lib/locations";
import { db } from "@/db/client";
import { inventoryItem, inventoryLot } from "@/db/schema";
import { eq } from "drizzle-orm";
import { formatCents } from "@/lib/money";

export default async function LocationDetailPage({ params }: PageProps<"/locations/[code]">) {
  const { code } = await params;
  const location = getLocationByCode(code);
  if (!location) notFound();

  const items = db
    .select({
      id: inventoryItem.id,
      name: inventoryItem.name,
      setName: inventoryItem.setName,
      condition: inventoryItem.condition,
      printing: inventoryItem.printing,
      quantity: inventoryLot.quantity,
      sellPriceCents: inventoryItem.sellPriceCents,
    })
    .from(inventoryLot)
    .innerJoin(inventoryItem, eq(inventoryItem.id, inventoryLot.inventoryItemId))
    .where(eq(inventoryLot.locationId, location.id))
    .all();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Location {location.code}</h1>
      <p className="text-sm text-slate-500">
        {location.kind} · {items.length} SKUs
        {location.maxSkus != null ? ` / ${location.maxSkus} max` : ""}
      </p>

      <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-3 py-2">Card</th>
              <th className="px-3 py-2">Set</th>
              <th className="px-3 py-2">Condition</th>
              <th className="px-3 py-2">Qty</th>
              <th className="px-3 py-2">Price</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-t">
                <td className="px-3 py-2">
                  <Link className="underline" href={`/inventory/${i.id}`}>
                    {i.name}
                  </Link>
                </td>
                <td className="px-3 py-2">{i.setName}</td>
                <td className="px-3 py-2">
                  {i.condition} {i.printing}
                </td>
                <td className="px-3 py-2">{i.quantity}</td>
                <td className="px-3 py-2">{formatCents(i.sellPriceCents)}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td className="px-3 py-4 text-slate-400" colSpan={5}>
                  Nothing assigned here yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
