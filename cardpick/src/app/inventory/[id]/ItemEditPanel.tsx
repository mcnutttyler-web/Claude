"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/money";
import { setQuantityAction, updateSellPriceAction, updateStatusAction } from "./actions";

interface Props {
  itemId: number;
  sellPriceCents: number | null;
  status: string;
  quantity: number;
}

export default function ItemEditPanel({ itemId, sellPriceCents, status, quantity }: Props) {
  const router = useRouter();
  const [sellPrice, setSellPrice] = useState(sellPriceCents != null ? formatCents(sellPriceCents).replace("$", "") : "");
  const [qty, setQty] = useState(quantity);
  const [busy, setBusy] = useState(false);

  async function saveSellPrice() {
    setBusy(true);
    try {
      await updateSellPriceAction(itemId, sellPrice);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function saveQty() {
    setBusy(true);
    try {
      await setQuantityAction(itemId, qty);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(newStatus: string) {
    setBusy(true);
    try {
      await updateStatusAction(itemId, newStatus);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
      <div className="flex items-end gap-2">
        <label className="text-sm">
          <div className="text-slate-600 mb-1">Sell price ($)</div>
          <input className="border rounded px-2 py-1 w-28" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} />
        </label>
        <button className="rounded bg-slate-900 text-white px-3 py-1.5 text-sm disabled:opacity-50" disabled={busy} onClick={saveSellPrice}>
          Save price
        </button>
      </div>

      <div className="flex items-end gap-2">
        <label className="text-sm">
          <div className="text-slate-600 mb-1">On-hand quantity</div>
          <input
            type="number"
            className="border rounded px-2 py-1 w-24"
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
          />
        </label>
        <button className="rounded bg-slate-900 text-white px-3 py-1.5 text-sm disabled:opacity-50" disabled={busy} onClick={saveQty}>
          Save quantity
        </button>
      </div>

      <div className="flex items-end gap-2">
        <label className="text-sm">
          <div className="text-slate-600 mb-1">Status</div>
          <select className="border rounded px-2 py-1" value={status} onChange={(e) => changeStatus(e.target.value)} disabled={busy}>
            <option value="ACTIVE">ACTIVE</option>
            <option value="RESERVE">RESERVE</option>
            <option value="BULK">BULK</option>
            <option value="SOLD_OUT">SOLD_OUT</option>
            <option value="INACTIVE">INACTIVE (soft delete)</option>
          </select>
        </label>
      </div>
    </div>
  );
}
