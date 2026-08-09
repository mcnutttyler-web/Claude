import Link from "next/link";
import { getDashboardStats } from "@/lib/dashboard";

function StatTile({ label, value, href, tone }: { label: string; value: string | number; href?: string; tone?: "warn" | "default" }) {
  const content = (
    <div
      className={`rounded-lg border p-4 ${
        tone === "warn" ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"
      }`}
    >
      <div className="text-sm text-slate-500">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

export default function DashboardPage() {
  const stats = getDashboardStats();

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatTile
          label="Oldest Unpicked Order"
          value={stats.oldestUnpicked ? stats.oldestUnpicked.ageLabel : "—"}
          href="/orders"
          tone={stats.oldestUnpicked ? "warn" : "default"}
        />
        <StatTile label="Orders Needing Attention" value={stats.ordersNeedsAttention} href="/orders" tone={stats.ordersNeedsAttention > 0 ? "warn" : "default"} />
        <StatTile label="Ready to Pack" value={stats.ordersReadyToPack} href="/orders" />
        <StatTile label="Active Items" value={stats.activeItemCount} href="/inventory" />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="font-medium mb-2">Get started</h2>
          <ul className="text-sm space-y-1 list-disc list-inside text-slate-600">
            <li>
              <Link className="underline" href="/import">Import a TCGplayer inventory CSV</Link>
            </li>
            <li>
              <Link className="underline" href="/bulk-assign">Bulk-assign cards to locations</Link>
            </li>
            <li>
              <Link className="underline" href="/orders">Import orders and start picking</Link>
            </li>
            <li>
              <Link className="underline" href="/reconcile">Reconcile quantity drift</Link>
            </li>
          </ul>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="font-medium mb-2">Scanning</h2>
          <p className="text-sm text-slate-600">
            Scan any CardPick location label from anywhere in the app to jump to that location.
            A $20-30 USB/Bluetooth QR scanner works with zero setup — see{" "}
            <Link className="underline" href="/labels">Labels</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}
