// TCGplayer imports. These touch MARKETPLACE data only (item.marketplaceQty,
// prices, catalog) and never balances. See CARDPICK_PROJECT.md #1.

import { db, setMeta, uid } from './db';
import { takeSnapshot } from './backup';
import { identityChanges, parseInventoryCsv, parseOrdersCsv, rowToItem, searchBlob, parseCondition } from '../domain/tcgplayer';
import type { Item, Order, Problem } from '../domain/types';

export interface InventoryImportSummary {
  added: number;
  updated: number;
  qtyChanged: number;
  zeroedAbsent: number;
  rejected: number;
  identityConflicts: number;
  totalListedQty: number;
  missingColumns: string[];
}

function problem(id: string, type: Problem['type'], message: string, detail: string, itemId: string | null = null): Problem {
  return { id, type, itemId, location: null, qty: 0, message, detail, status: 'open', resolution: '', createdAt: Date.now(), resolvedAt: null };
}

/**
 * @param completeInventory when true, SKUs absent from the file are set to
 *        marketplace qty 0 (the file is the full TCGplayer inventory).
 */
export async function importInventory(text: string, opts: { completeInventory: boolean }): Promise<InventoryImportSummary> {
  const parsed = parseInventoryCsv(text);
  const sum: InventoryImportSummary = {
    added: 0,
    updated: 0,
    qtyChanged: 0,
    zeroedAbsent: 0,
    rejected: parsed.rejected.length,
    identityConflicts: 0,
    totalListedQty: 0,
    missingColumns: parsed.missingColumns,
  };
  if (parsed.missingColumns.length) return sum;

  await takeSnapshot('before TCGplayer inventory import');
  const now = Date.now();
  const d = db();
  await d.transaction('rw', [d.items, d.problems, d.meta], async () => {
    const existing = new Map((await d.items.toArray()).map((i) => [i.id, i]));
    const puts: Item[] = [];
    const problems: Problem[] = [];
    const seen = new Set<string>();
    for (const row of parsed.rows) {
      const next = rowToItem(row, now);
      seen.add(next.id);
      sum.totalListedQty += next.marketplaceQty;
      const prev = existing.get(next.id);
      if (!prev) {
        puts.push(next);
        sum.added++;
        continue;
      }
      const changes = identityChanges(prev, next);
      if (changes.length) {
        // Keep the old identity; only refresh marketplace data. A human decides.
        sum.identityConflicts++;
        problems.push(
          problem(
            `import-identity-${next.id}-${changes.join('|')}`,
            'import',
            `TCGplayer changed identity of SKU ${next.id}`,
            `${prev.productName}: ${changes.join(', ')}. CardPick kept the old details; check this SKU on TCGplayer.`,
            next.id,
          ),
        );
        if (prev.marketplaceQty !== next.marketplaceQty) sum.qtyChanged++;
        puts.push({ ...prev, marketplaceQty: next.marketplaceQty, marketPrice: next.marketPrice, lastImportedAt: now });
        continue;
      }
      if (prev.marketplaceQty !== next.marketplaceQty) sum.qtyChanged++;
      sum.updated++;
      puts.push({ ...prev, ...next, unlisted: false, search: searchBlob(next) });
    }
    if (opts.completeInventory) {
      for (const it of existing.values()) {
        if (!seen.has(it.id) && !it.unlisted && it.marketplaceQty !== 0) {
          puts.push({ ...it, marketplaceQty: 0, lastImportedAt: now });
          sum.zeroedAbsent++;
        }
      }
    }
    for (const r of parsed.rejected) {
      const name = r.raw.productname ?? '';
      problems.push(
        problem(
          `import-row-${r.reason}-${r.raw.tcgplayerid ?? ''}-${name}-${r.raw.setname ?? ''}-${r.raw.condition ?? ''}`,
          'import',
          `Import row skipped: ${r.reason}`,
          `${name} · ${r.raw.setname ?? ''} · ${r.raw.condition ?? ''} (file line ${r.line + 1})`,
        ),
      );
    }
    await d.items.bulkPut(puts);
    // Deterministic ids: re-importing the same file never duplicates open problems.
    for (const p of problems) {
      const old = await d.problems.get(p.id);
      if (!old || old.status === 'open') await d.problems.put(old ?? p);
    }
  });
  await setMeta('lastInventoryImportAt', now);
  return sum;
}

/** Record a physical card that has no TCGplayer listing. Always opens a Fix item. */
export async function createUnlistedItem(f: {
  productName: string;
  setName: string;
  number: string;
  conditionRaw: string;
}): Promise<Item> {
  if (!f.productName.trim() || !f.setName.trim()) throw new Error('Name and set are required');
  const { condition, printing, language } = parseCondition(f.conditionRaw || 'Near Mint');
  const base: Item = {
    id: uid('local-'),
    productLine: 'Pokemon',
    setName: f.setName.trim(),
    productName: f.productName.trim(),
    number: f.number.trim(),
    rarity: '',
    conditionRaw: f.conditionRaw.trim() || 'Near Mint',
    condition,
    printing,
    language,
    marketPrice: null,
    marketplaceQty: 0,
    unlisted: true,
    lastImportedAt: null,
    search: '',
  };
  base.search = searchBlob(base) + ' unlisted';
  const d = db();
  await d.transaction('rw', [d.items, d.problems], async () => {
    await d.items.put(base);
    await d.problems.put(
      problem(
        `unlisted-${base.id}`,
        'unlisted',
        `Not on TCGplayer: ${base.productName}`,
        `${base.setName} #${base.number} · ${base.conditionRaw}. List it on TCGplayer, re-import, then link it here.`,
        base.id,
      ),
    );
  });
  return base;
}

// ---------------------------------------------------------------------------
// Orders

export interface OrderImportSummary {
  orders: number;
  lines: number;
  unmatched: number;
  skippedClosed: number;
  errors: string[];
}

export async function importOrders(text: string): Promise<OrderImportSummary> {
  const parsed = parseOrdersCsv(text);
  const sum: OrderImportSummary = { orders: 0, lines: 0, unmatched: 0, skippedClosed: 0, errors: parsed.errors };
  if (!parsed.lines.length) return sum;
  const d = db();
  const now = Date.now();
  await d.transaction('rw', [d.items, d.orders, d.problems], async () => {
    const items = await d.items.toArray();
    const byId = new Map(items.map((i) => [i.id, i]));
    const exactKey = (n: string, s: string, num: string, c: string) =>
      [n, s, num, c].map((x) => x.trim().toLowerCase()).join('|');
    const byIdentity = new Map<string, Item[]>();
    for (const i of items) {
      const k = exactKey(i.productName, i.setName, i.number, i.conditionRaw);
      byIdentity.set(k, [...(byIdentity.get(k) ?? []), i]);
    }

    const grouped = new Map<string, Order>();
    for (const l of parsed.lines) {
      let o = grouped.get(l.orderId);
      if (!o) {
        o = { id: l.orderId, buyer: l.buyer, orderedAt: l.orderedAt, importedAt: now, status: 'open', lines: [] };
        grouped.set(l.orderId, o);
      }
      let itemId: string | null = null;
      if (l.sku && byId.has(l.sku)) itemId = l.sku;
      else if (!l.sku) {
        // Exact identity match only (name+set+number+full condition), and only if unique.
        const m = byIdentity.get(exactKey(l.hint.productName, l.hint.setName, l.hint.number, l.hint.condition)) ?? [];
        if (m.length === 1) itemId = m[0]!.id;
      }
      const same = o.lines.find((x) => x.itemId !== null && x.itemId === itemId);
      if (same) same.qty += l.qty;
      else o.lines.push({ itemId, qty: l.qty, picked: 0, label: itemId ? l.label : `${l.label}${l.sku ? ` (SKU ${l.sku})` : ''}` });
    }

    for (const o of grouped.values()) {
      const prev = await d.orders.get(o.id);
      if (prev && prev.status !== 'open') {
        sum.skippedClosed++;
        continue;
      }
      // Re-importing an open order replaces its lines (no double counting).
      await d.orders.put(o);
      sum.orders++;
      for (const [idx, line] of o.lines.entries()) {
        sum.lines++;
        const pid = `order-line-${o.id}-${idx}`;
        if (line.itemId === null) {
          sum.unmatched++;
          await d.problems.put({
            ...problem(pid, 'order-line', `Order ${o.id}: card not matched`, `${line.label} ×${line.qty}. Link it to the right card, or pick it manually.`),
            orderId: o.id,
            lineIndex: idx,
          });
        } else {
          const old = await d.problems.get(pid);
          if (old && old.status === 'open') await d.problems.put({ ...old, status: 'resolved', resolution: 'order re-imported with a match', resolvedAt: now });
        }
      }
    }
  });
  return sum;
}
