import { getLocationCapacities } from "@/lib/locations";
import { locationQrDataUrl } from "@/lib/qr";
import PrintButton from "./PrintButton";

const LABELS_PER_PAGE = 30; // Avery 5160: 3 columns x 10 rows

export default async function LabelsPage() {
  const locations = getLocationCapacities().filter((l) => l.active);
  const labels = await Promise.all(
    locations.map(async (l) => ({ code: l.code, dataUrl: await locationQrDataUrl(l.code) })),
  );

  const pages: (typeof labels)[] = [];
  for (let i = 0; i < labels.length; i += LABELS_PER_PAGE) {
    pages.push(labels.slice(i, i + LABELS_PER_PAGE));
  }
  if (pages.length === 0) pages.push([]);

  return (
    <div>
      <div className="mb-4 print:hidden flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Location Labels</h1>
          <p className="text-sm text-slate-500">
            Avery 5160 (30 labels/sheet, 2⅝&quot; × 1&quot;). Print at 100% scale, no "fit to page".
          </p>
        </div>
        <PrintButton />
      </div>

      {pages.map((page, pageIndex) => (
        <div key={pageIndex} className="avery-5160-page">
          {page.map((label) => (
            <div key={label.code} className="avery-5160-label">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={label.dataUrl} alt={label.code} width={72} height={72} />
              <span className="label-code">{label.code}</span>
            </div>
          ))}
          {Array.from({ length: LABELS_PER_PAGE - page.length }).map((_, i) => (
            <div key={`empty-${i}`} className="avery-5160-label avery-5160-label-empty" />
          ))}
        </div>
      ))}

      <style>{`
        .avery-5160-page {
          width: 8.5in;
          padding: 0.5in 0.1875in;
          display: grid;
          grid-template-columns: repeat(3, 2.625in);
          grid-auto-rows: 1in;
          column-gap: 0.125in;
          row-gap: 0;
          box-sizing: border-box;
          page-break-after: always;
        }
        .avery-5160-label {
          display: flex;
          align-items: center;
          gap: 0.1in;
          padding: 0.05in 0.15in;
          box-sizing: border-box;
          overflow: hidden;
        }
        .avery-5160-label img {
          width: 0.9in;
          height: 0.9in;
          flex-shrink: 0;
        }
        .label-code {
          font-family: monospace;
          font-size: 14pt;
          font-weight: 600;
        }
        @media screen {
          .avery-5160-page {
            border: 1px dashed #ccc;
            margin-bottom: 1rem;
          }
          .avery-5160-label {
            border: 1px dotted #ddd;
          }
        }
        @media print {
          .avery-5160-page {
            margin: 0;
          }
        }
      `}</style>
    </div>
  );
}
