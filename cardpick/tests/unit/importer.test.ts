import { describe, expect, it } from 'vitest';
import { db } from '../../src/db/db';
import { createUnlistedItem, importOrders } from '../../src/db/importer';
import { checkIntegrity, createLocation, setCount } from '../../src/db/inventory';
import { linkOrderLine, linkUnlisted } from '../../src/db/problems';
import { seed, view, PIKACHU_BASE, PIKACHU_CZ, PIKACHU_CZ_LP } from './helpers';

describe('TCGplayer inventory import', () => {
  it('never creates physical inventory or verification', async () => {
    const s = await seed([PIKACHU_BASE, PIKACHU_CZ, PIKACHU_CZ_LP]);
    expect(s.added).toBe(3);
    expect(await db().balances.count()).toBe(0);
    expect(await db().ledger.count()).toBe(0);
    const v = await view('2001');
    expect(v.status).toBe('unverified');
    expect(v.physical).toBe(0);
    expect(v.item.marketplaceQty).toBe(5);
  });

  it('keeps Base Set vs Crown Zenith, and NM vs LP, as separate cards', async () => {
    await seed([PIKACHU_BASE, PIKACHU_CZ, PIKACHU_CZ_LP]);
    const items = await db().items.where('productName').equals('Pikachu').toArray();
    expect(items).toHaveLength(3);
    expect(new Set(items.map((i) => `${i.setName}|${i.condition}`)).size).toBe(3);
  });

  it('re-import updates marketplace qty only and leaves balances untouched', async () => {
    await seed([PIKACHU_CZ]);
    await createLocation('B004', 'sorted');
    await setCount('2001', 'B004', 4, 'test');
    const s = await seed([{ ...PIKACHU_CZ, qty: 9 }]);
    expect(s.qtyChanged).toBe(1);
    const v = await view('2001');
    expect(v.item.marketplaceQty).toBe(9);
    expect(v.physical).toBe(4);
  });

  it('a complete-inventory import zeroes marketplace qty of SKUs absent from the file', async () => {
    await seed([PIKACHU_BASE, PIKACHU_CZ]);
    const s = await seed([PIKACHU_CZ], true);
    expect(s.zeroedAbsent).toBe(1);
    expect((await db().items.get('1001'))!.marketplaceQty).toBe(0);
    const partial = await seed([{ ...PIKACHU_BASE, id: '3003', qty: 1 }], false);
    expect(partial.zeroedAbsent).toBe(0);
    expect((await db().items.get('2001'))!.marketplaceQty).toBe(5);
  });

  it('identity change on an existing SKU is flagged, not applied; re-import does not duplicate problems', async () => {
    await seed([PIKACHU_CZ]);
    const moved = { ...PIKACHU_CZ, set: 'Base Set' };
    expect((await seed([moved])).identityConflicts).toBe(1);
    await seed([moved]);
    expect((await db().items.get('2001'))!.setName).toBe('Crown Zenith');
    const probs = await db().problems.where('type').equals('import').toArray();
    expect(probs).toHaveLength(1);
  });

  it('rejected rows become Fix items', async () => {
    await seed([PIKACHU_CZ, { ...PIKACHU_BASE, id: '' }]);
    expect(await db().problems.where('type').equals('import').count()).toBe(1);
  });

  it('takes a snapshot before importing', async () => {
    await seed([PIKACHU_CZ]);
    expect(await db().snapshots.count()).toBe(1);
  });
});

describe('unlisted cards', () => {
  it('stay flagged until linked, then balances move to the real SKU', async () => {
    await seed([PIKACHU_CZ]);
    await createLocation('C001', 'chaos');
    const local = await createUnlistedItem({ productName: 'Pikachu', setName: 'Crown Zenith', number: '029/159', conditionRaw: 'Near Mint' });
    await setCount(local.id, 'C001', 2, 't');
    expect((await view(local.id)).status).toBe('needs-review');
    const p = (await db().problems.where('type').equals('unlisted').toArray())[0]!;
    expect(await linkUnlisted(p.id, '2001')).toBe(2);
    expect(await db().items.get(local.id)).toBeUndefined();
    const v = await view('2001');
    expect(v.physical).toBe(2);
    expect(v.status).toBe('verified');
    expect((await checkIntegrity()).ok).toBe(true);
  });
});

describe('order import', () => {
  it('groups lines per order, does not double count on re-import, flags unmatched lines', async () => {
    await seed([PIKACHU_BASE, PIKACHU_CZ]);
    const csv = 'Order #,SkuId,Quantity,Product Name,Set\nA1,1001,1,Pikachu,Base Set\nA1,2001,2,Pikachu,Crown Zenith\nB2,,1,Mewtwo,Base Set';
    const s = await importOrders(csv);
    expect(s).toMatchObject({ orders: 2, lines: 3, unmatched: 1 });
    await importOrders(csv);
    const a1 = await db().orders.get('A1');
    expect(a1!.lines.map((l) => l.qty)).toEqual([1, 2]);
    const probs = await db().problems.where('type').equals('order-line').toArray();
    expect(probs.filter((p) => p.status === 'open')).toHaveLength(1);
    await linkOrderLine(probs[0]!.id, '1001');
    expect((await db().orders.get('B2'))!.lines[0]!.itemId).toBe('1001');
  });

  it('matches SKU-less lines only on an exact, unique identity', async () => {
    await seed([PIKACHU_CZ, PIKACHU_CZ_LP]);
    await importOrders('Order #,Product Name,Set,Number,Condition,Quantity\nX,Pikachu,Crown Zenith,029/159,Lightly Played,1\nY,Pikachu,Crown Zenith,029/159,Mint,1');
    expect((await db().orders.get('X'))!.lines[0]!.itemId).toBe('2002');
    expect((await db().orders.get('Y'))!.lines[0]!.itemId).toBeNull();
  });
});
