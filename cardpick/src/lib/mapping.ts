/**
 * Canonical fields CardPick needs, independent of whatever header text a
 * given TCGplayer export happens to use. A mapping profile is just
 * { [canonicalField]: sourceHeaderName | null }, chosen once by the user
 * per CSV shape and reused automatically after that (see shapeSignature).
 */

export interface FieldDef {
  key: string;
  label: string;
  required: boolean;
  hint?: string;
}

export const INVENTORY_IMPORT_FIELDS: FieldDef[] = [
  { key: "tcgplayerProductId", label: "TCGplayer Product ID", required: false },
  { key: "tcgplayerSkuId", label: "TCGplayer SKU ID", required: false },
  { key: "name", label: "Card Name", required: true },
  { key: "setName", label: "Set Name", required: true },
  { key: "setCode", label: "Set Code / Abbreviation", required: false },
  { key: "cardNumber", label: "Card Number", required: false },
  {
    key: "conditionRaw",
    label: "Condition (may include printing, e.g. \"Near Mint Foil\")",
    required: true,
  },
  { key: "marketPrice", label: "Market Price", required: false },
  { key: "quantity", label: "Quantity", required: false },
];

export const ORDER_IMPORT_FIELDS: FieldDef[] = [
  { key: "orderId", label: "Order Number / ID", required: true },
  { key: "lineIndex", label: "Line Number (if present)", required: false },
  { key: "name", label: "Card Name", required: true },
  { key: "setName", label: "Set Name", required: false },
  { key: "cardNumber", label: "Card Number", required: false },
  { key: "conditionRaw", label: "Condition (may include printing)", required: false },
  { key: "tcgplayerSkuId", label: "TCGplayer SKU ID", required: false },
  { key: "quantity", label: "Quantity", required: true },
  { key: "shipBy", label: "Ship By Date", required: false },
];

export const EXPORT_FIELDS: FieldDef[] = [
  { key: "tcgplayerSkuId", label: "TCGplayer SKU ID", required: true },
  { key: "tcgplayerProductId", label: "TCGplayer Product ID", required: false },
  { key: "sellPrice", label: "Price", required: true },
  { key: "quantity", label: "Quantity", required: false },
];

export type ColumnMap = Record<string, string | null>;

export function applyMapping(
  row: Record<string, string>,
  columnMap: ColumnMap,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [field, header] of Object.entries(columnMap)) {
    out[field] = header ? (row[header] ?? "") : "";
  }
  return out;
}

export function validateMapping(fields: FieldDef[], columnMap: ColumnMap): string[] {
  const errors: string[] = [];
  for (const field of fields) {
    if (field.required && !columnMap[field.key]) {
      errors.push(`"${field.label}" must be mapped to a column.`);
    }
  }
  return errors;
}
