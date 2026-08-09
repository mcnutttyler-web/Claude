"use server";

import { revalidatePath } from "next/cache";
import { analyzeOrderImport, commitOrderImport } from "@/lib/importOrders";
import type { ColumnMap } from "@/lib/mapping";

export async function analyzeOrderImportAction(fileContent: string) {
  return analyzeOrderImport(fileContent);
}

export async function commitOrderImportAction(input: {
  fileContent: string;
  filename: string;
  columnMap: ColumnMap;
  force?: boolean;
}) {
  try {
    const result = commitOrderImport(input);
    revalidatePath("/orders");
    revalidatePath("/");
    return { ok: true as const, result };
  } catch (err) {
    if (err instanceof Error && err.name === "DuplicateImportError") {
      return { ok: false as const, duplicate: true as const };
    }
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
  }
}
