"use client";

import { useState } from "react";
import { INVENTORY_IMPORT_FIELDS, type ColumnMap } from "@/lib/mapping";
import type { ReconcileRow } from "@/lib/reconcile";
import { analyzeReconcileAction, applyReconcileAction } from "./actions";

const RECONCILE_FIELD_KEYS = ["tcgplayerSkuId", "name", "setName", "cardNumber", "conditionRaw", "quantity"];
const RECONCILE_FIELDS = INVENTORY_IMPORT_FIELDS.filter((f) => RECONCILE_FIELD_KEYS.includes(f.key));

export default function ReconcilePage() {
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMap, setColumnMap] = useState<ColumnMap>({});
  const [rows, setRows] = useState<ReconcileRow[] | null>(null);
  const [decisions, setDecisions] = useState<Record<number, "CARDPICK" | "TCGPLAYER" | "SKIP">>({});
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState<number | null>(null);

  async function onFileSelected(file: File) {
    const text = await file.text();
    setFileContent(text);
    setApplied(null);
    setRows(null);
    // Parse headers client-side quickly for the mapping UI.
    const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
    setHeaders(firstLine.split(",").map((h) => h.trim()));
  }

  async function onAnalyze() {
    if (!fileContent) return;
    setBusy(true);
    try {
      const result = await analyzeReconcileAction(fileContent, columnMap);
      setRows(result);
      setDecisions({});
    } finally {
      setBusy(false);
    }
  }

  function setDecision(rowIndex: number, decision: "CARDPICK" | "TCGPLAYER" | "SKIP") {
    setDecisions((d) => ({ ...d, [rowIndex]: decision }));
  }

  async function onApply() {
    if (!rows) return;
    setBusy(true);
    try {
      const acceptances = rows
        .filter((r) => r.inventoryItemId != null && decisions[r.rowIndex] && decisions[r.rowIndex] !== "SKIP")
        .map((r) => ({
          inventoryItemId: r.inventoryItemId!,
          cardPickQty: r.cardPickQty ?? 0,
          tcgplayerQty: r.tcgplayerQty,
          accept: decisions[r.rowIndex] as "CARDPICK" | "TCGPLAYER",
        }));
      const result = await applyReconcileAction(acceptances);
      setApplied(result.applied);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="text-xl font-semibold">Reconcile Quantities</h1>
      <p className="text-sm text-slate-500">
        Upload a fresh TCGplayer inventory export to compare quantities. Nothing changes until you accept a side
        for each row (or in bulk).
      </p>

      {!rows && (
        <div className="space-y-4">
          <input type="file" accept=".csv" onChange={(e) => e.target.files?.[0] && onFileSelected(e.target.files[0])} />
          {headers.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="font-medium mb-3">Map columns</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {RECONCILE_FIELDS.map((f) => (
                  <label key={f.key} className="text-sm">
                    <div className="text-slate-600 mb-1">{f.label}</div>
                    <select
                      className="w-full border rounded px-2 py-1"
                      value={columnMap[f.key] ?? ""}
                      onChange={(e) => setColumnMap((m) => ({ ...m, [f.key]: e.target.value || null }))}
                    >
                      <option value="">— none —</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <button className="mt-3 rounded bg-slate-900 text-white px-4 py-2 text-sm disabled:opacity-50" disabled={busy} onClick={onAnalyze}>
                Compare
              </button>
            </div>
          )}
        </div>
      )}

      {rows && (
        <div className="space-y-4">
          <div className="flex gap-2 text-sm">
            <button
              className="rounded border px-3 py-1.5"
              onClick={() => {
                const d: Record<number, "CARDPICK" | "TCGPLAYER"> = {};
                rows.filter((r) => r.delta !== 0).forEach((r) => (d[r.rowIndex] = "TCGPLAYER"));
                setDecisions(d);
              }}
            >
              Accept TCGplayer for all deltas
            </button>
            <button
              className="rounded border px-3 py-1.5"
              onClick={() => {
                const d: Record<number, "CARDPICK" | "TCGPLAYER"> = {};
                rows.filter((r) => r.delta !== 0).forEach((r) => (d[r.rowIndex] = "CARDPICK"));
                setDecisions(d);
              }}
            >
              Keep CardPick for all
            </button>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-3 py-2">Card</th>
                  <th className="px-3 py-2">CardPick Qty</th>
                  <th className="px-3 py-2">TCGplayer Qty</th>
                  <th className="px-3 py-2">Delta</th>
                  <th className="px-3 py-2">Decision</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.rowIndex} className={`border-t ${r.delta !== 0 ? "bg-amber-50" : ""}`}>
                    <td className="px-3 py-2">
                      {r.name}
                      {r.matchStatus !== "MATCHED" && <span className="text-red-600 text-xs block">{r.matchStatus}</span>}
                    </td>
                    <td className="px-3 py-2">{r.cardPickQty ?? "—"}</td>
                    <td className="px-3 py-2">{r.tcgplayerQty}</td>
                    <td className="px-3 py-2">{r.delta}</td>
                    <td className="px-3 py-2">
                      {r.matchStatus === "MATCHED" && r.delta !== 0 ? (
                        <div className="flex gap-1">
                          <button
                            className={`rounded border px-2 py-1 text-xs ${decisions[r.rowIndex] === "CARDPICK" ? "bg-slate-900 text-white" : ""}`}
                            onClick={() => setDecision(r.rowIndex, "CARDPICK")}
                          >
                            Accept CardPick
                          </button>
                          <button
                            className={`rounded border px-2 py-1 text-xs ${decisions[r.rowIndex] === "TCGPLAYER" ? "bg-slate-900 text-white" : ""}`}
                            onClick={() => setDecision(r.rowIndex, "TCGPLAYER")}
                          >
                            Accept TCGplayer
                          </button>
                          <button
                            className={`rounded border px-2 py-1 text-xs ${decisions[r.rowIndex] === "SKIP" ? "bg-slate-900 text-white" : ""}`}
                            onClick={() => setDecision(r.rowIndex, "SKIP")}
                          >
                            Skip
                          </button>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button className="rounded bg-green-700 text-white px-4 py-2 text-sm disabled:opacity-50" disabled={busy} onClick={onApply}>
            Apply accepted changes
          </button>

          {applied != null && <p className="text-sm text-green-700">Applied {applied} changes.</p>}
        </div>
      )}
    </div>
  );
}
