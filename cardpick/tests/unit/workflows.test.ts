// Realistic end-to-end workflows at the data layer.
import { describe, expect, it } from 'vitest';
import { db } from '../../src/db/db';
import { checkIntegrity, confirmLost, createLocation, markFound, nextChaosCode, putAway, retireLocation, setCount } from '../../src/db/inventory';
import { auditTap, finishAudit, previewAudit, putawayTap, putawayUndo, startSession } from '../../src/db/sessions';
import { completeBatch, confirmTask, createBatch, undoTask } from '../../src/db/picking';
import { importOrders } from '../../src/db/importer';
import { experimentStats } from '../../src/db/stats';
import { exportBackup, restoreBackup, validateBackup } from '../../src/db/backup';
import { reconcile } from '../../src/domain/status';
import { MISSING } from '../../src/domain/types';
import { seed, view, PIKACHU_CZ, type Row } from './helpers';

async function integrityOk() {
  const r = await checkIntegrity();
  expect(r.problems).toEqual([]);
}

describe('Audit', () => {
  it('processes 300 cards into a location and records experiment metrics', async () => {
    const rows: Row[] = Array.from({ length: 120 }, (_, i) => ({ id: String(5000 + i), name: `Card ${i}`, set: 'Crown Zenith', number: `${i + 1}/159`, qty: 2 }));
    await seed(rows);
    await createLocation('B004', 'sorted', { setHomes: ['Crown Zenith'] });
    const s = await startSession('B004', 'audit');
    // 300 taps: SKUs get 2 or 3 each until 300 cards, roughly matching TCGplayer.
    let taps = 0;
    for (let i = 0; i < 120 && taps < 300; i++) {
      const n = i % 10 === 0 ? 3 : i < 50 ? 2 : 3;
      for (let k = 0; k < n && taps < 300; k++, taps++) await auditTap(s.id, String(5000 + i));
    }
    expect(taps).toBe(300);
    const pre = await previewAudit(s.id);
    expect(pre.homeAbsent).toHaveLength(120 - pre.session.lines.length);
    const res = await finishAudit(s.id, { markNotCountedMissing: false, confirmHomeAbsent: true });
    expect(res.cardsCounted).toBe(300);
    expect(res.confirmedAbsent).toBe(120 - res.skusCounted);
    expect((await view('5001')).status).toBe('verified');
    const stats = await experimentStats();
    expect(stats.cardsAudited).toBe(300);
    expect(stats.discrepantSkus).toBe(res.discrepancies);
    expect(stats.discrepancyRate).toBeGreaterThan(0);
    await integrityOk();
  });

  it('rapid concurrent taps never lose a count', async () => {
    await seed([PIKACHU_CZ]);
    await createLocation('B004', 'sorted');
    await createLocation('C001', 'chaos');
    const a = await startSession('B004', 'audit');
    const p = await startSession('C001', 'putaway');
    await Promise.all(Array.from({ length: 25 }, () => auditTap(a.id, '2001')));
    await Promise.all(Array.from({ length: 25 }, () => putawayTap(p.id, '2001')));
    expect((await db().sessions.get(a.id))!.lines[0]!.qty).toBe(25);
    expect((await db().sessions.get(p.id))!.lines[0]!.qty).toBe(25);
    expect((await view('2001')).physical).toBe(25);
    await integrityOk();
  });

  it('decrement on a mistap and resumes the same open session', async () => {
    await seed([PIKACHU_CZ]);
    await createLocation('B004', 'sorted');
    const s = await startSession('B004', 'audit');
    await auditTap(s.id, '2001');
    await auditTap(s.id, '2001');
    await auditTap(s.id, '2001', -1);
    const again = await startSession('B004', 'audit');
    expect(again.id).toBe(s.id);
    expect(again.lines).toEqual([{ itemId: '2001', qty: 1 }]);
    // Nothing is applied until finish.
    expect(await db().balances.count()).toBe(0);
  });

  it('previously recorded cards that are not recounted move to MISSING only when asked', async () => {
    await seed([PIKACHU_CZ, { id: '2005', name: 'Raichu', set: 'Crown Zenith', qty: 1 }]);
    await createLocation('B004', 'sorted');
    await setCount('2005', 'B004', 1, 'earlier');
    const s = await startSession('B004', 'audit');
    await auditTap(s.id, '2001');
    expect((await previewAudit(s.id)).notCounted.map((n) => n.item.id)).toEqual(['2005']);
    const r = await finishAudit(s.id, { markNotCountedMissing: true, confirmHomeAbsent: false });
    expect(r.movedToMissing).toBe(1);
    const v = await view('2005');
    expect(v.physical).toBe(0);
    expect(v.missing).toBe(1);
    expect(v.status).toBe('needs-review');
    await integrityOk();
  });

  it('a set spanning two boxes is not verified until both are counted', async () => {
    await seed([PIKACHU_CZ]);
    await createLocation('B004', 'sorted', { setHomes: ['Crown Zenith'] });
    await createLocation('B005', 'sorted', { setHomes: ['Crown Zenith'] });
    await setCount('2001', 'B004', 3, 't');
    expect((await view('2001')).status).toBe('unverified');
    await setCount('2001', 'B005', 0, 't');
    expect((await view('2001')).status).toBe('verified');
  });
});

describe('Chaos put away', () => {
  it('puts 100 cards into C001 consecutively without re-selecting the location', async () => {
    const rows: Row[] = Array.from({ length: 40 }, (_, i) => ({ id: String(7000 + i), name: `Card ${i}`, set: 'Paldea Evolved', qty: 0 }));
    await seed(rows);
    expect(await nextChaosCode()).toBe('C001');
    await createLocation('C001', 'chaos');
    expect(await nextChaosCode()).toBe('C002');
    const s = await startSession('C001', 'putaway');
    for (let i = 0; i < 100; i++) await putawayTap(s.id, String(7000 + (i % 40)));
    const bal = await db().balances.where('location').equals('C001').toArray();
    expect(bal.reduce((a, b) => a + b.qty, 0)).toBe(100);
    await putawayUndo(s.id, '7000');
    expect((await view('7000')).physical).toBe(2);
    expect((await view('7001')).status).toBe('verified');
    await integrityOk();
  });

  it('retiring a location is refused while it holds cards', async () => {
    await seed([PIKACHU_CZ]);
    await createLocation('C003', 'chaos');
    await putAway('2001', 'C003', 1, 't');
    await expect(retireLocation('C003')).rejects.toThrow(/still holds/);
  });
});

describe('Multi-location card and picking', () => {
  async function pikachuSetup(tcgQty = 5) {
    await seed([{ ...PIKACHU_CZ, qty: tcgQty }]);
    await createLocation('B004', 'sorted');
    await createLocation('C009', 'chaos');
    await setCount('2001', 'B004', 3, 'audit');
    await putAway('2001', 'C009', 2, 'putaway');
  }

  it('physical total comes from location balances', async () => {
    await pikachuSetup();
    const v = await view('2001');
    expect(v.locations).toEqual([
      { location: 'B004', qty: 3, counted: true },
      { location: 'C009', qty: 2, counted: true },
    ]);
    expect(v.physical).toBe(5);
    expect(v.status).toBe('verified');
  });

  it('an order for four Pikachu picks B004 ×3 then C009 ×1', async () => {
    await pikachuSetup();
    await importOrders('Order #,SkuId,Quantity\nA,2001,4');
    const b = await createBatch(['A']);
    expect(b.tasks.map((t) => [t.location, t.qty])).toEqual([
      ['B004', 3],
      ['C009', 1],
    ]);
    for (const t of b.tasks) await confirmTask(b.id, t.id, t.qty);
    const sum = await completeBatch(b.id);
    expect(sum).toMatchObject({ picked: 4, needed: 4, ordersComplete: 1, shortTasks: 0, stops: 2 });
    expect((await view('2001')).locations).toEqual([{ location: 'C009', qty: 1, counted: true }]);
    expect((await db().orders.get('A'))!.status).toBe('picked');
    await integrityOk();
  });

  it('short pick: found qty is kept, missing qty is flagged, nothing is blindly erased', async () => {
    await seed([PIKACHU_CZ]);
    await createLocation('C009', 'chaos');
    await putAway('2001', 'C009', 2, 'putaway');
    await importOrders('Order #,SkuId,Quantity\nA,2001,2');
    const b = await createBatch(['A']);
    const t = b.tasks[0]!;
    expect([t.location, t.qty]).toEqual(['C009', 2]);
    const after = await confirmTask(b.id, t.id, 1);
    const v = await view('2001');
    expect(v.physical).toBe(0); // the one found was taken
    expect(v.missing).toBe(1); // the other is not erased: it is MISSING
    expect(v.status).toBe('needs-review');
    const prob = v.openProblems[0]!;
    expect(prob).toMatchObject({ type: 'missing', qty: 1, location: 'C009' });
    expect(after.unlocated).toEqual([{ itemId: '2001', qty: 1, orders: [{ orderId: 'A', qty: 1 }], fromTask: t.id }]);
    expect((await db().orders.get('A'))!.lines[0]!.picked).toBe(1);
    await integrityOk();

    // Later the card turns up in C010.
    await createLocation('C010', 'chaos');
    await markFound(prob.id, 'C010', 1);
    const v2 = await view('2001');
    expect([v2.physical, v2.missing, v2.status]).toEqual([1, 0, 'verified']);
    await integrityOk();
  });

  it('short pick re-routes the shortfall to another location', async () => {
    await pikachuSetup();
    await importOrders('Order #,SkuId,Quantity\nA,2001,3');
    const b = await createBatch(['A']);
    expect(b.tasks.map((t) => [t.location, t.qty])).toEqual([['B004', 3]]);
    const after = await confirmTask(b.id, b.tasks[0]!.id, 1);
    const follow = after.tasks.find((t) => t.status === 'todo')!;
    expect([follow.location, follow.qty]).toEqual(['C009', 2]);
    expect((await view('2001')).missing).toBe(2);
    await integrityOk();
  });

  it('undo restores a short pick exactly', async () => {
    await pikachuSetup();
    await importOrders('Order #,SkuId,Quantity\nA,2001,3');
    const b = await createBatch(['A']);
    await confirmTask(b.id, b.tasks[0]!.id, 1);
    const undone = await undoTask(b.id, b.tasks[0]!.id);
    expect(undone.tasks).toHaveLength(1);
    expect(undone.tasks[0]!.status).toBe('todo');
    const v = await view('2001');
    expect([v.physical, v.missing, v.status]).toEqual([5, 0, 'verified']);
    expect((await db().orders.get('A'))!.lines[0]!.picked).toBe(0);
    await integrityOk();
  });

  it('confirm lost is the explicit way units leave MISSING', async () => {
    await seed([PIKACHU_CZ]);
    await createLocation('C009', 'chaos');
    await putAway('2001', 'C009', 2, 'p');
    await importOrders('Order #,SkuId,Quantity\nA,2001,2');
    const b = await createBatch(['A']);
    await confirmTask(b.id, b.tasks[0]!.id, 0);
    const p = (await view('2001')).openProblems[0]!;
    await confirmLost(p.id, 2);
    const v = await view('2001');
    expect([v.physical, v.missing]).toEqual([0, 0]);
    const ledger = await db().ledger.where('location').equals(MISSING).toArray();
    expect(ledger.map((l) => l.type)).toEqual(['missing', 'writeoff']);
    await integrityOk();
  });

  it('batch picking merges orders per location with a per-order breakdown', async () => {
    await pikachuSetup();
    await importOrders('Order #,SkuId,Quantity,Order Date\nA,2001,1,2026-09-01\nD,2001,2,2026-09-02');
    const b = await createBatch(['A', 'D']);
    expect(b.tasks).toHaveLength(1);
    expect(b.tasks[0]).toMatchObject({ location: 'B004', qty: 3, orders: [{ orderId: 'A', qty: 1 }, { orderId: 'D', qty: 2 }] });
  });

  it('unverified set-home picks: points to the box, flags when not found', async () => {
    await seed([PIKACHU_CZ]);
    await createLocation('B004', 'sorted', { setHomes: ['Crown Zenith'] });
    await importOrders('Order #,SkuId,Quantity\nA,2001,1');
    const b = await createBatch(['A']);
    expect(b.tasks[0]).toMatchObject({ location: 'B004', verified: false, qty: 1 });
    await confirmTask(b.id, b.tasks[0]!.id, 0);
    expect((await view('2001')).status).toBe('needs-review');
    expect(await db().balances.count()).toBe(0);
    const sum = await completeBatch(b.id);
    expect(sum.ordersShort).toBe(1);
  });
});

describe('Reconciliation', () => {
  it('physical 5 vs TCGplayer 3 recommends +2 without changing TCGplayer data', async () => {
    await seed([{ ...PIKACHU_CZ, qty: 3 }]);
    await createLocation('B004', 'sorted');
    await createLocation('C009', 'chaos');
    await setCount('2001', 'B004', 3, 'a');
    await putAway('2001', 'C009', 2, 'p');
    const r = reconcile([await view('2001')]);
    expect(r.actionable).toHaveLength(1);
    expect(r.actionable[0]!.adjustment).toBe(2);
    expect((await db().items.get('2001'))!.marketplaceQty).toBe(3);
  });

  it('needs-review items are blocked, not recommended', async () => {
    await seed([PIKACHU_CZ]);
    await createLocation('C009', 'chaos');
    await putAway('2001', 'C009', 2, 'p');
    await importOrders('Order #,SkuId,Quantity\nA,2001,2');
    const b = await createBatch(['A']);
    await confirmTask(b.id, b.tasks[0]!.id, 1);
    const r = reconcile([await view('2001')]);
    expect(r.actionable).toHaveLength(0);
    expect(r.blocked).toHaveLength(1);
  });
});

describe('Backup and restore', () => {
  it('round-trips all data and rejects corrupted backups', async () => {
    await seed([PIKACHU_CZ]);
    await createLocation('C001', 'chaos');
    await putAway('2001', 'C001', 3, 'p');
    const text = await exportBackup();
    await putAway('2001', 'C001', 5, 'later');
    await restoreBackup(text);
    expect((await view('2001')).physical).toBe(3);
    await integrityOk();

    const bad = JSON.parse(text);
    bad.tables.balances[0].qty = 99;
    expect(validateBackup(JSON.stringify(bad)).ok).toBe(false);
    expect(validateBackup('{"app":"other"}').ok).toBe(false);
    const truncated = JSON.parse(text);
    truncated.tables.ledger.pop();
    expect(validateBackup(JSON.stringify(truncated)).ok).toBe(false);
  });
});
