import { ReconcileWizard } from "@/components/reconcile-wizard";

export default function ReconcilePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Reconcile quantities</h1>
      <p className="text-sm text-neutral-500">
        Upload a fresh TCGplayer inventory export to compare quantities. Nothing changes until you approve rows, per-row or in bulk.
      </p>
      <ReconcileWizard />
    </div>
  );
}
