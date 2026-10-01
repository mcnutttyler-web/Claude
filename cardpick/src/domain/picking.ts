// Batch pick allocation. Pure: takes snapshots of balances and set homes,
// returns a route. Never mutates inventory.

import type { PickTask } from './types';
import { compareLocation } from './search';

export interface Need {
  itemId: string;
  setName: string;
  qty: number;
  /** Orders in priority order (oldest first). */
  orders: { orderId: string; qty: number }[];
}

export interface BalanceView {
  itemId: string;
  location: string;
  qty: number;
  counted: boolean;
}

export interface Allocation {
  tasks: PickTask[];
  unlocated: { itemId: string; qty: number; orders: { orderId: string; qty: number }[] }[];
}

/**
 * Allocation rules:
 * 1. Verified balances first. Locations that are already on the route are
 *    preferred (fewer stops), then the location holding the most units.
 * 2. Any remainder goes to the item's set-home location, marked *unverified*,
 *    unless that location has already been counted for this item (a counted
 *    balance there — even zero — is evidence it is not there).
 * 3. Anything left is "unlocated": CardPick does not pretend to know.
 */
export function allocate(needs: Need[], balances: BalanceView[], setHomes: Map<string, string[]>): Allocation {
  const byItem = new Map<string, BalanceView[]>();
  for (const b of balances) {
    const arr = byItem.get(b.itemId) ?? [];
    arr.push(b);
    byItem.set(b.itemId, arr);
  }
  const route = new Set<string>();
  // Seed the route with locations that are the *only* source for some need.
  for (const n of needs) {
    const c = (byItem.get(n.itemId) ?? []).filter((b) => b.qty > 0);
    if (c.length === 1) route.add(c[0]!.location);
  }

  const raw: { location: string; verified: boolean; itemId: string; qty: number; need: Need }[] = [];
  const unlocatedRaw: { need: Need; qty: number }[] = [];

  // Hardest needs (fewest options) first so they shape the route.
  const ordered = [...needs].sort(
    (a, b) =>
      (byItem.get(a.itemId)?.filter((x) => x.qty > 0).length ?? 0) -
      (byItem.get(b.itemId)?.filter((x) => x.qty > 0).length ?? 0),
  );
  for (const n of ordered) {
    let remaining = n.qty;
    const all = byItem.get(n.itemId) ?? [];
    const cands = all
      .filter((b) => b.qty > 0)
      .sort(
        (a, b) =>
          Number(route.has(b.location)) - Number(route.has(a.location)) ||
          b.qty - a.qty ||
          compareLocation(a.location, b.location),
      );
    for (const c of cands) {
      if (remaining <= 0) break;
      const take = Math.min(c.qty, remaining);
      raw.push({ location: c.location, verified: true, itemId: n.itemId, qty: take, need: n });
      route.add(c.location);
      remaining -= take;
    }
    if (remaining > 0) {
      const counted = new Set(all.filter((b) => b.counted).map((b) => b.location));
      const home = (setHomes.get(n.setName) ?? []).find((h) => !counted.has(h));
      if (home) {
        raw.push({ location: home, verified: false, itemId: n.itemId, qty: remaining, need: n });
        route.add(home);
        remaining = 0;
      }
    }
    if (remaining > 0) unlocatedRaw.push({ need: n, qty: remaining });
  }

  // Split each need's orders across its allocations, oldest order first.
  const orderQueues = new Map<Need, { orderId: string; qty: number }[]>();
  const takeOrders = (need: Need, qty: number) => {
    let q = orderQueues.get(need);
    if (!q) {
      q = need.orders.map((o) => ({ ...o }));
      orderQueues.set(need, q);
    }
    const out: { orderId: string; qty: number }[] = [];
    let left = qty;
    while (left > 0 && q.length) {
      const head = q[0]!;
      const t = Math.min(head.qty, left);
      out.push({ orderId: head.orderId, qty: t });
      head.qty -= t;
      left -= t;
      if (head.qty === 0) q.shift();
    }
    return out;
  };

  // Keep allocations in need order, so order splitting follows the original priority.
  const tasks: PickTask[] = [];
  for (const n of needs) {
    for (const r of raw.filter((x) => x.need === n)) {
      tasks.push({
        id: `${r.location}|${r.itemId}|${r.verified ? 'v' : 'u'}`,
        location: r.location,
        verified: r.verified,
        itemId: r.itemId,
        qty: r.qty,
        orders: takeOrders(n, r.qty),
        status: 'todo',
        found: null,
      });
    }
  }
  const unlocated = needs.flatMap((n) =>
    unlocatedRaw.filter((u) => u.need === n).map((u) => ({ itemId: n.itemId, qty: u.qty, orders: takeOrders(n, u.qty) })),
  );
  tasks.sort((a, b) => compareLocation(a.location, b.location) || Number(b.verified) - Number(a.verified));
  return { tasks, unlocated };
}

/** Distribute a found quantity over a task's orders, oldest first. */
export function distributeFound(orders: { orderId: string; qty: number }[], found: number): Map<string, number> {
  const m = new Map<string, number>();
  let left = found;
  for (const o of orders) {
    const t = Math.min(o.qty, left);
    m.set(o.orderId, (m.get(o.orderId) ?? 0) + t);
    left -= t;
  }
  return m;
}

export function stopCount(tasks: PickTask[]): number {
  return new Set(tasks.map((t) => t.location)).size;
}
