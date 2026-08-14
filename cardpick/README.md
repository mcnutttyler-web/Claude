# CardPick

Inventory, pricing, and order-picking for a TCG card shop, built against the
CardPick spec addendum: Next.js (App Router, TypeScript), SQLite via
`better-sqlite3` in WAL mode, Drizzle ORM with checked-in SQL migrations,
Tailwind, Vitest. No Docker, no separate backend.

## Running it

```bash
npm install
npm run db:migrate   # applies lib/db/migrations/*.sql (also runs automatically on server start via instrumentation.ts)
npm run dev           # next dev -H 0.0.0.0 -p 3000, reachable from other devices on the LAN
npm test              # vitest
```

The SQLite file lives at `data/cardpick.db` (gitignored). Automatic snapshots
go to `backups/` before every import, bulk action, reprice apply, and
fulfillment confirmation — see Settings for manual backup/restore.

Copy `.env.example` to `.env.local` and fill in `ANTHROPIC_API_KEY` (required)
and `POKEMONTCG_API_KEY` (optional, raises a rate limit) to enable the
"Scan a Card" photo-recognition feature at `/scan`. Everything else runs with
no environment variables set.

## Status vs. the spec

Phases 1–2 (import, matching, bulk location assignment, order picking,
reconciliation) are covered end-to-end with a Vitest suite. Phases 3–4
(pricing preview/apply, QR labels + keyboard-wedge scanning, backup/restore,
dashboard/history) are implemented; camera-based scanning is deliberately
**not** built — it requires a secure context (HTTPS/Tailscale) that a plain
LAN `next dev` server doesn't have, per the spec's own note. The default
scan input is a USB/Bluetooth keyboard-wedge QR scanner (`lib/scan-context.tsx`).

The CSV import mapping layer (`lib/import/mapping.ts`) is intentionally
generic — no TCGplayer header strings are hardcoded outside the mapping
config's *default guesses*, which the user confirms/edits on every import.
Real TCGplayer export/upload-template samples haven't been supplied yet
(see Phase 0 in the spec addendum); once available, tighten the default
header guesses in `INVENTORY_FIELDS`/`ORDER_FIELDS`/`RECONCILE_FIELDS` and
the placeholder headers in Settings → TCGplayer upload export.

## Photo-based card recognition (`/scan`)

Added after the original spec addendum, at explicit request — this
deliberately crosses two of the addendum's own non-goals ("image handling",
"any LLM call"), so it's worth calling out separately rather than folding
into the phases above.

Photograph a physical card → Claude's vision API reads the name/set/number
off the photo → the guess is matched against a locally-cached copy of
[pokemontcg.io](https://docs.pokemontcg.io)'s reference data (never
TCGplayer's own site — their ToS forbids scraping and their card database
is copyrighted, so pokemontcg.io is the legal substitute, and it already
includes TCGplayer market prices pulled in legitimately) → confirmed
candidate flows through the same `match_key`/`matchInventoryItem` pipeline
CSV imports use (`lib/matching.ts`), so a scanned card that already exists
updates in place instead of duplicating, and ambiguous matches are surfaced
rather than auto-resolved, same as everywhere else in the app.

**Honest limitation:** this does not post a listing to TCGplayer directly.
Their bulk price/quantity CSV (already built) only works for SKUs you've
listed once before — first-time listings still require TCGplayer's own
seller UI, there's no API path around that. What this buys you is fast,
accurate intake (correct name/set/number/condition/market-price captured in
seconds instead of typed by hand) — for a card you've already listed before,
its price/qty is already synced via the export; for a brand-new one, the
card is now correctly in CardPick ready for you to key into TCGplayer's own
listing form manually.

Costs real money per scan (a paid vision API call) — see `.env.example`.

## Things explicitly not built (per spec)

Full-text search, user accounts/roles, charts, Docker/containers/separate
API server, websockets/real-time updates/optimistic UI. (Image handling and
LLM calls were both later added, scoped narrowly to `/scan` — see above.)
