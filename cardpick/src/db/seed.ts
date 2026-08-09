import { db } from "./client";
import { pricingSettings, appSettings, setAlias, location } from "./schema";
import { sql } from "drizzle-orm";
import { UNASSIGNED_LOCATION_CODE } from "../lib/constants";

const DEFAULT_SET_ALIASES: Array<[string, string]> = [
  ["MEW", "Pokémon 151"],
  ["OBF", "Obsidian Flames"],
  ["SVI", "Scarlet & Violet Base Set"],
];

export function seedDefaults() {
  const pricingCount = db
    .select({ c: sql<number>`count(*)` })
    .from(pricingSettings)
    .get();
  if (!pricingCount || pricingCount.c === 0) {
    db.insert(pricingSettings).values({}).run();
  }

  const appCount = db
    .select({ c: sql<number>`count(*)` })
    .from(appSettings)
    .get();
  if (!appCount || appCount.c === 0) {
    db.insert(appSettings).values({}).run();
  }

  for (const [alias, fullName] of DEFAULT_SET_ALIASES) {
    db.insert(setAlias)
      .values({ alias, fullName })
      .onConflictDoNothing({ target: setAlias.alias })
      .run();
  }

  // Sentinel "no location yet" bucket. Kind LEGACY so it has no capacity
  // limits and is excluded from location suggestions, matching how the
  // spec treats legacy/overflow locations.
  db.insert(location)
    .values({
      code: UNASSIGNED_LOCATION_CODE,
      kind: "LEGACY",
      notes: "Default holding location for freshly imported stock.",
    })
    .onConflictDoNothing({ target: location.code })
    .run();
}
