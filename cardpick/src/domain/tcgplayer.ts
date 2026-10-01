// Parsing of TCGplayer seller exports. Pure functions; no database access.
//
// Inventory export columns (seller portal → Inventory → Export):
//   TCGplayer Id, Product Line, Set Name, Product Name, Title, Number, Rarity,
//   Condition, TCG Market Price, TCG Direct Low, TCG Low Price With Shipping,
//   TCG Low Price, Total Quantity, Add to Quantity, TCG Marketplace Price, Photo URL
// "TCGplayer Id" is the SKU id (it differs per condition/printing).

import { parseCsvObjects } from './csv';
import type { Item } from './types';

export const BASE_CONDITIONS = [
  'Near Mint',
  'Lightly Played',
  'Moderately Played',
  'Heavily Played',
  'Damaged',
] as const;

export const CONDITION_SHORT: Record<string, string> = {
  'Near Mint': 'NM',
  'Lightly Played': 'LP',
  'Moderately Played': 'MP',
  'Heavily Played': 'HP',
  Damaged: 'DMG',
};

export function parseCondition(raw: string): { condition: string; printing: string; language: string } {
  let s = raw.trim().replace(/\s+/g, ' ');
  let language = 'English';
  const lang = s.match(/\s+-\s+([A-Za-z ]+)$/);
  if (lang) {
    language = lang[1]!.trim();
    s = s.slice(0, lang.index).trim();
  }
  let condition = '';
  for (const c of BASE_CONDITIONS) {
    if (s.toLowerCase().startsWith(c.toLowerCase())) {
      condition = c;
      s = s.slice(c.length).trim();
      break;
    }
  }
  const printing = s === 'Normal' ? '' : s;
  return { condition: condition || raw.trim(), printing, language };
}

export function shortVariant(item: Pick<Item, 'condition' | 'printing' | 'language'>): string {
  const parts = [CONDITION_SHORT[item.condition] ?? item.condition];
  if (item.printing) parts.push(shortPrinting(item.printing));
  if (item.language && item.language !== 'English') parts.push(item.language.slice(0, 3).toUpperCase());
  return parts.join(' ');
}

function shortPrinting(p: string): string {
  return p
    .replace('Reverse Holofoil', 'Rev Holo')
    .replace('1st Edition', '1st Ed')
    .replace('Holofoil', 'Holo');
}

export function searchBlob(i: Pick<Item, 'productName' | 'setName' | 'number' | 'conditionRaw' | 'rarity'>): string {
  return `${i.productName} ${i.setName} ${i.number} ${i.conditionRaw} ${i.rarity}`.toLowerCase();
}

function num(s: string | undefined): number | null {
  if (s === undefined || s.trim() === '') return null;
  const n = Number(s.replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export interface ParsedInventoryRow {
  line: number; // 1-based data line (excluding header)
  sku: string;
  productLine: string;
  setName: string;
  productName: string;
  number: string;
  rarity: string;
  conditionRaw: string;
  marketPrice: number | null;
  totalQty: number | null;
}

export interface InventoryParse {
  rows: ParsedInventoryRow[];
  /** Rows that could not be trusted; these become Fix items, never guesses. */
  rejected: { line: number; reason: string; raw: Record<string, string> }[];
  missingColumns: string[];
}

const REQUIRED = ['tcgplayerid', 'productname', 'setname', 'condition', 'totalquantity'];

export function parseInventoryCsv(text: string): InventoryParse {
  const { headers, rows } = parseCsvObjects(text);
  const missingColumns = REQUIRED.filter((r) => !headers.includes(r));
  const out: InventoryParse = { rows: [], rejected: [], missingColumns };
  if (missingColumns.length) return out;

  const seen = new Map<string, number>();
  rows.forEach((r, idx) => {
    const line = idx + 1;
    const sku = (r.tcgplayerid ?? '').trim();
    const qty = num(r.totalquantity);
    if (!sku || !/^\d+$/.test(sku)) {
      out.rejected.push({ line, reason: 'Missing or invalid TCGplayer Id', raw: r });
      return;
    }
    if (qty === null || qty < 0 || !Number.isInteger(qty)) {
      out.rejected.push({ line, reason: `Invalid Total Quantity "${r.totalquantity ?? ''}"`, raw: r });
      return;
    }
    if (seen.has(sku)) {
      out.rejected.push({ line, reason: `Duplicate TCGplayer Id ${sku} (also line ${seen.get(sku)})`, raw: r });
      return;
    }
    seen.set(sku, line);
    out.rows.push({
      line,
      sku,
      productLine: r.productline ?? '',
      setName: r.setname ?? '',
      productName: r.productname ?? '',
      number: r.number ?? '',
      rarity: r.rarity ?? '',
      conditionRaw: r.condition ?? '',
      marketPrice: num(r.tcgmarketprice),
      totalQty: qty,
    });
  });
  // A duplicate SKU makes *both* rows untrustworthy: drop the first one as well.
  const dupSkus = new Set(
    out.rejected.filter((x) => x.reason.startsWith('Duplicate')).map((x) => (x.raw.tcgplayerid ?? '').trim()),
  );
  if (dupSkus.size) {
    const keep: ParsedInventoryRow[] = [];
    for (const row of out.rows) {
      if (dupSkus.has(row.sku)) {
        out.rejected.push({ line: row.line, reason: `Duplicate TCGplayer Id ${row.sku}`, raw: { tcgplayerid: row.sku, productname: row.productName, setname: row.setName, condition: row.conditionRaw } });
      } else keep.push(row);
    }
    out.rows = keep;
  }
  return out;
}

export function rowToItem(row: ParsedInventoryRow, now: number): Item {
  const { condition, printing, language } = parseCondition(row.conditionRaw);
  const base = {
    id: row.sku,
    productLine: row.productLine,
    setName: row.setName,
    productName: row.productName,
    number: row.number,
    rarity: row.rarity,
    conditionRaw: row.conditionRaw,
    condition,
    printing,
    language,
    marketPrice: row.marketPrice,
    marketplaceQty: row.totalQty ?? 0,
    unlisted: false,
    lastImportedAt: now,
    search: '',
  };
  base.search = searchBlob(base);
  return base;
}

/** Identity fields that must never silently change for an existing SKU. */
export function identityChanges(prev: Item, next: Item): string[] {
  const changes: string[] = [];
  const fields: (keyof Item)[] = ['setName', 'number', 'conditionRaw'];
  for (const f of fields) {
    if (String(prev[f]).trim() !== String(next[f]).trim()) {
      changes.push(`${f}: "${String(prev[f])}" → "${String(next[f])}"`);
    }
  }
  return changes;
}

// ---------------------------------------------------------------------------
// Orders
//
// Supported inputs (detected by headers):
//  A) One row per order line: Order # / Order Number / Order Id, plus
//     SkuId / TCGplayer Id / SKU, Quantity, optional Product Name, Set, Condition, Number, Buyer.
//  B) TCGplayer pull sheet: one row per SKU with an "Order Quantity" column
//     listing orders like "ABC123-4567-89:1 | DEF456-7890-12:2" and SkuId + Quantity.
// Lines without a usable SKU are kept with itemId=null and become Fix items.

export interface ParsedOrderLine {
  orderId: string;
  sku: string | null;
  qty: number;
  label: string;
  buyer: string;
  orderedAt: number | null;
  /** Identity hints for matching when the SKU is absent. */
  hint: { productName: string; setName: string; number: string; condition: string };
}

export interface OrderParse {
  lines: ParsedOrderLine[];
  errors: string[];
}

function pick(r: Record<string, string>, keys: string[]): string {
  for (const k of keys) {
    const v = r[k];
    if (v !== undefined && v !== '') return v;
  }
  return '';
}

const ORDER_KEYS = ['ordernumber', 'order', 'orderid', 'ordernum'];
const SKU_KEYS = ['skuid', 'sku', 'tcgplayerid', 'tcgplayerskuid'];
const QTY_KEYS = ['quantity', 'qty', 'orderquantityitem'];

export function parseOrdersCsv(text: string): OrderParse {
  const { headers, rows } = parseCsvObjects(text);
  const res: OrderParse = { lines: [], errors: [] };
  const hasOrder = ORDER_KEYS.some((k) => headers.includes(k));
  const hasPullSheet = headers.includes('orderquantity');
  if (!hasOrder && !hasPullSheet) {
    res.errors.push('Could not find an order number column ("Order #", "Order Number", or a pull sheet "Order Quantity" column).');
    return res;
  }
  rows.forEach((r, idx) => {
    const skuRaw = pick(r, SKU_KEYS).trim();
    const sku = /^\d+$/.test(skuRaw) ? skuRaw : null;
    const productName = pick(r, ['productname', 'name', 'cardname', 'product']);
    const setName = pick(r, ['set', 'setname']);
    const number = pick(r, ['number', 'cardnumber']);
    const condition = pick(r, ['condition']);
    const label = [productName, setName, number && `#${number}`, condition].filter(Boolean).join(' · ') || `Line ${idx + 1}`;
    const buyer = pick(r, ['buyername', 'buyer', 'customer', 'customername']);
    const dateStr = pick(r, ['orderdate', 'date']);
    const t = dateStr ? Date.parse(dateStr) : NaN;
    const orderedAt = Number.isFinite(t) ? t : null;
    const hint = { productName, setName, number, condition };

    if (hasPullSheet && r.orderquantity) {
      const parts = r.orderquantity.split(/[|;\n]/).map((p) => p.trim()).filter(Boolean);
      for (const p of parts) {
        const m = p.match(/^(.+?)\s*[:x×]\s*(\d+)$/i);
        if (!m) {
          res.errors.push(`Line ${idx + 1}: could not read order quantity "${p}"`);
          continue;
        }
        res.lines.push({ orderId: m[1]!.trim(), sku, qty: Number(m[2]), label, buyer, orderedAt, hint });
      }
      return;
    }
    const orderId = pick(r, ORDER_KEYS).trim();
    const qty = Number(pick(r, QTY_KEYS) || '1');
    if (!orderId) {
      res.errors.push(`Line ${idx + 1}: missing order number`);
      return;
    }
    if (!Number.isInteger(qty) || qty <= 0) {
      res.errors.push(`Line ${idx + 1}: invalid quantity`);
      return;
    }
    res.lines.push({ orderId, sku, qty, label, buyer, orderedAt, hint });
  });
  return res;
}
