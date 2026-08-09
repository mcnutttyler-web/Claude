"use client";

import { useState } from "react";
import { INVENTORY_IMPORT_FIELDS, type ColumnMap } from "@/lib/mapping";
import {
  analyzeInventoryImportAction,
  commitInventoryImportAction,
  getCandidateSummariesAction,
  resolveAmbiguousInventoryRowAction,
} from "./actions";
import type { AnalyzeInventoryImportResult, CommitInventoryImportResult } from "@/lib/importInventory";

type CandidateSummary = Awaited<ReturnType<typeof getCandidateSummariesAction>>[number];

export default function ImportPage() {
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [filename, setFilename] = useState<string>("");
  const [analysis, setAnalysis] = useState<AnalyzeInventoryImportResult | null>(null);
  const [columnMap, setColumnMap] = useState<ColumnMap>({});
  const [forceDuplicate, setForceDuplicate] = useState(false);
  const [result, setResult] = useState<CommitInventoryImportResult | null>(null);
  const [candidates, setCandidates] = useState<Record<number, CandidateSummary[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFileSelected(file: File) {
    setError(null);
    setResult(null);
    const text = await file.text();
    setFileContent(text);
    setFilename(file.name);
    setBusy(true);
    try {
      const a = await analyzeInventoryImportAction(text);
      setAnalysis(a);
      setColumnMap(a.existingMapping ?? {});
      setForceDuplicate(false);
    } finally {
      setBusy(false);
    }
  }

  async function onCommit() {
    if (!fileContent) return;
    setBusy(true);
    setError(null);
    try {
      const res = await commitInventoryImportAction({
        fileContent,
        filename,
        columnMap,
        force: forceDuplicate,
      });
      if (!res.ok) {
        if (res.duplicate) {
          setError('This exact file was already imported. Check "Import anyway" to proceed.');
        } else {
          setError(res.error ?? "Import failed.");
        }
        return;
      }
      setResult(res.result);
      const ambiguousRows = res.result.warnings.filter(
        (w) => (w as { type?: string }).type === "AMBIGUOUS",
      ) as Array<{ candidateIds: number[] }>;
      const allIds = Array.from(new Set(ambiguousRows.flatMap((r) => r.candidateIds)));
      if (allIds.length) {
        const summaries = await getCandidateSummariesAction(allIds);
        const byId = new Map(summaries.map((s) => [s.id, s]));
        const grouped: Record<number, CandidateSummary[]> = {};
        res.result.warnings.forEach((w, idx) => {
          const warn = w as { type?: string; candidateIds?: number[] };
          if (warn.type === "AMBIGUOUS" && warn.candidateIds) {
            grouped[idx] = warn.candidateIds.map((id) => byId.get(id)).filter(Boolean) as CandidateSummary[];
          }
        });
        setCandidates(grouped);
      }
    } finally {
      setBusy(false);
    }
  }

  async function onResolve(rowIndex: number, choice: { type: "existing"; itemId: number } | { type: "new" }) {
    if (!result) return;
    setBusy(true);
    try {
      await resolveAmbiguousInventoryRowAction(result.importBatchId, rowIndex, choice);
      setResult({
        ...result,
        warnings: result.warnings.map((w, idx) =>
          idx === rowIndex ? { ...w, resolved: true } : w,
        ),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-xl font-semibold">Import Inventory CSV</h1>

      {!analysis && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
          <input
            type="file"
            accept=".csv"
            onChange={(e) => e.target.files?.[0] && onFileSelected(e.target.files[0])}
          />
          <p className="text-sm text-slate-500 mt-2">Select a TCGplayer inventory/price export CSV.</p>
        </div>
      )}

      {analysis && !result && (
        <div className="space-y-4">
          <div className="text-sm text-slate-600">
            {filename} — {analysis.rowCount} rows detected.
          </div>

          {analysis.duplicateBatch && (
            <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
              <p className="font-medium">This exact file was already imported</p>
              <p>
                Batch #{analysis.duplicateBatch.id} ({analysis.duplicateBatch.filename}) on{" "}
                {new Date(analysis.duplicateBatch.createdAt).toLocaleString()}.
              </p>
              <label className="flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  checked={forceDuplicate}
                  onChange={(e) => setForceDuplicate(e.target.checked)}
                />
                Import anyway
              </label>
            </div>
          )}

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="font-medium mb-3">
              Map columns {analysis.existingMapping ? "(auto-filled from a saved profile)" : ""}
            </h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {INVENTORY_IMPORT_FIELDS.map((f) => (
                <label key={f.key} className="text-sm">
                  <div className="text-slate-600 mb-1">
                    {f.label}
                    {f.required && <span className="text-red-500"> *</span>}
                  </div>
                  <select
                    className="w-full border rounded px-2 py-1"
                    value={columnMap[f.key] ?? ""}
                    onChange={(e) =>
                      setColumnMap((m) => ({ ...m, [f.key]: e.target.value || null }))
                    }
                  >
                    <option value="">— none —</option>
                    {analysis.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2">
            <button
              className="rounded bg-slate-900 text-white px-4 py-2 text-sm disabled:opacity-50"
              disabled={busy || (analysis.duplicateBatch != null && !forceDuplicate)}
              onClick={onCommit}
            >
              {busy ? "Importing…" : "Import"}
            </button>
            <button
              className="rounded border px-4 py-2 text-sm"
              onClick={() => {
                setAnalysis(null);
                setFileContent(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm space-y-1">
            <p>
              <strong>{result.created}</strong> created, <strong>{result.updated}</strong> price-updated,{" "}
              <strong>{result.unchanged}</strong> unchanged, <strong>{result.ambiguousCount}</strong> ambiguous,{" "}
              <strong>{result.skipped}</strong> skipped, of {result.totalRows} rows.
            </p>
          </div>

          {result.warnings.filter((w) => (w as { type?: string }).type === "AMBIGUOUS").length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
              <h2 className="font-medium mb-2">Ambiguous rows need manual resolution</h2>
              <p className="text-sm text-slate-600 mb-3">
                These rows matched more than one existing item and were never auto-resolved.
              </p>
              <div className="space-y-3">
                {result.warnings.map((w, idx) => {
                  const warn = w as {
                    type?: string;
                    resolved?: boolean;
                    parsed?: { name: string; setName: string; condition: string; printing: string };
                    candidateIds?: number[];
                  };
                  if (warn.type !== "AMBIGUOUS") return null;
                  return (
                    <div key={idx} className="border rounded bg-white p-3 text-sm">
                      <p className="font-medium">
                        {warn.parsed?.name} — {warn.parsed?.setName} ({warn.parsed?.condition}{" "}
                        {warn.parsed?.printing})
                      </p>
                      {warn.resolved ? (
                        <p className="text-green-700 mt-1">Resolved.</p>
                      ) : (
                        <div className="mt-2 space-y-1">
                          {(candidates[idx] ?? []).map((c) => (
                            <button
                              key={c.id}
                              className="block w-full text-left border rounded px-2 py-1 hover:bg-slate-50"
                              disabled={busy}
                              onClick={() => onResolve(idx, { type: "existing", itemId: c.id })}
                            >
                              Update existing: {c.name} · {c.setName} · {c.condition} {c.printing} (#{c.id})
                            </button>
                          ))}
                          <button
                            className="block w-full text-left border rounded px-2 py-1 hover:bg-slate-50"
                            disabled={busy}
                            onClick={() => onResolve(idx, { type: "new" })}
                          >
                            Create as a new item instead
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <button
            className="rounded border px-4 py-2 text-sm"
            onClick={() => {
              setAnalysis(null);
              setResult(null);
              setFileContent(null);
              setCandidates({});
            }}
          >
            Import another file
          </button>
        </div>
      )}
    </div>
  );
}
