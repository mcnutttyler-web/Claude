import Dexie, { type Table } from 'dexie';
import type {
  AuditSession,
  Balance,
  Item,
  LedgerEntry,
  Location,
  Meta,
  Order,
  PickBatch,
  Problem,
  Snapshot,
} from '../domain/types';

export class CardPickDB extends Dexie {
  items!: Table<Item, string>;
  locations!: Table<Location, string>;
  balances!: Table<Balance, string>;
  ledger!: Table<LedgerEntry, number>;
  problems!: Table<Problem, string>;
  sessions!: Table<AuditSession, string>;
  orders!: Table<Order, string>;
  batches!: Table<PickBatch, string>;
  meta!: Table<Meta, string>;
  snapshots!: Table<Snapshot, number>;

  constructor(name = 'cardpick') {
    super(name);
    // Schema changes must add a new version() with an upgrade, never edit v1.
    this.version(1).stores({
      items: 'id, setName, productName',
      locations: 'code, kind',
      balances: 'key, itemId, location',
      ledger: '++id, itemId, location, at, type, ref',
      problems: 'id, status, type, itemId',
      sessions: 'id, mode, startedAt',
      orders: 'id, status',
      batches: 'id, createdAt',
      meta: 'key',
      snapshots: '++id, at',
    });
  }
}

/** Tables that make up a backup (everything except snapshots). */
export const DATA_TABLES = [
  'items',
  'locations',
  'balances',
  'ledger',
  'problems',
  'sessions',
  'orders',
  'batches',
  'meta',
] as const;
export type DataTable = (typeof DATA_TABLES)[number];

let current: CardPickDB | null = null;

export function db(): CardPickDB {
  if (!current) current = new CardPickDB();
  return current;
}

/** Tests use a fresh database per case. */
export function useDatabase(instance: CardPickDB): void {
  current = instance;
}

export function uid(prefix = ''): string {
  const r = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return prefix + r;
}

export const balanceKey = (itemId: string, location: string) => `${itemId}|${location}`;

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const m = await db().meta.get(key);
  return m ? (m.value as T) : fallback;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db().meta.put({ key, value });
}
