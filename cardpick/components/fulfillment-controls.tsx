"use client";

import { useState, useTransition } from "react";
import { confirmFulfillmentAction, reverseFulfillmentAction } from "@/lib/actions/orders";

export function FulfillmentControls({
  orderId,
  status,
  fulfillmentGroupId,
}: {
  orderId: number;
  status: string;
  fulfillmentGroupId: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  if (status === "READY_TO_PACK") {
    return (
      <button
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const result = await confirmFulfillmentAction(orderId);
            setMessage(`Fulfilled ${result.linesFulfilled} line(s)`);
          })
        }
        className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs text-white disabled:opacity-50"
      >
        {isPending ? "Confirming…" : "Confirm fulfillment"}
      </button>
    );
  }

  if (status === "FULFILLED" && fulfillmentGroupId) {
    return (
      <div className="flex items-center gap-2">
        <button
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await reverseFulfillmentAction(fulfillmentGroupId);
              setMessage("Fulfillment reversed");
            })
          }
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-100 disabled:opacity-50"
        >
          {isPending ? "Reversing…" : "Reverse fulfillment"}
        </button>
        {message && <span className="text-xs text-neutral-500">{message}</span>}
      </div>
    );
  }

  return message ? <span className="text-xs text-neutral-500">{message}</span> : null;
}
