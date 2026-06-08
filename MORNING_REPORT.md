# Morning Report — Overnight Session

**Branch:** `events` (local only, NOT pushed)
**Session start:** Around midnight; work tagged with commits `8c81ff1` → `7337f69`.
**Test suite:** **126 / 126 passing**, `npx tsc --noEmit` clean.

Nothing was pushed, deployed, run against the production DB, or run
against the live Gmail account. All work is on the `events` branch only.
Review the commits below in order, then run the manual deploy checklist
at the end of this document.

---

## Commit-by-commit log

In reverse chronological order (newest first). Each commit is independently
reviewable.

### `7337f69` — events + gmail/status: input validation and error handling
**Step 5 in the overnight plan.** Additive hardening only — every valid
input that used to be accepted is still accepted.
- `app/api/events/route.ts`: POST/PATCH wrap `request.json()` so a
  malformed body returns 400 with `"Invalid JSON body"` instead of a
  crash. New `validateEventPayload`: `event_date` and `event_end_date`
  must match `YYYY-MM-DD`; `quoted_amount` / `actual_amount` / `deposit`
  must be finite and non-negative; `title` / `notes` / `location` /
  `contact_name` / `phone` / `email` capped at 5,000 chars. PATCH
  rejects non-object `updates`.
- `app/api/gmail/status/route.ts`: GET + POST wrapped in try/catch with
  `logError()`; always return JSON with `status: "error"` and 503 so
  the in-app Gmail banner can't crash on an HTML 500.
- Tests: `app/api/events/validation.test.ts` (14) and
  `app/api/gmail/status/route.test.ts` (6).

### `aed6cf9` — events: soft-delete `[event-id:UUID]` activity logs on DELETE
**Step 4 in the overnight plan.** Fixes the gap noted in the audit.
- New helper `deleteActivityLogsForEvent(eventId)` in
  `lib/supabase/queries.ts`, mirroring `deleteActivityLogsForOrder`.
  Sets `is_deleted=true` on rows where `source = 'event'` AND `note`
  contains `[event-id:UUID]`.
- `app/api/events/route.ts` DELETE handler now calls the new helper
  after `deleteEvent`.
- Tests: 3 new unit tests + 3 new route tests; updated the existing
  `cascadeDeleteAccount` log-count assertion to include the seeded
  event logs.

### `c6a4214` — sheets: header-row validation guard (Risk 4)
**Step 3 in the overnight plan.** Risk 4 from `ENGINE_AUDIT.md`.
- `lib/sheets/schema.ts`: `ExpectedHeaderMap` for all 5 tabs,
  `normalizeHeaderText`, `validateHeaderRow`, `assertHeaderRow`,
  `SheetHeaderMismatchError`, `headerValidationEnabled()` with a
  `SHEET_HEADER_VALIDATION=off` escape hatch.
- `lib/sheets/read.ts`: `getTabRaw` asserts the first row.
- `lib/sheets/write.ts`: 5-minute per-tab in-process cache of
  "already validated"; `updateCell` / `appendRow` / `deleteRow`
  validate before mutating. Substring match against expected labels,
  so harmless rewordings like `"Account Name"` instead of `"Account"`
  or `"Phone #"` instead of `"Phone"` still pass — but a structural
  insertion/deletion that shifts column positions fails loud.
- 17 new unit tests in `lib/sheets/schema.test.ts`.

### `ae653c7` — tests: harness + suite for cascades, locks, rollups, and cron auth
**Steps 1 + 2 in the overnight plan.**
- `lib/__tests__/fakeSupabase.ts`: in-memory fake Supabase client
  (select/insert/update/upsert/delete with eq/neq/or/ilike/order/
  single/PGRST204-missing-table). Sufficient for everything in
  `lib/supabase/queries.ts` and `lib/events/queries.ts`.
- New test files (counts as of this commit):
  - `lib/supabase/queries.test.ts` — cascadeDeleteAccount + deleteActivityLogsForOrder
  - `lib/events/helpers.test.ts` — commission math + status rollups
  - `lib/commission/calculator.test.ts` — 10% of last-30d orders, excludes Canceled
  - `lib/accounts/identity.test.ts` — slug + stable account id
  - `lib/gmail/clientPollLock.test.ts` — multi-tab acquire/release, 90s TTL, 120s throttle, force flag
  - `app/api/accounts/retab/route.test.ts` — cascade verification, 400/404, same-tab no-op
  - `app/api/accounts/move/route.test.ts` — cross-tab move
  - `app/api/sheets/update/route.test.ts` — rename cascade + account_name backfill + same-tab no-op
  - `app/api/cron/cron-secret.test.ts` — 401 with no header / wrong header / unset env / passes with correct Bearer

### `fc39a71` — events: first-class event-booking entity, separate from pipeline tabs
**Step 0b.** Untracked work that was sitting on disk; committed as-is
so the events feature is reviewable atomically.

### `8c81ff1` — gmail-resilience: in-app OAuth credentials, status route, auth banner
**Step 0a.** Untracked work that was sitting on disk; committed first
so the gmail-resilience surface is isolated from the events surface.
Includes `supabase/app_credentials.sql`.

---

## Untestable / unverifiable paths

Things I could NOT verify on this branch — deliberately, per the
"no live infrastructure" boundary — and that you should smoke test
yourself after deploying.

1. **Live Sheets header validation.** The validator is exercised
   against synthetic header rows. It has never seen the real spreadsheet.
   First time anything reads or writes the live sheet, the assert
   either passes (great) or throws a `SheetHeaderMismatchError` —
   in which case either fix the sheet or set `SHEET_HEADER_VALIDATION=off`
   in Vercel and update the expected-headers maps in `lib/sheets/schema.ts`
   to match what the sheet now says.
2. **Live Gmail probe.** `checkGmailConnectivity` and the actual
   OAuth refresh flow are unmocked here. Hit `POST /api/gmail/status`
   from Settings → "Test Connection" once you deploy to confirm the
   try/catch wrapping doesn't mask a previously-visible bug.
3. **Events Supabase schema.** All tests use the in-memory fake.
   `supabase/events.sql` has NOT been run against any database here.
   Run it once on staging (and then production) before exercising
   the events UI live.
4. **`deleteActivityLogsForEvent` in production.** The unit test
   passes against the fake, but you should delete a throwaway event
   in production and confirm its `[event-id:UUID]` timeline entries
   flip `is_deleted=true`.
5. **CRON_SECRET in production.** Tests confirm the 401 / not-401
   gate. They do NOT confirm Vercel's cron jobs actually send the
   matching `Authorization: Bearer ${CRON_SECRET}` header. Verify
   by tailing Vercel logs after the first scheduled fire.

---

## Manual deploy checklist (in order)

Do these in sequence. Stop and review if any step looks off.

1. **Review the branch.**
   - `git log events --not main` — confirm the 6 commits listed above.
   - Skim each commit with `git show <sha>`.
2. **Run the suite locally one more time.**
   - `npm test` (or `npx vitest run`) — expect 126/126.
   - `npx tsc --noEmit` — expect no output.
   - `npm run lint` — expect no errors.
3. **Provision Supabase tables (staging first, then prod).** Run each
   SQL file in the Supabase SQL editor. Safe to re-run (they use
   `IF NOT EXISTS`).
   - `supabase/app_credentials.sql` — required by the gmail-resilience commit
   - `supabase/events.sql` — required by the events commit
   - `supabase/activity_logs.sql` — already there in prod, but re-run
     to add any new columns the events activity logging needs
   - `supabase/app_settings.sql` — already there in prod; same reason
4. **Confirm env vars are set in Vercel for the target environment.**
   - `CRON_SECRET` — required (without it every cron returns 401)
   - `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` — required for gmail/status to leave `not_configured`
   - `GMAIL_REFRESH_TOKEN` — optional once `app_credentials` is populated; leave it in for now as a fallback
   - `SHEET_HEADER_VALIDATION` — leave UNSET. Only set to `off` if the
     deploy fails immediately on a header-row mismatch.
5. **Push and deploy.**
   - `git push origin events` (do NOT push to main yet).
   - Open a PR from `events` → `main` and review the full diff.
   - Merge once happy. Vercel will auto-deploy.
6. **Post-deploy smoke tests.**
   - Load the dashboard. Confirm no Gmail banner crash.
   - Settings → "Test Connection" — confirm Gmail probe returns 200/503 JSON, not HTML.
   - Open an account, add an Event, save. Confirm timeline shows
     "Event logged".
   - Edit the same event. Confirm timeline shows "Event updated".
   - Delete the same event. Confirm BOTH timeline entries disappear
     (they're soft-deleted; the UI filter hides them).
   - Edit a Restaurant account's status from the dashboard.
     Confirm no `SheetHeaderMismatchError` in the logs and the cell
     actually updates in the sheet.
   - Wait for the next scheduled `cron/stale-sweep`. Confirm in
     Vercel logs that the run completed (not a 401).

---

## What I did NOT do (and why)

- **Did not push, deploy, or merge.** Out of scope per instructions.
- **Did not run migrations.** No DB access; SQL files are reviewable
  in `supabase/` and listed in the checklist above.
- **Did not touch live Gmail.** All Gmail tests stub
  `checkGmailConnectivity` and `readGmailCredentialRow`.
- **Did not refactor existing runtime behavior beyond the listed
  fixes.** Header validation is opt-out additive; event-delete
  cascade is purely additive; input validation is additive (no
  previously-accepted input is now rejected EXCEPT obviously broken
  inputs — `NaN` amounts, negative money, malformed dates,
  >5000-char strings, non-object PATCH `updates`); gmail/status only
  added try/catch wrappers.
- **Did not address other Risks** from `ENGINE_AUDIT.md` beyond
  Risk 4. They were not on the overnight list. Leave them for a
  fresh session with clearer scope.

---

## Quick test invocation reference

```bash
cd "/Users/jakekorman/Documents/Radical Sasquatch Files/sales-engine"

# Full suite
npx vitest run

# Single file
npx vitest run lib/sheets/schema.test.ts

# Typecheck
npx tsc --noEmit

# Per-file test counts (as of 7337f69):
#   lib/sheets/schema.test.ts             17
#   lib/activity/notes.test.ts            14
#   lib/events/helpers.test.ts            17
#   app/api/events/validation.test.ts     14
#   lib/supabase/queries.test.ts          11
#   app/api/accounts/move/route.test.ts    4
#   app/api/gmail/status/route.test.ts     6
#   app/api/sheets/update/route.test.ts    3
#   lib/accounts/identity.test.ts          9
#   app/api/events/route.test.ts           3
#   lib/commission/calculator.test.ts      5
#   lib/gmail/clientPollLock.test.ts       6
#   app/api/accounts/retab/route.test.ts   5
#   app/api/cron/cron-secret.test.ts      12
#   ----------------------------------------
#   Total                                126
```
