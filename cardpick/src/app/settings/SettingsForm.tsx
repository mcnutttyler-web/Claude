"use client";

import { useState } from "react";
import { updateLateThresholdAction } from "./actions";

export default function SettingsForm({ initialHours }: { initialHours: number }) {
  const [hours, setHours] = useState(initialHours);
  const [saved, setSaved] = useState(false);

  async function save() {
    await updateLateThresholdAction(hours);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3 text-sm max-w-sm">
      <label>
        <div className="text-slate-600 mb-1">LATE flag threshold (hours since order import)</div>
        <input
          type="number"
          className="border rounded px-2 py-1 w-full"
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
        />
      </label>
      <button className="rounded bg-slate-900 text-white px-4 py-2 text-sm" onClick={save}>
        Save
      </button>
      {saved && <p className="text-green-700">Saved.</p>}
    </div>
  );
}
