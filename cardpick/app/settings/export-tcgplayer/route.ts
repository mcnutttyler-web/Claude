import { exportTcgplayerUploadCsv } from "@/lib/export";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const includeQuantity = url.searchParams.get("includeQuantity") === "true";
  const csv = exportTcgplayerUploadCsv({ includeQuantity });
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="tcgplayer-upload-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
