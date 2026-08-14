"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  markPulledAction,
  markShortAction,
  resolveShortAction,
  resolveOrderLineMatchAction,
  searchInventoryForMatchAction,
} from "@/lib/actions/orders";
import type { PickListLine } from "@/lib/pick";

export function PickLineActions({ line }: { line: PickListLine }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showShortForm, setShowShortForm] = useState(false);
  const [showMatchSearch, setShowMatchSearch] = useState(false);

  function refresh() {
    router.refresh();
  }

  if (line.matchStatus !== "MATCHED") {
    return (
      <div className="space-y-1">
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">
          {line.matchStatus === "AMBIGUOUS" ? "Ambiguous — pick one" : "No match — search inventory"}
        </span>
        {!showMatchSearch ? (
          <button onClick={() => setShowMatchSearch(true)} className="block text-xs text-blue-600 hover:underline">
            Resolve
          </button>
        ) : (
          <MatchResolver
            lineId={line.lineId}
            onResolved={() => {
              setShowMatchSearch(false);
              refresh();
            }}
          />
        )}
      </div>
    );
  }

  if (line.pickState === "SHORT") {
    return (
      <div className="space-y-1 text-xs">
        <div className="font-semibold text-red-700">SHORT</div>
        <div className="flex gap-1">
          <button
            disabled={isPending}
            onClick={() => startTransition(async () => { await resolveShortAction(line.lineId, "FOUND_ELSEWHERE"); refresh(); })}
            className="rounded border border-neutral-300 px-2 py-1 hover:bg-neutral-100"
          >
            Found elsewhere
          </button>
          <button
            disabled={isPending}
            onClick={() => startTransition(async () => { await resolveShortAction(line.lineId, "REDUCE_QUANTITY", 0); refresh(); })}
            className="rounded border border-neutral-300 px-2 py-1 hover:bg-neutral-100"
          >
            Reduce qty
          </button>
          <button
            disabled={isPending}
            onClick={() => startTransition(async () => { await resolveShortAction(line.lineId, "CANCEL_LINE"); refresh(); })}
            className="rounded border border-neutral-300 px-2 py-1 hover:bg-neutral-100"
          >
            Cancel line
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <button
        disabled={isPending}
        onClick={() => startTransition(async () => { await markPulledAction(line.lineId); refresh(); })}
        className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs text-white disabled:opacity-50"
      >
        Pulled
      </button>{" "}
      {!showShortForm ? (
        <button onClick={() => setShowShortForm(true)} className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-100">
          Short
        </button>
      ) : (
        <ShortForm
          lineId={line.lineId}
          onDone={() => {
            setShowShortForm(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function ShortForm({ lineId, onDone }: { lineId: number; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [correctedQuantity, setCorrectedQuantity] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <div className="mt-1 space-y-1 rounded border border-neutral-200 bg-neutral-50 p-2 text-xs">
      <input
        placeholder="Reason (not found, damaged, short qty…)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="w-full rounded border border-neutral-300 px-2 py-1"
      />
      <input
        placeholder="Correct on-hand qty at this location (optional)"
        value={correctedQuantity}
        onChange={(e) => setCorrectedQuantity(e.target.value)}
        className="w-full rounded border border-neutral-300 px-2 py-1"
      />
      <button
        disabled={isPending || !reason}
        onClick={() =>
          startTransition(async () => {
            await markShortAction(lineId, reason, correctedQuantity === "" ? undefined : Number(correctedQuantity));
            onDone();
          })
        }
        className="rounded bg-red-600 px-2 py-1 text-white disabled:opacity-50"
      >
        Confirm short
      </button>
    </div>
  );
}

function MatchResolver({ lineId, onResolved }: { lineId: number; onResolved: () => void }) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<{ id: number; name: string; setName: string; cardNumber: string }[]>([]);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="rounded border border-neutral-200 bg-neutral-50 p-2 text-xs">
      <input
        placeholder="Search inventory…"
        value={term}
        onChange={(e) => {
          setTerm(e.target.value);
          startTransition(async () => {
            const rows = await searchInventoryForMatchAction(e.target.value);
            setResults(rows);
          });
        }}
        className="mb-1 w-full rounded border border-neutral-300 px-2 py-1"
      />
      <ul className="max-h-40 space-y-1 overflow-y-auto">
        {results.map((r) => (
          <li key={r.id}>
            <button
              className="w-full rounded px-1 py-0.5 text-left hover:bg-neutral-200"
              onClick={() =>
                startTransition(async () => {
                  await resolveOrderLineMatchAction(lineId, r.id);
                  onResolved();
                })
              }
            >
              {r.name} — {r.setName} #{r.cardNumber}
            </button>
          </li>
        ))}
      </ul>
      {isPending && <div className="text-neutral-400">Searching…</div>}
    </div>
  );
}
