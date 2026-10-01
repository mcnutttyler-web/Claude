import type { Item } from './types';
import { BASE_CONDITIONS } from './tcgplayer';

export interface ProductGroup {
  key: string;
  productName: string;
  setName: string;
  number: string;
  rarity: string;
  variants: Item[];
  score: number;
}

export interface SearchContext {
  /** Sets that live at the current location: their cards rank first. */
  preferredSets?: string[];
  limit?: number;
}

export function productKey(i: Pick<Item, 'setName' | 'productName' | 'number'>): string {
  return `${i.setName}|${i.productName}|${i.number}`;
}

const condRank = (c: string) => {
  const i = (BASE_CONDITIONS as readonly string[]).indexOf(c);
  return i === -1 ? 99 : i;
};

export function sortVariants(v: Item[]): Item[] {
  return [...v].sort(
    (a, b) =>
      condRank(a.condition) - condRank(b.condition) ||
      a.printing.localeCompare(b.printing) ||
      a.language.localeCompare(b.language),
  );
}

/**
 * Token search across name, set, number, condition, rarity.
 * Every token must match. Results are grouped per product (set + name + number)
 * with condition/printing variants inside, so one tap picks the exact SKU.
 */
export function searchItems(items: Item[], query: string, ctx: SearchContext = {}): ProductGroup[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const preferred = new Set((ctx.preferredSets ?? []).map((s) => s.toLowerCase()));
  const groups = new Map<string, ProductGroup>();

  for (const it of items) {
    let score = 0;
    let ok = true;
    const name = it.productName.toLowerCase();
    const num = it.number.toLowerCase();
    for (const t of tokens) {
      if (!it.search.includes(t)) {
        ok = false;
        break;
      }
      if (name.startsWith(t)) score += 6;
      else if (name.split(/[\s-]+/).some((w) => w.startsWith(t))) score += 4;
      if (num === t || num.split('/')[0] === t || num.split('/')[0]?.replace(/^0+/, '') === t) score += 8;
    }
    if (!ok) continue;
    if (preferred.has(it.setName.toLowerCase())) score += 10;
    if (it.marketplaceQty > 0) score += 2;
    const key = productKey(it);
    const g = groups.get(key);
    if (g) {
      g.variants.push(it);
      g.score = Math.max(g.score, score);
    } else {
      groups.set(key, {
        key,
        productName: it.productName,
        setName: it.setName,
        number: it.number,
        rarity: it.rarity,
        variants: [it],
        score,
      });
    }
  }
  const out = [...groups.values()];
  out.sort((a, b) => b.score - a.score || a.productName.localeCompare(b.productName) || a.setName.localeCompare(b.setName));
  const limited = out.slice(0, ctx.limit ?? 30);
  for (const g of limited) g.variants = sortVariants(g.variants);
  return limited;
}

/** Natural sort for location codes: B2 < B10, C001 < C002. */
export function compareLocation(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}
