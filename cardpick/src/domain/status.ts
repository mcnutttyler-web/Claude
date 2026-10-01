import { MISSING, type Balance, type Item, type Location, type Problem } from './types';
import { compareLocation } from './search';

export type ItemStatus = 'verified' | 'unverified' | 'needs-review';

export interface ItemView {
  item: Item;
  /** Real-location balances with qty > 0, natural-sorted. */
  locations: { location: string; qty: number; counted: boolean }[];
  physical: number;
  missing: number;
  status: ItemStatus;
  /** Set-home locations not yet counted for this item (where it might also be). */
  uncountedHomes: string[];
  openProblems: Problem[];
}

export function homesBySet(locations: Location[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const l of locations) {
    if (l.retired || l.kind === 'system') continue;
    for (const s of l.setHomes) {
      const arr = m.get(s) ?? [];
      arr.push(l.code);
      m.set(s, arr);
    }
  }
  for (const arr of m.values()) arr.sort(compareLocation);
  return m;
}

/**
 * Verified    = counted somewhere, every set-home location counted, no open problems.
 * Needs Review = open problem or units in MISSING.
 * Unverified  = everything else (including "TCGplayer says so").
 */
export function itemView(item: Item, balances: Balance[], homes: Map<string, string[]>, problems: Problem[]): ItemView {
  const real = balances.filter((b) => b.location !== MISSING);
  const missing = balances.filter((b) => b.location === MISSING).reduce((s, b) => s + b.qty, 0);
  const counted = new Set(real.filter((b) => b.countedAt !== null).map((b) => b.location));
  const uncountedHomes = (homes.get(item.setName) ?? []).filter((h) => !counted.has(h));
  const openProblems = problems.filter((p) => p.status === 'open' && p.itemId === item.id);
  let status: ItemStatus = 'unverified';
  if (openProblems.length || missing > 0) status = 'needs-review';
  else if (counted.size > 0 && uncountedHomes.length === 0) status = 'verified';
  return {
    item,
    locations: real
      .filter((b) => b.qty > 0)
      .map((b) => ({ location: b.location, qty: b.qty, counted: b.countedAt !== null }))
      .sort((a, b) => compareLocation(a.location, b.location)),
    physical: real.reduce((s, b) => s + b.qty, 0),
    missing,
    status,
    uncountedHomes,
    openProblems,
  };
}

export interface ReconRow {
  view: ItemView;
  /** Recommended change to the TCGplayer quantity (physical − marketplace). */
  adjustment: number;
}

export interface Reconciliation {
  /** Verified items whose physical total differs from TCGplayer. Safe to act on. */
  actionable: ReconRow[];
  /** Items with a difference that cannot be trusted yet (unverified / needs review). */
  blocked: ReconRow[];
  verifiedMatching: number;
}

export function reconcile(views: ItemView[]): Reconciliation {
  const r: Reconciliation = { actionable: [], blocked: [], verifiedMatching: 0 };
  for (const v of views) {
    const hasEvidence = v.locations.length > 0 || v.missing > 0 || v.status !== 'unverified';
    if (!hasEvidence) continue; // never counted: nothing to say yet
    const adjustment = v.physical - v.item.marketplaceQty;
    if (v.status === 'verified') {
      if (adjustment === 0) r.verifiedMatching++;
      else r.actionable.push({ view: v, adjustment });
    } else if (adjustment !== 0 || v.status === 'needs-review') {
      r.blocked.push({ view: v, adjustment });
    }
  }
  r.actionable.sort((a, b) => Math.abs(b.adjustment) - Math.abs(a.adjustment));
  return r;
}
