import Link from "next/link";
import { listOrders } from "@/lib/orderQueries";
import { formatDuration, getLateThresholdHours, isOrderLate } from "@/lib/dashboard";

export default function OrdersPage() {
  const orders = listOrders();
  const thresholdHours = getLateThresholdHours();
  const now = new Date();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Orders</h1>
        <Link className="rounded bg-slate-900 text-white px-3 py-1.5 text-sm" href="/orders/import">
          Import orders
        </Link>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-3 py-2">Order</th>
              <th className="px-3 py-2">Imported</th>
              <th className="px-3 py-2">Ship by</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Age</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const late = isOrderLate(o.importedAt, thresholdHours, now) && o.status !== "FULFILLED";
              return (
                <tr key={o.id} className="border-t">
                  <td className="px-3 py-2">
                    <Link className="underline" href={`/orders/${o.id}`}>
                      {o.tcgplayerOrderId}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{new Date(o.importedAt).toLocaleString()}</td>
                  <td className="px-3 py-2">{o.shipBy ?? "—"}</td>
                  <td className="px-3 py-2">{o.status}</td>
                  <td className="px-3 py-2">
                    {formatDuration(now.getTime() - new Date(o.importedAt).getTime())}
                    {late && <span className="ml-2 text-red-600 font-medium">LATE</span>}
                  </td>
                </tr>
              );
            })}
            {orders.length === 0 && (
              <tr>
                <td className="px-3 py-4 text-slate-400" colSpan={5}>
                  No orders imported yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
