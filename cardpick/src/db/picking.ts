// Batch picking: build a location-ordered route for many orders at once,
// then confirm what was actually found at each stop.

import { balanceKey, db, uid } from './db';
import { adjust, InventoryError, inventoryTx, moveToMissing, pickFrom } from './inventory';
import { activeMs } from '../domain/metrics';
import { allocate, distributeFound, type BalanceView, type Need } from '../domain/picking';
import { homesBySet } from '../domain/status';
import { MISSING, type Order, type PickBatch, type PickTask, type Problem } from '../domain/types';

const TABLES = ['batches', 'orders', 'sessions'] as const;

export async function activeBatch(): Promise<PickBatch | null> {
  const all = await db().batches.toArray();
  return all.find((b) => b.completedAt === null) ?? null;
}

async function balanceViews(): Promise<BalanceView[]> {
  const d = db();
  const locs = new Map((await d.locations.toArray()).map((l) => [l.code, l]));
  return (await d.balances.toArray())
    .filter((b) => {
      const l = locs.get(b.location);
      return b.location !== MISSING && l && !l.retired && l.kind !== 'system';
    })
    .map((b) => ({ itemId: b.itemId, location: b.location, qty: b.qty, counted: b.countedAt !== null }));
}

const orderSort = (a: Order, b: Order) =>
  (a.orderedAt ?? Infinity) - (b.orderedAt ?? Infinity) || a.id.localeCompare(b.id);

export async function createBatch(orderIds: string[]): Promise<PickBatch> {
  if (await activeBatch()) throw new InventoryError('Finish the current pick batch first');
  const d = db();
  const orders = (await d.orders.bulkGet(orderIds)).filter((o): o is Order => !!o && o.status === 'open');
  if (!orders.length) throw new InventoryError('No open orders selected');
  orders.sort(orderSort);

  const items = new Map((await d.items.toArray()).map((i) => [i.id, i]));
  const needs = new Map<string, Need>();
  for (const o of orders) {
    for (const l of o.lines) {
      const left = l.qty - l.picked;
      if (!l.itemId || left <= 0) continue;
      const item = items.get(l.itemId);
      if (!item) continue;
      const n = needs.get(l.itemId) ?? { itemId: l.itemId, setName: item.setName, qty: 0, orders: [] };
      n.qty += left;
      n.orders.push({ orderId: o.id, qty: left });
      needs.set(l.itemId, n);
    }
  }
  const homes = homesBySet(await d.locations.toArray());
  const alloc = allocate([...needs.values()], await balanceViews(), homes);
  const batch: PickBatch = {
    id: uid('batch-'),
    createdAt: Date.now(),
    completedAt: null,
    orderIds: orders.map((o) => o.id),
    tasks: alloc.tasks,
    unlocated: alloc.unlocated,
    taps: [],
  };
  await d.transaction('rw', [d.batches, d.orders], async () => {
    await d.batches.put(batch);
    for (const o of orders) await d.orders.put({ ...o, status: 'picking' });
  });
  return batch;
}

async function adjustOrders(found: Map<string, number>, itemId: string, sign: 1 | -1) {
  const d = db();
  for (const [orderId, n] of found) {
    if (!n) continue;
    const o = await d.orders.get(orderId);
    if (!o) continue;
    let left = n;
    const lines = o.lines.map((l) => {
      if (l.itemId !== itemId || left === 0) return l;
      const room = sign > 0 ? l.qty - l.picked : l.picked;
      const t = Math.min(room, left);
      left -= t;
      return { ...l, picked: l.picked + sign * t };
    });
    await d.orders.put({ ...o, lines });
  }
}

/**
 * Record what was found for one pick task.
 * - found === qty: cards removed from the location.
 * - found < qty at a verified location: found cards are removed; whatever
 *   CardPick still believed was there moves to MISSING with a Fix item
 *   (never silently erased); the shortfall is re-routed to other locations.
 * - unverified (set-home) task: no balance existed, so nothing is removed;
 *   a shortfall opens a Fix item.
 */
export function confirmTask(batchId: string, taskId: string, found: number): Promise<PickBatch> {
  return inventoryTx(async () => {
    const d = db();
    const b = await d.batches.get(batchId);
    if (!b || b.completedAt !== null) throw new InventoryError('Batch is not active');
    const task = b.tasks.find((t) => t.id === taskId);
    if (!task || task.status !== 'todo') throw new InventoryError('Task already done');
    if (!Number.isInteger(found) || found < 0 || found > task.qty) throw new InventoryError(`Found must be 0–${task.qty}`);

    const effects: NonNullable<PickTask['effects']> = { missingMoved: 0, problemId: null, addedTaskIds: [] };
    const short = task.qty - found;
    const newTasks: PickTask[] = [];
    let unlocated = b.unlocated;

    if (task.verified) {
      if (found > 0) await pickFrom(task.itemId, task.location, found, batchId);
      if (short > 0) {
        const left = (await d.balances.get(balanceKey(task.itemId, task.location)))?.qty ?? 0;
        if (left > 0) {
          const p = await moveToMissing(task.itemId, task.location, left, `short pick: needed ${task.qty}, found ${found}`, batchId);
          effects.missingMoved = left;
          effects.problemId = p.id;
        }
      }
    } else if (short > 0) {
      const p: Problem = {
        id: uid('p-'),
        type: 'pick-unverified',
        itemId: task.itemId,
        location: task.location,
        qty: short,
        message: `Not found at ${task.location}: needed ${task.qty}, found ${found}`,
        detail: 'This card was expected here only because its set lives here; it was never counted. TCGplayer may be listing cards you do not have.',
        status: 'open',
        resolution: '',
        createdAt: Date.now(),
        resolvedAt: null,
      };
      await d.problems.put(p);
      effects.problemId = p.id;
    }

    // Orders that didn't get cards from this stop, oldest first stays first.
    const foundByOrder = distributeFound(task.orders, found);
    const shortOrders = task.orders
      .map((o) => ({ orderId: o.orderId, qty: o.qty - (foundByOrder.get(o.orderId) ?? 0) }))
      .filter((o) => o.qty > 0);

    if (short > 0) {
      // Re-route the shortfall to other verified stock not already reserved by this batch.
      const reserved = new Map<string, number>();
      for (const t of b.tasks) if (t.status === 'todo' && t.id !== taskId && t.itemId === task.itemId) reserved.set(t.location, (reserved.get(t.location) ?? 0) + t.qty);
      const visited = new Set(b.tasks.filter((t) => t.itemId === task.itemId).map((t) => t.location));
      const cands = (await balanceViews())
        .filter((v) => v.itemId === task.itemId && !visited.has(v.location))
        .map((v) => ({ ...v, free: v.qty - (reserved.get(v.location) ?? 0) }))
        .filter((v) => v.free > 0)
        .sort((x, y) => y.free - x.free);
      let need = short;
      const queue = shortOrders.map((o) => ({ ...o }));
      const takeOrders = (n: number) => {
        const out: { orderId: string; qty: number }[] = [];
        while (n > 0 && queue.length) {
          const h = queue[0]!;
          const t = Math.min(h.qty, n);
          out.push({ orderId: h.orderId, qty: t });
          h.qty -= t;
          n -= t;
          if (!h.qty) queue.shift();
        }
        return out;
      };
      for (const c of cands) {
        if (need <= 0) break;
        const t = Math.min(c.free, need);
        const nt: PickTask = {
          id: `${c.location}|${task.itemId}|v|${uid()}`,
          location: c.location,
          verified: true,
          itemId: task.itemId,
          qty: t,
          orders: takeOrders(t),
          status: 'todo',
          found: null,
        };
        newTasks.push(nt);
        effects.addedTaskIds.push(nt.id);
        need -= t;
      }
      if (need > 0) unlocated = [...unlocated, { itemId: task.itemId, qty: need, orders: takeOrders(need), fromTask: taskId }];
    }

    await adjustOrders(foundByOrder, task.itemId, 1);
    const tasks = b.tasks.map((t) => (t.id === taskId ? { ...t, status: 'done' as const, found, effects } : t));
    const next: PickBatch = { ...b, tasks: [...tasks, ...newTasks], unlocated, taps: [...b.taps, Date.now()] };
    await d.batches.put(next);
    return next;
  }, [...TABLES]);
}

/** Undo a confirmed task (mistap). Only while its re-routed follow-ups are untouched. */
export function undoTask(batchId: string, taskId: string): Promise<PickBatch> {
  return inventoryTx(async () => {
    const d = db();
    const b = await d.batches.get(batchId);
    if (!b || b.completedAt !== null) throw new InventoryError('Batch is not active');
    const task = b.tasks.find((t) => t.id === taskId);
    if (!task || task.status !== 'done' || !task.effects || task.found === null) throw new InventoryError('Nothing to undo');
    const fx = task.effects;
    if (b.tasks.some((t) => fx.addedTaskIds.includes(t.id) && t.status === 'done')) {
      throw new InventoryError('Undo the follow-up pick first');
    }
    if (fx.problemId) {
      const p = await d.problems.get(fx.problemId);
      if (p && (p.status !== 'open' || p.resolution)) {
        throw new InventoryError('That problem was already worked on in Fix');
      }
    }
    if (fx.missingMoved) {
      await adjust(task.itemId, MISSING, -fx.missingMoved, 'undo short pick', batchId);
      await adjust(task.itemId, task.location, fx.missingMoved, 'undo short pick', batchId);
    }
    if (task.verified && task.found > 0) await adjust(task.itemId, task.location, task.found, 'undo pick', batchId);
    if (fx.problemId) await d.problems.delete(fx.problemId);
    await adjustOrders(distributeFound(task.orders, task.found), task.itemId, -1);
    const next: PickBatch = {
      ...b,
      tasks: b.tasks
        .filter((t) => !fx.addedTaskIds.includes(t.id))
        .map((t) => (t.id === taskId ? { ...t, status: 'todo' as const, found: null, effects: undefined } : t)),
      unlocated: b.unlocated.filter((u) => u.fromTask !== taskId),
    };
    await d.batches.put(next);
    return next;
  }, [...TABLES]);
}

export interface BatchSummary {
  picked: number;
  needed: number;
  shortTasks: number;
  stops: number;
  activeMs: number;
  ordersComplete: number;
  ordersShort: number;
}

/** Close the batch. Orders become 'picked' (complete) or 'short'. */
export async function completeBatch(batchId: string): Promise<BatchSummary> {
  const d = db();
  return d.transaction('rw', [d.batches, d.orders], async () => {
    const b = await d.batches.get(batchId);
    if (!b || b.completedAt !== null) throw new InventoryError('Batch is not active');
    if (b.tasks.some((t) => t.status === 'todo')) throw new InventoryError('Some stops are not done yet');
    let ordersComplete = 0;
    let ordersShort = 0;
    let picked = 0;
    let needed = 0;
    for (const id of b.orderIds) {
      const o = await d.orders.get(id);
      if (!o) continue;
      for (const l of o.lines) {
        picked += l.picked;
        needed += l.qty;
      }
      const done = o.lines.every((l) => l.itemId !== null && l.picked >= l.qty);
      if (done) ordersComplete++;
      else ordersShort++;
      await d.orders.put({ ...o, status: done ? 'picked' : 'short' });
    }
    await d.batches.put({ ...b, completedAt: Date.now() });
    return {
      picked,
      needed,
      shortTasks: b.tasks.filter((t) => (t.found ?? 0) < t.qty).length,
      stops: new Set(b.tasks.map((t) => t.location)).size,
      activeMs: activeMs(b.taps),
      ordersComplete,
      ordersShort,
    };
  });
}

/** Return a short order to the open queue (e.g. after Fix found the card). */
export async function reopenOrder(orderId: string): Promise<void> {
  const d = db();
  const o = await d.orders.get(orderId);
  if (!o || (o.status !== 'short' && o.status !== 'picked')) throw new InventoryError('Order is not closed');
  await d.orders.put({ ...o, status: 'open' });
}

export async function archiveOrder(orderId: string): Promise<void> {
  const d = db();
  const o = await d.orders.get(orderId);
  if (!o) throw new InventoryError('Order not found');
  if (o.status === 'picking') throw new InventoryError('Order is in an active batch');
  await d.orders.put({ ...o, status: 'archived' });
}
