import { exportInventoryRoundTripCsv } from "@/lib/export";

export async function GET() {
  const csv = exportInventoryRoundTripCsv();
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="cardpick-inventory-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
