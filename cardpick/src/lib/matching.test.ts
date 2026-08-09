import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { inventoryItem } from "@/db/schema";
import { findMatch } from "./matching";

function insertItem(overrides: Partial<typeof inventoryItem.$inferInsert>) {
  const inserted = db
    .insert(inventoryItem)
    .values({
      name: "Test Card",
      setName: "Test Set",
      condition: "Near Mint",
      printing: "Normal",
      matchKey: `key-${Math.random()}`,
      ...overrides,
    })
    .run();
  return Number(inserted.lastInsertRowid);
}

describe("findMatch", () => {
  it("returns NEW when nothing matches", () => {
    const result = findMatch({ matchKey: `nomatch-${Math.random()}` });
    expect(result.status).toBe("NEW");
  });

  it("matches exactly one row by sku", () => {
    const sku = `sku-${Math.random()}`;
    const id = insertItem({ tcgplayerSkuId: sku });
    const result = findMatch({ skuId: sku, matchKey: "irrelevant" });
    expect(result.status).toBe("MATCHED");
    expect(result.itemId).toBe(id);
  });

  it("flags more than one row sharing a sku as AMBIGUOUS, never auto-resolving", () => {
    const sku = `dupsku-${Math.random()}`;
    insertItem({ tcgplayerSkuId: sku });
    insertItem({ tcgplayerSkuId: sku });
    const result = findMatch({ skuId: sku, matchKey: "irrelevant" });
    expect(result.status).toBe("AMBIGUOUS");
    expect(result.itemId).toBeNull();
    expect(result.candidateIds).toHaveLength(2);
  });

  it("falls through to product+condition+printing when sku does not match", () => {
    const productId = `prod-${Math.random()}`;
    const id = insertItem({
      tcgplayerProductId: productId,
      condition: "Lightly Played",
      printing: "Holofoil",
    });
    const result = findMatch({
      productId,
      condition: "Lightly Played",
      printing: "Holofoil",
      matchKey: "irrelevant",
    });
    expect(result.status).toBe("MATCHED");
    expect(result.itemId).toBe(id);
  });

  it("falls through to match_key when sku and product both miss", () => {
    const matchKey = `mk-${Math.random()}`;
    const id = insertItem({ matchKey });
    const result = findMatch({ matchKey });
    expect(result.status).toBe("MATCHED");
    expect(result.itemId).toBe(id);
  });
});
