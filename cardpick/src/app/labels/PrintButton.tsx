"use client";

export default function PrintButton() {
  return (
    <button className="rounded bg-slate-900 text-white px-4 py-2 text-sm" onClick={() => window.print()}>
      Print
    </button>
  );
}
