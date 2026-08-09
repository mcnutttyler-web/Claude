"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignItemLocationAction, suggestLocationAction } from "@/lib/actions/inventory";

export function AssignLocation({ itemId, locations }: { itemId: number; locations: { id: number; code: string }[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2 text-sm">
      <select value={selected} onChange={(e) => setSelected(e.target.value)} className="rounded border border-neutral-300 px-2 py-1">
        <option value="">Choose location…</option>
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.code}
          </option>
        ))}
      </select>
      <button
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const suggestion = await suggestLocationAction();
            if (suggestion) setSelected(String(suggestion.id));
          })
        }
        className="rounded border border-neutral-300 px-2 py-1 hover:bg-neutral-100 disabled:opacity-50"
      >
        Suggest
      </button>
      <button
        disabled={isPending || !selected}
        onClick={() =>
          startTransition(async () => {
            await assignItemLocationAction(itemId, Number(selected));
            router.refresh();
          })
        }
        className="rounded bg-neutral-900 px-3 py-1 text-white disabled:opacity-50"
      >
        Assign
      </button>
    </div>
  );
}
