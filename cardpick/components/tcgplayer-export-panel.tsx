"use client";

import { useState } from "react";
import type { TcgplayerExportSettings } from "@/lib/export";

export function TcgplayerExportPanel({ initial }: { initial: TcgplayerExportSettings }) {
  const [includeQuantity, setIncludeQuantity] = useState(initial.includeQuantity);
  const [quantitySemantics, setQuantitySemantics] = useState(initial.quantitySemantics);
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <div className="max-w-xl space-y-3 rounded-lg border border-neutral-200 bg-white p-4 text-sm">
      <p className="text-neutral-500">
        The export always writes price only, by default. Enabling the quantity column can overwrite live TCGplayer listings if the
        semantics are wrong — confirm explicitly before turning it on.
      </p>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={includeQuantity}
          onChange={(e) => {
            if (e.target.checked) setShowConfirm(true);
            else setIncludeQuantity(false);
          }}
        />
        Include quantity column in export
      </label>

      {showConfirm && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
          <div className="font-semibold text-amber-900">Confirm quantity export</div>
          <p className="mt-1 text-amber-800">Choose how TCGplayer should interpret the quantity column:</p>
          <div className="mt-2 space-y-1">
            <label className="flex items-center gap-2">
              <input type="radio" checked={quantitySemantics === "ADD_TO"} onChange={() => setQuantitySemantics("ADD_TO")} />
              <span>
                <strong>Add to</strong> quantity — TCGplayer adds this number to what it already has listed.
              </span>
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={quantitySemantics === "TOTAL"} onChange={() => setQuantitySemantics("TOTAL")} />
              <span>
                <strong>Total</strong> quantity — TCGplayer replaces its listed quantity with this number.
              </span>
            </label>
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setIncludeQuantity(true);
                setShowConfirm(false);
              }}
              className="rounded bg-amber-600 px-3 py-1.5 text-white"
            >
              I understand, enable it
            </button>
            <button type="button" onClick={() => setShowConfirm(false)} className="rounded border border-neutral-300 px-3 py-1.5">
              Cancel
            </button>
          </div>
        </div>
      )}

      <input type="hidden" name="includeQuantity" value={String(includeQuantity)} />
      <input type="hidden" name="quantitySemantics" value={quantitySemantics} />

      <div className="flex gap-2 pt-2">
        <a
          href={`/settings/export-tcgplayer?includeQuantity=${includeQuantity}`}
          className="rounded-md bg-neutral-900 px-4 py-2 text-white"
        >
          Download TCGplayer upload CSV
        </a>
      </div>
    </div>
  );
}
