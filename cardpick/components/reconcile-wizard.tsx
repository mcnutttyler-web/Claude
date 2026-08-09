"use client";

import { useState } from "react";
import type { StartImportResult } from "@/lib/import/inventory-import";
import type { FieldMapping } from "@/lib/import/mapping";
import { RECONCILE_FIELDS } from "@/lib/import/mapping";
import type { ReconcileDiffRow, ReconcileDecision, ReconcileAction } from "@/lib/reconcile";
import { startReconcileImportAction, previewReconcileAction, applyReconcileAction } from "@/lib/actions/reconcile";

type Step =
  | { name: "upload" }
  | { name: "map"; started: StartImportResult }
  | { name: "diff"; started: StartImportResult; diff: ReconcileDiffRow[] }
  | { name: "done"; result: { changed: number; kept: number; skipped: number } };

export function ReconcileWizard() {
  const [step, setStep] = useState<Step>({ name: "upload" });
  const [decisions, setDecisions] = useState<Record<number, ReconcileAction>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const result = await startReconcileImportAction(fd);
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setStep({ name: "map", started: result });
  }

  async function handleMapSubmit(mapping: FieldMapping) {
    if (step.name !== "map") return;
    setBusy(true);
    const diff = await previewReconcileAction(step.started.batchId, mapping);
    setBusy(false);
    const initialDecisions: Record<number, ReconcileAction> = {};
    for (const row of diff) initialDecisions[row.importRowId] = "SKIP";
    setDecisions(initialDecisions);
    setStep({ name: "diff", started: step.started, diff });
  }

  async function handleApply() {
    if (step.name !== "diff") return;
    setBusy(true);
    const payload: ReconcileDecision[] = Object.entries(decisions).map(([importRowId, action]) => ({
      importRowId: Number(importRowId),
      action,
    }));
    const result = await applyReconcileAction(step.started.batchId, payload);
    setBusy(false);
    setStep({ name: "done", result });
  }

  if (step.name === "upload") {
    return (
      <div className="max-w-xl space-y-4">
        {error && <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        <form onSubmit={handleUpload} className="space-y-3">
          <input type="file" name="file" accept=".csv" required className="block text-sm" />
          <button disabled={busy} className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50">
            {busy ? "Uploading…" : "Upload fresh TCGplayer inventory export"}
          </button>
        </form>
      </div>
    );
  }

  if (step.name === "map") {
    return (
      <div className="max-w-2xl">
        <ReconcileMappingForm headers={step.started.headers} initial={step.started.suggestedMapping} busy={busy} onSubmit={handleMapSubmit} />
      </div>
    );
  }

  if (step.name === "diff") {
    return (
      <div className="space-y-3">
        <div className="flex gap-2 text-sm">
          <button
            onClick={() => setDecisions(Object.fromEntries(step.diff.map((r) => [r.importRowId, "ACCEPT_TCGPLAYER" as ReconcileAction])))}
            className="rounded border border-neutral-300 px-2 py-1 hover:bg-neutral-100"
          >
            Accept TCGplayer for all
          </button>
          <button
            onClick={() => setDecisions(Object.fromEntries(step.diff.map((r) => [r.importRowId, "ACCEPT_CARDPICK" as ReconcileAction])))}
            className="rounded border border-neutral-300 px-2 py-1 hover:bg-neutral-100"
          >
            Accept CardPick for all
          </button>
          <button
            onClick={() => setDecisions(Object.fromEntries(step.diff.map((r) => [r.importRowId, "SKIP" as ReconcileAction])))}
            className="rounded border border-neutral-300 px-2 py-1 hover:bg-neutral-100"
          >
            Skip all
          </button>
        </div>
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b bg-neutral-50 text-left text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-2 py-2">SKU</th>
                <th className="px-2 py-2">Card</th>
                <th className="px-2 py-2">CardPick Qty</th>
                <th className="px-2 py-2">TCGplayer Qty</th>
                <th className="px-2 py-2">Delta</th>
                <th className="px-2 py-2">Decision</th>
              </tr>
            </thead>
            <tbody>
              {step.diff.map((row) => (
                <tr key={row.importRowId} className="border-b border-neutral-100">
                  <td className="px-2 py-2 font-mono text-xs">{row.sku ?? "—"}</td>
                  <td className="px-2 py-2">
                    {row.cardName ?? "—"}
                    {row.matchStatus !== "MATCHED" && (
                      <span className="ml-1 rounded bg-amber-100 px-1 text-xs text-amber-800">{row.matchStatus}</span>
                    )}
                  </td>
                  <td className="px-2 py-2">{row.cardpickQty ?? "—"}</td>
                  <td className="px-2 py-2">{row.tcgplayerQty ?? "—"}</td>
                  <td className={`px-2 py-2 ${row.deltaQty ? "font-semibold text-amber-700" : ""}`}>{row.deltaQty ?? "—"}</td>
                  <td className="px-2 py-2">
                    {row.matchStatus === "MATCHED" ? (
                      <div className="flex gap-1 text-xs">
                        {(["ACCEPT_CARDPICK", "ACCEPT_TCGPLAYER", "SKIP"] as ReconcileAction[]).map((a) => (
                          <button
                            key={a}
                            onClick={() => setDecisions({ ...decisions, [row.importRowId]: a })}
                            className={`rounded border px-2 py-1 ${decisions[row.importRowId] === a ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 hover:bg-neutral-100"}`}
                          >
                            {a.replace("ACCEPT_", "")}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-neutral-400">no CardPick match</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button disabled={busy} onClick={handleApply} className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50">
          {busy ? "Applying…" : "Apply decisions"}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800">
      Reconciled: {step.result.changed} changed, {step.result.kept} kept as-is, {step.result.skipped} skipped.
    </div>
  );
}

function ReconcileMappingForm({
  headers,
  initial,
  busy,
  onSubmit,
}: {
  headers: string[];
  initial: FieldMapping;
  busy: boolean;
  onSubmit: (mapping: FieldMapping) => void;
}) {
  const [mapping, setMapping] = useState<FieldMapping>(initial);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(mapping);
      }}
      className="space-y-3"
    >
      <table className="w-full text-sm">
        <tbody>
          {RECONCILE_FIELDS.map((field) => (
            <tr key={field.key} className="border-b border-neutral-100">
              <td className="py-2 pr-4">
                {field.label}
                {field.required && <span className="text-red-500"> *</span>}
              </td>
              <td className="py-2">
                <select
                  value={mapping[field.key] ?? ""}
                  onChange={(e) => setMapping({ ...mapping, [field.key]: e.target.value || null })}
                  className="w-full rounded border border-neutral-300 px-2 py-1"
                >
                  <option value="">— not mapped —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button disabled={busy} className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50">
        {busy ? "Diffing…" : "Compute diff"}
      </button>
    </form>
  );
}
