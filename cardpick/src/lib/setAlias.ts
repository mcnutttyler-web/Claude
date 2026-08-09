import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { setAlias } from "@/db/schema";

export function resolveSetAlias(code: string): string | null {
  const row = db
    .select({ fullName: setAlias.fullName })
    .from(setAlias)
    .where(eq(sql`lower(${setAlias.alias})`, code.trim().toLowerCase()))
    .get();
  return row?.fullName ?? null;
}

/** Grows the alias table as new set-code/full-name pairs are observed in imports. */
export function recordSetAlias(code: string, fullName: string) {
  if (!code.trim() || !fullName.trim()) return;
  db.insert(setAlias)
    .values({ alias: code.trim(), fullName: fullName.trim() })
    .onConflictDoNothing({ target: setAlias.alias })
    .run();
}
