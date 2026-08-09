import Link from "next/link";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { inventoryItem, order, orderLine } from "@/lib/db/schema";
import { oldestUnpickedOrderAgeMs, formatDuration } from "@/lib/pick";
import { centsToDollarsString } from "@/lib/money";

export default async function DashboardPage() {
  const activeCount = db.select({ c: sql<number>`count(*)` }).from(inventoryItem).where(eq(inventoryItem.status, "ACTIVE")).get()!.c;
  const pendingOrders = db.select({ c: sql<number>`count(*)` }).from(order).where(inArray(order.status, ["PENDING", "NEEDS_ATTENTION"])).get()!.c;
  const needsAttention = db.select({ c: sql<number>`count(*)` }).from(order).where(eq(order.status, "NEEDS_ATTENTION")).get()!.c;
  const readyToPack = db.select({ c: sql<number>`count(*)` }).from(order).where(eq(order.status, "READY_TO_PACK")).get()!.c;
  const shortLines = db.select({ c: sql<number>`count(*)` }).from(orderLine).where(eq(orderLine.pickState, "SHORT")).get()!.c;
  const totalMarketValueCents = db.select({ v: sql<number>`coalesce(sum(${inventoryItem.marketPriceCents}), 0)` }).from(inventoryItem).where(eq(inventoryItem.status, "ACTIVE")).get()!.v;

  const oldestAgeMs = oldestUnpickedOrderAgeMs();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <Stat label="Active SKUs" value={activeCount.toLocaleString()} />
        <Stat label="Est. market value" value={centsToDollarsString(totalMarketValueCents)} />
        <Stat label="Orders in progress" value={pendingOrders.toLocaleString()} />
        <Stat label="Ready to pack" value={readyToPack.toLocaleString()} />
        <Stat label="Needs attention" value={needsAttention.toLocaleString()} tone={needsAttention > 0 ? "warn" : "default"} />
        <Stat label="Short picks" value={shortLines.toLocaleString()} tone={shortLines > 0 ? "warn" : "default"} />
        <Stat
          label="Oldest unpicked order"
          value={oldestAgeMs != null ? formatDuration(oldestAgeMs) : "—"}
          tone={oldestAgeMs != null && oldestAgeMs > 24 * 60 * 60 * 1000 ? "warn" : "default"}
        />
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <QuickLink href="/inventory/import" label="Import inventory CSV" />
        <QuickLink href="/orders/import" label="Import orders CSV" />
        <QuickLink href="/pick" label="Go to pick list" />
        <QuickLink href="/reconcile" label="Reconcile quantities" />
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warn" }) {
  return (
    <div className={`rounded-lg border p-4 ${tone === "warn" ? "border-amber-300 bg-amber-50" : "border-neutral-200 bg-white"}`}>
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="rounded-md border border-neutral-300 bg-white px-3 py-2 hover:bg-neutral-100">
      {label}
    </Link>
  );
}
