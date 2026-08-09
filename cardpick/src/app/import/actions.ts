"use server";

import { revalidatePath } from "next/cache";
import {
  analyzeInventoryImport,
  commitInventoryImport,
  resolveAmbiguousInventoryRow,
  type AmbiguityChoice,
} from "@/lib/importInventory";
import type { ColumnMap } from "@/lib/mapping";
import { getInventoryItemSummaries } from "@/lib/inventoryQueries";

export async function analyzeInventoryImportAction(fileContent: string) {
  return analyzeInventoryImport(fileContent);
}

export async function commitInventoryImportAction(input: {
  fileContent: string;
  filename: string;
  columnMap: ColumnMap;
  force?: boolean;
}) {
  try {
    const result = commitInventoryImport(input);
    revalidatePath("/inventory");
    revalidatePath("/");
    return { ok: true as const, result };
  } catch (err) {
    if (err instanceof Error && err.name === "DuplicateImportError") {
      return { ok: false as const, duplicate: true as const };
    }
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function getCandidateSummariesAction(ids: number[]) {
  return getInventoryItemSummaries(ids);
}

export async function resolveAmbiguousInventoryRowAction(
  importBatchId: number,
  rowIndex: number,
  choice: AmbiguityChoice,
) {
  const result = resolveAmbiguousInventoryRow(importBatchId, rowIndex, choice);
  revalidatePath("/inventory");
  revalidatePath("/import");
  return result;
}
