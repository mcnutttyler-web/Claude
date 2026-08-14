import { randomUUID } from "node:crypto";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

/** Point the app at a fresh throwaway SQLite file and run migrations against
 * it. Must be called before importing anything from lib/db/client (or
 * anything that transitively imports it) in a given test file. */
export function setupTestDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cardpick-test-"));
  process.env.CARDPICK_DB_PATH = path.join(dir, `${randomUUID()}.db`);
  process.env.CARDPICK_BACKUP_DIR = path.join(dir, "backups");
}

export async function migrateTestDb() {
  const { db } = await import("../lib/db/client");
  migrate(db, { migrationsFolder: path.join(process.cwd(), "lib", "db", "migrations") });
}
