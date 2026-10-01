import { DATA_TABLES, db, setMeta, type DataTable } from './db';
import { integrityOf } from './inventory';
import type { Balance, LedgerEntry, Problem } from '../domain/types';

export const BACKUP_APP = 'cardpick';
export const BACKUP_VERSION = 1;
const KEEP_SNAPSHOTS = 10;

export interface BackupFile {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: number;
  counts: Record<string, number>;
  tables: Record<DataTable, unknown[]>;
}

export async function buildBackup(): Promise<BackupFile> {
  const d = db();
  const tables = {} as Record<DataTable, unknown[]>;
  const counts: Record<string, number> = {};
  await d.transaction('r', DATA_TABLES.map((t) => d[t]), async () => {
    for (const t of DATA_TABLES) {
      tables[t] = await d[t].toArray();
      counts[t] = tables[t].length;
    }
  });
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: Date.now(), counts, tables };
}

export async function exportBackup(): Promise<string> {
  const b = await buildBackup();
  await setMeta('lastBackupAt', b.exportedAt);
  return JSON.stringify(b);
}

export function validateBackup(text: string): { ok: true; backup: BackupFile } | { ok: false; error: string } {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Not a valid JSON file' };
  }
  const b = obj as Partial<BackupFile>;
  if (!b || b.app !== BACKUP_APP) return { ok: false, error: 'Not a CardPick backup' };
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) {
    return { ok: false, error: `Backup version ${String(b.version)} is newer than this app understands` };
  }
  if (!b.tables) return { ok: false, error: 'Backup has no data' };
  for (const t of DATA_TABLES) {
    if (!Array.isArray(b.tables[t])) return { ok: false, error: `Backup is missing table "${t}"` };
    if (b.counts && b.counts[t] !== undefined && b.counts[t] !== b.tables[t].length) {
      return { ok: false, error: `Backup table "${t}" is truncated` };
    }
  }
  const rep = integrityOf(
    b.tables.balances as Balance[],
    b.tables.ledger as LedgerEntry[],
    b.tables.problems as Problem[],
  );
  if (!rep.ok) return { ok: false, error: `Backup fails integrity check: ${rep.problems[0]}` };
  return { ok: true, backup: b as BackupFile };
}

/** Replace all data with a validated backup. A snapshot of current data is taken first. */
export async function restoreBackup(text: string): Promise<BackupFile> {
  const v = validateBackup(text);
  if (!v.ok) throw new Error(v.error);
  await takeSnapshot('before restore');
  const d = db();
  await d.transaction('rw', DATA_TABLES.map((t) => d[t]), async () => {
    for (const t of DATA_TABLES) {
      await d[t].clear();
      await (d[t] as any).bulkPut(v.backup.tables[t]);
    }
  });
  return v.backup;
}

/** In-browser safety copy before risky operations (imports, restores, links). */
export async function takeSnapshot(reason: string): Promise<void> {
  const b = await buildBackup();
  const d = db();
  await d.snapshots.add({ at: b.exportedAt, reason, data: JSON.stringify(b) });
  const all = await d.snapshots.orderBy('at').primaryKeys();
  const excess = all.length - KEEP_SNAPSHOTS;
  if (excess > 0) await d.snapshots.bulkDelete(all.slice(0, excess));
}

export async function listSnapshots() {
  return (await db().snapshots.orderBy('at').reverse().toArray()).map((s) => ({ id: s.id!, at: s.at, reason: s.reason, size: s.data.length }));
}

export async function restoreSnapshot(id: number): Promise<void> {
  const s = await db().snapshots.get(id);
  if (!s) throw new Error('Snapshot not found');
  await restoreBackup(s.data);
}
