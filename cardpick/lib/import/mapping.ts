import { createHash } from "node:crypto";
import { parseMoneyToCents } from "../money";

export type ImportKind = "INVENTORY" | "ORDER" | "RECONCILE";

export interface FieldDef {
  key: string;
  label: string;
  required: boolean;
  type: "string" | "money" | "int" | "date";
  /** Lowercase substrings used only to *suggest* a default mapping. Never
   * relied on for correctness — the user confirms/edits every mapping, and
   * the confirmed mapping is what gets saved as the profile. */
  guessHints: string[];
}

export const INVENTORY_FIELDS: FieldDef[] = [
  { key: "tcgplayerProductId", label: "TCGplayer Product ID", required: false, type: "string", guessHints: ["product id", "tcgplayer id", "product_id"] },
  { key: "tcgplayerSkuId", label: "TCGplayer SKU ID", required: false, type: "string", guessHints: ["sku"] },
  { key: "name", label: "Card / Product Name", required: true, type: "string", guessHints: ["product name", "name", "title"] },
  { key: "setName", label: "Set Name", required: true, type: "string", guessHints: ["set name", "set"] },
  { key: "setCode", label: "Set Code", required: false, type: "string", guessHints: ["set code", "edition"] },
  { key: "cardNumber", label: "Card Number", required: false, type: "string", guessHints: ["number", "card number", "collector number"] },
  { key: "rawCondition", label: "Condition (may include printing, e.g. \"Near Mint Foil\")", required: true, type: "string", guessHints: ["condition"] },
  { key: "marketPrice", label: "Market Price", required: false, type: "money", guessHints: ["market price", "tcg market price"] },
  { key: "quantity", label: "Quantity", required: false, type: "int", guessHints: ["quantity", "total quantity", "qty"] },
];

export const ORDER_FIELDS: FieldDef[] = [
  { key: "externalOrderId", label: "Order ID", required: true, type: "string", guessHints: ["order #", "order number", "order id"] },
  { key: "name", label: "Card / Product Name", required: true, type: "string", guessHints: ["product name", "name", "title"] },
  { key: "setName", label: "Set Name", required: false, type: "string", guessHints: ["set name", "set"] },
  { key: "cardNumber", label: "Card Number", required: false, type: "string", guessHints: ["number", "card number"] },
  { key: "rawCondition", label: "Condition (may include printing)", required: false, type: "string", guessHints: ["condition"] },
  { key: "tcgplayerSkuId", label: "TCGplayer SKU ID (often absent on order exports)", required: false, type: "string", guessHints: ["sku"] },
  { key: "quantity", label: "Quantity", required: true, type: "int", guessHints: ["quantity", "qty"] },
  { key: "shipBy", label: "Ship By Date", required: false, type: "date", guessHints: ["ship by", "ship date"] },
];

export const RECONCILE_FIELDS: FieldDef[] = INVENTORY_FIELDS;

export function fieldsForKind(kind: ImportKind): FieldDef[] {
  if (kind === "ORDER") return ORDER_FIELDS;
  if (kind === "RECONCILE") return RECONCILE_FIELDS;
  return INVENTORY_FIELDS;
}

/** A stable signature for a header set, independent of column order, so the
 * same file "shape" auto-applies a previously-saved mapping profile. */
export function computeShapeSignature(headers: string[]): string {
  const normalized = headers.map((h) => h.trim().toLowerCase()).sort();
  return createHash("sha256").update(normalized.join("|")).digest("hex");
}

export type FieldMapping = Record<string, string | null>;

export function guessMapping(headers: string[], fields: FieldDef[]): FieldMapping {
  const mapping: FieldMapping = {};
  const lowerHeaders = headers.map((h) => ({ raw: h, lower: h.trim().toLowerCase() }));
  for (const field of fields) {
    const exact = lowerHeaders.find((h) => h.lower === field.label.toLowerCase());
    const hinted = lowerHeaders.find((h) => field.guessHints.some((hint) => h.lower.includes(hint)));
    mapping[field.key] = exact?.raw ?? hinted?.raw ?? null;
  }
  return mapping;
}

export function validateMapping(mapping: FieldMapping, fields: FieldDef[]): string[] {
  const errors: string[] = [];
  for (const field of fields) {
    if (field.required && !mapping[field.key]) {
      errors.push(`"${field.label}" must be mapped to a column.`);
    }
  }
  return errors;
}

export type MappedRow = Record<string, string | number | null>;

export function applyMapping(
  row: Record<string, string>,
  mapping: FieldMapping,
  fields: FieldDef[]
): MappedRow {
  const out: MappedRow = {};
  for (const field of fields) {
    const header = mapping[field.key];
    const rawValue = header != null ? row[header] ?? "" : "";
    if (field.type === "money") {
      out[field.key] = parseMoneyToCents(rawValue);
    } else if (field.type === "int") {
      const cleaned = rawValue.replace(/[,\s]/g, "");
      out[field.key] = cleaned === "" ? null : Number.parseInt(cleaned, 10);
    } else {
      out[field.key] = rawValue.trim() === "" ? null : rawValue.trim();
    }
  }
  return out;
}
