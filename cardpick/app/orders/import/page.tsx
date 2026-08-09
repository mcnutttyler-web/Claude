import { CsvImportWizard } from "@/components/csv-import-wizard";
import { ORDER_FIELDS } from "@/lib/import/mapping";
import { startOrderImportAction, previewOrderImportAction, commitOrderImportAction } from "@/lib/actions/orders";

export default function OrderImportPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Import orders CSV</h1>
      <p className="text-sm text-neutral-500">
        TCGplayer order exports often omit SKU IDs — matching falls back to product name, set, condition, and card number.
      </p>
      <CsvImportWizard
        config={{
          kind: "ORDER",
          fields: ORDER_FIELDS,
          start: startOrderImportAction,
          preview: previewOrderImportAction,
          commit: commitOrderImportAction,
          doneHref: "/orders",
        }}
      />
    </div>
  );
}
