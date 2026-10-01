// FIX: resolving problems. Missing-unit resolutions live in inventory.ts
// (markFound / confirmLost) because they move physical units.

import { db } from './db';
import { takeSnapshot } from './backup';
import { InventoryError, inventoryTx, transferItem } from './inventory';
import type { Problem } from '../domain/types';

export async function openProblems(): Promise<Problem[]> {
  return (await db().problems.where('status').equals('open').toArray()).sort((a, b) => a.createdAt - b.createdAt);
}

/** Close a problem that does not move inventory (import row, unmatched line, not-found note). */
export async function dismissProblem(id: string, resolution: string): Promise<void> {
  const d = db();
  const p = await d.problems.get(id);
  if (!p || p.status !== 'open') throw new InventoryError('Problem is not open');
  if (p.type === 'missing') throw new InventoryError('Missing cards must be found or confirmed lost');
  if (p.type === 'unlisted') throw new InventoryError('Link this card to its TCGplayer listing instead');
  await d.problems.put({ ...p, status: 'resolved', resolution, resolvedAt: Date.now() });
}

/** Link an unlisted card to its real TCGplayer SKU: balances move over, local item is removed. */
export async function linkUnlisted(problemId: string, targetItemId: string): Promise<number> {
  const d = db();
  const p = await d.problems.get(problemId);
  if (!p || p.type !== 'unlisted' || p.status !== 'open' || !p.itemId) throw new InventoryError('Not an open unlisted card');
  const target = await d.items.get(targetItemId);
  if (!target || target.unlisted) throw new InventoryError('Pick a TCGplayer listing to link to');
  const local = p.itemId;
  await takeSnapshot(`before linking ${local} → ${targetItemId}`);
  return inventoryTx(async () => {
    const moved = await transferItem(local, targetItemId, problemId);
    await d.items.delete(local);
    // Keep audit history and other problems pointing at the real card.
    for (const s of await d.sessions.toArray()) {
      if (s.lines.some((l) => l.itemId === local)) {
        await d.sessions.put({ ...s, lines: s.lines.map((l) => (l.itemId === local ? { ...l, itemId: targetItemId } : l)) });
      }
    }
    for (const other of await d.problems.where('itemId').equals(local).toArray()) {
      if (other.id !== p.id) await d.problems.put({ ...other, itemId: targetItemId });
    }
    await d.problems.put({ ...p, itemId: targetItemId, status: 'resolved', resolution: `linked to SKU ${targetItemId}`, resolvedAt: Date.now() });
    return moved;
  }, ['sessions']);
}

/** Match an imported order line to the right card. */
export async function linkOrderLine(problemId: string, itemId: string): Promise<void> {
  const d = db();
  await d.transaction('rw', [d.problems, d.orders, d.items], async () => {
    const p = await d.problems.get(problemId);
    if (!p || p.type !== 'order-line' || p.status !== 'open' || !p.orderId || p.lineIndex === undefined) {
      throw new InventoryError('Not an open order-line problem');
    }
    if (!(await d.items.get(itemId))) throw new InventoryError('Unknown card');
    const o = await d.orders.get(p.orderId);
    if (!o) throw new InventoryError('Order not found');
    const lines = o.lines.map((l, i) => (i === p.lineIndex ? { ...l, itemId } : l));
    await d.orders.put({ ...o, lines });
    await d.problems.put({ ...p, itemId, status: 'resolved', resolution: `matched to ${itemId}`, resolvedAt: Date.now() });
  });
}
