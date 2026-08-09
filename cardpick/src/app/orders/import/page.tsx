"use client";

import { useState } from "react";
import { ORDER_IMPORT_FIELDS, type ColumnMap } from "@/lib/mapping";
import type { AnalyzeOrderImportResult, CommitOrderImportResult } from "@/lib/importOrders";
import { analyzeOrderImportAction, commitOrderImportAction } from "./actions";

export default function OrderImportPage() {
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [filename, setFilename] = useState("");
  const [analysis, setAnalysis] = useState<AnalyzeOrderImportResult | null>(null);
  const [columnMap, setColumnMap] = useState<ColumnMap>({});
  const [forceDuplicate, setForceDuplicate] = useState(false);
  const [result, setResult] = useState<CommitOrderImportResult | null>(null);
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
      const a = await analyzeOrderImportAction(text);
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
      const res = await commitOrderImportAction({ fileContent, filename, columnMap, force: forceDuplicate });
      if (!res.ok) {
        setError(res.duplicate ? 'This exact file was already imported. Check "Import anyway" to proceed.' : res.error ?? "Import failed.");
        return;
      }
      setResult(res.result);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-xl font-semibold">Import Orders CSV</h1>
      <p className="text-sm text-slate-500">
        TCGplayer order exports often don&apos;t include a SKU column — matching falls back to
        name/set/number/condition in that case.
      </p>

      {!analysis && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
          <input type="file" accept=".csv" onChange={(e) => e.target.files?.[0] && onFileSelected(e.target.files[0])} />
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
              <label className="flex items-center gap-2 mt-2">
                <input type="checkbox" checked={forceDuplicate} onChange={(e) => setForceDuplicate(e.target.checked)} />
                Import anyway
              </label>
            </div>
          )}

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="font-medium mb-3">Map columns</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {ORDER_IMPORT_FIELDS.map((f) => (
                <label key={f.key} className="text-sm">
                  <div className="text-slate-600 mb-1">
                    {f.label}
                    {f.required && <span className="text-red-500"> *</span>}
                  </div>
                  <select
                    className="w-full border rounded px-2 py-1"
                    value={columnMap[f.key] ?? ""}
                    onChange={(e) => setColumnMap((m) => ({ ...m, [f.key]: e.target.value || null }))}
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

          <button
            className="rounded bg-slate-900 text-white px-4 py-2 text-sm disabled:opacity-50"
            disabled={busy || (analysis.duplicateBatch != null && !forceDuplicate)}
            onClick={onCommit}
          >
            {busy ? "Importing…" : "Import"}
          </button>
        </div>
      )}

      {result && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm space-y-1">
          <p>
            <strong>{result.ordersCreated}</strong> orders created, <strong>{result.linesUpserted}</strong> lines
            written, <strong>{result.linesUnchanged}</strong> unchanged, <strong>{result.ambiguousCount}</strong>{" "}
            ambiguous, <strong>{result.unmatchedCount}</strong> unmatched.
          </p>
          <a className="underline" href="/orders">
            Go to orders
          </a>
        </div>
      )}
    </div>
  );
}
