# CardPick — Project Memory

Durable product and architecture decisions. **Read this before any
architectural change.** If a change would reverse one of these, stop and
discuss it first.

## North star

One seller with ~15–16k Pokémon cards needs to establish trustworthy physical
inventory and pull orders quickly. Optimize for **speed + accuracy +
simplicity**, not feature count.

## Inventory truth decisions

1. **TCGplayer inventory is reference inventory, never physical truth.**
   Importing a TCGplayer export only updates `item.marketplaceQty`. It never
   creates, edits, or verifies a physical balance. (Enforced in
   `src/db/importer.ts`; tested in `tests/unit/importer.test.ts`.)
2. **Location balances are the physical record.** Physical total =
   sum of `balances.qty` across real locations. There is no separately
   editable "physical quantity" field anywhere.
3. **Every physical change is a ledger event.** All mutations go through
   `src/db/inventory.ts`, which writes the balance *and* an append-only
   `ledger` row in the same IndexedDB transaction. `checkIntegrity()`
   replays the ledger and must reproduce every balance exactly.
4. **Short picks and failed audits never erase inventory.** Units that were
   expected but not found move to the system location `MISSING` and open a
   Fix item. They leave MISSING only by "Found it" (move back to a real
   location) or "Confirm lost" (an explicit, logged write-off).
5. **Verification is evidence, not a flag you toggle.** An item is
   *Verified* when it has at least one counted balance and no open problems,
   *Needs Review* when an open problem or MISSING units reference it, and
   *Unverified* otherwise. When unsure, CardPick says *Needs Review*.
6. **Backups before risky operations.** Imports, restores, and merges take an
   automatic in-browser snapshot first. Manual JSON backup/restore is always
   available; restore validates the file before replacing anything.

## Card identity decisions

7. **Identity = TCGplayer SKU** (`TCGplayer Id` in the seller export), which
   already encodes product + condition + printing + language.
8. **Never merge by name.** Base Set Pikachu ≠ Crown Zenith Pikachu.
   Near Mint ≠ Lightly Played. Holofoil ≠ Reverse Holofoil. Rows without a
   SKU, duplicate SKUs, or SKUs whose set/number/condition change between
   imports become Fix items, not guesses.
9. **Cards not on TCGplayer** can be recorded as *unlisted* items (local id
   `local-…`). They always carry an open Fix item until linked to a real SKU.

## Physical layout decisions

10. **Existing sorted inventory stays where it is.** Locations of kind
    `sorted` (e.g. `B004`) can carry *set homes* ("Crown Zenith lives in
    B004"). This lets search and picking point to the right box *before* the
    box is audited, always labelled *unverified*.
11. **Chaos bins are first-class.** Locations of kind `chaos` (`C001`…) hold
    anything in any order; the software remembers contents. Chaos bins have a
    target capacity (default 650) so boxes stay hand-searchable.
12. **No forced reorganization.** Inventory migrates into chaos bins naturally
    over time.

## Workflow decisions

13. **Organize around physical activities:** Audit, Put Away, Pick, Fix, plus
    Find. Not around database tables.
14. **Phone-first, point-of-sale feel.** The current location is remembered;
    search auto-focuses and clears after each card; one tap on a
    condition/printing chip records one card; no confirmation dialogs on
    repeated actions (undo instead). Large thumb-zone buttons.
15. **Batch picking over order-by-order.** Picks are grouped by location, then
    card, with a per-order breakdown so cards can be sorted as they are pulled.
    Allocation prefers verified balances and locations already on the route.
16. **CardPick never writes to TCGplayer.** Reconciliation *recommends*
    adjustments (e.g. "+2") and exports a review CSV; the human applies them.
17. **History is kept** (ledger, pick results, audit sessions) so later
    analysis (fast movers, problem locations) is possible. Not optimized yet.

## Technical decisions

- Local-first static web app: Vite + React + TypeScript, IndexedDB via Dexie.
  No server, no accounts, no cloud. Data lives in the browser of the device
  that uses it → **backups matter**; the app requests persistent storage and
  shows backup age.
- Pure logic lives in `src/domain/` (unit tested without a browser). All
  database mutations live in `src/db/`. Screens in `src/screens/` call
  `src/db/` functions; they never write tables directly.
- Tests: `npm run typecheck`, `npm test` (Vitest + fake-indexeddb),
  `npm run e2e` (Playwright, phone viewport), `npm run build`.
