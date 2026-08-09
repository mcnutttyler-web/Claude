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

## Things explicitly not built (per spec)

Full-text search, user accounts/roles, charts, image handling, any
TCGplayer API call, any LLM call, Docker/containers/separate API server,
websockets/real-time updates/optimistic UI.
