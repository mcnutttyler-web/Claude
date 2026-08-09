"use client";

import { useState } from "react";
import { formatCents } from "@/lib/money";
import type { PricingSettingsLike } from "@/lib/pricing";
import type { RepriceRow } from "@/lib/repricing";
import { applyRepriceAction, previewRepriceAction, updatePricingSettingsAction } from "./actions";

export default function PricingClient({ initialSettings }: { initialSettings: PricingSettingsLike & { id: number } }) {
  const [settings, setSettings] = useState(initialSettings);
  const [rows, setRows] = useState<RepriceRow[] | null>(null);
  const [includeStale, setIncludeStale] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState<number | null>(null);

  async function saveSettings(patch: Partial<PricingSettingsLike>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    await updatePricingSettingsAction(patch);
  }

  async function onPreview() {
    setBusy(true);
    setApplied(null);
    try {
      const r = await previewRepriceAction(includeStale);
      setRows(r);
      setSelected(new Set(r.map((x) => x.itemId)));
    } finally {
      setBusy(false);
    }
  }

  function toggle(itemId: number) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  async function onApply() {
    setBusy(true);
    try {
      const result = await applyRepriceAction(Array.from(selected));
      setApplied(result.updatedCount);
      setRows(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4 grid sm:grid-cols-3 gap-3 text-sm">
        <label>
          <div className="text-slate-600 mb-1">p1 (%) — $0.49–$2.00</div>
          <input
            type="number"
            className="border rounded px-2 py-1 w-full"
            value={settings.p1Bps / 100}
            onChange={(e) => saveSettings({ p1Bps: Math.round(Number(e.target.value) * 100) })}
          />
        </label>
        <label>
          <div className="text-slate-600 mb-1">p2 (%) — $2.00–$10.00</div>
          <input
            type="number"
            className="border rounded px-2 py-1 w-full"
            value={settings.p2Bps / 100}
            onChange={(e) => saveSettings({ p2Bps: Math.round(Number(e.target.value) * 100) })}
          />
        </label>
        <label>
          <div className="text-slate-600 mb-1">p3 (%) — $10.00+</div>
          <input
            type="number"
            className="border rounded px-2 py-1 w-full"
            value={settings.p3Bps / 100}
            onChange={(e) => saveSettings({ p3Bps: Math.round(Number(e.target.value) * 100) })}
          />
        </label>
        <label>
          <div className="text-slate-600 mb-1">Rounding mode</div>
          <select
            className="border rounded px-2 py-1 w-full"
            value={settings.roundingMode}
            onChange={(e) => saveSettings({ roundingMode: e.target.value as PricingSettingsLike["roundingMode"] })}
          >
            <option value="UP_TO_X9">Up to nearest $0.X9</option>
            <option value="NEAREST_CENT">Nearest cent</option>
            <option value="NONE">None (truncate)</option>
          </select>
        </label>
        <label>
          <div className="text-slate-600 mb-1">Hard floor ($)</div>
          <input
            type="number"
            step="0.01"
            className="border rounded px-2 py-1 w-full"
            value={(settings.hardFloorCents / 100).toFixed(2)}
            onChange={(e) => saveSettings({ hardFloorCents: Math.round(Number(e.target.value) * 100) })}
          />
        </label>
        <label>
          <div className="text-slate-600 mb-1">Staleness guard (days)</div>
          <input
            type="number"
            className="border rounded px-2 py-1 w-full"
            value={settings.stalenessDays}
            onChange={(e) => saveSettings({ stalenessDays: Number(e.target.value) })}
          />
        </label>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-sm flex items-center gap-2">
          <input type="checkbox" checked={includeStale} onChange={(e) => setIncludeStale(e.target.checked)} />
          Include items with stale market prices (explicit override)
        </label>
        <button className="rounded bg-slate-900 text-white px-4 py-2 text-sm disabled:opacity-50" disabled={busy} onClick={onPreview}>
          Preview repricing
        </button>
      </div>

      {rows && (
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.size === rows.length && rows.length > 0}
                      onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.itemId)) : new Set())}
                    />
                  </th>
                  <th className="px-3 py-2">Card</th>
                  <th className="px-3 py-2">Market (as of)</th>
                  <th className="px-3 py-2">Current</th>
                  <th className="px-3 py-2">Proposed</th>
                  <th className="px-3 py-2">Delta</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.itemId} className={`border-t ${r.isStale ? "bg-amber-50" : ""}`}>
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={selected.has(r.itemId)} onChange={() => toggle(r.itemId)} />
                    </td>
                    <td className="px-3 py-2">
                      {r.name} <span className="text-slate-400">· {r.setName}</span>
                      {r.isStale && <span className="text-amber-700 text-xs block">stale as of {r.marketPriceAsof}</span>}
                    </td>
                    <td className="px-3 py-2">
                      {formatCents(r.marketPriceCents)}
                      <span className="text-slate-400 text-xs block">{r.marketPriceAsof}</span>
                    </td>
                    <td className="px-3 py-2">{formatCents(r.currentSellPriceCents)}</td>
                    <td className="px-3 py-2">{formatCents(r.proposedSellPriceCents)}</td>
                    <td className="px-3 py-2">
                      {r.currentSellPriceCents != null
                        ? formatCents(r.proposedSellPriceCents - r.currentSellPriceCents)
                        : "new"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="rounded bg-green-700 text-white px-4 py-2 text-sm disabled:opacity-50" disabled={busy || selected.size === 0} onClick={onApply}>
            Apply to {selected.size} selected
          </button>
        </div>
      )}

      {applied != null && <p className="text-sm text-green-700">Applied {applied} price changes.</p>}
    </div>
  );
}
