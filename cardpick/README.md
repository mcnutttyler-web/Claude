# CardPick

Phone-first inventory and order picking for one Pokémon card seller.
Audit what you physically have, put new cards into chaos bins, find any card,
batch-pick orders by location, and fix discrepancies without corrupting good
inventory.

- Product decisions: [CARDPICK_PROJECT.md](CARDPICK_PROJECT.md) (read before architectural changes)
- Backlog and current state: [CARDPICK_ROADMAP.md](CARDPICK_ROADMAP.md)

## Run it

```bash
cd cardpick
npm install
npm run dev            # development, http://localhost:5173
npm run build          # production build into dist/
npx vite preview --host --port 4173   # serve the build on your Wi-Fi
```

To use it on your phone, serve the build with `--host` and open
`http://<computer-ip>:4173` on the phone (same Wi-Fi), or put `dist/` on any
static host. Then use "Add to Home Screen".

**Important: data lives in the browser of the device and address you use.**
Opening CardPick from a different address (another host, IP, or port) is a
different, empty database. Use one address consistently, and move data
between devices/addresses with *More → Backup & restore*.

## First session (≈10 minutes)

1. **More → Import from TCGplayer**: upload the Seller Portal inventory export.
   This only records what TCGplayer *says*; nothing is marked physical or verified.
2. **More → Locations**: add your sorted boxes (e.g. `B004`) and tap one to
   attach the sets that live in it. Add a few chaos bins (`C001`…).
3. **Audit**: pick a box, type a few letters of each card, tap its condition
   chip. One tap = one card. Tap **Finish** when the box (or section) is done.
4. **More → Progress** shows the audit experiment: cards/hour, discrepancy rate,
   and a recommendation once ~300 cards are audited.
5. **Back up** (the yellow button appears when a backup is overdue).

## Checks

```bash
npm run typecheck   # TypeScript
npm test            # unit + data-layer workflow tests (Vitest, fake IndexedDB)
npm run e2e         # browser tests on a Pixel 7 viewport (Playwright)
npm run check       # all of the above + production build
```

## Code map

| Path | What |
| --- | --- |
| `src/domain/` | Pure logic: CSV/TCGplayer parsing, search, pick allocation, status, metrics |
| `src/db/inventory.ts` | **The only code that changes physical balances** (balance + ledger, one transaction) |
| `src/db/sessions.ts` | Audit and Put Away sessions |
| `src/db/picking.ts` | Batch creation, confirm/short/undo, completion |
| `src/db/importer.ts` | TCGplayer inventory + order imports (marketplace data only) |
| `src/db/problems.ts` | Fix resolutions that don't move units |
| `src/db/backup.ts` | Backup, validated restore, automatic snapshots |
| `src/screens/` | Audit, Put Away, Pick, Find, Fix, plus Setup/Review screens |
