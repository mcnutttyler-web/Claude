// Core domain types. See CARDPICK_PROJECT.md for the rules these encode.

/** One sellable identity: a TCGplayer SKU (product + condition + printing + language). */
export interface Item {
  /** TCGplayer SKU id as a string, or `local-<uuid>` for unlisted cards. */
  id: string;
  productLine: string;
  setName: string;
  productName: string;
  number: string;
  rarity: string;
  /** Raw TCGplayer condition string, e.g. "Lightly Played Reverse Holofoil". */
  conditionRaw: string;
  /** Parsed base condition, e.g. "Near Mint". */
  condition: string;
  /** Parsed printing, e.g. "Holofoil", "Reverse Holofoil", "1st Edition Holofoil", "" (normal). */
  printing: string;
  /** Parsed language; "English" unless stated. */
  language: string;
  marketPrice: number | null;
  /** What TCGplayer last reported. Reference only — never physical truth. */
  marketplaceQty: number;
  /** True when the item is not (yet) a TCGplayer listing. */
  unlisted: boolean;
  lastImportedAt: number | null;
  /** Lower-cased search blob, precomputed. */
  search: string;
}

export type LocationKind = 'sorted' | 'chaos' | 'system';

export interface Location {
  code: string; // e.g. "B004", "C001", "MISSING"
  kind: LocationKind;
  note: string;
  /** Target card count (chaos bins). null = no target. */
  capacity: number | null;
  /** Sets that physically live here (sorted locations). */
  setHomes: string[];
  retired: boolean;
  createdAt: number;
}

export const MISSING = 'MISSING';

/** Physical quantity of one item at one location. The physical record. */
export interface Balance {
  key: string; // `${itemId}|${location}`
  itemId: string;
  location: string;
  qty: number;
  /** When a human last counted/placed this balance (evidence). */
  countedAt: number | null;
  updatedAt: number;
}

export type LedgerType =
  | 'audit' // a count set the balance
  | 'putaway' // cards placed into a location
  | 'pick' // cards removed to fill an order
  | 'missing' // expected units not found → moved to MISSING
  | 'found' // units from MISSING found again
  | 'writeoff' // units confirmed lost (leave MISSING)
  | 'move' // relocation between real locations
  | 'adjust' // manual correction (undo, merge)
  | 'restore'; // a backup restore baseline

/** Append-only movement log. Replaying it must reproduce all balances. */
export interface LedgerEntry {
  id?: number;
  at: number;
  type: LedgerType;
  itemId: string;
  location: string;
  /** Signed change applied to the balance at `location`. */
  delta: number;
  note: string;
  ref: string; // session / batch / problem id
}

export type ProblemType =
  | 'missing' // units in MISSING awaiting investigation
  | 'unlisted' // card exists physically but has no TCGplayer SKU
  | 'import' // import row could not be trusted
  | 'order-line' // order line could not be matched to an item
  | 'pick-unverified'; // card not found at its expected (unverified) location

export interface Problem {
  id: string;
  type: ProblemType;
  itemId: string | null;
  location: string | null;
  qty: number;
  message: string;
  detail: string;
  status: 'open' | 'resolved';
  resolution: string;
  createdAt: number;
  resolvedAt: number | null;
  /** For order-line problems: which order line. */
  orderId?: string;
  lineIndex?: number;
}

export interface AuditLine {
  itemId: string;
  qty: number;
}

export interface AuditSession {
  id: string;
  location: string;
  /** 'putaway' sessions share this table so speed metrics are comparable. */
  mode: 'audit' | 'putaway';
  startedAt: number;
  endedAt: number | null;
  /** Timestamps of every recorded card tap (for active-time metrics). */
  taps: number[];
  lines: AuditLine[];
  /** Filled at finish (audit mode). */
  result: AuditResult | null;
}

export interface AuditResult {
  cardsCounted: number;
  skusCounted: number;
  /** SKUs whose counted total disagrees with TCGplayer. */
  discrepancies: number;
  /** SKUs TCGplayer lists for this location's set homes that were confirmed absent. */
  confirmedAbsent: number;
  /** Units moved to MISSING because a prior balance here wasn't recounted. */
  movedToMissing: number;
  /** Counted SKUs not yet verified because another set-home location is unaudited. */
  pending: number;
  /** Counted SKUs that have no TCGplayer listing. */
  unlisted: number;
  activeMs: number;
}

export interface OrderLine {
  /** Matched item id, or null when unmatched (then a Fix item exists). */
  itemId: string | null;
  qty: number;
  picked: number;
  /** Raw description, for unmatched lines and display. */
  label: string;
}

export interface Order {
  id: string; // TCGplayer order number
  buyer: string;
  orderedAt: number | null;
  importedAt: number;
  status: 'open' | 'picking' | 'picked' | 'short' | 'archived';
  lines: OrderLine[];
}

export interface PickTask {
  id: string; // `${location}|${itemId}`
  location: string;
  /** false = guessed from a set home, no counted balance. */
  verified: boolean;
  itemId: string;
  qty: number;
  /** Per-order breakdown of qty. */
  orders: { orderId: string; qty: number }[];
  status: 'todo' | 'done';
  found: number | null;
  /** What confirming this task did, so it can be undone exactly. */
  effects?: {
    missingMoved: number;
    problemId: string | null;
    addedTaskIds: string[];
  };
}

export interface UnlocatedNeed {
  itemId: string;
  qty: number;
  orders: { orderId: string; qty: number }[];
  /** Set when this shortfall came from a short pick of that task. */
  fromTask?: string;
}

export interface PickBatch {
  id: string;
  createdAt: number;
  completedAt: number | null;
  orderIds: string[];
  tasks: PickTask[];
  /** Items that could not be allocated to any location. */
  unlocated: UnlocatedNeed[];
  /** Timestamps of each task completion (metrics). */
  taps: number[];
}

export interface Meta {
  key: string;
  value: unknown;
}

export interface Snapshot {
  id?: number;
  at: number;
  reason: string;
  data: string; // serialized backup JSON
}
