import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { mappingProfile, importBatch, order, orderLine } from "@/db/schema";
import { parseCsv } from "./csv";
import { sha256Hex, shapeSignature } from "./hash";
import type { ColumnMap } from "./mapping";
import { applyMapping, ORDER_IMPORT_FIELDS, validateMapping } from "./mapping";
import { splitConditionAndPrinting } from "./condition";
import { buildMatchKey } from "./matchKey";
import { findMatch } from "./matching";
import { resolveSetAlias } from "./setAlias";
import { snapshot } from "@/db/backup";

export interface AnalyzeOrderImportResult {
  headers: string[];
  sampleRows: Record<string, string>[];
  rowCount: number;
  sha256: string;
  shapeSignature: string;
  existingMapping: ColumnMap | null;
  duplicateBatch: { id: number; filename: string; createdAt: string } | null;
}

export function analyzeOrderImport(fileContent: string): AnalyzeOrderImportResult {
  const { headers, rows } = parseCsv(fileContent);
  const sig = shapeSignature(headers);
  const sha256 = sha256Hex(fileContent);

  const existingProfile = db
    .select()
    .from(mappingProfile)
    .where(and(eq(mappingProfile.kind, "ORDER_IMPORT"), eq(mappingProfile.shapeSignature, sig)))
    .get();

  const duplicateBatch = db
    .select({ id: importBatch.id, filename: importBatch.filename, createdAt: importBatch.createdAt })
    .from(importBatch)
    .where(and(eq(importBatch.sha256, sha256), eq(importBatch.kind, "ORDER")))
    .get();

  return {
    headers,
    sampleRows: rows.slice(0, 5),
    rowCount: rows.length,
    sha256,
    shapeSignature: sig,
    existingMapping: existingProfile ? (JSON.parse(existingProfile.columnMap) as ColumnMap) : null,
    duplicateBatch: duplicateBatch ?? null,
  };
}

interface ParsedOrderRow {
  orderId: string;
  name: string;
  setName: string | null;
  cardNumber: string | null;
  condition: string | null;
  printing: string | null;
  tcgplayerSkuId: string | null;
  quantity: number;
  shipBy: string | null;
}

function parseOrderRow(raw: Record<string, string>, columnMap: ColumnMap): ParsedOrderRow | { error: string } {
  const m = applyMapping(raw, columnMap);
  const orderId = m.orderId?.trim();
  if (!orderId) return { error: "missing order id" };
  const name = m.name?.trim();
  if (!name) return { error: "missing card name" };

  const setCode = null;
  const setNameRaw = m.setName?.trim() || null;
  const setName = setNameRaw ? (resolveSetAlias(setNameRaw) ?? setNameRaw) : null;

  let condition: string | null = null;
  let printing: string | null = null;
  if (m.conditionRaw?.trim()) {
    const split = splitConditionAndPrinting(m.conditionRaw.trim());
    condition = split.condition;
    printing = split.printing;
  }

  const quantityParsed = Number.parseInt((m.quantity ?? "1").replace(/[^0-9-]/g, ""), 10);
  const quantity = Number.isFinite(quantityParsed) && quantityParsed > 0 ? quantityParsed : 1;

  return {
    orderId,
    name,
    setName,
    cardNumber: m.cardNumber?.trim() || null,
    condition,
    printing,
    tcgplayerSkuId: m.tcgplayerSkuId?.trim() || null,
    quantity,
    shipBy: m.shipBy?.trim() || null,
  };
}

export interface CommitOrderImportInput {
  fileContent: string;
  filename: string;
  columnMap: ColumnMap;
  force?: boolean;
}

export interface CommitOrderImportResult {
  importBatchId: number;
  ordersCreated: number;
  ordersUpdated: number;
  linesUpserted: number;
  linesUnchanged: number;
  ambiguousCount: number;
  unmatchedCount: number;
  skipped: number;
  totalRows: number;
}

export function commitOrderImport({
  fileContent,
  filename,
  columnMap,
  force,
}: CommitOrderImportInput): CommitOrderImportResult {
  const errors = validateMapping(ORDER_IMPORT_FIELDS, columnMap);
  if (errors.length) throw new Error(errors.join(" "));

  const { headers, rows } = parseCsv(fileContent);
  const sig = shapeSignature(headers);
  const sha256 = sha256Hex(fileContent);

  if (!force) {
    const duplicate = db
      .select({ id: importBatch.id })
      .from(importBatch)
      .where(and(eq(importBatch.sha256, sha256), eq(importBatch.kind, "ORDER")))
      .get();
    if (duplicate) {
      const err = new Error("DUPLICATE_IMPORT");
      err.name = "DuplicateImportError";
      throw err;
    }
  }

  snapshot("order-import");

  const existingProfile = db
    .select()
    .from(mappingProfile)
    .where(and(eq(mappingProfile.kind, "ORDER_IMPORT"), eq(mappingProfile.shapeSignature, sig)))
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
        name: `Order import (${sig.slice(0, 8)})`,
        kind: "ORDER_IMPORT",
        shapeSignature: sig,
        columnMap: JSON.stringify(columnMap),
      })
      .run();
    mappingProfileId = Number(inserted.lastInsertRowid);
  }

  const insertedBatch = db
    .insert(importBatch)
    .values({ filename, sha256, kind: "ORDER", rowCount: rows.length, mappingProfileId })
    .run();
  const importBatchId = Number(insertedBatch.lastInsertRowid);

  // TCGplayer order exports don't carry a stable line-number column in
  // every export shape; when absent we derive lineIndex from row order
  // per order, which is what makes the natural key (order_id, line_index)
  // meaningful and re-imports idempotent.
  const lineIndexByOrder = new Map<string, number>();

  let ordersCreated = 0;
  let ordersUpdated = 0;
  let linesUpserted = 0;
  let linesUnchanged = 0;
  let ambiguous = 0;
  let unmatched = 0;
  let skipped = 0;

  rows.forEach((raw) => {
    const parsed = parseOrderRow(raw, columnMap);
    if ("error" in parsed) {
      skipped++;
      return;
    }

    let orderRow = db
      .select()
      .from(order)
      .where(eq(order.tcgplayerOrderId, parsed.orderId))
      .get();
    if (!orderRow) {
      const inserted = db
        .insert(order)
        .values({
          tcgplayerOrderId: parsed.orderId,
          shipBy: parsed.shipBy,
          importBatchId,
        })
        .run();
      orderRow = db.select().from(order).where(eq(order.id, Number(inserted.lastInsertRowid))).get()!;
      ordersCreated++;
    } else {
      ordersUpdated++;
    }

    const lineIndex = lineIndexByOrder.get(parsed.orderId) ?? 0;
    lineIndexByOrder.set(parsed.orderId, lineIndex + 1);

    let matchStatus: "MATCHED" | "AMBIGUOUS" | "UNMATCHED" = "UNMATCHED";
    let matchedInventoryItemId: number | null = null;

    if (parsed.setName && parsed.condition && parsed.printing) {
      const matchKey = buildMatchKey({
        name: parsed.name,
        setName: parsed.setName,
        cardNumber: parsed.cardNumber,
        condition: parsed.condition,
        printing: parsed.printing,
      });
      const match = findMatch({
        skuId: parsed.tcgplayerSkuId,
        condition: parsed.condition,
        printing: parsed.printing,
        matchKey,
      });
      if (match.status === "MATCHED") {
        matchStatus = "MATCHED";
        matchedInventoryItemId = match.itemId;
      } else if (match.status === "AMBIGUOUS") {
        matchStatus = "AMBIGUOUS";
        ambiguous++;
      } else {
        unmatched++;
      }
    } else if (parsed.tcgplayerSkuId) {
      const match = findMatch({ skuId: parsed.tcgplayerSkuId, matchKey: "__no_sku_fallback__" });
      if (match.status === "MATCHED") {
        matchStatus = "MATCHED";
        matchedInventoryItemId = match.itemId;
      } else if (match.status === "AMBIGUOUS") {
        matchStatus = "AMBIGUOUS";
        ambiguous++;
      } else {
        unmatched++;
      }
    } else {
      unmatched++;
    }

    const existingLine = db
      .select()
      .from(orderLine)
      .where(and(eq(orderLine.orderId, orderRow.id), eq(orderLine.lineIndex, lineIndex)))
      .get();

    const values = {
      orderId: orderRow.id,
      lineIndex,
      name: parsed.name,
      setName: parsed.setName,
      cardNumber: parsed.cardNumber,
      condition: parsed.condition,
      printing: parsed.printing,
      tcgplayerSkuId: parsed.tcgplayerSkuId,
      quantity: parsed.quantity,
      matchedInventoryItemId,
      matchStatus,
    };

    if (existingLine) {
      const unchanged =
        existingLine.name === values.name &&
        existingLine.quantity === values.quantity &&
        existingLine.matchedInventoryItemId === values.matchedInventoryItemId &&
        existingLine.matchStatus === values.matchStatus;
      if (unchanged) {
        linesUnchanged++;
      } else {
        db.update(orderLine)
          .set({ ...values, updatedAt: new Date().toISOString() })
          .where(eq(orderLine.id, existingLine.id))
          .run();
        linesUpserted++;
      }
    } else {
      db.insert(orderLine).values(values).run();
      linesUpserted++;
    }
  });

  return {
    importBatchId,
    ordersCreated,
    ordersUpdated,
    linesUpserted,
    linesUnchanged,
    ambiguousCount: ambiguous,
    unmatchedCount: unmatched,
    skipped,
    totalRows: rows.length,
  };
}
