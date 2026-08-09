import { getAppSettingsAction } from "./actions";
import ExportPanel from "./ExportPanel";

export default async function ExportPage() {
  const settings = await getAppSettingsAction();
  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-xl font-semibold">Export to TCGplayer</h1>
      <ExportPanel initialIncludeQuantity={settings.exportIncludeQuantity} initialMode={settings.exportQuantityMode} />
    </div>
  );
}
