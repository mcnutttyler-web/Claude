import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema";

export const dbPath = process.env.CARDPICK_DB_PATH ?? path.join(process.cwd(), "data", "cardpick.db");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

declare global {
  var __cardpickSqlite: Database.Database | undefined;
}

function open(): Database.Database {
  const instance = new Database(dbPath);
  instance.pragma("journal_mode = WAL");
  instance.pragma("foreign_keys = ON");
  return instance;
}

if (!global.__cardpickSqlite) {
  global.__cardpickSqlite = open();
}

export let rawDb: Database.Database = global.__cardpickSqlite;
export let db: BetterSQLite3Database<typeof schema> = drizzle(rawDb, { schema });

/** Close the current connection and reopen against the file on disk — used
 * after a restore replaces the underlying .db file out from under us.
 * Reassigns the live `db`/`rawDb` bindings (ESM live bindings propagate this
 * to every module that imported them). */
export function reconnect() {
  try {
    rawDb.close();
  } catch {
    // already closed
  }
  rawDb = open();
  global.__cardpickSqlite = rawDb;
  db = drizzle(rawDb, { schema });
}
