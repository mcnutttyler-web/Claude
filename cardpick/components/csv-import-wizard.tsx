"use client";

import { useState } from "react";
import type { StartImportResult, PreviewResult } from "@/lib/import/inventory-import";
import type { FieldDef, FieldMapping } from "@/lib/import/mapping";

export interface ImportWizardConfig {
  kind: "INVENTORY" | "ORDER";
  fields: FieldDef[];
  start: (formData: FormData) => Promise<StartImportResult | { error: string }>;
  preview: (batchId: number, mapping: FieldMapping) => Promise<PreviewResult>;
  commit: (batchId: number) => Promise<Record<string, number>>;
  doneHref: string;
}

type Step =
  | { name: "upload" }
  | { name: "map"; started: StartImportResult }
  | { name: "preview"; started: StartImportResult; preview: PreviewResult; mapping: FieldMapping }
  | { name: "done"; result: Record<string, number> };

export function CsvImportWizard({ config }: { config: ImportWizardConfig }) {
  const [step, setStep] = useState<Step>({ name: "upload" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const result = await config.start(fd);
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setStep({ name: "map", started: result });
  }

  async function handleMappingSubmit(mapping: FieldMapping) {
    if (step.name !== "map") return;
    setBusy(true);
    setError(null);
    const preview = await config.preview(step.started.batchId, mapping);
    setBusy(false);
    if (preview.errors.length > 0) {
      setError(preview.errors.join(" "));
      return;
    }
    setStep({ name: "preview", started: step.started, preview, mapping });
  }

  async function handleCommit() {
    if (step.name !== "preview") return;
    setBusy(true);
    const result = await config.commit(step.started.batchId);
    setBusy(false);
    setStep({ name: "done", result });
  }

  return (
    <div className="max-w-3xl space-y-4">
      {error && <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {step.name === "upload" && (
        <form onSubmit={handleUpload} className="space-y-3">
          <input type="file" name="file" accept=".csv" required className="block text-sm" />
          <button disabled={busy} className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50">
            {busy ? "Uploading…" : "Upload"}
          </button>
        </form>
      )}

      {step.name === "map" && (
        <>
          {step.started.duplicateOfBatchId != null && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              A file with this exact content was already imported (batch #{step.started.duplicateOfBatchId}). Continuing will still
              process it — matched rows will simply update in place.
            </div>
          )}
          {step.started.savedProfileId != null && (
            <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
              Recognized this file&apos;s column layout and auto-applied your saved mapping. Review and confirm below.
            </div>
          )}
          <MappingForm
            fields={config.fields}
            headers={step.started.headers}
            initial={step.started.suggestedMapping}
            busy={busy}
            onSubmit={handleMappingSubmit}
          />
        </>
      )}

      {step.name === "preview" && (
        <PreviewPanel started={step.started} preview={step.preview} busy={busy} onCommit={handleCommit} />
      )}

      {step.name === "done" && (
        <div className="space-y-3">
          <div className="rounded-md border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800">
            <div className="font-semibold">Import complete</div>
            <ul className="mt-1 list-inside list-disc">
              {Object.entries(step.result).map(([k, v]) => (
                <li key={k}>
                  {k}: {v}
                </li>
              ))}
            </ul>
          </div>
          <a href={config.doneHref} className="inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm text-white">
            Done
          </a>
        </div>
      )}
    </div>
  );
}

function MappingForm({
  fields,
  headers,
  initial,
  busy,
  onSubmit,
}: {
  fields: FieldDef[];
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
      <p className="text-sm text-neutral-500">
        Map each field to a column from your file. Nothing is written to inventory until you review the preview and commit.
      </p>
      <table className="w-full text-sm">
        <tbody>
          {fields.map((field) => (
            <tr key={field.key} className="border-b border-neutral-100">
              <td className="py-2 pr-4 align-top">
                {field.label}
                {field.required && <span className="text-red-500"> *</span>}
              </td>
              <td className="py-2">
                <select
                  value={mapping[field.key] ?? ""}
                  onChange={(e) => setMapping({ ...mapping, [field.key]: e.target.value || null })}
                  className="w-full rounded-md border border-neutral-300 px-2 py-1"
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
        {busy ? "Matching…" : "Preview"}
      </button>
    </form>
  );
}

function PreviewPanel({
  started,
  preview,
  busy,
  onCommit,
}: {
  started: StartImportResult;
  preview: PreviewResult;
  busy: boolean;
  onCommit: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex gap-4 text-sm">
        <CountPill label="New" value={preview.counts.new} tone="new" />
        <CountPill label="Matched" value={preview.counts.matched} tone="matched" />
        <CountPill label="Ambiguous" value={preview.counts.ambiguous} tone="ambiguous" />
        <span className="text-neutral-400">of {preview.total} rows total</span>
      </div>
      {preview.counts.ambiguous > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          {preview.counts.ambiguous} row(s) matched more than one existing item and will be skipped — resolve them manually after
          import.
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-xs">
          <thead className="border-b bg-neutral-50 text-left uppercase text-neutral-500">
            <tr>
              <th className="px-2 py-1">Row</th>
              <th className="px-2 py-1">Status</th>
              <th className="px-2 py-1">Name</th>
              <th className="px-2 py-1">Match key</th>
            </tr>
          </thead>
          <tbody>
            {preview.sample.map((r) => (
              <tr key={r.rowIndex} className="border-b border-neutral-100">
                <td className="px-2 py-1">{r.rowIndex + 1}</td>
                <td className="px-2 py-1">{r.matchStatus}</td>
                <td className="px-2 py-1">{String(r.mapped.name ?? "")}</td>
                <td className="px-2 py-1 font-mono">{r.matchKey}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={onCommit} disabled={busy} className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50">
        {busy ? "Committing…" : `Commit ${preview.total} rows`}
      </button>
      <p className="text-xs text-neutral-400">Batch #{started.batchId} · a database snapshot is taken automatically before committing.</p>
    </div>
  );
}

function CountPill({ label, value, tone }: { label: string; value: number; tone: "new" | "matched" | "ambiguous" }) {
  const colors = {
    new: "bg-blue-100 text-blue-800",
    matched: "bg-emerald-100 text-emerald-800",
    ambiguous: "bg-amber-100 text-amber-800",
  } as const;
  return (
    <span className={`rounded-full px-2.5 py-1 font-medium ${colors[tone]}`}>
      {label}: {value}
    </span>
  );
}
