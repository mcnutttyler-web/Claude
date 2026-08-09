import Link from "next/link";
import { searchInventoryAction } from "@/lib/actions/inventory";
import { InventorySearch } from "@/components/inventory-search";

export default async function InventoryPage() {
  const initialRows = await searchInventoryAction("");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <div className="flex gap-2 text-sm">
          <Link href="/inventory/import" className="rounded-md border border-neutral-300 bg-white px-3 py-2 hover:bg-neutral-100">
            Import CSV
          </Link>
          <Link href="/inventory/export" className="rounded-md border border-neutral-300 bg-white px-3 py-2 hover:bg-neutral-100">
            Export CSV
          </Link>
        </div>
      </div>
      <InventorySearch initialRows={initialRows} />
    </div>
  );
}
