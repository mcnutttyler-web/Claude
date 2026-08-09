export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const path = await import("node:path");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const { db } = await import("./lib/db/client");
  const { seedConditionSuffixes } = await import("./lib/matching");

  migrate(db, { migrationsFolder: path.join(process.cwd(), "lib", "db", "migrations") });
  seedConditionSuffixes();
}
