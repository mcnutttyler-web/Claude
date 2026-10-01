// THE ONLY PLACE PHYSICAL BALANCES CHANGE.
//
// Every change writes the balance row and an append-only ledger row in the
// same transaction. checkIntegrity() replays the ledger to prove they agree.

import { balanceKey, db, uid, type DataTable } from './db';
import { MISSING, type LedgerType, type Location, type LocationKind, type Problem } from '../domain/types';

export class InventoryError extends Error {}

const TX_TABLES = ['balances', 'ledger', 'problems', 'locations', 'items'] as const;

/** Run `fn` atomically over the inventory tables (plus any `extra` tables). */
export function inventoryTx<T>(fn: () => Promise<T>, extra: DataTable[] = []): Promise<T> {
  const d = db();
  const names = [...new Set<DataTable>([...TX_TABLES, ...extra])];
  return d.transaction('rw', names.map((t) => d[t]), fn);
}

/** Apply a signed delta. Must run inside a transaction covering balances+ledger. */
async function applyDelta(
  itemId: string,
  location: string,
  delta: number,
  type: LedgerType,
  note: string,
  ref: string,
  counted = false,
): Promise<number> {
  if (!Number.isInteger(delta)) throw new InventoryError('Quantity must be a whole number');
  const d = db();
  const key = balanceKey(itemId, location);
  const prev = await d.balances.get(key);
  const now = Date.now();
  const qty = (prev?.qty ?? 0) + delta;
  if (qty < 0) {
    throw new InventoryError(`Cannot go below zero at ${location} (have ${prev?.qty ?? 0}, change ${delta})`);
  }
  await d.balances.put({
    key,
    itemId,
    location,
    qty,
    countedAt: counted ? now : (prev?.countedAt ?? null),
    updatedAt: now,
  });
  if (delta !== 0) await d.ledger.add({ at: now, type, itemId, location, delta, note, ref });
  return qty;
}

async function requireLocation(code: string): Promise<Location> {
  const loc = await db().locations.get(code);
  if (!loc) throw new InventoryError(`Unknown location ${code}`);
  if (loc.retired) throw new InventoryError(`Location ${code} is retired`);
  return loc;
}

async function requireItem(itemId: string) {
  const it = await db().items.get(itemId);
  if (!it) throw new InventoryError(`Unknown card ${itemId}`);
  return it;
}

// ---------------------------------------------------------------------------
// Locations

export const LOCATION_CODE = /^[A-Z0-9][A-Z0-9-]{0,15}$/;

export async function ensureSystemLocations(): Promise<void> {
  const d = db();
  if (!(await d.locations.get(MISSING))) {
    await d.locations.put({
      code: MISSING,
      kind: 'system',
      note: 'Expected but not found. Investigate in Fix.',
      capacity: null,
      setHomes: [],
      retired: false,
      createdAt: Date.now(),
    });
  }
}

export async function createLocation(
  codeRaw: string,
  kind: Exclude<LocationKind, 'system'>,
  opts: { note?: string; capacity?: number | null; setHomes?: string[] } = {},
): Promise<Location> {
  const code = codeRaw.trim().toUpperCase();
  if (!LOCATION_CODE.test(code) || code === MISSING) throw new InventoryError(`"${codeRaw}" is not a valid location code`);
  const d = db();
  if (await d.locations.get(code)) throw new InventoryError(`Location ${code} already exists`);
  const loc: Location = {
    code,
    kind,
    note: opts.note ?? '',
    capacity: opts.capacity === undefined ? (kind === 'chaos' ? 650 : null) : opts.capacity,
    setHomes: opts.setHomes ?? [],
    retired: false,
    createdAt: Date.now(),
  };
  await d.locations.put(loc);
  return loc;
}

export async function updateLocation(code: string, patch: Partial<Pick<Location, 'note' | 'capacity' | 'setHomes' | 'kind'>>): Promise<void> {
  if (code === MISSING) throw new InventoryError('System location cannot be edited');
  await db().locations.update(code, patch);
}

/** Retiring is only allowed for empty locations, so no units are hidden. */
export async function retireLocation(code: string): Promise<void> {
  const rows = await db().balances.where('location').equals(code).toArray();
  const units = rows.reduce((s, r) => s + r.qty, 0);
  if (units > 0) throw new InventoryError(`${code} still holds ${units} cards`);
  await db().locations.update(code, { retired: true });
}

export async function nextChaosCode(): Promise<string> {
  const all = await db().locations.toArray();
  let max = 0;
  for (const l of all) {
    const m = l.code.match(/^C(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `C${String(max + 1).padStart(3, '0')}`;
}

// ---------------------------------------------------------------------------
// Movements

/** Cards placed into a location (put away). Counts as verification evidence. */
export function putAway(itemId: string, location: string, qty: number, ref: string): Promise<number> {
  return inventoryTx(async () => {
    if (qty <= 0) throw new InventoryError('Put away quantity must be positive');
    await requireItem(itemId);
    const loc = await requireLocation(location);
    if (loc.kind === 'system') throw new InventoryError('Cannot put cards into a system location');
    return applyDelta(itemId, location, qty, 'putaway', '', ref, true);
  });
}

/** Reverse a put away (undo). */
export function undoPutAway(itemId: string, location: string, qty: number, ref: string): Promise<number> {
  return inventoryTx(() => applyDelta(itemId, location, -qty, 'adjust', 'undo put away', ref));
}

/** A physical count: sets the balance at a location to exactly `qty`. */
export function setCount(itemId: string, location: string, qty: number, ref: string): Promise<number> {
  return inventoryTx(async () => {
    if (qty < 0) throw new InventoryError('Count cannot be negative');
    await requireItem(itemId);
    const loc = await requireLocation(location);
    if (loc.kind === 'system') throw new InventoryError('Cannot count into a system location');
    const prev = (await db().balances.get(balanceKey(itemId, location)))?.qty ?? 0;
    return applyDelta(itemId, location, qty - prev, 'audit', `count ${prev}→${qty}`, ref, true);
  });
}

/** Explicit correction (undo of a pick/short pick). Logged as 'adjust'. */
export function adjust(itemId: string, location: string, delta: number, note: string, ref: string): Promise<number> {
  return inventoryTx(() => applyDelta(itemId, location, delta, 'adjust', note, ref));
}

/** Remove cards for an order. */
export function pickFrom(itemId: string, location: string, qty: number, ref: string): Promise<number> {
  return inventoryTx(() => applyDelta(itemId, location, -qty, 'pick', '', ref));
}

/** Units expected at `from` that were not found: move to MISSING and open a Fix item. */
export function moveToMissing(itemId: string, from: string, qty: number, reason: string, ref: string): Promise<Problem> {
  return inventoryTx(async () => {
    if (qty <= 0) throw new InventoryError('Missing quantity must be positive');
    await ensureSystemLocations();
    await applyDelta(itemId, from, -qty, 'missing', reason, ref, true);
    await applyDelta(itemId, MISSING, qty, 'missing', `from ${from}: ${reason}`, ref);
    const problem: Problem = {
      id: uid('p-'),
      type: 'missing',
      itemId,
      location: from,
      qty,
      message: `${qty} missing from ${from}`,
      detail: reason,
      status: 'open',
      resolution: '',
      createdAt: Date.now(),
      resolvedAt: null,
    };
    await db().problems.put(problem);
    return problem;
  });
}

async function openMissingProblem(problemId: string, qty: number): Promise<Problem> {
  const p = await db().problems.get(problemId);
  if (!p || p.type !== 'missing' || p.status !== 'open' || !p.itemId) throw new InventoryError('Not an open missing-card problem');
  if (!Number.isInteger(qty) || qty <= 0 || qty > p.qty) throw new InventoryError(`Quantity must be 1–${p.qty}`);
  return p;
}

async function shrinkProblem(p: Problem, qty: number, resolution: string) {
  const left = p.qty - qty;
  await db().problems.put({
    ...p,
    qty: left,
    message: left ? `${left} missing from ${p.location}` : p.message,
    status: left ? 'open' : 'resolved',
    resolution: [p.resolution, resolution].filter(Boolean).join('; '),
    resolvedAt: left ? null : Date.now(),
  });
}

/** Missing units were found at `location` (may differ from where they were expected). */
export function markFound(problemId: string, location: string, qty: number): Promise<void> {
  return inventoryTx(async () => {
    const p = await openMissingProblem(problemId, qty);
    const loc = await requireLocation(location);
    if (loc.kind === 'system') throw new InventoryError('Choose a real location');
    await applyDelta(p.itemId!, MISSING, -qty, 'found', `found at ${location}`, problemId);
    await applyDelta(p.itemId!, location, qty, 'found', 'found from MISSING', problemId, true);
    await shrinkProblem(p, qty, `${qty} found at ${location}`);
  });
}

/** Explicit, logged write-off. The only way units leave inventory without a pick. */
export function confirmLost(problemId: string, qty: number): Promise<void> {
  return inventoryTx(async () => {
    const p = await openMissingProblem(problemId, qty);
    await applyDelta(p.itemId!, MISSING, -qty, 'writeoff', 'confirmed lost', problemId);
    await shrinkProblem(p, qty, `${qty} confirmed lost`);
  });
}

/** Move cards between real locations (e.g. consolidating chaos bins). */
export function moveCards(itemId: string, from: string, to: string, qty: number, ref = uid('mv-')): Promise<void> {
  return inventoryTx(async () => {
    if (qty <= 0) throw new InventoryError('Move quantity must be positive');
    const l = await requireLocation(to);
    if (l.kind === 'system') throw new InventoryError('Choose a real location');
    await applyDelta(itemId, from, -qty, 'move', `to ${to}`, ref);
    await applyDelta(itemId, to, qty, 'move', `from ${from}`, ref, true);
  });
}

/** Re-home all balances of one item onto another (linking an unlisted card to its SKU). */
export function transferItem(fromItem: string, toItem: string, ref: string): Promise<number> {
  return inventoryTx(async () => {
    await requireItem(toItem);
    const rows = await db().balances.where('itemId').equals(fromItem).toArray();
    let moved = 0;
    for (const r of rows) {
      if (r.qty > 0) {
        await applyDelta(fromItem, r.location, -r.qty, 'adjust', `linked to ${toItem}`, ref);
        await applyDelta(toItem, r.location, r.qty, 'adjust', `linked from ${fromItem}`, ref, r.countedAt !== null);
        moved += r.qty;
      }
      await db().balances.delete(r.key);
    }
    return moved;
  });
}

// ---------------------------------------------------------------------------
// Integrity

export interface IntegrityReport {
  ok: boolean;
  balances: number;
  ledgerEntries: number;
  problems: string[];
}

/** Replay the ledger and compare with stored balances. Read-only. */
export async function checkIntegrity(): Promise<IntegrityReport> {
  const d = db();
  const [balances, ledger, problems] = await Promise.all([d.balances.toArray(), d.ledger.toArray(), d.problems.toArray()]);
  return integrityOf(balances, ledger, problems);
}

export function integrityOf(
  balances: { key: string; itemId: string; location: string; qty: number }[],
  ledger: { itemId: string; location: string; delta: number }[],
  problems: Problem[],
): IntegrityReport {
  const issues: string[] = [];
  const replay = new Map<string, number>();
  for (const e of ledger) {
    const k = balanceKey(e.itemId, e.location);
    replay.set(k, (replay.get(k) ?? 0) + e.delta);
  }
  const stored = new Map(balances.map((b) => [b.key, b.qty]));
  for (const b of balances) {
    if (b.qty < 0) issues.push(`Negative balance ${b.key} = ${b.qty}`);
    if (b.key !== balanceKey(b.itemId, b.location)) issues.push(`Malformed balance key ${b.key}`);
  }
  for (const k of new Set([...replay.keys(), ...stored.keys()])) {
    const a = replay.get(k) ?? 0;
    const s = stored.get(k) ?? 0;
    if (a !== s) issues.push(`Balance ${k}: stored ${s}, ledger says ${a}`);
  }
  const missingByItem = new Map<string, number>();
  for (const b of balances) if (b.location === MISSING) missingByItem.set(b.itemId, (missingByItem.get(b.itemId) ?? 0) + b.qty);
  const openByItem = new Map<string, number>();
  for (const p of problems)
    if (p.type === 'missing' && p.status === 'open' && p.itemId) openByItem.set(p.itemId, (openByItem.get(p.itemId) ?? 0) + p.qty);
  for (const k of new Set([...missingByItem.keys(), ...openByItem.keys()])) {
    if ((missingByItem.get(k) ?? 0) !== (openByItem.get(k) ?? 0)) {
      issues.push(`MISSING units for ${k} (${missingByItem.get(k) ?? 0}) don't match open problems (${openByItem.get(k) ?? 0})`);
    }
  }
  return { ok: issues.length === 0, balances: balances.length, ledgerEntries: ledger.length, problems: issues };
}
