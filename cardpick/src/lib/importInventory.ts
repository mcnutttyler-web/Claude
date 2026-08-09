import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/db/client";
import {
  mappingProfile,
  importBatch,
  inventoryItem,
  inventoryLot,
} from "@/db/schema";
import { parseCsv } from "./csv";
import { sha256Hex, shapeSignature } from "./hash";
import type { ColumnMap } from "./mapping";
import { applyMapping, INVENTORY_IMPORT_FIELDS, validateMapping } from "./mapping";
import { splitConditionAndPrinting } from "./condition";
import { buildMatchKey } from "./matchKey";
import { parseCents } from "./money";
import { findMatch } from "./matching";
import { resolveSetAlias, recordSetAlias } from "./setAlias";
import { getUnassignedLocationId } from "./locations";
import { logHistory } from "./history";
import { snapshot } from "@/db/backup";

export interface AnalyzeInventoryImportResult {
  headers: string[];
  sampleRows: Record<string, string>[];
  rowCount: number;
  sha256: string;
  shapeSignature: string;
  existingMapping: ColumnMap | null;
  existingMappingProfileId: number | null;
  duplicateBatch: { id: number; filename: string; createdAt: string } | null;
}

export function analyzeInventoryImport(fileContent: string): AnalyzeInventoryImportResult {
  const { headers, rows } = parseCsv(fileContent);
  const sig = shapeSignature(headers);
  const sha256 = sha256Hex(fileContent);

  const existingProfile = db
    .select()
    .from(mappingProfile)
    .where(and(eq(mappingProfile.kind, "INVENTORY_IMPORT"), eq(mappingProfile.shapeSignature, sig)))
    .get();

  const duplicateBatch = db
    .select({ id: importBatch.id, filename: importBatch.filename, createdAt: importBatch.createdAt })
    .from(importBatch)
    .where(and(eq(importBatch.sha256, sha256), eq(importBatch.kind, "INVENTORY")))
    .get();

  return {
    headers,
    sampleRows: rows.slice(0, 5),
    rowCount: rows.length,
    sha256,
    shapeSignature: sig,
    existingMapping: existingProfile ? (JSON.parse(existingProfile.columnMap) as ColumnMap) : null,
    existingMappingProfileId: existingProfile?.id ?? null,
    duplicateBatch: duplicateBatch ?? null,
  };
}

interface ParsedRow {
  tcgplayerProductId: string | null;
  tcgplayerSkuId: string | null;
  name: string;
  setName: string;
  setCode: string | null;
  cardNumber: string | null;
  condition: string;
  printing: string;
  marketPriceCents: number | null;
  quantity: number | null;
  matchKey: string;
}

function parseInventoryRow(
  raw: Record<string, string>,
  columnMap: ColumnMap,
): ParsedRow | { error: string } {
  const m = applyMapping(raw, columnMap);
  const name = m.name?.trim();
  if (!name) return { error: "missing card name" };

  const setCode = m.setCode?.trim() || null;
  const setNameRaw = m.setName?.trim() || null;
  if (setCode && setNameRaw) recordSetAlias(setCode, setNameRaw);
  const setName = setNameRaw ?? (setCode ? (resolveSetAlias(setCode) ?? setCode) : null);
  if (!setName) return { error: "missing set name (and no known alias for set code)" };

  const conditionRaw = m.conditionRaw?.trim() || "Near Mint";
  const { condition, printing } = splitConditionAndPrinting(conditionRaw);

  const cardNumber = m.cardNumber?.trim() || null;
  const tcgplayerProductId = m.tcgplayerProductId?.trim() || null;
  const tcgplayerSkuId = m.tcgplayerSkuId?.trim() || null;
  const marketPriceCents = parseCents(m.marketPrice);
  const quantityParsed = m.quantity ? Number.parseInt(m.quantity.replace(/[^0-9-]/g, ""), 10) : NaN;
  const quantity = Number.isFinite(quantityParsed) ? quantityParsed : null;

  const matchKey = buildMatchKey({ name, setName, cardNumber, condition, printing });

  return {
    tcgplayerProductId,
    tcgplayerSkuId,
    name,
    setName,
    setCode,
    cardNumber,
    condition,
    printing,
    marketPriceCents,
    quantity,
    matchKey,
  };
}

export interface CommitInventoryImportInput {
  fileContent: string;
  filename: string;
  columnMap: ColumnMap;
  force?: boolean;
}

export interface CommitInventoryImportResult {
  importBatchId: number;
  created: number;
  updated: number;
  unchanged: number;
  ambiguousCount: number;
  skipped: number;
  totalRows: number;
  warnings: Array<Record<string, unknown>>;
}

export function commitInventoryImport({
  fileContent,
  filename,
  columnMap,
  force,
}: CommitInventoryImportInput): CommitInventoryImportResult {
  const errors = validateMapping(INVENTORY_IMPORT_FIELDS, columnMap);
  if (errors.length) throw new Error(errors.join(" "));

  const { headers, rows } = parseCsv(fileContent);
  const sig = shapeSignature(headers);
  const sha256 = sha256Hex(fileContent);

  if (!force) {
    const duplicate = db
      .select({ id: importBatch.id })
      .from(importBatch)
      .where(and(eq(importBatch.sha256, sha256), eq(importBatch.kind, "INVENTORY")))
      .get();
    if (duplicate) {
      const err = new Error("DUPLICATE_IMPORT");
      err.name = "DuplicateImportError";
      throw err;
    }
  }

  snapshot("import");

  const existingProfile = db
    .select()
    .from(mappingProfile)
    .where(and(eq(mappingProfile.kind, "INVENTORY_IMPORT"), eq(mappingProfile.shapeSignature, sig)))
    .get();

  let mappingProfileId: number;
  if (existingProfile) {
    db.update(mappingProfile)
      .set({ columnMap: JSON.stringify(columnMap), updatedAt: new Date().toISOString() })
      .where(eq(mappingProfile.id, existingProfile.id))
      .run();
    mappingProfileId = existingProfile.id;
  } else {
    const inserted = db
      .insert(mappingProfile)
      .values({
        name: `Inventory import (${sig.slice(0, 8)})`,
        kind: "INVENTORY_IMPORT",
        shapeSignature: sig,
        columnMap: JSON.stringify(columnMap),
      })
      .run();
    mappingProfileId = Number(inserted.lastInsertRowid);
  }

  const insertedBatch = db
    .insert(importBatch)
    .values({ filename, sha256, kind: "INVENTORY", rowCount: rows.length, mappingProfileId })
    .run();
  const importBatchId = Number(insertedBatch.lastInsertRowid);

  const unassignedLocationId = getUnassignedLocationId();
  const batchGroupId = randomUUID();
  const todayIso = new Date().toISOString().slice(0, 10);
  const warnings: Array<Record<string, unknown>> = [];

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let ambiguous = 0;
  let skipped = 0;

  rows.forEach((raw, rowIndex) => {
    const parsed = parseInventoryRow(raw, columnMap);
    if ("error" in parsed) {
      warnings.push({ rowIndex, type: "ERROR", error: parsed.error });
      skipped++;
      return;
    }

    const match = findMatch({
      skuId: parsed.tcgplayerSkuId,
      productId: parsed.tcgplayerProductId,
      condition: parsed.condition,
      printing: parsed.printing,
      matchKey: parsed.matchKey,
    });

    if (match.status === "AMBIGUOUS") {
      warnings.push({
        rowIndex,
        type: "AMBIGUOUS",
        parsed,
        candidateIds: match.candidateIds,
      });
      ambiguous++;
      return;
    }

    if (match.status === "NEW") {
      createNewInventoryItem(parsed, filename, batchGroupId, unassignedLocationId, todayIso);
      created++;
      return;
    }

    // MATCHED — only price/catalog-id fields are ever touched on import.
    // Quantity drift is handled deliberately via the Reconcile screen.
    const wasChanged = patchMatchedInventoryItem(match.itemId!, parsed, batchGroupId, todayIso);
    if (wasChanged) updated++;
    else unchanged++;
  });

  db.update(importBatch)
    .set({ warnings: JSON.stringify(warnings) })
    .where(eq(importBatch.id, importBatchId))
    .run();

  return {
    importBatchId,
    created,
    updated,
    unchanged,
    ambiguousCount: ambiguous,
    skipped,
    totalRows: rows.length,
    warnings,
  };
}

function createNewInventoryItem(
  parsed: ParsedRow,
  filename: string,
  batchGroupId: string,
  unassignedLocationId: number,
  todayIso: string,
): number {
  const insert = db
    .insert(inventoryItem)
    .values({
      tcgplayerProductId: parsed.tcgplayerProductId,
      tcgplayerSkuId: parsed.tcgplayerSkuId,
      name: parsed.name,
      setName: parsed.setName,
      setCode: parsed.setCode,
      cardNumber: parsed.cardNumber,
      printing: parsed.printing,
      condition: parsed.condition,
      matchKey: parsed.matchKey,
      marketPriceCents: parsed.marketPriceCents,
      marketPriceAsof: parsed.marketPriceCents != null ? todayIso : null,
      status: "ACTIVE",
      source: filename,
    })
    .run();
  const itemId = Number(insert.lastInsertRowid);
  db.insert(inventoryLot)
    .values({
      inventoryItemId: itemId,
      locationId: unassignedLocationId,
      quantity: parsed.quantity ?? 0,
      isPrimary: true,
    })
    .run();
  logHistory({
    inventoryItemId: itemId,
    action: "CREATE",
    batchGroupId,
    notes: `Imported from ${filename}`,
  });
  return itemId;
}

/** Returns true if any field actually changed. */
function patchMatchedInventoryItem(
  itemId: number,
  parsed: ParsedRow,
  batchGroupId: string,
  todayIso: string,
): boolean {
  const existing = db.select().from(inventoryItem).where(eq(inventoryItem.id, itemId)).get()!;
  const patch: Record<string, unknown> = {};

  if (parsed.marketPriceCents != null && parsed.marketPriceCents !== existing.marketPriceCents) {
    logHistory({
      inventoryItemId: itemId,
      action: "PRICE_CHANGE",
      field: "market_price_cents",
      oldValue: existing.marketPriceCents,
      newValue: parsed.marketPriceCents,
      batchGroupId,
    });
    patch.marketPriceCents = parsed.marketPriceCents;
    patch.marketPriceAsof = todayIso;
  }
  if (parsed.tcgplayerSkuId && !existing.tcgplayerSkuId) {
    patch.tcgplayerSkuId = parsed.tcgplayerSkuId;
  }
  if (parsed.tcgplayerProductId && !existing.tcgplayerProductId) {
    patch.tcgplayerProductId = parsed.tcgplayerProductId;
  }

  if (Object.keys(patch).length === 0) return false;
  patch.updatedAt = new Date().toISOString();
  db.update(inventoryItem).set(patch).where(eq(inventoryItem.id, itemId)).run();
  return true;
}

export interface AmbiguousWarning {
  rowIndex: number;
  type: "AMBIGUOUS";
  parsed: ParsedRow;
  candidateIds: number[];
  resolved?: boolean;
}

export type AmbiguityChoice = { type: "existing"; itemId: number } | { type: "new" };

/** Manually resolves one AMBIGUOUS row from a prior import batch. Never auto-resolved. */
export function resolveAmbiguousInventoryRow(
  importBatchId: number,
  rowIndex: number,
  choice: AmbiguityChoice,
): { itemId: number } {
  const batch = db.select().from(importBatch).where(eq(importBatch.id, importBatchId)).get();
  if (!batch) throw new Error("Import batch not found");

  const warnings: Array<Record<string, unknown>> = JSON.parse(batch.warnings ?? "[]");
  const entry = warnings.find(
    (w) => w.rowIndex === rowIndex && w.type === "AMBIGUOUS" && !w.resolved,
  ) as AmbiguousWarning | undefined;
  if (!entry) throw new Error("Ambiguous row not found or already resolved");

  const batchGroupId = randomUUID();
  const todayIso = new Date().toISOString().slice(0, 10);
  let itemId: number;

  if (choice.type === "new") {
    itemId = createNewInventoryItem(
      entry.parsed,
      batch.filename,
      batchGroupId,
      getUnassignedLocationId(),
      todayIso,
    );
  } else {
    if (!entry.candidateIds.includes(choice.itemId)) {
      throw new Error("Chosen item is not one of the surfaced candidates");
    }
    patchMatchedInventoryItem(choice.itemId, entry.parsed, batchGroupId, todayIso);
    itemId = choice.itemId;
  }

  entry.resolved = true;
  db.update(importBatch)
    .set({ warnings: JSON.stringify(warnings) })
    .where(eq(importBatch.id, importBatchId))
    .run();

  return { itemId };
}
