import { CsvImportWizard } from "@/components/csv-import-wizard";
import { INVENTORY_FIELDS } from "@/lib/import/mapping";
import { startInventoryImportAction, previewInventoryImportAction, commitInventoryImportAction } from "@/lib/actions/inventory";

export default function InventoryImportPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Import inventory / pricing CSV</h1>
      <CsvImportWizard
        config={{
          kind: "INVENTORY",
          fields: INVENTORY_FIELDS,
          start: startInventoryImportAction,
          preview: previewInventoryImportAction,
          commit: commitInventoryImportAction,
          doneHref: "/inventory",
        }}
      />
    </div>
  );
}
