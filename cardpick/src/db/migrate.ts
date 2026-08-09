import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db, rawSqlite } from "./client";
import { seedDefaults } from "./seed";

let migrated = false;

export function ensureMigrated() {
  if (migrated) return;
  migrate(db, { migrationsFolder: "./drizzle" });
  seedDefaults();
  migrated = true;
}

if (require.main === module) {
  ensureMigrated();
  console.log("Migrated. WAL mode:", rawSqlite.pragma("journal_mode"));
}
