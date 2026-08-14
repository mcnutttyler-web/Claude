import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { inventoryItem, inventoryLot, location } from "@/lib/db/schema";

export default async function LocationDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const loc = db.select().from(location).where(eq(location.code, code)).get();
  if (!loc) notFound();

  const items = db
    .select({
      id: inventoryItem.id,
      name: inventoryItem.name,
      setName: inventoryItem.setName,
      cardNumber: inventoryItem.cardNumber,
      condition: inventoryItem.condition,
      printing: inventoryItem.printing,
      quantity: inventoryLot.quantity,
    })
    .from(inventoryLot)
    .innerJoin(inventoryItem, eq(inventoryItem.id, inventoryLot.inventoryItemId))
    .where(eq(inventoryLot.locationId, loc.id))
    .all();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Location {loc.code}</h1>
        <p className="text-sm text-neutral-500">
          {loc.kind} · {items.length} SKU(s) · {items.reduce((s, i) => s + i.quantity, 0)} units total
          {loc.maxSkus != null && ` · limit ${loc.maxSkus} SKUs / ${loc.maxQuantity} qty`}
        </p>
      </div>
      <table className="w-full text-sm">
        <thead className="border-b border-neutral-200 text-left text-xs uppercase text-neutral-500">
          <tr>
            <th className="px-2 py-2">Name</th>
            <th className="px-2 py-2">Set</th>
            <th className="px-2 py-2">#</th>
            <th className="px-2 py-2">Cond.</th>
            <th className="px-2 py-2">Qty</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id} className="border-b border-neutral-100">
              <td className="px-2 py-2">
                <Link href={`/inventory/${i.id}`} className="text-blue-600 hover:underline">
                  {i.name}
                </Link>
              </td>
              <td className="px-2 py-2">{i.setName}</td>
              <td className="px-2 py-2">{i.cardNumber}</td>
              <td className="px-2 py-2">{i.condition} {i.printing !== "NORMAL" && `(${i.printing})`}</td>
              <td className="px-2 py-2">{i.quantity}</td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={5} className="px-2 py-6 text-center text-neutral-400">
                Nothing assigned to this location yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
