import Link from "next/link";
import { searchInventory } from "@/lib/inventoryQueries";
import { formatCents } from "@/lib/money";
import InventorySearchBox from "./InventorySearchBox";

export default async function InventoryPage({ searchParams }: PageProps<"/inventory">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const page = typeof sp.page === "string" ? Number(sp.page) || 1 : 1;
  const { rows, total, pageSize } = searchInventory({ q, page });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Inventory</h1>
      <InventorySearchBox initialValue={q ?? ""} />
      <p className="text-sm text-slate-500">{total} items</p>

      <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-3 py-2">Card</th>
              <th className="px-3 py-2">Set</th>
              <th className="px-3 py-2">Condition</th>
              <th className="px-3 py-2">Qty</th>
              <th className="px-3 py-2">Location</th>
              <th className="px-3 py-2">Market</th>
              <th className="px-3 py-2">Sell</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2">
                  <Link className="underline" href={`/inventory/${r.id}`}>
                    {r.name}
                  </Link>
                </td>
                <td className="px-3 py-2">{r.setName}</td>
                <td className="px-3 py-2">
                  {r.condition} {r.printing}
                </td>
                <td className="px-3 py-2">{r.quantity ?? 0}</td>
                <td className="px-3 py-2">
                  {r.locationCode ? (
                    <Link className="underline" href={`/locations/${r.locationCode}`}>
                      {r.locationCode}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2">
                  {formatCents(r.marketPriceCents)}
                  {r.marketPriceAsof && (
                    <span className="text-slate-400 text-xs block">as of {r.marketPriceAsof}</span>
                  )}
                </td>
                <td className="px-3 py-2">{formatCents(r.sellPriceCents)}</td>
                <td className="px-3 py-2">{r.status}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="px-3 py-4 text-slate-400" colSpan={8}>
                  No items found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex gap-3 text-sm">
        {page > 1 && (
          <Link className="underline" href={`/inventory?q=${encodeURIComponent(q ?? "")}&page=${page - 1}`}>
            Previous
          </Link>
        )}
        {page * pageSize < total && (
          <Link className="underline" href={`/inventory?q=${encodeURIComponent(q ?? "")}&page=${page + 1}`}>
            Next
          </Link>
        )}
      </div>
    </div>
  );
}
