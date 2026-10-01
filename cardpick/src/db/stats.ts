import { db } from './db';
import { activeMs, perHour, type ExperimentStats } from '../domain/metrics';
import { MISSING } from '../domain/types';

export async function experimentStats(): Promise<ExperimentStats> {
  const sessions = (await db().sessions.where('mode').equals('audit').toArray()).filter((s) => s.result);
  const s: ExperimentStats = {
    cardsAudited: 0,
    skusAudited: 0,
    activeMs: 0,
    cardsPerHour: null,
    discrepantSkus: 0,
    discrepancyRate: null,
    unlistedSkus: 0,
    sessions: sessions.length,
  };
  let judged = 0;
  for (const x of sessions) {
    const r = x.result!;
    s.cardsAudited += r.cardsCounted;
    s.skusAudited += r.skusCounted + r.confirmedAbsent;
    s.activeMs += r.activeMs;
    s.discrepantSkus += r.discrepancies;
    s.unlistedSkus += r.unlisted;
    judged += r.skusCounted + r.confirmedAbsent - r.pending;
  }
  s.cardsPerHour = perHour(s.cardsAudited, s.activeMs);
  s.discrepancyRate = judged > 0 ? s.discrepantSkus / judged : null;
  return s;
}

export interface PutawayStats {
  cards: number;
  activeMs: number;
  per100Ms: number | null;
}

export async function putawayStats(): Promise<PutawayStats> {
  const sessions = await db().sessions.where('mode').equals('putaway').toArray();
  let cards = 0;
  let ms = 0;
  for (const s of sessions) {
    cards += s.lines.reduce((a, l) => a + l.qty, 0);
    ms += activeMs(s.taps);
  }
  return { cards, activeMs: ms, per100Ms: cards > 1 ? (ms / cards) * 100 : null };
}

export interface PickStats {
  batches: number;
  orders: number;
  cardsPicked: number;
  shortTasks: number;
  avgStops: number | null;
  avgBatchMs: number | null;
}

export async function pickStats(): Promise<PickStats> {
  const batches = (await db().batches.toArray()).filter((b) => b.completedAt !== null);
  const st: PickStats = { batches: batches.length, orders: 0, cardsPicked: 0, shortTasks: 0, avgStops: null, avgBatchMs: null };
  let stops = 0;
  let ms = 0;
  for (const b of batches) {
    st.orders += b.orderIds.length;
    st.cardsPicked += b.tasks.reduce((s, t) => s + (t.found ?? 0), 0);
    st.shortTasks += b.tasks.filter((t) => (t.found ?? 0) < t.qty).length;
    stops += new Set(b.tasks.map((t) => t.location)).size;
    ms += activeMs(b.taps);
  }
  if (batches.length) {
    st.avgStops = stops / batches.length;
    st.avgBatchMs = ms / batches.length;
  }
  return st;
}

export interface InventoryOverview {
  skusListed: number;
  marketplaceUnits: number;
  physicalUnits: number;
  missingUnits: number;
  skusCounted: number;
  /** Share of TCGplayer-listed units belonging to SKUs that have physical evidence. */
  pctListedWithEvidence: number | null;
}

export async function inventoryOverview(): Promise<InventoryOverview> {
  const d = db();
  const [items, balances] = await Promise.all([d.items.toArray(), d.balances.toArray()]);
  const counted = new Set(balances.filter((b) => b.countedAt !== null && b.location !== MISSING).map((b) => b.itemId));
  let marketplaceUnits = 0;
  let evidenced = 0;
  let skusListed = 0;
  for (const i of items) {
    if (i.marketplaceQty > 0) {
      skusListed++;
      marketplaceUnits += i.marketplaceQty;
      if (counted.has(i.id)) evidenced += i.marketplaceQty;
    }
  }
  return {
    skusListed,
    marketplaceUnits,
    physicalUnits: balances.filter((b) => b.location !== MISSING).reduce((s, b) => s + b.qty, 0),
    missingUnits: balances.filter((b) => b.location === MISSING).reduce((s, b) => s + b.qty, 0),
    skusCounted: counted.size,
    pctListedWithEvidence: marketplaceUnits ? evidenced / marketplaceUnits : null,
  };
}
