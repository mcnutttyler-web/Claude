"use client";

import { useState, useTransition } from "react";
import { previewBulkAssignAction, applyBulkAssignAction } from "@/lib/actions/locations";
import type { BulkAssignFilter, BulkAssignPreview } from "@/lib/bulk-assign";

export function BulkAssignForm({ locations }: { locations: { id: number; code: string; kind: string }[] }) {
  const [setName, setSetName] = useState("");
  const [status, setStatus] = useState("");
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [currentLocationId, setCurrentLocationId] = useState("");
  const [targetLocationId, setTargetLocationId] = useState("");
  const [preview, setPreview] = useState<BulkAssignPreview | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function buildFilter(): BulkAssignFilter {
    const filter: BulkAssignFilter = {};
    if (setName) filter.setName = setName;
    if (status) filter.status = status;
    if (rangeFrom && rangeTo) filter.nameRange = { from: rangeFrom, to: rangeTo };
    if (currentLocationId === "UNASSIGNED") filter.currentLocationId = "UNASSIGNED";
    else if (currentLocationId) filter.currentLocationId = Number(currentLocationId);
    return filter;
  }

  return (
    <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
      <h2 className="font-semibold">Bulk-assign by rule</h2>
      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <input placeholder="Set name" value={setName} onChange={(e) => setSetName(e.target.value)} className="rounded border border-neutral-300 px-2 py-1" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded border border-neutral-300 px-2 py-1">
          <option value="">Any status</option>
          {["ACTIVE", "RESERVE", "BULK", "SOLD_OUT", "INACTIVE"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <input placeholder="Name A" maxLength={1} value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} className="rounded border border-neutral-300 px-2 py-1" />
        <input placeholder="Name Z" maxLength={1} value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} className="rounded border border-neutral-300 px-2 py-1" />
        <select value={currentLocationId} onChange={(e) => setCurrentLocationId(e.target.value)} className="rounded border border-neutral-300 px-2 py-1 sm:col-span-2">
          <option value="">Any current location</option>
          <option value="UNASSIGNED">Unassigned</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>{l.code}</option>
          ))}
        </select>
        <select value={targetLocationId} onChange={(e) => setTargetLocationId(e.target.value)} className="rounded border border-neutral-300 px-2 py-1 sm:col-span-2">
          <option value="">Target location…</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>{l.code}</option>
          ))}
        </select>
      </div>

      <div className="flex gap-2">
        <button
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              setResult(null);
              const p = await previewBulkAssignAction(buildFilter());
              setPreview(p);
            })
          }
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-100 disabled:opacity-50"
        >
          Preview
        </button>
        <button
          disabled={isPending || !preview || !targetLocationId}
          onClick={() =>
            startTransition(async () => {
              const r = await applyBulkAssignAction(buildFilter(), Number(targetLocationId));
              setResult(`Assigned ${r.assignedCount} item(s).${r.capacityWarning ? " " + r.capacityWarning : ""}`);
              setPreview(null);
            })
          }
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          Apply
        </button>
      </div>

      {preview && (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm">
          <div className="font-medium">{preview.matchCount} item(s) match.</div>
          <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto text-xs text-neutral-600">
            {preview.sample.map((item) => (
              <li key={item.id}>
                {item.name} — {item.setName} {item.currentLocationCode ? `(currently ${item.currentLocationCode})` : "(unassigned)"}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result && <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">{result}</div>}
    </div>
  );
}
