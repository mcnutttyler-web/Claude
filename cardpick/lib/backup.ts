import fs from "node:fs";
import path from "node:path";
import { rawDb, reconnect, dbPath } from "./db/client";

const BACKUP_DIR = process.env.CARDPICK_BACKUP_DIR ?? path.join(process.cwd(), "backups");
const MAX_SNAPSHOTS = 20;

function timestamp(): string {
  const d = new Date();
  const pad = (n: number, len = 2) => n.toString().padStart(len, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}${pad(d.getMilliseconds(), 3)}`;
}

/** Snapshot the live DB via VACUUM INTO, then prune to the most recent MAX_SNAPSHOTS. */
export function snapshotDatabase(reason: string): string {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const filename = `cardpick-${timestamp()}.db`;
  const fullPath = path.join(BACKUP_DIR, filename);
  rawDb.exec(`VACUUM INTO '${fullPath.replace(/'/g, "''")}'`);
  pruneSnapshots();
  void reason; // reason is caller-supplied context for logging/history, not stored on disk
  return fullPath;
}

export function listSnapshots(): { filename: string; path: string; sizeBytes: number; mtime: Date }[] {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith(".db"))
    .map((f) => {
      const p = path.join(BACKUP_DIR, f);
      const stat = fs.statSync(p);
      return { filename: f, path: p, sizeBytes: stat.size, mtime: stat.mtime };
    })
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
}

function pruneSnapshots() {
  const snapshots = listSnapshots();
  for (const snap of snapshots.slice(MAX_SNAPSHOTS)) {
    fs.unlinkSync(snap.path);
  }
}

/** Restore from a snapshot file. Caller must have already confirmed via the
 * "type RESTORE" UI gate. A pre-restore snapshot of current state is always
 * taken first so the restore itself is undoable. */
export function restoreFromSnapshot(snapshotPath: string): void {
  if (!fs.existsSync(snapshotPath)) {
    throw new Error(`Snapshot not found: ${snapshotPath}`);
  }
  snapshotDatabase("pre-restore");
  rawDb.close();
  for (const ext of ["", "-wal", "-shm"]) {
    const sidecar = dbPath + ext;
    if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar);
  }
  fs.copyFileSync(snapshotPath, dbPath);
  reconnect();
}
