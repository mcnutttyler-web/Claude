import { getDistinctSetNames } from "@/lib/inventoryQueries";
import { getLocationCapacities } from "@/lib/locations";
import BulkAssignForm from "./BulkAssignForm";

export default function BulkAssignPage() {
  const setNames = getDistinctSetNames();
  const locations = getLocationCapacities().map((l) => ({ id: l.id, code: l.code }));

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-xl font-semibold">Bulk Location Assignment</h1>
      <p className="text-sm text-slate-500">
        Filter existing inventory by any combination below, preview the match, then apply a target location to
        all matching rows in one grouped, reversible action. This is the migration path for moving thousands of
        existing cards without touching them one at a time.
      </p>
      <BulkAssignForm setNames={setNames} locations={locations} />
    </div>
  );
}
