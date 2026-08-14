import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import { db, rawDb } from "./client";

migrate(db, { migrationsFolder: path.join(process.cwd(), "lib", "db", "migrations") });
console.log(`Migrations applied to ${rawDb.name}`);
