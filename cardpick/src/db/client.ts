import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema";

const DB_PATH = process.env.CARDPICK_DB_PATH ?? "./data/cardpick.db";
export const DB_FILE_PATH = path.resolve(DB_PATH);

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

declare global {
  // eslint-disable-next-line no-var
  var __cardpickSqlite: Database.Database | undefined;
}

function openSqlite(): Database.Database {
  const instance = new Database(DB_PATH);
  instance.pragma("journal_mode = WAL");
  instance.pragma("foreign_keys = ON");
  return instance;
}

let currentSqlite = global.__cardpickSqlite ?? openSqlite();
let currentDb = drizzle(currentSqlite, { schema });

if (process.env.NODE_ENV !== "production") {
  global.__cardpickSqlite = currentSqlite;
}

/**
 * Restore replaces the underlying db file on disk while this long-running
 * process is still up. Rather than requiring a process restart, every
 * consumer imports the `db`/`rawSqlite` Proxies below, which always
 * forward to whatever connection is "current" — reopenDatabase() swaps it.
 */
export function reopenDatabase() {
  try {
    currentSqlite.close();
  } catch {
    // already closed
  }
  currentSqlite = openSqlite();
  currentDb = drizzle(currentSqlite, { schema });
  if (process.env.NODE_ENV !== "production") {
    global.__cardpickSqlite = currentSqlite;
  }
}

export const db: BetterSQLite3Database<typeof schema> = new Proxy(
  {} as BetterSQLite3Database<typeof schema>,
  {
    get(_target, prop, receiver) {
      const value = Reflect.get(currentDb as object, prop, receiver);
      return typeof value === "function" ? value.bind(currentDb) : value;
    },
  },
);

export const rawSqlite: Database.Database = new Proxy({} as Database.Database, {
  get(_target, prop, receiver) {
    const value = Reflect.get(currentSqlite as object, prop, receiver);
    return typeof value === "function" ? value.bind(currentSqlite) : value;
  },
});
