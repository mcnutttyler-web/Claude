import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { cardScan, inventoryItem, inventoryLot, referenceCard } from "../db/schema";
import { buildMatchKey, matchInventoryItem, BASE_CONDITIONS, printingLabelToCode, resolveSetAlias } from "../matching";
import { identifyCardFromImage, type VisionCardGuess } from "./vision";
import { searchReferenceCards, getReferenceCardById, camelCaseToPrintingCode, type ReferenceCardCandidate } from "./pokemontcg";
import { snapshotDatabase } from "../backup";
import { newGroupId, recordHistory } from "../history";

const UPLOAD_DIR = process.env.CARDPICK_UPLOAD_DIR ?? path.join(process.cwd(), "uploads");

function saveUpload(bytes: Buffer, extension: string): string {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const filename = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
  const fullPath = path.join(UPLOAD_DIR, filename);
  fs.writeFileSync(fullPath, bytes);
  return fullPath;
}

export interface StartScanResult {
  scanId: number;
  guess: VisionCardGuess;
  candidates: ReferenceCardCandidate[];
}

/** Save the photo, ask the vision model what card it is, and look up
 * matching reference cards (cache-first, pokemontcg.io on miss). Nothing
 * is written to inventory yet. */
export async function startScan(imageBytes: Buffer, mediaType: "image/jpeg" | "image/png" | "image/webp"): Promise<StartScanResult> {
  const extension = mediaType === "image/png" ? "png" : mediaType === "image/webp" ? "webp" : "jpg";
  const imagePath = saveUpload(imageBytes, extension);

  const guess = await identifyCardFromImage(imageBytes, mediaType);

  let candidates: ReferenceCardCandidate[] = [];
  if (guess.name) {
    candidates = await searchReferenceCards({
      name: guess.name,
      setNameGuess: guess.setNameGuess,
      cardNumberGuess: guess.cardNumberGuess,
    });
  }

  const scan = db
    .insert(cardScan)
    .values({
      imagePath,
      recognizedName: guess.name,
      recognizedSetNameGuess: guess.setNameGuess,
      recognizedCardNumberGuess: guess.cardNumberGuess,
      recognizedPrintingGuess: guess.printingGuess,
      confidence: guess.confidence,
      visionRawJson: JSON.stringify(guess),
      resolutionStatus: "PENDING",
    })
    .returning()
    .get();

  return { scanId: scan.id, guess, candidates };
}

export interface CommitScanInput {
  scanId: number;
  referenceCardId: number | null;
  manualIdentity?: { name: string; setName: string; cardNumber: string } | null;
  conditionLabel: string;
  printingLabel: string | null;
  quantity: number;
  locationId: number | null;
  sellPriceCents: number | null;
}

export type CommitScanResult =
  | { status: "CREATED"; inventoryItemId: number }
  | { status: "UPDATED"; inventoryItemId: number }
  | { status: "AMBIGUOUS"; candidateItemIds: number[] };

/** Resolve the confirmed identity + condition/printing into the same
 * match_key pipeline every other import uses, then create or update the
 * matching inventory item. Ambiguous inventory matches are never
 * auto-resolved — the scan is left PENDING for manual resolution instead. */
export function commitScan(input: CommitScanInput): CommitScanResult {
  const scan = db.select().from(cardScan).where(eq(cardScan.id, input.scanId)).get();
  if (!scan) throw new Error("Scan not found");

  let name: string;
  let rawSetName: string;
  let cardNumber: string;
  let referenceCandidate: ReferenceCardCandidate | null = null;

  if (input.referenceCardId) {
    const candidate = getReferenceCardById(input.referenceCardId);
    if (!candidate) throw new Error("Reference card not found");
    referenceCandidate = candidate;
    name = candidate.name;
    rawSetName = candidate.setName;
    cardNumber = candidate.cardNumber;
  } else if (input.manualIdentity) {
    name = input.manualIdentity.name;
    rawSetName = input.manualIdentity.setName;
    cardNumber = input.manualIdentity.cardNumber;
  } else {
    throw new Error("Either referenceCardId or manualIdentity is required");
  }

  const setName = resolveSetAlias(rawSetName);
  const conditionCode = BASE_CONDITIONS.find((c) => c.label === input.conditionLabel)?.code ?? "NM";
  const printingCode = printingLabelToCode(input.printingLabel ?? referenceCandidate?.printingCode ?? scan.recognizedPrintingGuess);
  const matchKey = buildMatchKey({ name, setName, cardNumber, conditionCode, printingCode });

  const matchResult = matchInventoryItem({
    tcgplayerSkuId: null,
    tcgplayerProductId: referenceCandidate?.tcgplayerProductId ?? null,
    conditionCode,
    printingCode,
    matchKey,
  });

  if (matchResult.status === "AMBIGUOUS") {
    db.update(cardScan)
      .set({ resolutionStatus: "PENDING", referenceCardId: input.referenceCardId })
      .where(eq(cardScan.id, input.scanId))
      .run();
    return { status: "AMBIGUOUS", candidateItemIds: matchResult.candidates.map((c) => c.id) };
  }

  snapshotDatabase(`scan:${scan.id}`);
  const groupId = newGroupId();
  const marketPriceCents = referenceCandidate ? extractMarketPriceCents(referenceCandidate, printingCode) : null;
  const nowAsof = new Date().toISOString().slice(0, 10);

  let inventoryItemId: number;
  let resultStatus: "CREATED" | "UPDATED";

  if (matchResult.status === "NEW") {
    const inserted = db
      .insert(inventoryItem)
      .values({
        name,
        setName,
        cardNumber,
        printing: printingCode,
        condition: conditionCode,
        matchKey,
        marketPriceCents,
        marketPriceAsof: marketPriceCents != null ? nowAsof : null,
        sellPriceCents: input.sellPriceCents,
        pendingQuantity: input.locationId ? null : input.quantity,
        status: "ACTIVE",
        source: "photo-scan",
      })
      .returning()
      .get();
    inventoryItemId = inserted.id;
    resultStatus = "CREATED";
    recordHistory({ entityType: "inventory_item", entityId: inserted.id, action: "SCAN_CREATE", reason: `scan:${scan.id}`, after: inserted, groupId });

    if (input.locationId) {
      const lot = db
        .insert(inventoryLot)
        .values({ inventoryItemId: inserted.id, locationId: input.locationId, quantity: input.quantity, isPrimary: true })
        .returning()
        .get();
      recordHistory({ entityType: "inventory_lot", entityId: lot.id, action: "SCAN_CREATE", reason: `scan:${scan.id}`, after: lot, groupId });
    }
  } else {
    const existing = matchResult.item;
    inventoryItemId = existing.id;
    resultStatus = "UPDATED";

    const before = { marketPriceCents: existing.marketPriceCents, marketPriceAsof: existing.marketPriceAsof, sellPriceCents: existing.sellPriceCents };
    db.update(inventoryItem)
      .set({
        marketPriceCents: marketPriceCents ?? existing.marketPriceCents,
        marketPriceAsof: marketPriceCents != null ? nowAsof : existing.marketPriceAsof,
        sellPriceCents: input.sellPriceCents ?? existing.sellPriceCents,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(inventoryItem.id, existing.id))
      .run();
    recordHistory({ entityType: "inventory_item", entityId: existing.id, action: "SCAN_UPDATE", reason: `scan:${scan.id}`, before, after: { marketPriceCents, sellPriceCents: input.sellPriceCents }, groupId });

    if (input.locationId && input.quantity > 0) {
      const existingLot = db.select().from(inventoryLot).where(eq(inventoryLot.inventoryItemId, existing.id)).get();
      if (existingLot) {
        const beforeLot = { quantity: existingLot.quantity };
        const nextQty = existingLot.quantity + input.quantity;
        db.update(inventoryLot).set({ quantity: nextQty, updatedAt: new Date().toISOString() }).where(eq(inventoryLot.id, existingLot.id)).run();
        recordHistory({ entityType: "inventory_lot", entityId: existingLot.id, action: "SCAN_UPDATE", reason: `scan:${scan.id}`, before: beforeLot, after: { quantity: nextQty }, groupId });
      } else {
        const lot = db
          .insert(inventoryLot)
          .values({ inventoryItemId: existing.id, locationId: input.locationId, quantity: input.quantity, isPrimary: true })
          .returning()
          .get();
        recordHistory({ entityType: "inventory_lot", entityId: lot.id, action: "SCAN_CREATE", reason: `scan:${scan.id}`, after: lot, groupId });
      }
    }
  }

  db.update(cardScan)
    .set({ resolutionStatus: "RESOLVED", referenceCardId: input.referenceCardId, resultingInventoryItemId: inventoryItemId })
    .where(eq(cardScan.id, input.scanId))
    .run();

  return { status: resultStatus, inventoryItemId };
}

/** Best-effort market price lookup from the cached pokemontcg.io payload's
 * tcgplayer.prices block for the variant matching printingCode. Informational
 * only — returns null (leaving sellPriceCents entirely user-driven) when the
 * variant isn't present in the cached data. */
function extractMarketPriceCents(candidate: ReferenceCardCandidate, printingCode: string): number | null {
  const row = db.select().from(referenceCard).where(eq(referenceCard.id, candidate.id)).get();
  if (!row) return null;
  try {
    const raw = JSON.parse(row.rawJson) as { tcgplayer?: { prices?: Record<string, { market?: number }> } };
    const prices = raw.tcgplayer?.prices;
    if (!prices) return null;
    const variantKey = Object.keys(prices).find((k) => camelCaseToPrintingCode(k) === printingCode);
    const market = variantKey ? prices[variantKey]?.market : undefined;
    return typeof market === "number" ? Math.round(market * 100) : null;
  } catch {
    return null;
  }
}
