import { describe, expect, it } from 'vitest';
import { parseCsv } from '../../src/domain/csv';
import { parseCondition, parseInventoryCsv, parseOrdersCsv, shortVariant } from '../../src/domain/tcgplayer';
import { searchItems } from '../../src/domain/search';
import { rowToItem } from '../../src/domain/tcgplayer';
import { tcgCsv, PIKACHU_BASE, PIKACHU_CZ, PIKACHU_CZ_LP } from './helpers';

describe('csv', () => {
  it('handles quotes, embedded commas/newlines, CRLF and BOM', () => {
    const rows = parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n"multi\nline",2\r\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
      ['multi\nline', '2'],
    ]);
  });
});

describe('condition parsing keeps printings and languages distinct', () => {
  it.each([
    ['Near Mint', 'Near Mint', '', 'English'],
    ['Lightly Played Reverse Holofoil', 'Lightly Played', 'Reverse Holofoil', 'English'],
    ['Near Mint 1st Edition Holofoil', 'Near Mint', '1st Edition Holofoil', 'English'],
    ['Moderately Played Holofoil - Japanese', 'Moderately Played', 'Holofoil', 'Japanese'],
    ['Damaged Unlimited', 'Damaged', 'Unlimited', 'English'],
  ])('%s', (raw, c, p, l) => {
    expect(parseCondition(raw)).toEqual({ condition: c, printing: p, language: l });
  });
  it('short labels', () => {
    expect(shortVariant(parseCondition('Lightly Played Reverse Holofoil'))).toBe('LP Rev Holo');
  });
});

describe('inventory csv', () => {
  it('reports missing columns', () => {
    expect(parseInventoryCsv('Name,Qty\nPikachu,1').missingColumns.length).toBeGreaterThan(0);
  });
  it('rejects rows without SKU, bad quantities, and BOTH copies of duplicate SKUs', () => {
    const csv = tcgCsv([
      PIKACHU_BASE,
      { ...PIKACHU_CZ, id: '' },
      { ...PIKACHU_CZ_LP, qty: -1 },
      { id: '9', name: 'Mew', set: 'Base Set', qty: 1 },
      { id: '9', name: 'Mew', set: 'Base Set', qty: 2 },
    ]);
    const p = parseInventoryCsv(csv);
    expect(p.rows.map((r) => r.sku)).toEqual(['1001']);
    expect(p.rejected).toHaveLength(4);
  });
});

describe('order csv', () => {
  it('reads one-row-per-line exports', () => {
    const p = parseOrdersCsv('Order #,SkuId,Quantity,Product Name\nA1,1001,2,Pikachu\nA1,2001,1,Pikachu\nB2,1001,1,Pikachu');
    expect(p.errors).toEqual([]);
    expect(p.lines.map((l) => [l.orderId, l.sku, l.qty])).toEqual([
      ['A1', '1001', 2],
      ['A1', '2001', 1],
      ['B2', '1001', 1],
    ]);
  });
  it('reads pull sheets with an Order Quantity column', () => {
    const p = parseOrdersCsv('Product Name,Set,SkuId,Quantity,Order Quantity\nPikachu,Base Set,1001,3,"ABC-1:1 | DEF-2:2"');
    expect(p.lines.map((l) => [l.orderId, l.qty])).toEqual([
      ['ABC-1', 1],
      ['DEF-2', 2],
    ]);
  });
  it('rejects files with no order column', () => {
    expect(parseOrdersCsv('Name,Qty\nPikachu,1').errors.length).toBe(1);
  });
});

describe('search', () => {
  const items = [PIKACHU_BASE, PIKACHU_CZ, PIKACHU_CZ_LP].map((r, i) =>
    rowToItem({ line: i, sku: r.id, productLine: 'Pokemon', setName: r.set, productName: r.name, number: r.number!, rarity: '', conditionRaw: r.condition ?? 'Near Mint', marketPrice: null, totalQty: r.qty }, 0),
  );
  it('groups variants per product and never merges sets', () => {
    const g = searchItems(items, 'pika');
    expect(g).toHaveLength(2);
    const cz = g.find((x) => x.setName === 'Crown Zenith')!;
    expect(cz.variants.map((v) => v.condition)).toEqual(['Near Mint', 'Lightly Played']);
  });
  it('ranks the current location sets first and matches numbers', () => {
    expect(searchItems(items, 'pika', { preferredSets: ['Base Set'] })[0]!.setName).toBe('Base Set');
    expect(searchItems(items, 'pika 29')[0]!.setName).toBe('Crown Zenith');
  });
});
