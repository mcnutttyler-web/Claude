"use client";

import { useState, useTransition } from "react";
import { previewRepriceAction, applyRepriceAction } from "@/lib/actions/pricing";
import type { RepriceRow } from "@/lib/pricing";
import { centsToDollarsString } from "@/lib/money";

export function RepricePanel() {
  const [rows, setRows] = useState<RepriceRow[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [overrideStaleness, setOverrideStaleness] = useState(false);
  const [result, setResult] = useState<{ applied: number; skippedStale: number } | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      <button
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const preview = await previewRepriceAction();
            setRows(preview);
            setSelected(new Set(preview.filter((r) => !r.stale && r.deltaCents).map((r) => r.itemId)));
            setResult(null);
          })
        }
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {isPending ? "Computing…" : "Preview reprice"}
      </button>

      {rows && (
        <div className="space-y-2">
          <div className="flex items-center gap-3 text-sm">
            <button onClick={() => setSelected(new Set(rows.filter((r) => !r.stale).map((r) => r.itemId)))} className="text-blue-600 hover:underline">
              Select all
            </button>
            <button onClick={() => setSelected(new Set())} className="text-blue-600 hover:underline">
              Select none
            </button>
            <label className="ml-auto flex items-center gap-1 text-xs text-neutral-500">
              <input type="checkbox" checked={overrideStaleness} onChange={(e) => setOverrideStaleness(e.target.checked)} />
              Override staleness guard (reprice stale items too)
            </label>
          </div>
          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b bg-neutral-50 text-left text-xs uppercase text-neutral-500">
                <tr>
                  <th className="px-2 py-2"></th>
                  <th className="px-2 py-2">Card</th>
                  <th className="px-2 py-2">Market (as of)</th>
                  <th className="px-2 py-2">Current</th>
                  <th className="px-2 py-2">Proposed</th>
                  <th className="px-2 py-2">Delta</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.itemId} className={`border-b border-neutral-100 ${r.stale ? "opacity-50" : ""}`}>
                    <td className="px-2 py-2">
                      <input
                        type="checkbox"
                        disabled={r.stale && !overrideStaleness}
                        checked={selected.has(r.itemId)}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(r.itemId);
                          else next.delete(r.itemId);
                          setSelected(next);
                        }}
                      />
                    </td>
                    <td className="px-2 py-2">
                      {r.name} — {r.setName}
                      {r.stale && <span className="ml-1 rounded bg-amber-100 px-1 text-xs text-amber-800">stale</span>}
                    </td>
                    <td className="px-2 py-2">
                      {centsToDollarsString(r.marketPriceCents)} ({r.marketPriceAsof ?? "—"})
                    </td>
                    <td className="px-2 py-2">{centsToDollarsString(r.currentSellPriceCents)}</td>
                    <td className="px-2 py-2">{r.stale ? "—" : centsToDollarsString(r.proposedSellPriceCents)}</td>
                    <td className="px-2 py-2">{r.deltaCents != null ? centsToDollarsString(r.deltaCents) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            disabled={isPending || selected.size === 0}
            onClick={() =>
              startTransition(async () => {
                const applyResult = await applyRepriceAction([...selected], overrideStaleness);
                setResult(applyResult);
                setRows(null);
              })
            }
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            Apply to {selected.size} selected
          </button>
        </div>
      )}

      {result && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
          Applied to {result.applied} item(s){result.skippedStale > 0 ? `; skipped ${result.skippedStale} stale item(s)` : ""}.
        </div>
      )}
    </div>
  );
}
