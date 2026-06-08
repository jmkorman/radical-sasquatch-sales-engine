# Google Sheets → Export-Only Migration Plan

**Status:** Phase 1 already complete in code (discovered during improvements-batch-1).
**Goal:** Move Google Sheets from "source of truth + sync target" to "export only" so Supabase
is the single source of truth and Sheets is a read-only mirror users can pull on demand.

---

## Where we are today (already implemented)

The codebase already does Supabase-first reads with a Sheets fallback. We confirmed this
without writing any new code:

- `lib/accounts/source.ts` → `getAccountsData()`
  - Tries `getAccountSnapshots()` (Supabase) first.
  - If snapshots return rows, **Sheets is never queried** for that request.
  - On empty or error, falls back to `getAllTabs()` (Sheets) AND seeds Supabase via
    `upsertAccountSnapshots(...)` so the next request hits Supabase.
- `app/api/sheets/update/route.ts` POST handler
  - Writes to Supabase first (`upsertAccountSnapshot` / cascade on rename).
  - Then opportunistically mirrors to Sheets via `syncUpdateToSheets()` /
    `syncDeleteToSheets()`, gated by `canSyncSheets()` (env vars present).
  - Sheets failures are swallowed (`console.warn`) — they never block the API response.
- `app/api/events/route.ts`, `app/api/orders/route.ts`, `app/api/activity-logs/route.ts`
  - All write directly to Supabase. Sheets is not involved.

**Net effect:** Supabase is already the system of record for everything except the
account table itself when Supabase is empty. The remaining work is to *stop writing
to Sheets at all on the mutation path*, replace it with an explicit on-demand export,
and tighten the read path so Sheets fallback can be turned off.

---

## What "export-only" actually requires

1. **Stop per-mutation Sheets writes.** `sheets/update` should write to Supabase only.
   Sheets stays in sync via the export job, not via every cell edit.
2. **Add an explicit export.** A button + route that snapshots current Supabase state
   into the spreadsheet in one batch write.
3. **Gate the Sheets read fallback.** Today it's automatic. Make it opt-in (env flag
   `SHEETS_READ_FALLBACK=1`) so an empty Supabase doesn't silently re-seed from Sheets.
4. **Decouple `tab_slug` / `row_index` from sheet position.** Currently `row_index` is
   the literal sheet row. After this migration, `row_index` becomes a stable Supabase
   ordinal that the export translates into a sheet row at export time.
5. **Document the rollback.** If Supabase goes down mid-migration we need a fast
   "re-enable sheet writes" lever.

---

## Phase sequence

### Phase 1 — Dual-write + Supabase-first reads ✅ DONE
- [x] `getAccountsData()` reads Supabase first.
- [x] `sheets/update` writes Supabase first.
- [x] Sheets mirror is best-effort, non-blocking.
- [x] Events / orders / activity logs are Supabase-only.

### Phase 2 — Add explicit export (NEXT)
- [ ] `POST /api/sheets/export` (CRON_SECRET-gated or session-gated):
  - Read all snapshots from Supabase.
  - Build the same shape `getAllTabs()` returns from Sheets today.
  - Batch-write each tab via `sheets.spreadsheets.values.batchUpdate`.
- [ ] Settings UI: "Export to Google Sheets" button → calls the route, shows last-export
  timestamp (store in `app_credentials` row `key='sheets'` → `status_checked_at`).
- [ ] Add a daily cron entry in `vercel.json` to auto-export (Hobby-plan friendly).

### Phase 3 — Stop the per-mutation Sheets writes
- [ ] Behind a feature flag `SHEETS_LIVE_SYNC` (default off in prod, on in dev):
  - In `syncUpdateToSheets` / `syncDeleteToSheets`, no-op when flag is off.
- [ ] Remove the `syncUpdateToSheets` call site once one full week of clean exports
  has run successfully.
- [ ] Update the system health check to stop alerting on Sheets *write* failures and
  alert only on export failures.

### Phase 4 — Gate the read fallback
- [ ] Replace the automatic Sheets fallback in `getAccountsData()` with:
  ```
  if (snapshots.length === 0 && process.env.SHEETS_READ_FALLBACK === '1') { ... }
  ```
- [ ] If the fallback is disabled and Supabase returns empty, return `{ data: emptyTabs, source: 'supabase' }`
  rather than silently re-seeding from Sheets.
- [ ] Remove the seed-on-fallback path entirely (it's a re-hydration hack that masks
  real Supabase outages).

### Phase 5 — Decouple `row_index` from sheet position
- [ ] Repurpose `row_index` as a Supabase-stable ordinal (insertion order or
  `created_at` rank) — the export job assigns true sheet rows at write time.
- [ ] Migrate existing callers that read `row_index` as a sheet pointer
  (search: `findAccountBySheetPosition`, `getCellValue(tab, rowIndex, ...)`).

### Phase 6 — Cleanup
- [ ] Remove `lib/sheets/write.ts` cell-level helpers (`updateCell`, `deleteRow`)
  except the ones the export job uses (`batchUpdate`, `clear`).
- [ ] Remove the `expectedValues` optimistic-concurrency block in `sheets/update`
  (Supabase has its own `updated_at` guard we can use instead).
- [ ] Update `lib/sheets/schema.ts` to be export-only column metadata.

---

## Rollback strategy

At any point in Phase 2–4 we can revert by:

1. Setting `SHEETS_READ_FALLBACK=1` in Vercel (re-enables the read fallback).
2. Setting `SHEETS_LIVE_SYNC=1` in Vercel (re-enables per-mutation writes).
3. The dual-write code stays in place behind the flag until Phase 6, so the rollback
   window is wide.

---

## Out of scope for this PR (`improvements-batch-1`)

This PR ships only the *planning* portion of #8 plus the orthogonal improvements
(#3 rate limiting, #4 error logging, #5 health banner, #7 schema drift, #10
preview deploy disable). Phases 2–6 above are tracked here for a follow-up PR
once the rate-limit + error-log infrastructure has baked in production.
