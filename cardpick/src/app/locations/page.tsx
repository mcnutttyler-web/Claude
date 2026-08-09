import Link from "next/link";
import { getLocationCapacities } from "@/lib/locations";
import LocationForm from "./LocationForm";

export default function LocationsPage() {
  const locations = getLocationCapacities();

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Locations</h1>
      <LocationForm />

      <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Kind</th>
              <th className="px-3 py-2">SKUs</th>
              <th className="px-3 py-2">Qty</th>
              <th className="px-3 py-2">Active</th>
            </tr>
          </thead>
          <tbody>
            {locations.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="px-3 py-2">
                  <Link className="underline" href={`/locations/${encodeURIComponent(l.code)}`}>
                    {l.code}
                  </Link>
                </td>
                <td className="px-3 py-2">{l.kind}</td>
                <td className="px-3 py-2">
                  {l.skuCount}
                  {l.maxSkus != null ? ` / ${l.maxSkus}` : ""}
                </td>
                <td className="px-3 py-2">
                  {l.totalQuantity}
                  {l.maxQuantity != null ? ` / ${l.maxQuantity}` : ""}
                </td>
                <td className="px-3 py-2">{l.active ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
