# CardPick Roadmap

_Last updated: 2026-10-01 (phase 1 complete)_

## Current goal

**Run the 300-card audit experiment on real inventory.** Measure cards/hour
and the TCGplayer discrepancy rate, then decide between progressive
correction and a set-by-set controlled rebuild (More → Progress gives a
recommendation at 300 cards).

## Current state (what works and is tested)

| Area | Status |
| --- | --- |
| TCGplayer inventory import | ✅ Marketplace qty only; SKU identity; rejects missing/duplicate SKUs; flags identity changes; optional "complete inventory" zeroing; snapshot first |
| Locations | ✅ Sorted boxes with set homes, chaos bins with capacity (default 650), retire only when empty |
| Physical truth | ✅ Balances per location, append-only ledger, integrity check (Fix → Check data) |
| Verification | ✅ Verified / Unverified / Needs Review derived from evidence; set spanning boxes needs every box counted |
| Backup & restore | ✅ JSON backup, validated restore (integrity-checked), 10 automatic snapshots, overdue-backup reminder |
| Audit | ✅ POS-style tap counting, resumable after reload, Enter adds unambiguous match, confirm-absent for whole sets, not-recounted → Missing (opt-in), per-session metrics |
| Put away | ✅ Remembered bin, one tap per card, undo, capacity meter, "next bin" |
| Find | ✅ Product view across conditions/printings, locations, status, history, recommended adjustment |
| Reconcile | ✅ Actionable (verified) vs blocked (not trusted); CSV export; never writes to TCGplayer |
| Order import | ✅ Order-line CSV and pull-sheet "Order Quantity" format; exact-unique matching only; unmatched → Fix |
| Batch picking | ✅ Location-ordered route, per-order breakdown, verified stock first, set-home fallback (unverified), short pick → Missing + re-route, undo |
| Fix | ✅ Found it / Confirm lost for Missing; link unlisted card to SKU; match order line; review import issues |
| Metrics | ✅ Cards/hour, discrepancy rate, put-away time per 100, short picks, locations per batch |

Tests: 42 unit/data-layer tests and 5 Playwright phone-viewport flows (full
loop, 60-card put away, resume after reload, unlisted card, no horizontal scroll).

## Next tasks (ordered by impact on accuracy + time saved)

1. **Validate against real TCGplayer files.** Import the real inventory export
   and a real pull sheet / order export. The column names are from known
   exports but are unconfirmed for this account. Adjust parsers if needed.
   *(Accuracy; blocks everything)*
2. **Run the 300-card audit** and review UX friction from real use (search
   misses, wrong chip taps, slow spots). *(Time)*
3. **Search quality for real catalogs.** Handle numbers like "GG30" and "SWSH020", and accented
   names ("Flabébé"). Add a "same as last card" quick-repeat if repeated cards are common. *(Time)*
4. **Audit by set section within a box**: limit confirm-absent to a name range
   (e.g. A–M) for sets split across boxes. *(Accuracy)*
5. **Offline service worker** so the app loads with no Wi-Fi in the card room. *(Reliability)*
6. **Pick: per-order sort view** after the batch ("Order A: these 3 cards"),
   for packing. *(Time)*
7. **Move cards UI** (`moveCards` exists in the data layer) for consolidating chaos bins. *(Later)*
8. **TCGplayer-ready upload file** from Reconcile once the exact upload format is confirmed. *(Time)*

## Known risks

- **Browser storage is the only copy.** Clearing site data, switching
  browsers/addresses, or losing the phone loses data since the last backup.
  Mitigations: persistent-storage request, backup reminder after 3 days,
  automatic snapshots (same browser only). Consider an automatic daily download prompt.
- **Order export formats are assumed**, not confirmed with real files.
  Unmatched lines never guess; they go to Fix.
- **Audit counts apply only on Finish.** An unfinished audit is saved and
  resumable, but its counts are not inventory until finished. The Audit
  screen lists unfinished audits.
- **"Confirm absent" is trusting.** If ticked while only part of a set was
  counted, CardPick records true zeroes for the uncounted cards, and Reconcile
  would recommend reductions. The checkbox is opt-in and worded explicitly.
- **Unverified (set-home) picks don't decrement inventory** (none was
  recorded). This is correct, but those cards remain unverified until the box is audited.
- **Large catalogs**: all items load into memory for search. That's fine for tens of
  thousands of SKUs but untested at a full-catalog (300k+) export. Export
  "my inventory" rather than the whole catalog.
- **Undo of a short pick** is refused once its Missing problem has been worked
  on in Fix (by design, to avoid double-counting).

## UX friction (to measure in real use)

- Each card = type 3–5 letters + 1 tap. Card numbers (e.g. "pika 29") are the
  fastest disambiguator; watch whether real sets need more.
- Toast on every tap may be noisy; consider a subtle flash instead.
- Finishing an audit is 2 taps (Finish → Save counts); that's acceptable because it's once per box.
- Locations screen editing (set homes) is a one-time setup but fiddly for many boxes.
  Consider bulk "B001–B020" creation.

## Future ideas (not now)

- Chaos bin consolidation suggestions (bins under ~15% of capacity).
- Fast-mover analysis from pick history to suggest moving hot cards to an
  easy-access bin.
- Locations that frequently produce short picks.
- Barcode / QR labels for bins (scan instead of choose).
- Multi-device sync (would need a server; explicitly out of scope now).
