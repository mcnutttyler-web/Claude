"use client";

import { useState } from "react";
import type { BulkAssignFilter } from "@/lib/bulkAssign";
import { applyBulkAssignAction, previewBulkAssignAction } from "./actions";

interface LocationOption {
  id: number;
  code: string;
}

interface PreviewRow {
  itemId: number;
  name: string;
  setName: string;
  currentLocationCode: string;
}

export default function BulkAssignForm({ setNames, locations }: { setNames: string[]; locations: LocationOption[] }) {
  const [setName, setSetName] = useState("");
  const [status, setStatus] = useState("");
  const [nameFrom, setNameFrom] = useState("");
  const [nameTo, setNameTo] = useState("");
  const [currentLocationId, setCurrentLocationId] = useState<string>("");
  const [targetLocationId, setTargetLocationId] = useState<string>("");
  const [preview, setPreview] = useState<{ matchCount: number; sample: PreviewRow[] } | null>(null);
  const [result, setResult] = useState<{ updatedCount: number } | null>(null);
  const [busy, setBusy] = useState(false);

  function buildFilter(): BulkAssignFilter {
    return {
      setName: setName || undefined,
      status: status || undefined,
      nameFrom: nameFrom || undefined,
      nameTo: nameTo || undefined,
      currentLocationId: currentLocationId
        ? currentLocationId === "unassigned"
          ? "unassigned"
          : Number(currentLocationId)
        : undefined,
    };
  }

  async function onPreview() {
    setBusy(true);
    setResult(null);
    try {
      const p = await previewBulkAssignAction(buildFilter());
      setPreview(p as { matchCount: number; sample: PreviewRow[] });
    } finally {
      setBusy(false);
    }
  }

  async function onApply() {
    if (!targetLocationId) return;
    setBusy(true);
    try {
      const r = await applyBulkAssignAction(buildFilter(), Number(targetLocationId));
      setResult(r);
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 grid sm:grid-cols-2 gap-3 text-sm">
        <label>
          <div className="text-slate-600 mb-1">Set name</div>
          <select className="w-full border rounded px-2 py-1" value={setName} onChange={(e) => setSetName(e.target.value)}>
            <option value="">Any</option>
            {setNames.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          <div className="text-slate-600 mb-1">Status</div>
          <select className="w-full border rounded px-2 py-1" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="RESERVE">RESERVE</option>
            <option value="BULK">BULK</option>
            <option value="SOLD_OUT">SOLD_OUT</option>
            <option value="INACTIVE">INACTIVE</option>
          </select>
        </label>
        <label>
          <div className="text-slate-600 mb-1">Name from</div>
          <input className="w-full border rounded px-2 py-1" placeholder="A" value={nameFrom} onChange={(e) => setNameFrom(e.target.value)} />
        </label>
        <label>
          <div className="text-slate-600 mb-1">Name to</div>
          <input className="w-full border rounded px-2 py-1" placeholder="F" value={nameTo} onChange={(e) => setNameTo(e.target.value)} />
        </label>
        <label>
          <div className="text-slate-600 mb-1">Current location</div>
          <select
            className="w-full border rounded px-2 py-1"
            value={currentLocationId}
            onChange={(e) => setCurrentLocationId(e.target.value)}
          >
            <option value="">Any</option>
            <option value="unassigned">Unassigned</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code}
              </option>
            ))}
          </select>
        </label>
      </div>

      <button className="rounded border px-4 py-2 text-sm disabled:opacity-50" disabled={busy} onClick={onPreview}>
        Preview
      </button>

      {preview && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
          <p className="text-sm font-medium">{preview.matchCount} items match this filter.</p>
          <ul className="text-sm text-slate-600 list-disc list-inside">
            {preview.sample.map((r) => (
              <li key={r.itemId}>
                {r.name} · {r.setName} · currently {r.currentLocationCode}
              </li>
            ))}
          </ul>

          <div className="flex items-end gap-2">
            <label className="text-sm">
              <div className="text-slate-600 mb-1">Target location</div>
              <select
                className="border rounded px-2 py-1"
                value={targetLocationId}
                onChange={(e) => setTargetLocationId(e.target.value)}
              >
                <option value="">Choose…</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.code}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="rounded bg-slate-900 text-white px-4 py-1.5 text-sm disabled:opacity-50"
              disabled={busy || !targetLocationId || preview.matchCount === 0}
              onClick={onApply}
            >
              Apply to all {preview.matchCount} rows
            </button>
          </div>
        </div>
      )}

      {result && (
        <p className="text-sm text-green-700">
          Updated {result.updatedCount} rows in one grouped, reversible action.
        </p>
      )}
    </div>
  );
}
