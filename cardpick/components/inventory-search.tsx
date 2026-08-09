"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { searchInventoryAction, type InventorySearchRow } from "@/lib/actions/inventory";
import { centsToDollarsString } from "@/lib/money";

export function InventorySearch({ initialRows }: { initialRows: InventorySearchRow[] }) {
  const [term, setTerm] = useState("");
  const [rows, setRows] = useState(initialRows);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const handle = setTimeout(() => {
      startTransition(async () => {
        const results = await searchInventoryAction(term);
        setRows(results);
      });
    }, 150);
    return () => clearTimeout(handle);
  }, [term]);

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Search by name, set, card number, or SKU…"
        className="w-full max-w-md rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Set</th>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Printing</th>
              <th className="px-3 py-2">Cond.</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Market</th>
              <th className="px-3 py-2">Sell</th>
              <th className="px-3 py-2">Location</th>
              <th className="px-3 py-2">Qty</th>
            </tr>
          </thead>
          <tbody className={isPending ? "opacity-50" : ""}>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                <td className="px-3 py-2">
                  <Link href={`/inventory/${r.id}`} className="text-blue-600 hover:underline">
                    {r.name}
                  </Link>
                </td>
                <td className="px-3 py-2">{r.setName}</td>
                <td className="px-3 py-2">{r.cardNumber}</td>
                <td className="px-3 py-2">{r.printing}</td>
                <td className="px-3 py-2">{r.condition}</td>
                <td className="px-3 py-2">{r.status}</td>
                <td className="px-3 py-2">
                  {centsToDollarsString(r.marketPriceCents)}
                  {r.marketPriceAsof && <span className="ml-1 text-xs text-neutral-400">({r.marketPriceAsof})</span>}
                </td>
                <td className="px-3 py-2">{centsToDollarsString(r.sellPriceCents)}</td>
                <td className="px-3 py-2">{r.locationCode ?? <span className="text-neutral-400">unassigned</span>}</td>
                <td className="px-3 py-2">{r.quantity ?? "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-neutral-400">
                  No matches.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
