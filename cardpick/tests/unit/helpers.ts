import { toCsv } from '../../src/domain/csv';
import { importInventory } from '../../src/db/importer';
import { db } from '../../src/db/db';
import { homesBySet, itemView } from '../../src/domain/status';

export interface Row {
  id: string;
  name: string;
  set: string;
  number?: string;
  condition?: string;
  qty: number;
}

export const HEADER = [
  'TCGplayer Id', 'Product Line', 'Set Name', 'Product Name', 'Title', 'Number', 'Rarity', 'Condition',
  'TCG Market Price', 'TCG Direct Low', 'TCG Low Price With Shipping', 'TCG Low Price', 'Total Quantity',
  'Add to Quantity', 'TCG Marketplace Price', 'Photo URL',
];

export function tcgCsv(rows: Row[]): string {
  return toCsv([
    HEADER,
    ...rows.map((r) => [r.id, 'Pokemon', r.set, r.name, '', r.number ?? '001/100', 'Common', r.condition ?? 'Near Mint', '0.25', '', '', '', r.qty, '0', '0.30', '']),
  ]);
}

export const PIKACHU_BASE: Row = { id: '1001', name: 'Pikachu', set: 'Base Set', number: '58/102', qty: 3 };
export const PIKACHU_CZ: Row = { id: '2001', name: 'Pikachu', set: 'Crown Zenith', number: '029/159', qty: 5 };
export const PIKACHU_CZ_LP: Row = { id: '2002', name: 'Pikachu', set: 'Crown Zenith', number: '029/159', condition: 'Lightly Played', qty: 1 };

export async function seed(rows: Row[], complete = true) {
  return importInventory(tcgCsv(rows), { completeInventory: complete });
}

export async function view(itemId: string) {
  const d = db();
  const [item, bal, locs, probs] = await Promise.all([
    d.items.get(itemId),
    d.balances.where('itemId').equals(itemId).toArray(),
    d.locations.toArray(),
    d.problems.toArray(),
  ]);
  return itemView(item!, bal, homesBySet(locs), probs);
}
