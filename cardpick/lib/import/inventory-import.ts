import { eq, and } from "drizzle-orm";
import { db } from "../db/client";
import { importBatch, importRow, inventoryItem, mappingProfile } from "../db/schema";
import { parseCsv } from "./csv";
import {
  applyMapping,
  computeShapeSignature,
  fieldsForKind,
  guessMapping,
  validateMapping,
  type FieldMapping,
  type ImportKind,
} from "./mapping";
import { sha256 } from "./hash";
import { buildMatchKey, matchInventoryItem, resolveSetAlias, splitConditionAndPrinting } from "../matching";
import { snapshotDatabase } from "../backup";
import { recordHistory, newGroupId } from "../history";

export interface StartImportResult {
  batchId: number;
  headers: string[];
  suggestedMapping: FieldMapping;
  savedProfileId: number | null;
  duplicateOfBatchId: number | null;
  rowCount: number;
}

/** Step 1: parse the file, detect a reusable mapping profile by shape, and
 * stage rows in the DB as a DRAFT import_batch. Nothing touches inventory
 * yet. */
export function startImport(kind: ImportKind, filename: string, contents: string): StartImportResult {
  const hash = sha256(contents);
  const { headers, rows } = parseCsv(contents);
  const fields = fieldsForKind(kind);
  const shape = computeShapeSignature(headers);

  const existingProfile = db
    .select()
    .from(mappingProfile)
    .where(and(eq(mappingProfile.kind, kind), eq(mappingProfile.shapeSignature, shape)))
    .get();

  const mapping: FieldMapping = existingProfile
    ? (JSON.parse(existingProfile.fieldMapJson) as FieldMapping)
    : guessMapping(headers, fields);

  const duplicate = db
    .select()
    .from(importBatch)
    .where(and(eq(importBatch.sha256, hash), eq(importBatch.status, "COMMITTED")))
    .get();

  const batch = db
    .insert(importBatch)
    .values({
      filename,
      sha256: hash,
      kind,
      rowCount: rows.length,
      mappingProfileId: existingProfile?.id ?? null,
      status: "DRAFT",
    })
    .returning()
    .get();

  // Stage raw rows now so preview/commit don't need the original file again.
  const insertStmt = db.insert(importRow);
  rows.forEach((raw, idx) => {
    insertStmt.values({
      importBatchId: batch.id,
      rowIndex: idx,
      rawJson: JSON.stringify(raw),
      mappedJson: "{}",
      matchStatus: "NEW",
    }).run();
  });

  return {
    batchId: batch.id,
    headers,
    suggestedMapping: mapping,
    savedProfileId: existingProfile?.id ?? null,
    duplicateOfBatchId: duplicate?.id ?? null,
    rowCount: rows.length,
  };
}

export interface PreviewRow {
  rowIndex: number;
  raw: Record<string, string>;
  mapped: Record<string, string | number | null>;
  matchStatus: "NEW" | "MATCHED" | "AMBIGUOUS";
  matchKey: string;
  errors: string[];
}

export interface PreviewResult {
  errors: string[];
  counts: { new: number; matched: number; ambiguous: number };
  sample: PreviewRow[];
  total: number;
}

/** Step 2: apply the confirmed mapping to every staged row, run matching,
 * and persist the results back onto import_row for commit. Returns a
 * summary + sample for the user to review before anything is written to
 * inventory. */
export function previewImport(batchId: number, kind: ImportKind, mapping: FieldMapping): PreviewResult {
  const fields = fieldsForKind(kind);
  const mappingErrors = validateMapping(mapping, fields);
  if (mappingErrors.length > 0) {
    return { errors: mappingErrors, counts: { new: 0, matched: 0, ambiguous: 0 }, sample: [], total: 0 };
  }

  const rows = db.select().from(importRow).where(eq(importRow.importBatchId, batchId)).all();
  const counts = { new: 0, matched: 0, ambiguous: 0 };
  const sample: PreviewRow[] = [];

  for (const row of rows) {
    const raw = JSON.parse(row.rawJson) as Record<string, string>;
    const mappedRaw = applyMapping(raw, mapping, fields);

    const setName = resolveSetAlias(String(mappedRaw.setName ?? ""));
    const { conditionCode, printingCode } = splitConditionAndPrinting(String(mappedRaw.rawCondition ?? ""));
    const matchKey = buildMatchKey({
      name: String(mappedRaw.name ?? ""),
      setName,
      cardNumber: String(mappedRaw.cardNumber ?? ""),
      conditionCode,
      printingCode,
    });

    const matchResult = matchInventoryItem({
      tcgplayerSkuId: mappedRaw.tcgplayerSkuId as string | null,
      tcgplayerProductId: mappedRaw.tcgplayerProductId as string | null,
      conditionCode,
      printingCode,
      matchKey,
    });

    const matchStatus = matchResult.status;
    counts[matchStatus === "NEW" ? "new" : matchStatus === "MATCHED" ? "matched" : "ambiguous"]++;

    const mapped = { ...mappedRaw, setName, conditionCode, printingCode, matchKey };

    db.update(importRow)
      .set({
        mappedJson: JSON.stringify(mapped),
        matchStatus,
        matchedInventoryItemId: matchResult.status === "MATCHED" ? matchResult.item.id : null,
        candidatesJson: matchResult.status === "AMBIGUOUS" ? JSON.stringify(matchResult.candidates.map((c) => c.id)) : null,
      })
      .where(eq(importRow.id, row.id))
      .run();

    if (sample.length < 20) {
      sample.push({ rowIndex: row.rowIndex, raw, mapped, matchStatus, matchKey, errors: [] });
    }
  }

  // Persist the confirmed mapping as a reusable profile for this file shape.
  const raws = db.select().from(importRow).where(eq(importRow.importBatchId, batchId)).all();
  const headers = raws.length > 0 ? Object.keys(JSON.parse(raws[0].rawJson)) : [];
  const shape = computeShapeSignature(headers);
  const existingProfile = db
    .select()
    .from(mappingProfile)
    .where(and(eq(mappingProfile.kind, kind), eq(mappingProfile.shapeSignature, shape)))
    .get();
  if (existingProfile) {
    db.update(mappingProfile)
      .set({ fieldMapJson: JSON.stringify(mapping), updatedAt: new Date().toISOString() })
      .where(eq(mappingProfile.id, existingProfile.id))
      .run();
    db.update(importBatch).set({ mappingProfileId: existingProfile.id }).where(eq(importBatch.id, batchId)).run();
  } else {
    const created = db
      .insert(mappingProfile)
      .values({ name: `${kind} mapping (${shape.slice(0, 8)})`, kind, shapeSignature: shape, fieldMapJson: JSON.stringify(mapping) })
      .returning()
      .get();
    db.update(importBatch).set({ mappingProfileId: created.id }).where(eq(importBatch.id, batchId)).run();
  }

  return { errors: [], counts, sample, total: rows.length };
}

export interface CommitResult {
  created: number;
  updated: number;
  skippedAmbiguous: number;
}

/** Step 3: write staged, matched/new rows into inventory_item. Ambiguous
 * rows are never auto-resolved and are left for manual resolution. Always
 * snapshots the DB first. */
export function commitInventoryImport(batchId: number): CommitResult {
  const batch = db.select().from(importBatch).where(eq(importBatch.id, batchId)).get();
  if (!batch) throw new Error("Import batch not found");
  if (batch.status === "COMMITTED") throw new Error("Import batch already committed");

  snapshotDatabase(`import:${batch.filename}`);
  const groupId = newGroupId();
  const rows = db.select().from(importRow).where(eq(importRow.importBatchId, batchId)).all();

  let created = 0;
  let updated = 0;
  let skippedAmbiguous = 0;

  for (const row of rows) {
    if (row.matchStatus === "AMBIGUOUS") {
      skippedAmbiguous++;
      continue;
    }
    const mapped = JSON.parse(row.mappedJson) as Record<string, string | number | null>;
    const nowAsof = new Date().toISOString().slice(0, 10);

    if (row.matchStatus === "NEW") {
      const inserted = db
        .insert(inventoryItem)
        .values({
          tcgplayerProductId: (mapped.tcgplayerProductId as string) ?? null,
          tcgplayerSkuId: (mapped.tcgplayerSkuId as string) ?? null,
          name: String(mapped.name ?? ""),
          setName: String(mapped.setName ?? ""),
          setCode: (mapped.setCode as string) ?? null,
          cardNumber: String(mapped.cardNumber ?? ""),
          printing: String(mapped.printingCode ?? "NORMAL"),
          condition: String(mapped.conditionCode ?? ""),
          matchKey: String(mapped.matchKey ?? ""),
          marketPriceCents: (mapped.marketPrice as number) ?? null,
          marketPriceAsof: mapped.marketPrice != null ? nowAsof : null,
          pendingQuantity: (mapped.quantity as number) ?? null,
          status: "ACTIVE",
          source: batch.filename,
        })
        .returning()
        .get();
      created++;
      recordHistory({
        entityType: "inventory_item",
        entityId: inserted.id,
        action: "IMPORT_CREATE",
        reason: `import:${batch.filename}`,
        after: inserted,
        groupId,
      });
    } else if (row.matchStatus === "MATCHED" && row.matchedInventoryItemId) {
      const before = db.select().from(inventoryItem).where(eq(inventoryItem.id, row.matchedInventoryItemId)).get();
      if (!before) continue;
      db.update(inventoryItem)
        .set({
          tcgplayerProductId: (mapped.tcgplayerProductId as string) ?? before.tcgplayerProductId,
          tcgplayerSkuId: (mapped.tcgplayerSkuId as string) ?? before.tcgplayerSkuId,
          marketPriceCents: mapped.marketPrice != null ? (mapped.marketPrice as number) : before.marketPriceCents,
          marketPriceAsof: mapped.marketPrice != null ? nowAsof : before.marketPriceAsof,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(inventoryItem.id, before.id))
        .run();
      updated++;
      recordHistory({
        entityType: "inventory_item",
        entityId: before.id,
        action: "IMPORT_PRICE_UPDATE",
        reason: `import:${batch.filename}`,
        before,
        after: { marketPriceCents: mapped.marketPrice, marketPriceAsof: nowAsof },
        groupId,
      });
    }
  }

  db.update(importBatch)
    .set({ status: "COMMITTED", committedAt: new Date().toISOString() })
    .where(eq(importBatch.id, batchId))
    .run();

  return { created, updated, skippedAmbiguous };
}
