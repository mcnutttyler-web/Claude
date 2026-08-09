# CardPick

Local-first card inventory, pricing, and pick-and-pack tool for TCGplayer sellers.
Next.js (App Router) + SQLite (WAL) via Drizzle ORM. One process, no Docker, no
separate backend.

## Running

```bash
npm install
npm run dev
```

This starts `next dev -H 0.0.0.0 -p 3000`, so it's reachable from other devices
on the LAN at `http://<your-machine-ip>:3000`. Migrations and default seed data
(pricing settings, the `UNASSIGNED` holding location, a few set aliases) run
automatically on first request via `src/instrumentation.ts`.

The SQLite file lives at `./data/cardpick.db` by default (override with the
`CARDPICK_DB_PATH` env var). Automatic backups land in `./backups/` (override
with `CARDPICK_BACKUP_DIR`). Both directories are gitignored.

## Scripts

- `npm run dev` — start the app (LAN-reachable)
- `npm run build` / `npm start` — production build/run
- `npm test` — Vitest unit tests (core matching/pricing/import/pick-mode logic)
- `npm run db:generate` — generate a Drizzle migration after editing `src/db/schema.ts`
- `npm run db:migrate` — apply migrations + seed manually (rarely needed; the app does this itself)

## Where things live

- `src/db/schema.ts` — Drizzle schema (checked-in migrations in `drizzle/`)
- `src/lib/` — all business logic (matching, mapping, pricing, import/export,
  pick mode, reconcile, bulk-assign, backups, QR), covered by `*.test.ts` files
  next to each module
- `src/app/` — routes, one folder per feature, `actions.ts` files hold the
  Server Actions each page's client components call

## Notes for whoever picks this up

- **Column mapping is never hardcoded.** Every CSV import/export goes through
  a mapping profile (`src/lib/mapping.ts`) the user fills in once per file
  shape; it's saved and auto-reapplied on the next import of the same shape.
- **Money is integer cents everywhere**, formatted to dollars only at render
  time (`src/lib/money.ts`).
- **Matching never auto-resolves ambiguity** — see `src/lib/matching.ts` and
  the resolution UI on `/import`.
- **Scanning** is keyboard-wedge by default (`src/components/ScanListener.tsx`)
  — camera scanning is intentionally not built; see `/settings` for why.
- See `/settings` in the app for the explicit list of things left out of this
  MVP on purpose.
