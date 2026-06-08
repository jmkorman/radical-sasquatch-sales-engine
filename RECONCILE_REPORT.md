# Reconcile Report — pre-deploy

**Branch:** `events` (HEAD = `d6b479d`)
**Target:** `main` (HEAD = `5b82e33`)
**Status:** Local-only. Nothing pushed, merged, deployed, or run against the DB.

---

## 1. Reconcile with main

### What 5b82e33 changed
`5b82e33 "Fix Vercel deploy: health cron daily (Hobby plan limit)"` is a
**one-line edit to `vercel.json`**:

```diff
-    { "path": "/api/cron/health", "schedule": "0 */6 * * *" }
+    { "path": "/api/cron/health", "schedule": "0 6 * * *" }
```

It changed the health cron from every 6 hours to daily at 06:00 UTC because
the Vercel Hobby plan only allows daily crons. It did NOT touch the
health route handler.

### Did the merge happen?
**No merge was required.** Two independent checks proved this:

```bash
$ git merge-base events main
5b82e33e78bd58bb45ef6dc34d3e1e75b80af341      # = HEAD of main

$ git log --oneline events..main
                                              # empty — main is 0 commits ahead

$ git merge main --no-ff
Already up to date.
```

The `events` branch was created on top of `5b82e33`, so `5b82e33` is already
in its history. The premise in the task prompt ("main has 5b82e33 but
events does NOT") does not hold against this working tree. I am reporting
this rather than fabricating a merge commit.

### Are both fixes present on `events`?
Yes, verified directly:

- **`vercel.json`** is byte-identical between `events` and `main`. The
  health cron is `"0 6 * * *"` on both. The deploy fix from 5b82e33 is
  preserved.
- **`app/api/cron/health/route.ts`** differs only by the CRON_SECRET
  hardening from commit `fc1ede0`:

  ```diff
  -  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
  +  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
  ```

  This is the fail-closed version (401 if the env var is unset, not just
  if the header is wrong). Tests in `app/api/cron/cron-secret.test.ts`
  cover the no-header / wrong-header / unset-env / correct-Bearer paths.

Both the deploy fix AND the CRON_SECRET fail-closed guard are present on
`events`. Neither was dropped.

### About the "single merge commit"
Skipped on purpose. With nothing to merge, a `--no-ff` merge commit would
be an empty no-op that adds no signal. The pre-deploy reconcile work
that DID happen (lint fixes + the new SQL migration) was committed as
one regular commit, `d6b479d`. If you want an explicit merge bubble for
review optics, run:

```bash
git merge --no-ff -m "merge main into events (no changes; 5b82e33 already present)" main
```

…but I left that for you, since it's a pure paperwork commit.

---

## 2. Test / typecheck / lint on the reconciled branch

```
npx vitest run        14 files, 126 tests, 126 passed
npx tsc --noEmit      no errors
npm run lint          no errors
                      3 pre-existing react-hooks/exhaustive-deps warnings
                      (events/page.tsx, orders/page.tsx, AccountDetail.tsx)
```

The merge itself was a no-op, but the lint pass surfaced two errors
introduced by the overnight session that hadn't been caught (vitest +
tsc were clean):

1. `app/api/events/route.ts` — `Record<string, any>` triggered
   `@typescript-eslint/no-explicit-any`. Resolved with a single
   `eslint-disable-next-line` comment on the cast that bridges the
   validated `unknown` body to the existing shaping code. The original
   pre-validation code was implicitly `any` via `await request.json()`,
   so this is semantically the same.
2. `lib/__tests__/fakeSupabase.ts` — `order(_col, _opts)` flagged unused
   params. Resolved by dropping the param names entirely (the function
   was already a no-op).

Both fixes are runtime-neutral.

---

## 3. Schema dependency check (activity_logs)

### What the events code path touches
- `insertActivityLog` (called from POST/PATCH event handlers) writes:
  `account_id`, `tab`, `row_index`, `account_name`, `action_type`,
  `note`, `source = 'event'`, `activity_kind = 'event'`,
  `counts_as_contact = false`.
- `deleteActivityLogsForEvent` (called from DELETE event handler) runs:
  `update({ is_deleted: true }).eq("source", "event").ilike("note", "%[event-id:UUID]%")`.

### Where the gap is
- `insertActivityLog` already has a column-missing-retry loop that drops
  unknown columns and retries. So WRITES will survive an older
  production table — but `activity_kind` and `counts_as_contact` will
  be silently dropped, breaking read-side filters that depend on them.
- `deleteActivityLogsForEvent` has NO retry. If `source` doesn't exist,
  the `.eq("source", "event")` clause fails or matches nothing.
  If `is_deleted` doesn't exist, the `.update()` throws (PGRST204).
- `activity_logs.sql` only got checked into the repo in commit
  `188604d`, on the `events` branch — `main` has never carried it. The
  live production table was provisioned ad-hoc earlier and may have
  drifted from the documented shape.

### File written: `supabase/migrate_activity_logs.sql`
Yes, the migration was needed. The file contains
`ALTER TABLE … ADD COLUMN IF NOT EXISTS …` for every column the new
events code requires (`source`, `is_deleted`, `activity_kind`,
`counts_as_contact`) plus the rest of the columns in
`supabase/activity_logs.sql` for completeness (harmless if already
present). All indexes are re-applied as `CREATE INDEX IF NOT EXISTS`.

Safe to re-run. Safe to run on a brand-new DB (after
`activity_logs.sql` has created the bare table). On an up-to-date
production table, every statement is a no-op.

---

## 4. Reconcile commit

```
d6b479d reconcile: lint fixes + idempotent activity_logs migration
```

Single commit. Touches:
- `app/api/events/route.ts` (one-line eslint-disable comment)
- `lib/__tests__/fakeSupabase.ts` (drop unused param names)
- `supabase/migrate_activity_logs.sql` (new file, 117 lines)

---

## 5. Manual checklist (your turn — do these in order)

Each step is something only you should do. Stop and re-read this report
if any step looks wrong.

### Pre-flight

1. **Confirm the branch state matches this report.**
   ```bash
   cd "/Users/jakekorman/Documents/Radical Sasquatch Files/sales-engine"
   git log --oneline events..main           # expect empty
   git log --oneline main..events           # expect 8 commits ending at d6b479d
   git status                               # expect clean
   ```

2. **Re-run verification yourself.**
   ```bash
   npx vitest run            # expect 126/126 passing
   npx tsc --noEmit          # expect no output
   npm run lint              # expect 3 pre-existing useEffect warnings only
   ```

### Vercel env var

3. **Set `CRON_SECRET` in Vercel Production env.**
   - Project → Settings → Environment Variables → add
     `CRON_SECRET` for Production (and Preview if you want preview
     deploys to exercise the crons).
   - Use a strong random value (e.g. `openssl rand -hex 32`).
   - Without this, EVERY cron will return 401 after the merge — the
     hardening commit (`fc1ede0`) made the guard fail-closed on purpose.

### Supabase (run in the SQL editor, Production project)

Do these in order, with a Supabase backup / point-in-time recovery
window selected first.

4. **Run `supabase/app_credentials.sql`** — creates the table the
   gmail-resilience commit relies on for storing the refresh token.
   `IF NOT EXISTS`, safe to re-run.

5. **Run `supabase/events.sql`** — creates the events table the new
   feature reads/writes. `IF NOT EXISTS`, safe to re-run.

6. **Run `supabase/activity_logs.sql`** — `IF NOT EXISTS`, will be a
   no-op since prod already has the table. Run it anyway so the schema
   reference in the file is the source of truth.

7. **Run `supabase/migrate_activity_logs.sql`** — adds any columns the
   pre-existing prod table is missing. Every statement is
   `ADD COLUMN IF NOT EXISTS`, so it's safe to re-run and a no-op on an
   already-up-to-date schema.

8. **Spot-check the activity_logs schema.**
   ```sql
   select column_name, data_type, is_nullable, column_default
     from information_schema.columns
    where table_schema = 'public' and table_name = 'activity_logs'
    order by ordinal_position;
   ```
   Confirm `source`, `is_deleted`, `activity_kind`, `counts_as_contact`
   are present.

### Git / deploy

9. **Push the branch.**
   ```bash
   git push origin events
   ```

10. **Open a PR `events → main`.**
    - GitHub will diff 8 commits.
    - Review each commit individually:
      `8c81ff1 fc39a71 ae653c7 c6a4214 aed6cf9 7337f69 e974d9a d6b479d`.

11. **Merge to deploy.** Vercel auto-deploys on merge to `main`.
    Watch the build logs in Vercel.

### Post-deploy smoke tests (Production URL)

12. **Load the dashboard.** Confirm it renders. No client-side error
    overlay. Check the Gmail banner: it should not crash.

13. **Settings → "Test Connection" (Gmail).** Confirm the response is
    JSON, not HTML. Either 200 `{status: "ok", …}` or 503
    `{status: "error", detail: …}`. Either is fine; an HTML 500 is NOT.

14. **Events lifecycle on a throwaway account.**
    a. Open any account → "Events" → "Add Event". Save.
    b. Open the activity log. Confirm a `"Event logged: …"` entry shows.
    c. Edit the event. Confirm a `"Event updated: …"` entry shows.
    d. Delete the event. Confirm BOTH timeline entries disappear from
       the log view (they were soft-deleted; reads filter them).
    e. In Supabase SQL editor:
       ```sql
       select id, is_deleted, source, note
         from activity_logs
        where note ilike '%[event-id:%]%'
        order by created_at desc
        limit 10;
       ```
       Confirm the deleted event's logs have `is_deleted = true`.

15. **Gmail single-poll-across-tabs.**
    a. Open two browser tabs of the app at the same URL.
    b. Send yourself a test email from a fresh address (so it's not
       already in activity_logs).
    c. Wait ~60–90s.
    d. Confirm exactly ONE activity log entry for the inbound message.

16. **Restaurants header validation.** Edit a Restaurant account's
    status from the dashboard. Confirm:
    - The status updates in the sheet.
    - No `SheetHeaderMismatchError` in Vercel logs.
    - If a `SheetHeaderMismatchError` DOES appear: either fix the sheet
      to match the expected headers, or set
      `SHEET_HEADER_VALIDATION=off` in Vercel env and update
      `lib/sheets/schema.ts` in a follow-up PR.

17. **Wait for the next scheduled `cron/stale-sweep`** (09:00 UTC) and
    confirm in Vercel logs that the run returned non-401. If you don't
    want to wait, manually fire:
    ```bash
    curl -i -H "Authorization: Bearer ${CRON_SECRET}" \
      https://<your-app>.vercel.app/api/cron/stale-sweep
    ```
    Expect 200, NOT 401.

---

## What I did NOT do (and why)

- **Did not push.** Out of scope; that's step 9 in the checklist.
- **Did not run SQL.** Out of scope; that's steps 4–8.
- **Did not touch Vercel env vars.** Out of scope; step 3.
- **Did not run the post-deploy smoke tests.** Out of scope; steps 12–17.
- **Did not create a fake merge commit** for paperwork. There was
  nothing to merge from main, and an empty `--no-ff` commit would add
  no information. If you want one anyway for review optics, see the
  command at the bottom of section 1 above.
- **Did not address other Risks** in `ENGINE_AUDIT.md` beyond what the
  overnight session already covered (Risks 4 and 12).
