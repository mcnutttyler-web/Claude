import { eq, like } from "drizzle-orm";
import { db } from "../db/client";
import { referenceCard } from "../db/schema";
import { normalize } from "../matching";

const API_BASE = "https://api.pokemontcg.io/v2/cards";

export interface ReferenceCardCandidate {
  id: number;
  sourceId: string;
  name: string;
  setName: string;
  setCode: string | null;
  cardNumber: string;
  printingCode: string;
  smallImageUrl: string | null;
  largeImageUrl: string | null;
  tcgplayerProductId: string | null;
}

export interface ReferenceCardQuery {
  name: string;
  setNameGuess?: string | null;
  cardNumberGuess?: string | null;
}

interface PokemonTcgApiCard {
  id: string;
  name: string;
  number: string;
  set: { name: string; id: string; ptcgoCode?: string };
  images?: { small?: string; large?: string };
  tcgplayer?: { url?: string; prices?: Record<string, unknown> };
}

function toCandidate(row: typeof referenceCard.$inferSelect): ReferenceCardCandidate {
  return {
    id: row.id,
    sourceId: row.sourceId,
    name: row.name,
    setName: row.setName,
    setCode: row.setCode,
    cardNumber: row.cardNumber,
    printingCode: row.printingCode,
    smallImageUrl: row.smallImageUrl,
    largeImageUrl: row.largeImageUrl,
    tcgplayerProductId: row.tcgplayerProductId,
  };
}

/** "reverseHolofoil" -> "REVERSE_HOLOFOIL". Must insert underscores at the
 * original camelCase boundaries *before* upper-casing — upper-casing first
 * would make every letter look like a boundary. */
export function camelCaseToPrintingCode(key: string): string {
  return key.replace(/([A-Z])/g, "_$1").toUpperCase();
}

function guessPrintingCode(prices: Record<string, unknown> | undefined): string {
  if (!prices) return "NORMAL";
  const keys = Object.keys(prices);
  const preferred = ["holofoil", "reverseHolofoil", "1stEditionHolofoil", "normal"];
  const match = preferred.find((p) => keys.includes(p)) ?? keys[0];
  return match ? camelCaseToPrintingCode(match) : "NORMAL";
}

function extractTcgplayerProductId(url: string | undefined): string | null {
  if (!url) return null;
  const match = url.match(/(\d{4,})/);
  return match ? match[1] : null;
}

function upsertFromApi(cards: PokemonTcgApiCard[]): ReferenceCardCandidate[] {
  const results: ReferenceCardCandidate[] = [];
  for (const card of cards) {
    const values = {
      source: "POKEMONTCG" as const,
      sourceId: card.id,
      name: card.name,
      setName: card.set?.name ?? "",
      setCode: card.set?.ptcgoCode ?? card.set?.id ?? null,
      cardNumber: card.number ?? "",
      printingCode: guessPrintingCode(card.tcgplayer?.prices as Record<string, unknown> | undefined),
      smallImageUrl: card.images?.small ?? null,
      largeImageUrl: card.images?.large ?? null,
      tcgplayerProductId: extractTcgplayerProductId(card.tcgplayer?.url),
      rawJson: JSON.stringify(card),
      fetchedAt: new Date().toISOString(),
    };

    const row = db
      .insert(referenceCard)
      .values(values)
      .onConflictDoUpdate({
        target: [referenceCard.source, referenceCard.sourceId],
        set: values,
      })
      .returning()
      .get();
    results.push(toCandidate(row));
  }
  return results;
}

function searchCache(query: ReferenceCardQuery): ReferenceCardCandidate[] {
  const rows = db
    .select()
    .from(referenceCard)
    .where(like(referenceCard.name, `%${query.name}%`))
    .all();

  const normalizedTarget = normalize(query.name);
  const matches = rows.filter((r) => normalize(r.name) === normalizedTarget);
  if (query.cardNumberGuess) {
    const numTarget = normalize(query.cardNumberGuess);
    const narrowed = matches.filter((r) => normalize(r.cardNumber) === numTarget || numTarget.startsWith(normalize(r.cardNumber)));
    if (narrowed.length > 0) return narrowed.map(toCandidate);
  }
  return matches.map(toCandidate);
}

/** Cache-first lookup against the local reference_card table; falls back to
 * a live pokemontcg.io API call (caching the results) when the cache has no
 * confident match. Set POKEMONTCG_API_KEY in the environment to raise the
 * daily rate limit from 1,000 to 20,000 requests. */
export async function searchReferenceCards(query: ReferenceCardQuery): Promise<ReferenceCardCandidate[]> {
  const cached = searchCache(query);
  if (cached.length > 0) return cached;

  const clauses = [`name:"${query.name.replace(/"/g, '')}"`];
  const numericNumber = query.cardNumberGuess?.match(/\d+/)?.[0];
  if (numericNumber) clauses.push(`number:${numericNumber}`);

  const url = `${API_BASE}?q=${encodeURIComponent(clauses.join(" "))}`;
  const headers: Record<string, string> = {};
  if (process.env.POKEMONTCG_API_KEY) headers["X-Api-Key"] = process.env.POKEMONTCG_API_KEY;

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`pokemontcg.io request failed (${response.status})`);
  }
  const data = (await response.json()) as { data: PokemonTcgApiCard[] };
  return upsertFromApi(data.data ?? []);
}

export function getReferenceCardById(id: number): ReferenceCardCandidate | null {
  const row = db.select().from(referenceCard).where(eq(referenceCard.id, id)).get();
  return row ? toCandidate(row) : null;
}
