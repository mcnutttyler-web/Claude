"use client";

import { useState } from "react";
import { generateExportAction, setExportSettingsAction } from "./actions";

export default function ExportPanel({
  initialIncludeQuantity,
  initialMode,
}: {
  initialIncludeQuantity: boolean;
  initialMode: "ADD_TO" | "TOTAL";
}) {
  const [includeQuantity, setIncludeQuantity] = useState(initialIncludeQuantity);
  const [mode, setMode] = useState<"ADD_TO" | "TOTAL">(initialMode);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  function onToggleQuantity(checked: boolean) {
    if (checked) {
      setShowConfirm(true);
    } else {
      setIncludeQuantity(false);
      setExportSettingsAction(false, mode);
    }
  }

  async function confirmEnableQuantity() {
    setIncludeQuantity(true);
    setShowConfirm(false);
    await setExportSettingsAction(true, mode);
  }

  async function onGenerate() {
    setBusy(true);
    try {
      const csv = await generateExportAction(includeQuantity);
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cardpick-export-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={includeQuantity}
            onChange={(e) => onToggleQuantity(e.target.checked)}
          />
          Include quantity in export (off by default — price-only is safe)
        </label>

        {includeQuantity && (
          <label>
            <div className="text-slate-600 mb-1">Quantity semantics</div>
            <select
              className="border rounded px-2 py-1"
              value={mode}
              onChange={(e) => {
                const v = e.target.value as "ADD_TO" | "TOTAL";
                setMode(v);
                setExportSettingsAction(true, v);
              }}
            >
              <option value="TOTAL">Total on-hand (overwrites TCGplayer's listed quantity)</option>
              <option value="ADD_TO">Add to TCGplayer's existing quantity</option>
            </select>
          </label>
        )}
      </div>

      {showConfirm && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm space-y-3">
          <p className="font-medium">Confirm quantity export semantics</p>
          <p>
            You are about to export quantity as <strong>{mode === "TOTAL" ? "TOTAL on-hand" : "ADD-TO existing"}</strong>.
            Getting this wrong overwrites live TCGplayer listings. Choose the mode above that matches what
            TCGplayer's bulk upload expects before continuing.
          </p>
          <div className="flex gap-2">
            <button className="rounded bg-red-700 text-white px-3 py-1.5" onClick={confirmEnableQuantity}>
              I understand, enable quantity
            </button>
            <button className="rounded border px-3 py-1.5" onClick={() => setShowConfirm(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <button className="rounded bg-slate-900 text-white px-4 py-2 text-sm disabled:opacity-50" disabled={busy} onClick={onGenerate}>
        {busy ? "Generating…" : "Generate export CSV"}
      </button>
    </div>
  );
}
