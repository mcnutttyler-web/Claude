import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { location } from "@/lib/db/schema";
import { ScanWizard } from "@/components/scan-wizard";

export default async function ScanPage() {
  const locations = db.select({ id: location.id, code: location.code }).from(location).where(eq(location.active, true)).all();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Scan a card</h1>
        <p className="text-sm text-neutral-500">
          Photograph a physical card to identify it and add it to inventory. This doesn&apos;t post to TCGplayer directly — for a
          brand-new listing TCGplayer still requires creating the SKU once through their own seller tools; for cards you&apos;ve
          already listed, the price/quantity export on the Inventory page picks up the updated price automatically.
        </p>
      </div>
      <ScanWizard locations={locations} />
    </div>
  );
}
