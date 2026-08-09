"use client";

import { useState } from "react";
import { createLocationAction } from "./actions";

export default function LocationForm() {
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<"GRANULAR" | "LEGACY">("GRANULAR");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    try {
      await createLocationAction({ code, kind });
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
      <label className="text-sm">
        <div className="text-slate-600 mb-1">Code</div>
        <input
          className="border rounded px-2 py-1"
          placeholder="A01"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </label>
      <label className="text-sm">
        <div className="text-slate-600 mb-1">Kind</div>
        <select className="border rounded px-2 py-1" value={kind} onChange={(e) => setKind(e.target.value as "GRANULAR" | "LEGACY")}>
          <option value="GRANULAR">Granular (max 60 SKUs / 300 qty)</option>
          <option value="LEGACY">Legacy (no limits, e.g. OLD-*, BOX-*)</option>
        </select>
      </label>
      <button className="rounded bg-slate-900 text-white px-4 py-1.5 text-sm disabled:opacity-50" disabled={busy}>
        Add location
      </button>
    </form>
  );
}
