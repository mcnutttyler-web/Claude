import { and, eq } from "drizzle-orm";
import { db } from "./db/client";
import { conditionSuffix, inventoryItem, setAlias } from "./db/schema";
import type { InferSelectModel } from "drizzle-orm";

type InventoryItemRow = InferSelectModel<typeof inventoryItem>;

/** lowercase, trim, collapse internal whitespace, strip punctuation except digits and "/" */
export function normalize(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}/\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export const BASE_CONDITIONS: { label: string; code: string }[] = [
  { label: "Near Mint", code: "NM" },
  { label: "Lightly Played", code: "LP" },
  { label: "Moderately Played", code: "MP" },
  { label: "Heavily Played", code: "HP" },
  { label: "Damaged", code: "DMG" },
  { label: "Unopened", code: "UNOPENED" },
].sort((a, b) => b.label.length - a.label.length);

export const DEFAULT_CONDITION_SUFFIXES: { suffix: string; printingCode: string }[] = [
  { suffix: "", printingCode: "NORMAL" },
  { suffix: "Foil", printingCode: "FOIL" },
  { suffix: "Holofoil", printingCode: "HOLOFOIL" },
  { suffix: "Reverse Holofoil", printingCode: "REVERSE_HOLOFOIL" },
  { suffix: "1st Edition", printingCode: "FIRST_EDITION" },
  { suffix: "1st Edition Holofoil", printingCode: "FIRST_EDITION_HOLOFOIL" },
  { suffix: "Unlimited", printingCode: "UNLIMITED" },
  { suffix: "Unlimited Holofoil", printingCode: "UNLIMITED_HOLOFOIL" },
  { suffix: "Shadowless", printingCode: "SHADOWLESS" },
  { suffix: "Shadowless Holofoil", printingCode: "SHADOWLESS_HOLOFOIL" },
];

/** Ensure the default condition-suffix lookups exist in the DB (idempotent). */
export function seedConditionSuffixes() {
  for (const { suffix, printingCode } of DEFAULT_CONDITION_SUFFIXES) {
    const existing = db.select().from(conditionSuffix).where(eq(conditionSuffix.suffix, suffix)).get();
    if (!existing) {
      db.insert(conditionSuffix).values({ suffix, printingCode }).run();
    }
  }
}

function printingCodeToLabel(code: string): string {
  return code
    .toLowerCase()
    .split("_")
    .map((w) => (w === "1st" ? "1st" : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/**
 * TCGplayer fuses printing into the condition string, e.g.
 * "Near Mint Foil", "Lightly Played Reverse Holofoil". Split the known base
 * condition off the front and resolve the remainder (the printing suffix)
 * against the condition_suffix lookup table, growing the table with any
 * suffix we haven't seen before.
 */
export function splitConditionAndPrinting(rawCondition: string): {
  conditionCode: string;
  conditionLabel: string;
  printingCode: string;
  printingLabel: string;
} {
  const trimmed = (rawCondition ?? "").trim();
  const base = BASE_CONDITIONS.find((c) =>
    trimmed.toLowerCase().startsWith(c.label.toLowerCase())
  );

  const conditionLabel = base?.label ?? trimmed;
  const conditionCode = base?.code ?? (normalize(trimmed).toUpperCase().replace(/\s+/g, "_") || "UNKNOWN");
  const suffix = base ? trimmed.slice(base.label.length).trim() : "";

  let row = db.select().from(conditionSuffix).where(eq(conditionSuffix.suffix, suffix)).get();
  if (!row) {
    const printingCode = suffix === "" ? "NORMAL" : suffix.toUpperCase().replace(/\s+/g, "_");
    db.insert(conditionSuffix).values({ suffix, printingCode }).run();
    row = { id: 0, suffix, printingCode, createdAt: "" };
  }

  return {
    conditionCode,
    conditionLabel,
    printingCode: row.printingCode,
    printingLabel: printingCodeToLabel(row.printingCode),
  };
}

/** Resolve a set abbreviation/alias to its canonical full name, if known. */
export function resolveSetAlias(rawSetName: string): string {
  const trimmed = (rawSetName ?? "").trim();
  const row = db.select().from(setAlias).where(eq(setAlias.alias, trimmed)).get();
  return row ? row.fullName : trimmed;
}

/** Record a newly-seen set alias -> full name mapping (no-op if it already exists). */
export function recordSetAlias(alias: string, fullName: string) {
  if (!alias || alias === fullName) return;
  const existing = db.select().from(setAlias).where(eq(setAlias.alias, alias)).get();
  if (!existing) {
    db.insert(setAlias).values({ alias, fullName }).run();
  }
}

export interface MatchKeyInput {
  name: string;
  setName: string;
  cardNumber: string;
  conditionCode: string;
  printingCode: string;
}

export function buildMatchKey(input: MatchKeyInput): string {
  return [
    normalize(input.name),
    normalize(input.setName),
    normalize(input.cardNumber),
    input.conditionCode,
    input.printingCode,
  ].join("|");
}

export type MatchResult =
  | { status: "MATCHED"; item: InventoryItemRow; tier: 1 | 2 | 3 }
  | { status: "AMBIGUOUS"; candidates: InventoryItemRow[]; tier: 1 | 2 | 3 }
  | { status: "NEW" };

export interface MatchCandidateInput {
  tcgplayerSkuId?: string | null;
  tcgplayerProductId?: string | null;
  conditionCode: string;
  printingCode: string;
  matchKey: string;
}

/**
 * Resolve a candidate against existing inventory in strict priority order,
 * stopping at the first tier that produces any hit:
 *   1. tcgplayer_sku_id exact
 *   2. tcgplayer_product_id + condition + printing
 *   3. match_key exact
 * A tier returning >1 row is ambiguous and must never be auto-resolved.
 */
export function matchInventoryItem(input: MatchCandidateInput): MatchResult {
  if (input.tcgplayerSkuId) {
    const rows = db
      .select()
      .from(inventoryItem)
      .where(eq(inventoryItem.tcgplayerSkuId, input.tcgplayerSkuId))
      .all();
    if (rows.length === 1) return { status: "MATCHED", item: rows[0], tier: 1 };
    if (rows.length > 1) return { status: "AMBIGUOUS", candidates: rows, tier: 1 };
  }

  if (input.tcgplayerProductId) {
    const rows = db
      .select()
      .from(inventoryItem)
      .where(
        and(
          eq(inventoryItem.tcgplayerProductId, input.tcgplayerProductId),
          eq(inventoryItem.condition, input.conditionCode),
          eq(inventoryItem.printing, input.printingCode)
        )
      )
      .all();
    if (rows.length === 1) return { status: "MATCHED", item: rows[0], tier: 2 };
    if (rows.length > 1) return { status: "AMBIGUOUS", candidates: rows, tier: 2 };
  }

  const rows = db.select().from(inventoryItem).where(eq(inventoryItem.matchKey, input.matchKey)).all();
  if (rows.length === 1) return { status: "MATCHED", item: rows[0], tier: 3 };
  if (rows.length > 1) return { status: "AMBIGUOUS", candidates: rows, tier: 3 };

  return { status: "NEW" };
}
