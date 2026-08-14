import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { order, orderLine } from "@/lib/db/schema";
import { isOrderLate, findFulfillmentGroupId } from "@/lib/pick";
import { FulfillmentControls } from "@/components/fulfillment-controls";

export default async function OrdersPage() {
  const orders = db.select().from(order).orderBy(desc(order.importedAt)).all();

  const rows = orders.map((o) => {
    const lines = db.select().from(orderLine).where(eq(orderLine.orderId, o.id)).all();
    const fulfillmentGroupId = o.status === "FULFILLED" ? findFulfillmentGroupId(o.externalOrderId) : null;
    return { order: o, lineCount: lines.length, late: isOrderLate(o.importedAt), fulfillmentGroupId };
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Orders</h1>
        <Link href="/orders/import" className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm hover:bg-neutral-100">
          Import orders
        </Link>
      </div>

      <table className="w-full text-sm">
        <thead className="border-b border-neutral-200 text-left text-xs uppercase text-neutral-500">
          <tr>
            <th className="px-2 py-2">Order</th>
            <th className="px-2 py-2">Lines</th>
            <th className="px-2 py-2">Status</th>
            <th className="px-2 py-2">Imported</th>
            <th className="px-2 py-2">Ship by</th>
            <th className="px-2 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ order: o, lineCount, late, fulfillmentGroupId }) => (
            <tr key={o.id} className="border-b border-neutral-100">
              <td className="px-2 py-2 font-medium">{o.externalOrderId}</td>
              <td className="px-2 py-2">{lineCount}</td>
              <td className="px-2 py-2">
                <StatusBadge status={o.status} />
                {late && o.status !== "FULFILLED" && o.status !== "CANCELLED" && (
                  <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-700">LATE</span>
                )}
              </td>
              <td className="px-2 py-2 text-neutral-500">{o.importedAt}</td>
              <td className="px-2 py-2 text-neutral-500">{o.shipBy ?? "—"}</td>
              <td className="px-2 py-2">
                <FulfillmentControls orderId={o.id} status={o.status} fulfillmentGroupId={fulfillmentGroupId} />
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-2 py-6 text-center text-neutral-400">
                No orders imported yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    PENDING: "bg-neutral-100 text-neutral-700",
    NEEDS_ATTENTION: "bg-amber-100 text-amber-800",
    READY_TO_PACK: "bg-blue-100 text-blue-800",
    FULFILLED: "bg-emerald-100 text-emerald-800",
    CANCELLED: "bg-neutral-200 text-neutral-500",
  };
  return <span className={`rounded px-2 py-0.5 text-xs font-semibold ${colors[status] ?? ""}`}>{status.replace("_", " ")}</span>;
}
