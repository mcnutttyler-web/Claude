"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  confirmFulfillmentAction,
  markLinePulledAction,
  markLineShortAction,
  resolveShortLineAction,
  reverseFulfillmentAction,
} from "./actions";

interface Line {
  id: number;
  name: string;
  setName: string | null;
  cardNumber: string | null;
  condition: string | null;
  printing: string | null;
  quantity: number;
  matchStatus: "MATCHED" | "AMBIGUOUS" | "UNMATCHED";
  pickState: "PENDING" | "PULLED" | "SHORT";
  shortReason: string | null;
  resolution: string | null;
  currentLocationCode: string | null;
  currentQuantity: number | null;
}

export default function PickList({
  orderId,
  lines,
  orderStatus,
  reversibleBatchGroupId,
}: {
  orderId: number;
  lines: Line[];
  orderStatus: string;
  reversibleBatchGroupId: string | null;
}) {
  const router = useRouter();
  const [busyLineId, setBusyLineId] = useState<number | null>(null);
  const [shortingLineId, setShortingLineId] = useState<number | null>(null);
  const [shortReason, setShortReason] = useState("");
  const [correctQty, setCorrectQty] = useState("");
  const [busy, setBusy] = useState(false);

  async function onPull(lineId: number) {
    setBusyLineId(lineId);
    try {
      await markLinePulledAction(orderId, lineId);
      router.refresh();
    } finally {
      setBusyLineId(null);
    }
  }

  async function onSubmitShort(lineId: number) {
    setBusyLineId(lineId);
    try {
      await markLineShortAction(
        orderId,
        lineId,
        shortReason || "Not found",
        correctQty ? Number(correctQty) : undefined,
      );
      setShortingLineId(null);
      setShortReason("");
      setCorrectQty("");
      router.refresh();
    } finally {
      setBusyLineId(null);
    }
  }

  async function onResolve(lineId: number, resolution: "FOUND_ELSEWHERE" | "REDUCE_QUANTITY" | "CANCEL_LINE") {
    setBusyLineId(lineId);
    try {
      await resolveShortLineAction(orderId, lineId, resolution);
      router.refresh();
    } finally {
      setBusyLineId(null);
    }
  }

  async function onConfirmFulfillment() {
    setBusy(true);
    try {
      await confirmFulfillmentAction(orderId);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onReverse() {
    if (!reversibleBatchGroupId) return;
    setBusy(true);
    try {
      await reverseFulfillmentAction(orderId, reversibleBatchGroupId);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const allPulled = lines.length > 0 && lines.every((l) => l.pickState === "PULLED");

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-3 py-2">Location</th>
              <th className="px-3 py-2">Card</th>
              <th className="px-3 py-2">Qty</th>
              <th className="px-3 py-2">Match</th>
              <th className="px-3 py-2">State</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-t align-top">
                <td className="px-3 py-2">{l.currentLocationCode ?? "—"}</td>
                <td className="px-3 py-2">
                  {l.name}
                  <div className="text-slate-400 text-xs">
                    {l.setName} {l.cardNumber} {l.condition} {l.printing}
                  </div>
                </td>
                <td className="px-3 py-2">
                  {l.quantity}
                  {l.currentQuantity != null && l.currentQuantity < l.quantity && (
                    <span className="text-red-600 text-xs block">only {l.currentQuantity} on hand</span>
                  )}
                </td>
                <td className="px-3 py-2">{l.matchStatus}</td>
                <td className="px-3 py-2">
                  {l.pickState}
                  {l.pickState === "SHORT" && l.shortReason && (
                    <div className="text-xs text-red-600">{l.shortReason}</div>
                  )}
                </td>
                <td className="px-3 py-2">
                  {orderStatus !== "FULFILLED" && l.pickState === "PENDING" && (
                    <div className="flex gap-2">
                      <button
                        className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                        disabled={busyLineId === l.id}
                        onClick={() => onPull(l.id)}
                      >
                        Pulled
                      </button>
                      <button
                        className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                        disabled={busyLineId === l.id}
                        onClick={() => setShortingLineId(l.id)}
                      >
                        Short
                      </button>
                    </div>
                  )}
                  {shortingLineId === l.id && (
                    <div className="mt-2 space-y-1 border rounded p-2 bg-amber-50">
                      <input
                        className="border rounded px-2 py-1 text-xs w-full"
                        placeholder="Reason"
                        value={shortReason}
                        onChange={(e) => setShortReason(e.target.value)}
                      />
                      <input
                        className="border rounded px-2 py-1 text-xs w-full"
                        placeholder="Correct on-hand qty (optional)"
                        value={correctQty}
                        onChange={(e) => setCorrectQty(e.target.value)}
                      />
                      <button
                        className="rounded bg-slate-900 text-white px-2 py-1 text-xs"
                        onClick={() => onSubmitShort(l.id)}
                      >
                        Confirm short
                      </button>
                    </div>
                  )}
                  {l.pickState === "SHORT" && (
                    <div className="flex gap-1 flex-wrap mt-1">
                      <button className="rounded border px-2 py-1 text-xs" onClick={() => onResolve(l.id, "FOUND_ELSEWHERE")}>
                        Found elsewhere
                      </button>
                      <button className="rounded border px-2 py-1 text-xs" onClick={() => onResolve(l.id, "REDUCE_QUANTITY")}>
                        Reduce qty
                      </button>
                      <button className="rounded border px-2 py-1 text-xs" onClick={() => onResolve(l.id, "CANCEL_LINE")}>
                        Cancel line
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {orderStatus === "READY_TO_PACK" && allPulled && (
        <button className="rounded bg-green-700 text-white px-4 py-2 text-sm disabled:opacity-50" disabled={busy} onClick={onConfirmFulfillment}>
          Confirm fulfillment
        </button>
      )}

      {orderStatus === "FULFILLED" && reversibleBatchGroupId && (
        <button className="rounded border border-red-600 text-red-700 px-4 py-2 text-sm disabled:opacity-50" disabled={busy} onClick={onReverse}>
          Reverse fulfillment
        </button>
      )}
    </div>
  );
}
