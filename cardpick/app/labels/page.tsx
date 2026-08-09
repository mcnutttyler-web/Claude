import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { location } from "@/lib/db/schema";
import { locationQrSvg } from "@/lib/qr";
import { PrintButton } from "@/components/print-button";

const LABELS_PER_SHEET = 30;

export default async function LabelsPage() {
  const locations = db.select().from(location).where(eq(location.active, true)).orderBy(location.code).all();
  const withQr = await Promise.all(locations.map(async (l) => ({ code: l.code, svg: await locationQrSvg(l.code) })));

  const padded = [...withQr];
  while (padded.length % LABELS_PER_SHEET !== 0) padded.push({ code: "", svg: "" });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-semibold">QR location labels</h1>
          <p className="text-sm text-neutral-500">Avery 5160 (30 labels/sheet, 2⅝&quot; × 1&quot;). Use your browser&apos;s print dialog.</p>
        </div>
        <PrintButton />
      </div>

      <div className="label-sheet">
        {padded.map((l, idx) => (
          <div key={idx} className="label-cell">
            {l.code && (
              <>
                <div className="label-qr" dangerouslySetInnerHTML={{ __html: l.svg }} />
                <div className="label-code">{l.code}</div>
              </>
            )}
          </div>
        ))}
      </div>

      <style>{`
        .label-sheet {
          display: grid;
          grid-template-columns: repeat(3, 2.625in);
          grid-auto-rows: 1in;
          column-gap: 0.125in;
          row-gap: 0in;
          margin: 0.5in 0.1875in;
        }
        .label-cell {
          display: flex;
          align-items: center;
          gap: 0.1in;
          overflow: hidden;
          padding: 0.05in;
        }
        .label-qr svg { width: 0.85in; height: 0.85in; }
        .label-code { font-family: monospace; font-size: 14pt; font-weight: 700; }
        @media print {
          nav, .print\\:hidden { display: none !important; }
          @page { size: letter; margin: 0; }
          body { margin: 0; }
        }
      `}</style>
    </div>
  );
}
