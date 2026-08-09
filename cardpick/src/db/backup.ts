import fs from "node:fs";
import path from "node:path";
import { rawSqlite, DB_FILE_PATH, reopenDatabase } from "./client";

const BACKUP_DIR = process.env.CARDPICK_BACKUP_DIR ?? "./backups";
const RETAIN_COUNT = 20;

function ensureBackupDir() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  return BACKUP_DIR;
}

function timestamp() {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 6);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(
    d.getHours(),
  )}${pad(d.getMinutes())}${pad(d.getSeconds())}-${pad(d.getMilliseconds() % 1000)}-${rand}`;
}

/**
 * Snapshot the live database via VACUUM INTO. Safe to call while the app is
 * open elsewhere (WAL mode). Prunes to the most recent RETAIN_COUNT backups.
 */
export function snapshot(label?: string): string {
  const dir = ensureBackupDir();
  const name = `cardpick-${timestamp()}${label ? `-${label}` : ""}.db`;
  const dest = path.join(dir, name);
  rawSqlite.pragma("wal_checkpoint(TRUNCATE)");
  rawSqlite.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
  pruneOldBackups(dir);
  return dest;
}

function pruneOldBackups(dir: string) {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("cardpick-") && f.endsWith(".db"))
    .map((f) => ({ f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  for (const { f } of files.slice(RETAIN_COUNT)) {
    fs.unlinkSync(path.join(dir, f));
  }
}

export function listBackups(): Array<{ name: string; sizeBytes: number; createdAt: string }> {
  const dir = ensureBackupDir();
  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("cardpick-") && f.endsWith(".db"))
    .map((f) => {
      const stat = fs.statSync(path.join(dir, f));
      return { name: f, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/**
 * Restore from a named backup file. Takes a safety snapshot of the current
 * state first. Caller is responsible for requiring the "RESTORE"
 * confirmation phrase before invoking this.
 */
export function restoreFromBackup(name: string): { preRestoreSnapshot: string } {
  const dir = ensureBackupDir();
  const src = path.join(dir, name);
  if (!fs.existsSync(src)) {
    throw new Error(`Backup not found: ${name}`);
  }
  const preRestoreSnapshot = snapshot("pre-restore");

  rawSqlite.pragma("wal_checkpoint(TRUNCATE)");
  // Close before overwriting so the copy isn't racing an open WAL writer.
  rawSqlite.close();
  fs.copyFileSync(src, DB_FILE_PATH);
  for (const ext of ["-wal", "-shm"]) {
    const sidecar = `${DB_FILE_PATH}${ext}`;
    if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar);
  }
  reopenDatabase();

  return { preRestoreSnapshot };
}
