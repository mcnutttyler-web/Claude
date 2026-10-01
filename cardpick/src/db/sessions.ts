// Audit and Put Away sessions.
//
// Audit: taps only build a count list (saved on every tap, so nothing is lost
// if the phone sleeps). Counts are applied to balances when the session is
// finished, as one physical count per card.
// Put Away: every tap immediately places a card into the location.

import { balanceKey, db, setMeta, uid } from './db';
import { inventoryTx, moveToMissing, putAway, setCount, undoPutAway, InventoryError } from './inventory';
import { activeMs } from '../domain/metrics';
import { homesBySet, itemView } from '../domain/status';
import type { AuditResult, AuditSession, Item } from '../domain/types';

export async function startSession(location: string, mode: AuditSession['mode']): Promise<AuditSession> {
  const d = db();
  const loc = await d.locations.get(location);
  if (!loc || loc.retired || loc.kind === 'system') throw new InventoryError(`Choose a real location (got ${location})`);
  const open = (await d.sessions.where('mode').equals(mode).toArray()).find((s) => s.location === location && s.endedAt === null);
  await setMeta(`lastLocation:${mode}`, location);
  if (open) return open;
  const s: AuditSession = { id: uid(`${mode}-`), location, mode, startedAt: Date.now(), endedAt: null, taps: [], lines: [], result: null };
  await d.sessions.put(s);
  return s;
}

export async function openSessions(): Promise<AuditSession[]> {
  return (await db().sessions.toArray()).filter((s) => s.endedAt === null);
}

// Read-modify-write inside a rw transaction: Dexie serializes these, so rapid
// double taps can never lose a count.
function editLines(sessionId: string, itemId: string, delta: number, tap: boolean): Promise<AuditSession> {
  const d = db();
  return d.transaction('rw', d.sessions, () => editLinesTx(sessionId, itemId, delta, tap));
}

async function editLinesTx(sessionId: string, itemId: string, delta: number, tap: boolean): Promise<AuditSession> {
  const d = db();
  const s = await d.sessions.get(sessionId);
  if (!s || s.endedAt !== null) throw new InventoryError('Session is not open');
  const lines = s.lines.map((l) => ({ ...l }));
  let line = lines.find((l) => l.itemId === itemId);
  if (!line) {
    line = { itemId, qty: 0 };
    lines.unshift(line);
  } else if (delta > 0) {
    // Most recent card first.
    lines.splice(lines.indexOf(line), 1);
    lines.unshift(line);
  }
  line.qty += delta;
  if (line.qty < 0) throw new InventoryError('Count cannot go below zero');
  const next: AuditSession = { ...s, lines: lines.filter((l) => l.qty > 0), taps: tap ? [...s.taps, Date.now()] : s.taps };
  await d.sessions.put(next);
  return next;
}

/** Audit: count one more (or one fewer) of a card. Does not touch balances yet. */
export function auditTap(sessionId: string, itemId: string, delta = 1): Promise<AuditSession> {
  return editLines(sessionId, itemId, delta, delta > 0);
}

/** Put Away: place one card into the session location immediately. */
export function putawayTap(sessionId: string, itemId: string): Promise<AuditSession> {
  return inventoryTx(async () => {
    const s = await db().sessions.get(sessionId);
    if (!s || s.mode !== 'putaway' || s.endedAt !== null) throw new InventoryError('Not an open put away session');
    await putAway(itemId, s.location, 1, sessionId);
    return editLinesTx(sessionId, itemId, 1, true);
  }, ['sessions']);
}

/** Put Away: take one back out (mistap). */
export function putawayUndo(sessionId: string, itemId: string): Promise<AuditSession> {
  return inventoryTx(async () => {
    const s = await db().sessions.get(sessionId);
    if (!s || s.mode !== 'putaway') throw new InventoryError('Not a put away session');
    const line = s.lines.find((l) => l.itemId === itemId);
    if (!line || line.qty <= 0) throw new InventoryError('Nothing to undo for this card');
    await undoPutAway(itemId, s.location, 1, sessionId);
    return editLinesTx(sessionId, itemId, -1, false);
  }, ['sessions']);
}

export async function endPutaway(sessionId: string): Promise<AuditSession> {
  const d = db();
  const s = await d.sessions.get(sessionId);
  if (!s) throw new InventoryError('Session not found');
  const next = { ...s, endedAt: Date.now() };
  await d.sessions.put(next);
  return next;
}

export interface AuditPreview {
  session: AuditSession;
  /** Cards CardPick had at this location that were not counted this session. */
  notCounted: { item: Item; qty: number }[];
  /** TCGplayer-listed cards from this location's set homes that were not counted here. */
  homeAbsent: Item[];
}

export async function previewAudit(sessionId: string): Promise<AuditPreview> {
  const d = db();
  const s = await d.sessions.get(sessionId);
  if (!s) throw new InventoryError('Session not found');
  const loc = await d.locations.get(s.location);
  const countedIds = new Set(s.lines.map((l) => l.itemId));
  const here = await d.balances.where('location').equals(s.location).toArray();
  const notCounted: AuditPreview['notCounted'] = [];
  for (const b of here) {
    if (b.qty > 0 && !countedIds.has(b.itemId)) {
      const item = await d.items.get(b.itemId);
      if (item) notCounted.push({ item, qty: b.qty });
    }
  }
  const herePrev = new Map(here.map((b) => [b.itemId, b]));
  const homeAbsent: Item[] = [];
  for (const set of loc?.setHomes ?? []) {
    const items = await d.items.where('setName').equals(set).toArray();
    for (const it of items) {
      // Only cards TCGplayer claims exist, that weren't counted, and have no balance here already.
      if (it.marketplaceQty > 0 && !countedIds.has(it.id) && !herePrev.has(it.id)) homeAbsent.push(it);
    }
  }
  homeAbsent.sort((a, b) => a.productName.localeCompare(b.productName));
  return { session: s, notCounted, homeAbsent };
}

export interface FinishAuditOptions {
  /** Previously-recorded cards here that were not counted: true = they are not here (→ MISSING). */
  markNotCountedMissing: boolean;
  /** Set-home cards TCGplayer lists that weren't counted: true = confirmed absent (count 0). */
  confirmHomeAbsent: boolean;
}

export async function finishAudit(sessionId: string, opts: FinishAuditOptions): Promise<AuditResult> {
  const preview = await previewAudit(sessionId);
  const s = preview.session;
  if (s.endedAt !== null) throw new InventoryError('Audit already finished');
  const d = db();
  let movedToMissing = 0;
  let confirmedAbsent = 0;

  return inventoryTx(async () => {
    const fresh = await d.sessions.get(sessionId);
    if (!fresh || fresh.endedAt !== null) throw new InventoryError('Audit already finished');
    for (const l of s.lines) await setCount(l.itemId, s.location, l.qty, s.id);
    if (opts.markNotCountedMissing) {
      for (const n of preview.notCounted) {
        await moveToMissing(n.item.id, s.location, n.qty, `not found during audit of ${s.location}`, s.id);
        movedToMissing += n.qty;
      }
    }
    if (opts.confirmHomeAbsent) {
      for (const it of preview.homeAbsent) {
        await setCount(it.id, s.location, 0, s.id); // a counted zero: evidence of absence
        confirmedAbsent++;
      }
    }

    // Discrepancies against TCGplayer for the cards this audit touched.
    const [locations, problems] = await Promise.all([d.locations.toArray(), d.problems.toArray()]);
    const homes = homesBySet(locations);
    const touched = new Set([
      ...s.lines.map((l) => l.itemId),
      ...(opts.confirmHomeAbsent ? preview.homeAbsent.map((i) => i.id) : []),
      ...(opts.markNotCountedMissing ? preview.notCounted.map((n) => n.item.id) : []),
    ]);
    let discrepancies = 0;
    let pending = 0;
    let unlisted = 0;
    for (const id of touched) {
      const item = await d.items.get(id);
      if (!item) continue;
      const v = itemView(item, await d.balances.where('itemId').equals(id).toArray(), homes, problems);
      if (item.unlisted) unlisted++;
      if (v.status === 'unverified') pending++;
      else if (v.status === 'needs-review' || v.physical !== item.marketplaceQty) discrepancies++;
    }
    const result: AuditResult = {
      cardsCounted: s.lines.reduce((a, l) => a + l.qty, 0),
      skusCounted: s.lines.length,
      discrepancies,
      confirmedAbsent,
      movedToMissing,
      pending,
      unlisted,
      activeMs: activeMs(s.taps),
    };
    await d.sessions.put({ ...s, endedAt: Date.now(), result });
    return result;
  }, ['sessions']);
}

/** Abandon an audit without applying any counts. */
export async function discardAudit(sessionId: string): Promise<void> {
  const d = db();
  const s = await d.sessions.get(sessionId);
  if (!s || s.mode !== 'audit' || s.endedAt !== null) throw new InventoryError('Not an open audit');
  await d.sessions.delete(sessionId);
}

export async function currentQty(itemId: string, location: string): Promise<number> {
  return (await db().balances.get(balanceKey(itemId, location)))?.qty ?? 0;
}
