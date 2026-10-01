import { expect, test, type Page } from '@playwright/test';

const HEADER =
  'TCGplayer Id,Product Line,Set Name,Product Name,Title,Number,Rarity,Condition,TCG Market Price,TCG Direct Low,TCG Low Price With Shipping,TCG Low Price,Total Quantity,Add to Quantity,TCG Marketplace Price,Photo URL';

function inventoryCsv(): string {
  const rows = [
    ['2001', 'Crown Zenith', 'Pikachu', '029/159', 'Near Mint', 3],
    ['2002', 'Crown Zenith', 'Pikachu', '029/159', 'Lightly Played', 1],
    ['1001', 'Base Set', 'Pikachu', '58/102', 'Near Mint', 2],
    ['2003', 'Crown Zenith', 'Raichu', '030/159', 'Near Mint Holofoil', 2],
    ['2004', 'Crown Zenith', 'Mew', '060/159', 'Near Mint', 1],
  ];
  // Filler cards so search has realistic noise.
  for (let i = 0; i < 200; i++) rows.push([String(9000 + i), 'Paldea Evolved', `Filler Card ${i}`, `${i + 1}/193`, 'Near Mint', 1]);
  return [HEADER, ...rows.map((r) => `${r[0]},Pokemon,${r[1]},${r[2]},,${r[3]},Common,${r[4]},0.25,,,,${r[5]},0,0.30,`)].join('\n');
}

async function fresh(page: Page) {
  await page.goto('./');
  await page.evaluate(async () => {
    const dbs = await indexedDB.databases();
    await Promise.all(dbs.map((d) => new Promise((r) => { const q = indexedDB.deleteDatabase(d.name!); q.onsuccess = q.onerror = q.onblocked = () => r(null); })));
  });
  await page.reload();
}

async function importInventory(page: Page) {
  await page.getByRole('button', { name: 'Import TCGplayer inventory' }).click();
  await page.locator('[data-testid=inventory-file]').setInputFiles({ name: 'inv.csv', mimeType: 'text/csv', buffer: Buffer.from(inventoryCsv()) });
  await expect(page.getByTestId('import-summary')).toContainText('205');
}

async function addLocation(page: Page, code: string, kind: 'Sorted box (by set)' | 'Chaos bin', set?: string) {
  await page.goto('./#/locations');
  await page.getByRole('button', { name: kind, exact: true }).click();
  await page.getByLabel('Location code').fill(code);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  if (set) {
    await page.locator('.loc-row-head', { hasText: code }).click();
    await page.getByLabel('Add set').fill(set.slice(0, 5));
    await page.getByRole('button', { name: `+ ${set}` }).click();
    await expect(page.locator('.loc-row', { hasText: code })).toContainText(`Sets: ${set}`);
  }
}

async function tapCard(page: Page, query: string, chip: string) {
  const box = page.getByLabel('Search cards');
  await box.fill(query);
  await page.getByRole('button', { name: chip, exact: true }).first().click();
  await expect(box).toHaveValue('');
  await expect(box).toBeFocused();
}

test('full loop: import → audit → put away → find → pick (with short) → fix → reconcile → backup', async ({ page }) => {
  await fresh(page);
  await importInventory(page);
  await addLocation(page, 'B004', 'Sorted box (by set)', 'Crown Zenith');
  await addLocation(page, 'C001', 'Chaos bin');

  // AUDIT B004: 3 Pikachu NM, 1 Raichu holo. Mew (TCG says 1) is absent.
  await page.getByRole('button', { name: 'Audit' }).click();
  await page.getByRole('button', { name: /B004/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Auditing B004' })).toBeVisible();
  for (let i = 0; i < 3; i++) await tapCard(page, 'pika', 'Pikachu NM');
  await tapCard(page, 'raic', 'Raichu NM Holo');
  await expect(page.getByTestId('audit-count')).toHaveText('4');
  // Crown Zenith ranks first because the set lives in B004.
  await page.getByLabel('Search cards').fill('pika');
  await expect(page.locator('.result').first()).toContainText('Crown Zenith');
  await page.getByLabel('Search cards').fill('');
  await page.getByRole('button', { name: 'Finish B004' }).click();
  await expect(page.getByText('Listed on TCGplayer, not counted here')).toBeVisible();
  await page.getByText('I counted the whole set').click();
  await page.getByRole('button', { name: 'Save counts' }).click();
  await expect(page.getByRole('heading', { name: 'Audit done' })).toBeVisible();
  await expect(page.locator('.stats')).toContainText('Cards counted4');

  // PUT AWAY into C001: 2 more Pikachu NM, location remembered across navigation.
  await page.getByRole('button', { name: 'Put Away' }).click();
  await page.getByRole('button', { name: /C001/ }).first().click();
  await tapCard(page, 'pika 29', 'Pikachu NM');
  await page.getByRole('button', { name: 'Find' }).click();
  await page.getByRole('button', { name: 'Put Away' }).click();
  await expect(page.getByRole('heading', { name: 'Into C001' })).toBeVisible();
  await tapCard(page, 'pika 29', 'Pikachu NM');
  await expect(page.getByTestId('putaway-count')).toHaveText('2');

  // FIND: physical total 5 = B004 3 + C001 2.
  await page.getByRole('button', { name: 'Find' }).click();
  await expect(page.getByRole('heading', { name: 'Find' })).toBeVisible();
  await page.getByLabel('Search cards').fill('pikachu crown');
  await page.getByRole('button', { name: 'Pikachu NM', exact: true }).click();
  const nm = page.locator('.variant-panel', { hasText: 'NM' }).first();
  await expect(nm.getByTestId('physical-total')).toHaveText('5');
  await expect(nm).toContainText('B004 × 3');
  await expect(nm).toContainText('C001 × 2');
  await expect(nm).toContainText('Verified');
  await expect(nm).toContainText('Recommended TCGplayer adjustment: +2');

  // RECONCILE: +2 for Pikachu NM; −1 for Pikachu LP and Mew (confirmed absent from their set's box).
  await page.goto('./#/reconcile');
  await expect(page.getByTestId('recon-row').filter({ hasText: 'Pikachu NM' })).toContainText('+2');
  await expect(page.getByTestId('recon-row').filter({ hasText: 'Pikachu LP' })).toContainText('-1');
  await expect(page.getByTestId('recon-row').filter({ hasText: 'Mew' })).toContainText('-1');

  // PICK: order A needs 4 Pikachu → B004 ×3, then C001 ×1. Order B needs 1 Raichu.
  await page.getByRole('button', { name: 'Pick' }).click();
  await page.getByTestId('orders-file').setInputFiles({
    name: 'orders.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Order #,SkuId,Quantity,Order Date\nA-1001,2001,4,2026-09-01\nB-1002,2003,1,2026-09-02'),
  });
  await page.getByRole('button', { name: /Pick 2 orders · 5 cards/ }).click();
  const stop = page.getByTestId('current-stop');
  await expect(stop).toContainText('Go to B004');
  await expect(stop).toContainText('Pikachu');
  await expect(stop).toContainText('Raichu');
  await stop.locator('.task', { hasText: 'Pikachu' }).getByRole('button', { name: 'Got 3' }).click();
  await stop.locator('.task', { hasText: 'Raichu' }).getByRole('button', { name: 'Got 1' }).click();
  // C001: expected 1 (of 2 there). Simulate a short pick: found 0.
  await expect(stop).toContainText('Go to C001');
  await stop.getByRole('button', { name: 'Found fewer' }).click();
  await stop.getByRole('button', { name: 'Found 0' }).click();
  await page.getByRole('button', { name: 'Finish batch' }).click();
  await expect(page.locator('.stats')).toContainText('Orders short1');

  // FIX: the 2 Pikachu CardPick believed were in C001 are Missing, not erased.
  await page.getByRole('button', { name: 'Investigate shortages in Fix' }).click();
  const missing = page.getByTestId('problem').filter({ hasText: 'missing from C001' });
  await expect(missing).toContainText('2 missing from C001');
  await missing.getByRole('button', { name: 'Found it' }).click();
  await missing.getByRole('button', { name: 'decrease' }).click();
  await missing.getByRole('button', { name: /C001/ }).click();
  await missing.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('problem').filter({ hasText: '1 missing from C001' })).toBeVisible();
  await page.getByRole('button', { name: 'Check data' }).click();
  await expect(page.getByText(/All \d+ balances match/)).toBeVisible();

  // BACKUP downloads a file.
  await page.goto('./#/backup');
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download backup' }).click();
  expect((await dl).suggestedFilename()).toMatch(/^cardpick-backup-.*\.json$/);
});

test('chaos put away: 60 cards in a row without re-selecting the bin', async ({ page }) => {
  await fresh(page);
  await importInventory(page);
  await page.goto('./#/putaway');
  await page.getByRole('button', { name: '+ New chaos bin' }).click();
  await expect(page.getByRole('heading', { name: 'Into C001' })).toBeVisible();
  const t0 = Date.now();
  for (let i = 0; i < 60; i++) await tapCard(page, `filler card ${i} `.trim(), 'Filler Card ' + i + ' NM');
  const ms = Date.now() - t0;
  await expect(page.getByTestId('putaway-count')).toHaveText('60');
  // Software overhead per card must stay tiny compared to handling a card.
  expect(ms / 60).toBeLessThan(1000);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Into C001' })).toBeVisible();
});

test('audit survives a reload mid-count and Enter adds an unambiguous card', async ({ page }) => {
  await fresh(page);
  await importInventory(page);
  await addLocation(page, 'B010', 'Sorted box (by set)');
  await page.getByRole('button', { name: 'Audit' }).click();
  await page.getByRole('button', { name: /B010/ }).first().click();
  const box = page.getByLabel('Search cards');
  await box.fill('mew');
  await box.press('Enter');
  await box.fill('mew');
  await box.press('Enter');
  await expect(page.getByTestId('audit-count')).toHaveText('2');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Auditing B010' })).toBeVisible();
  await expect(page.getByTestId('audit-count')).toHaveText('2');
});

test('unlisted card is recorded and flagged for Fix', async ({ page }) => {
  await fresh(page);
  await importInventory(page);
  await addLocation(page, 'C002', 'Chaos bin');
  await page.goto('./#/putaway');
  await page.getByRole('button', { name: /C002/ }).first().click();
  await page.getByLabel('Search cards').fill('Snorlax');
  await page.getByRole('button', { name: /Record it as unlisted/ }).click();
  await page.getByLabel('Set').fill('Celebrations');
  await page.getByRole('button', { name: 'Add card' }).click();
  await expect(page.getByTestId('putaway-count')).toHaveText('1');
  await page.getByRole('button', { name: 'Fix', exact: true }).click();
  await expect(page.getByTestId('problem')).toContainText('Not on TCGplayer: Snorlax');
});

test('layout fits a phone without horizontal scroll', async ({ page }) => {
  await fresh(page);
  for (const r of ['audit', 'putaway', 'pick', 'find', 'fix', 'more', 'reconcile', 'stats', 'locations', 'backup', 'import']) {
    await page.goto(`./#/${r}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, r).toBeLessThanOrEqual(0);
  }
});
