# Engine Audit — Radical Sasquatch Sales Engine
_Audit date: June 7, 2026. Reconciled against live code June 8, 2026. Read-only. No application code was changed._

_Reconciliation note (June 8): The health cron was changed from every-6-hours to once-daily (`0 6 * * *`) because Vercel's Hobby plan rejects sub-daily crons — this was the silent cause of ~2 weeks of failed deploys. The `Array.from()` build-break workaround is in place but `tsconfig` still has no `target`. The venue-classification prompt was hardened (Catering vs Retail) and a SidePanel "Tab" dropdown now lets users retab auto-inferred accounts. Sections below reflect these changes._

---

## Top 5 Risks (Summary)

1. **Gmail refresh token has no recovery path, and detection just got slower.** It is a single static credential stored in an env var. If it expires, is revoked by Google, or the OAuth app is touched, Gmail integration silently goes dark with no in-app alert and no way to re-authenticate without developer intervention. The only automated probe is the health cron, which was just downgraded from every-6-hours to once-daily (Hobby-plan limit), so worst-case time-to-detect a dead token is now ~24h instead of ~6h.

2. **`activity_logs` and `contacts` tables have no SQL schema files.** Three of the five Supabase tables the app depends on cannot be recreated from the repo. If the Supabase project is reset or migrated, those tables — and all outreach history — are unrecoverable from code alone.

3. **The client-side Gmail poll lock is per browser tab, not per user session.** Every open browser tab polls Gmail independently on its own 60-second clock. Two open tabs double the API calls and double the risk of race-condition duplicate log entries.

4. **Google Sheets column positions are hardcoded integers.** A single column inserted or deleted in the spreadsheet silently corrupts every read and write for that tab. There is no validation, no header detection, and no error surfaced to the user.

5. **`CRON_SECRET` defaults to `"change-me"`.** If the env var is not set in production, every cron endpoint — stale-sweep, health, Notion sync — is callable by anyone who guesses the default, with full write access to Supabase and Google Sheets.

---

## 1. Architecture Overview

### Stack
- **Next.js 14** (App Router) — both UI and API surface
- **Supabase** — primary data store (PostgreSQL via REST client)
- **Google Sheets** — legacy read/write fallback; also the canonical schema for sheet-managed accounts
- **Gmail API** (OAuth2) — email polling, attribution, and sending
- **Anthropic Claude** (Haiku for cheap tasks, Opus for default) — account inference, email disambiguation, email analysis
- **Notion** — task sync (one-way: Notion → activity logs)
- **Vercel** — hosting + 3 scheduled cron jobs
- **Zustand** — client-side state (data cache, UI state)

### Data Flow

```
Gmail (OAuth2 poll)
  → lib/gmail/sent.ts (fetch messages)
  → lib/email/matcher.ts (score against known accounts)
  → [if ambiguous] lib/email/disambiguator.ts (AI tiebreaker)
  → [if no match] lib/email/inferAccount.ts (AI creates new account)
  → lib/supabase/queries.ts (insertActivityLog, upsertAccountSnapshot)
  → lib/sheets/write.ts (sync status/contact date to sheet — best-effort)

Browser (user navigation)
  → fetch /api/sheets
    → lib/accounts/source.ts (getAccountsData)
      → lib/supabase/queries.ts (getAccountSnapshots)
        → lib/accounts/snapshot.ts (dedupeSnapshotsByName → snapshotsToTabs)
      → [fallback] lib/sheets/read.ts → upsertAccountSnapshots
  → Zustand useSheetStore (AllTabsData in memory)
  → components/features/pipeline/CommandTable.tsx (render)

User action (log outreach / update status)
  → /api/activity (POST) → Supabase insertActivityLog
  → /api/sheets/update (POST) → Supabase updateAccountSnapshot + Google Sheets updateCell

Cron (Vercel scheduler)
  → /api/cron/stale-sweep (9am) → read all accounts + logs → updateAccountSnapshot + updateCell
  → /api/cron/health (daily 6am UTC) → probe Gmail, Supabase, Sheets → logError warn
  → /api/notion/sync (midnight) → fetch Notion tasks → insertActivityLog
```

### Key architectural choices and their consequences
- **Supabase is authoritative, Sheets is secondary.** Reads prefer Supabase; sheet writes are best-effort (`.catch(() => {})`). The two can drift silently.
- **Account IDs are derived, not assigned.** `id = "${tabSlug}:${normalizedName}"` means the primary key changes if an account is renamed or moved between tabs. This is handled by the move/retab endpoints but any missed reference becomes an orphan.
- **Deduplication runs at read time.** Wrong-tab duplicate rows accumulate in Supabase indefinitely; they are suppressed only when `snapshotsToTabs` is called. The DB is not authoritative on its own — the application logic that reads it is.

---

## 2. Data Model

### Tables

#### `accounts` (schema in `/supabase/accounts.sql`)
| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | `${tab_slug}:${normalized-name}` — changes on rename or retab |
| `account_name` | TEXT NOT NULL | Canonical display name |
| `tab` | TEXT NOT NULL | Human tab name ("Restaurants") |
| `tab_slug` | TEXT NOT NULL | Machine slug ("restaurants") |
| `row_index` | INTEGER NOT NULL | Sheet row; **0 for auto-inferred accounts** |
| `type` | TEXT | Business type label |
| `location` | TEXT | City/state |
| `status` | TEXT | Pipeline stage |
| `next_steps` | TEXT | Free-text; cron prepends `[auto-nudge]` marker here |
| `next_action_type` | TEXT | Structured action type |
| `contact_date` | TEXT | Last contact date (ISO string, not DATE) |
| `contact_name` | TEXT | |
| `phone`, `email` | TEXT | |
| `est_monthly_order` | TEXT | Dollar amount stored as text |
| `notes` | TEXT | |
| `raw` | JSONB | Escape hatch. Contains `review_pending`, `review_reason`, `review_confidence`, `hitListPinned`, `_rowIndex`, `website`, `ig`, `kitchen`, `dumplings`, `commissionPct`, and any field the sheets import dumps in |
| `updated_at` | TIMESTAMPTZ | Updated on every upsert |

**Flags:** No `created_at`. No `is_deleted`. Hard delete only (via `deleteAccountSnapshot`).
**`raw` sprawl:** The JSONB column is an undocumented accumulation point. Fields that don't have a dedicated column live here. There is no schema validation on it and no guarantee a field present today will be present tomorrow.

---

#### `activity_logs` (**no SQL schema file in repo**)
Inferred from `types/activity.ts` and query code:

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | `gmail-{messageId}` for Gmail logs; UUID otherwise |
| `account_id` | TEXT | FK → accounts.id (not enforced, becomes orphan on account move if not migrated) |
| `tab` | TEXT | Denormalized from account at insert time |
| `row_index` | INTEGER | Denormalized |
| `account_name` | TEXT | Denormalized — can drift from accounts.account_name |
| `action_type` | TEXT | One of: call, email, in-person, note, sample-sent, tasting-complete |
| `note` | TEXT | Free-text; Gmail logs embed `[gmail-message:ID]` and `[gmail-thread:ID]` markers |
| `status_before`, `status_after` | TEXT | |
| `follow_up_date` | TEXT | Only one per account (enforced in code, not DB) |
| `notion_task_id` | TEXT | |
| `next_action_type` | TEXT | |
| `source` | TEXT | manual, gmail, notion_sync, etc. |
| `activity_kind` | TEXT | outreach, note, research, order |
| `counts_as_contact` | BOOLEAN | false for notes, true for actions |
| `is_deleted` | BOOLEAN | Soft-delete flag |
| `created_at` | TIMESTAMPTZ | |

**Missing schema file** — this table must be recreated manually if lost.

---

#### `orders` (schema in `/supabase/orders.sql`)
Tracks individual sales orders. `account_id` is a TEXT FK (not a hard constraint) that can become orphaned if an account is deleted or moved without the migration step in `accounts/move`. The `getOrders` query has a compensating fallback that also matches on `account_name` when `account_id` misses.

---

#### `error_logs` (schema in `/supabase/error_logs.sql`)
Internal diagnostic table. Written by `lib/errors/log.ts`; read by the Settings page. Acknowledged flag exists but has no auto-expiry — rows accumulate forever.

---

#### `contacts` (**no SQL schema file in repo**)
Referenced by `lib/contacts/store.ts`, `lib/contacts/autoCapture.ts`, and several API routes. Schema inferred:

| Column | Type |
|--------|------|
| `id` | UUID PK |
| `account_id` | TEXT |
| `name`, `role`, `email`, `phone` | TEXT |
| `preferred_channel`, `notes` | TEXT |
| `created_at`, `updated_at` | TIMESTAMPTZ |

**Missing schema file** — table must be recreated manually if lost.

---

#### `app_settings` (**no SQL schema file in repo**)
Used only by Notion sync to store `last_notion_sync` timestamp. No schema in repo.

---

### Relationships
- All FK relationships are soft (TEXT columns with no DB-enforced constraints).
- `activity_logs.account_id` → `accounts.id` is the critical join; broken by any rename/retab that doesn't run the migration update.
- `orders.account_id` → `accounts.id` same issue; `getOrders` has a fallback to `account_name` match.
- No RLS policies. All server-side access uses the service role key and can read/write any row.

### Hardcoded to this client
| Location | Value | What it controls |
|----------|-------|-----------------|
| `GMAIL_OWNER_EMAIL` default | `jake@radicalsasquatch.com` | Filters self-email in polling |
| `GMAIL_OWNER_COMPANY` default | `Radical Sasquatch` | Blocks self-inference in AI |
| AI system prompt | "a dumpling company" | Account classification context |
| `lib/email/inferAccount.ts` | `OWNER_COMPANY` / `OWNER_DOMAIN` | Guards against self-account creation |
| `lib/utils/constants.ts` status lists | Ordered by Radical Sasquatch sales process | Status display and scoring |
| `tsconfig.json` | No `target` field | Causes unexpected TS behavior; caused a production build break |

---

## 3. External Integrations

### Gmail (OAuth2 Refresh Token)
**Auth mechanism:** Long-lived refresh token stored in `GMAIL_REFRESH_TOKEN` env var. The `googleapis` library automatically exchanges it for short-lived access tokens.

**What happens when the token is invalid:** `listRecentSentMessageIds` and `getSentMessagesById` swallow errors and return empty arrays. The poll appears to succeed but imports nothing. `checkGmailConnectivity()` (called by the health cron every 6h) will catch it and write a warn to `error_logs`. There is no in-app alert surfaced to the user proactively; they would have to check Settings → Error Logs.

**No re-auth flow from UI.** If the token is revoked, a developer must manually regenerate it via `/api/gmail/connect` → `/api/gmail/auth` OAuth flow and update the env var. There is no UI path for the end user to do this.

**Scope of polling:** Two queries per poll cycle: `in:sent after:{14 days ago}` and `in:inbox after:{14 days ago}`. Max 25 results per query. Fast-growing mailboxes could miss emails if more than 25 land in 14 days (unlikely but possible for sent volume bursts).

**Client-side lock:** `clientPollLock.ts` uses a module-level boolean (`inFlight`) and a 120-second throttle (`lastAt`). This is per JavaScript module instance — meaning per browser tab. Two open tabs will each run their own 60-second poll cycle independently, doubling Gmail API calls and risking duplicate `activity_log` rows (partially mitigated by the `[gmail-message:ID]` idempotency marker, but the insert still fires).

### Supabase
**Server client:** `createServerClient()` uses `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS). In development, falls back to anon key.
**Browser client:** `createBrowserClient()` uses `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Used for activity logs and orders fetched client-side (`/api/activity`, `/api/orders`). Anon key has implicit full access because no RLS is defined.

**No connection pooling management.** Every API request creates a new Supabase client. At scale this would exhaust connection limits but is fine for single-user usage.

**`isMissingRelation` helper:** Detects PostgreSQL error code PGRST204 (missing table) and gracefully returns empty results. This means a missing table silently degrades rather than alerting loudly.

### Google Sheets (Service Account)
**Auth:** `GOOGLE_SERVICE_ACCOUNT_KEY` (JSON as a single-line string) + `GOOGLE_SHEET_ID`.
**Usage:** Read fallback when Supabase is empty; write target for status/contact date changes; the canonical column schema lives here.
**Column index brittleness:** `lib/sheets/schema.ts` maps column names to integer indexes (0-based). Example: Restaurants tab has 16 columns mapped. If anyone inserts a column in the spreadsheet, every mapped index after that position shifts silently. There is no header-row validation.
**Fallback drift:** When Supabase is the source (normal case), Sheets writes are best-effort (`catch(() => {})`). The sheet can fall behind permanently without any alert.

### Anthropic
**Usage:** Three distinct tasks —
1. Account inference (`inferAccount.ts`) — Haiku, ~250 tokens
2. Email disambiguation (`disambiguator.ts`) — Haiku, ~200 tokens
3. Email analysis / action extraction (`analyze.ts`) — not confirmed which model

**If `ANTHROPIC_API_KEY` is absent:** `hasAnthropic()` returns false and all three functions return null. Account auto-creation is silently disabled. No error is logged.

**Model IDs hardcoded:** Model strings are literals in source, not env vars. A model deprecation requires a code change.

**Classification accuracy is prompt-dependent and unguarded.** The `inferAccount.ts` system prompt was hardened (June) to better separate Catering (venues/events: retreat centers, sports parks, museums, hotels) from Retail (shelf/store), after the model confidently mis-tabbed venues like "Solterra Retreat" as Retail. This reduces but does not eliminate misclassification — there is no test, no confidence audit trail beyond the stored `review_confidence`, and no feedback loop. The only correction path is manual: the review queue (70–84 confidence) or the new SidePanel "Tab" dropdown for already-live auto-inferred accounts.

### Notion
**One-way sync** (Notion → activity logs). The sync cron writes to Supabase but never reads back; there is no dedup on Notion task IDs beyond a nullable `notion_task_id` column in activity logs. If the sync runs twice for the same task window, duplicate logs are possible.

---

## 4. Cron Jobs

All three crons authenticate via `Authorization: Bearer ${CRON_SECRET}`. The middleware explicitly bypasses the session gate for `/api/cron/*` and `/api/notion/sync` if this header matches.

| Job | Schedule | Max Duration | What it does |
|-----|----------|-------------|--------------|
| `/api/notion/sync` | 0 0 * * * (midnight UTC) | default (10s) | Fetches Notion tasks completed since last sync → writes activity logs → updates `app_settings.last_notion_sync` |
| `/api/cron/stale-sweep` | 0 9 * * * (9am UTC) | 60s | Scans all pipeline accounts; 1× stale → prepends `[auto-nudge]` to nextSteps; 2× stale → moves to Backburner |
| `/api/cron/health` | 0 6 * * * (daily 6am UTC) | 30s | Probes Gmail auth, Supabase accounts table, Sheets env vars; logs warn to error_logs if failing. **Changed from `0 */6 * * *` (every 6h) to daily** because the Hobby plan rejects sub-daily crons — that rejection silently broke deploys for ~2 weeks. |

### Failure behavior
- **Notion sync** — no retries. If it fails midway (e.g., after inserting 3 of 10 tasks), the `last_notion_sync` timestamp may or may not have been updated depending on where in the flow it failed. Partially imported tasks with no follow-up run would silently not appear. No error is logged if Notion returns a non-2xx (inferred from the code structure).
- **Stale-sweep** — processes accounts in a `for` loop with individual `await` + `.catch()` per account. A failure on one account is logged as a warn and the loop continues. Sheet sync failures are silently swallowed (`catch(() => {})`). If the cron is killed at 60s mid-loop, some accounts are updated and some are not with no rollback.
- **Health check** — logs a warn to error_logs on failure. Returns 503. Does not page or alert anyone. The only way to notice a failing health check is to check Settings → Error Logs. **Now runs only once per day** (Hobby-plan constraint), so the probe's detection window for a dead Gmail token / Supabase outage widened from ~6h to ~24h.
- **Vercel Hobby cron constraint (new failure mode)** — the free Hobby plan only permits crons that run at most once per day. Any cron expression that fires more than once daily (e.g. `0 */6 * * *`) causes the **entire deployment to be rejected at build time**, with the failure surfaced only in the Vercel deploy log — not in the app. This already cost ~2 weeks of un-deployed commits. Re-adding any sub-daily cron will silently break deploys again until the account is upgraded to Pro.
- **Cron authentication** — if `CRON_SECRET` is not set in env, the check `if (cronSecret && ...)` short-circuits to allow all requests through (the `if (cronSecret && ...)` guard only fires when `cronSecret` is truthy). The default `"change-me"` is in the env file. If neither is set in production, crons are open.

---

## 5. Failure Modes (Ranked by Risk)

### Risk 1 — CRITICAL: Gmail token expiry with no recovery
The `GMAIL_REFRESH_TOKEN` can be revoked by Google at any time (user revokes app access, OAuth app policy changes, 6-month inactivity on some account types). When this happens: the poll runs, the list calls return empty arrays, no emails are imported, no error is surfaced to the user. The health cron will eventually write a warn to error_logs, but only if someone checks Settings. **There is no automated alert.** Recovery requires a developer to run the OAuth flow and re-set the env var. This is the most likely cause of "Gmail stopped logging emails" that won't be immediately obvious. **Detection latency worsened June 8:** the health probe now runs once daily (Hobby-plan limit) instead of every 6h, so a dead token can go unnoticed for up to ~24h.

### Risk 2 — CRITICAL: Missing Supabase table schemas
`activity_logs`, `contacts`, and `app_settings` have no SQL files in the repo. If the Supabase project is deleted, reset, or a new one is provisioned (for testing, staging, or a new client), these tables cannot be recreated from the codebase. All outreach history would be lost.

### Risk 3 — HIGH: Multi-tab Gmail polling race
`clientPollLock.ts` uses a module-level boolean. A user with two browser tabs open runs two independent 60-second poll cycles. Both can call `GET /api/gmail/poll` simultaneously. The Gmail dedup marker (`[gmail-message:ID]`) prevents duplicate logs from being inserted for the same message, but only if the first insert completes before the second begins. Under concurrent execution, both polls may insert the same log row before either checks for the marker. Result: duplicate activity log entries.

### Risk 4 — HIGH: Sheets column index drift
`lib/sheets/schema.ts` maps column names to zero-based integer offsets. These are not validated against the actual sheet headers at runtime. If anyone adds a column to the Google Sheet before an existing column, every write after that position silently writes to the wrong column. The failure mode is data corruption in the sheet, not an error.

### Risk 5 — HIGH: Dedup accumulation in Supabase
Wrong-tab duplicate accounts (created by the Gmail poll re-inference bug) accumulate in the `accounts` table. `dedupeSnapshotsByName` in `snapshot.ts` suppresses them at display time, but they remain in the DB. The cleanup endpoint (`/api/accounts/cleanup-dupes`) exists but must be manually triggered. Over time, the accounts table will contain many ghost rows that could affect query performance and confuse direct DB inspection.

### Risk 6 — HIGH: Account ID instability
Account IDs are computed as `${tabSlug}:${normalizedName}`. They change when an account is renamed (via `/api/sheets/update`) or moved between tabs (via `/api/accounts/move` or `/api/accounts/retab`). Both endpoints run child-table migration, but a rename via `/api/sheets/update` only updates Supabase — it does **not** migrate `activity_logs` or `orders` to the new ID. Old logs become orphaned. The `getOrders` fallback recovers orders by `account_name`, but activity logs have no such fallback. **Note (June 8):** the SidePanel now exposes a "Tab" dropdown for auto-inferred accounts (`_rowIndex === 0`) that calls `/api/accounts/retab`; that endpoint *does* migrate `activity_logs` and `orders` to the new ID. So tab moves via the dropdown are safe, but the ID-instability hazard remains for the rename path and for any future code that references the old ID.

### Risk 7 — MEDIUM: `raw` JSONB field is an undocumented accumulation
The `raw` column in `accounts` stores an ever-growing set of fields: `review_pending`, `review_reason`, `review_confidence`, `hitListPinned`, `_rowIndex`, `website`, `ig`, `kitchen`, `dumplings`, `commissionPct`, and whatever the sheet import writes. There is no schema, no validation, and no migration strategy. Code that reads `raw.someField` silently gets `undefined` if the field was written with a different name in a previous version.

### Risk 8 — MEDIUM: TypeScript `target` not set (root cause still live)
`tsconfig.json` still has no `target` field, defaulting to ES3. ES2015+ features (e.g., `Map.values()` iteration) fail silently in local `next build` but throw `TS2802` during Vercel's strict type check, causing deployment to fail. This already happened once and was not caught for approximately two weeks. **A point fix was applied** — the two offending iterations in `lib/accounts/snapshot.ts` (lines 211, 223) were wrapped in `Array.from(...)` — but this is a workaround, not a cure. The underlying `tsconfig` setting is unchanged, so any future use of a modern iterator/iterable pattern (`Map`/`Set` iteration, spreading an iterator, `for...of` over a non-array) will reintroduce the same build break.

### Risk 9 — MEDIUM: Sheets → Supabase sync is one-directional and lossy
On first load with an empty Supabase, accounts are seeded from Sheets (`upsertAccountSnapshots`). After that, Sheets writes are best-effort. If a user edits the Google Sheet directly (which Jake does), those changes do not propagate to Supabase until the next full re-seed (which only happens when Supabase is empty). The two stores can permanently diverge.

### Risk 10 — LOW: Error logs never expire
`error_logs` rows have no TTL or auto-delete. `logError` is called for every skipped Gmail message (severity warn), every stale-sweep operation, and every failed API call. Over months of normal operation the table will grow very large. There is no cleanup job.

### Risk 11 — LOW: Notion sync has no deduplication guarantee
The sync fetches tasks completed "since last sync" using the `last_notion_sync` timestamp. If two cron invocations overlap (possible if the first exceeds 10s but Vercel still fires the next one at midnight), tasks in the overlap window are inserted twice. The `notion_task_id` column exists but there is no UNIQUE constraint or upsert to prevent duplicates.

### Risk 12 — MEDIUM: Vercel Hobby plan rejects sub-daily crons (deploy-blocking)
The project is on Vercel's free Hobby plan, which only allows cron schedules that fire at most once per day. A cron expression that runs more than once daily causes the **whole deployment to fail at build time**, with the error visible only in the Vercel deploy log — never in the app. This already happened: the health cron's `0 */6 * * *` schedule silently blocked every deploy for ~2 weeks, masquerading as a "GitHub not deploying" problem. It was fixed by downgrading the cron to daily (`0 6 * * *`). This is a standing trap: any future addition of a sub-daily cron, or any plan downgrade, will reintroduce silent deploy failures until the account is on Pro. There is no guardrail in the repo (lint/test) that catches a non-compliant cron before it reaches Vercel.

---

## 6. Error Handling and Logging

### What exists
- `lib/errors/log.ts` — `logError(source, error, context?, severity)` writes to the `error_logs` Supabase table and always also calls `console.error`. Designed never to throw.
- `logError` is called in: Gmail poll, cron routes (stale-sweep, health), account review/move/retab, sheet update.
- Settings page surfaces unacknowledged errors from `error_logs`.
- `isMissingRelation` helper gracefully handles missing Supabase tables (returns empty arrays instead of throwing).
- Activity log insert has column-missing retry logic (migration-tolerant).

### What is missing or weak
- **Gmail list helpers swallow errors entirely.** `listRecentSentMessageIds` returns `[]` on any error without calling `logError`. A token expiry produces no log entry from the poll itself. Only `checkGmailConnectivity()` in the health cron surfaces this, and only once per day (was every 6h before the June 8 Hobby-plan cron downgrade).
- **Sheet write failures in the poll are `catch(() => {})`.** Status and contact date syncs to Google Sheets fail silently. No log entry, no user feedback.
- **No alerting.** Error logs are written to a DB table that someone must proactively check. There is no email, Slack, or push notification when something breaks.
- **No structured error classification.** `source` is a free-text string. There is no enum, no severity escalation, no aggregation. Searching error logs requires knowing the exact source string.
- **Stale-sweep sheet syncs swallow all errors.** `updateCell` calls in the cron are `.catch(() => {})`. A sheet write failure is invisible.
- **Notion sync errors are not logged.** The sync route has a try-catch that returns a 500 but does not call `logError`. The cron invocation result is not surfaced anywhere.
- **No request-level tracing.** There is no correlation ID between a frontend action, its API call, and any downstream Supabase/Gmail/Sheets operation.

---

## 7. Test Coverage

### What is tested
**`lib/activity/notes.test.ts`** — 12 unit tests covering:
- `parseActivityNote` / `formatActivityNote` round-trip (SUMMARY/DETAILS/OBJECTION/NEXT format)
- Plain note splitting (single paragraph vs. multi-paragraph)
- Gmail auto-summary formatting (sent vs. received)
- Truncation at `GMAIL_DETAILS_DISPLAY_CAP`
- Edge cases: empty string, whitespace-only

This is the **only test file** in the repository.

### What is not tested
Everything else. Specifically:

| Module | Risk of being untested |
|--------|----------------------|
| `lib/email/matcher.ts` | High — confidence scoring, domain/name signals, thread bias |
| `lib/email/inferAccount.ts` | High — AI inference + confidence gating + dedup guard |
| `lib/accounts/snapshot.ts` | High — two-pass dedup, `snapshotsToTabs`, `isPendingReview` |
| `lib/accounts/identity.ts` | Medium — ID normalization, alias matching |
| `lib/gmail/sent.ts` | Medium — message parsing, header extraction |
| `app/api/gmail/poll/route.ts` | High — core business logic, 300+ lines |
| `app/api/accounts/review/route.ts` | High — approve/reject with cascade delete |
| `app/api/cron/stale-sweep/route.ts` | Medium — account mutation logic |
| `lib/sheets/schema.ts` | High — column index maps are the most brittle single file |
| All React components | Low priority for business logic |

The matcher, inferencer, dedup, and cron logic represent the highest risk from lack of tests. Multiple bugs in these areas were caught in production (wrong-tab classification, duplicate accounts, React key collision).

---

## 8. Multi-Tenant Readiness

### Current state
The system is **entirely single-tenant**. There is no concept of workspace, organization, or user identity beyond the single app session cookie. Every Supabase query reads all rows from every table with no row-level filter.

### What would need to change to support a second client

**Schema changes:**
- Add `workspace_id` (UUID FK) to every table: `accounts`, `activity_logs`, `orders`, `contacts`, `error_logs`, `app_settings` (and the proposed `events` table from Section 9).
- Enable Supabase RLS policies on every table.
- Move Gmail credentials (client ID, secret, refresh token, owner email) from env vars to a per-workspace credentials table.
- Move Google Sheets ID and service account key to per-workspace config.
- Move Anthropic API key to per-workspace config (or a shared pool with per-workspace usage tracking).
- Move Notion API key and database ID to per-workspace config.

**Application changes:**
- All `createServerClient()` calls currently use a global service role key with no row filter. Every query would need a `.eq("workspace_id", currentWorkspace)` clause, or equivalent RLS JWT claims.
- Authentication would need to issue per-user JWTs with workspace claims, not a single shared app password.
- Gmail polling would need to be workspace-aware: the poll cron would need to iterate over all active workspaces and use per-workspace credentials.
- The `GMAIL_OWNER_EMAIL` / `GMAIL_OWNER_COMPANY` defaults (`jake@radicalsasquatch.com`, `Radical Sasquatch`) are baked into the AI inference system prompt at module load time. They would need to be fetched per-workspace at request time.
- The Sheets column schema (`lib/sheets/schema.ts`) hardcodes the column layout for Radical Sasquatch's specific spreadsheet. Different clients would have different sheet layouts.
- The AI system prompt in `inferAccount.ts` says "a dumpling company." This would need to be a per-workspace description.
- `CRON_SECRET` is a single global token. Cron jobs would need per-workspace auth or a different invocation mechanism.
- `clientPollLock.ts` is a module-level singleton. It would need to be keyed by workspace or session.

**Structural assumptions that bake in one client:**
1. One Gmail account = one app instance
2. One Google Sheet ID = one app instance
3. Status values (`PIPELINE_STATUSES`, `STATUS_VALUES`) are hardcoded for Radical Sasquatch's sales process
4. Tab names and slugs (Restaurants, Retail, Catering, Food Truck) are hardcoded throughout — in types, schema maps, UI components, AI prompts, and cron logic
5. Stale thresholds per tab are constants, not configurable
6. The `[auto-nudge]` marker string is a hardcoded literal in both the cron and the UI rendering
7. Commission rate defaults (10%) are hardcoded
8. `CRON_SECRET = "change-me"` default implies a single known secret

**Estimated effort to multi-tenant:**
This is a substantial rearchitecting task, not a configuration change. The tab/status model and schema would need to be either made configurable or replaced with a general-purpose CRM model. The Gmail/Sheets integration is the hardest part — it is deeply interwoven with the data model and the column mapping is entirely client-specific.

---

## 9. Proposed Feature: Event Bookings (not yet built)

_Added June 8, 2026 at user request. This is a design spec only — no application code has been written. The goal: track events where the food truck is booked at a venue/account, since a large share of revenue depends on those bookings, and make it fast to log an event the moment it locks in._

### The core decision: new entity, NOT a new pipeline "tab"

The instinct is "add an Events tab." **Do not model events as a pipeline tab.** The tab abstraction in this app is for *account buckets* — it is keyed by `${tabSlug}:${normalizedName}`, deduped by name across tabs, carries a `row_index` tied to a Google Sheet row, and is hardcoded into types, `lib/sheets/schema.ts`, the AI inference prompt, and cron logic. An event is not an account: it is a dated, money-bearing **booking that belongs to** an account, and the same account can have many events over time. Forcing events through the account/tab machinery would inherit every wrong-tab, dedup, and rowIndex hazard documented above and would collapse multiple events for one venue into a single deduped row.

The right shape is a **first-class `events` entity** (its own Supabase table + API route + view), linked to an account by `account_id`, displayed in the UI as a dedicated **"Events" view** (a sibling of the pipeline, like the existing Orders concept) rather than a fifth/sixth account tab. This mirrors how `orders` already works (`orders` is a separate table with `account_id` + `account_name` fallback, not a tab).

### Proposed data model — `events` table

Modeled on the existing `orders` table (`/supabase/orders.sql`) for consistency. **A SQL file `/supabase/events.sql` must ship with it** — do not repeat the `activity_logs`/`contacts` mistake of a schema that exists only in production.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `gen_random_uuid()` |
| `account_id` | TEXT | Soft FK → `accounts.id`. Same orphan risk as orders on rename/retab — see Risk 6. Must be migrated by `move`/`retab`. |
| `account_name` | TEXT | Denormalized fallback (matches the `orders` pattern; `getOrders` recovers by name when `account_id` misses). |
| `tab` / `tab_slug` | TEXT | Denormalized source tab of the booking account (usually Food Truck/Catering). |
| `event_name` | TEXT | e.g. "Aurora Sports Park Summer Fest". |
| `event_date` | DATE NOT NULL | When the event happens. Primary sort key. |
| `event_end_date` | DATE | For multi-day events; null = single day. |
| `location` | TEXT | Venue address / site. |
| `status` | TEXT NOT NULL default `'Tentative'` | Booking lifecycle: `Tentative` → `Confirmed` → `Completed` → `Paid` → `Cancelled`. (Distinct from account pipeline statuses; defined in its own constant, not `STATUS_VALUES`.) |
| `estimated_revenue` | NUMERIC default 0 | Expected $ — what forecasting/booked-revenue rolls up. |
| `actual_revenue` | NUMERIC | Filled after the event; null until then. |
| `deposit_amount` | NUMERIC | Deposit collected to lock the booking. |
| `deposit_paid` | BOOLEAN default false | |
| `contact_name`, `phone`, `email` | TEXT | Event point of contact (may differ from account contact). |
| `details` / `notes` | TEXT | Logistics, menu, headcount, etc. |
| `created_at` | TIMESTAMPTZ default now() | |
| `updated_at` | TIMESTAMPTZ default now() | |

Indexes: `account_id`, `account_name`, `status`, `event_date desc`, `created_at desc` — same set as `orders`.

### Revenue semantics (the point of the feature)
- **Booked revenue** = sum of `estimated_revenue` for events in `Confirmed`/`Completed`/`Paid` (exclude `Tentative` and `Cancelled`), filterable by date range.
- **Realized revenue** = sum of `actual_revenue` for `Paid` events.
- **Pipeline/forecast** = `Tentative` events, shown separately so they don't inflate booked numbers.
- These can surface on the Dashboard as "Booked this month / next 30 days" tiles and roll up per account on the account side panel ("3 events booked, $X").

### Input flow ("easy to input as they lock in")
- An **"Add Event" quick form**: account (typeahead against existing accounts, with "create if new"), event name, date, location, estimated revenue, status, deposit, contact. Default status `Tentative`; one click to `Confirmed`.
- Reachable from (a) a top-level **Events view**, and (b) a button on an **account's side panel** so a booking can be logged in context (auto-fills `account_id`/`account_name`/contact).
- Optional: log a companion `activity_log` row (`activity_kind: "order"` or a new `"event"`) so the booking shows in the account's timeline and counts as a contact touch.

### UI surface
- New **Events view** alongside the existing pipeline `table`/`board` views (extend the `ViewSwitcher`, or add a dedicated route `app/(app)/events/page.tsx`). Default sort by `event_date` ascending (next upcoming first), with status filter chips and a date-range filter. A calendar/agenda layout is a natural follow-on but a sortable table is the minimum.
- Per-account: an "Events" panel in the account side panel listing that account's bookings + the Add Event button.

### Integration points / files this would touch (for scoping only)
- New: `/supabase/events.sql`, `app/api/events/route.ts` (GET/POST/PATCH), `lib/events/*` (types + queries), an Events view component, `ViewSwitcher` entry or new route.
- Touch: `move`/`retab` endpoints must migrate `events.account_id` alongside `activity_logs`/`orders` (otherwise events orphan — Risk 6). Dashboard prioritizer/tiles for booked-revenue rollups. `cascadeDeleteAccount` must also clear/repoint events.
- Constants: an `EVENT_STATUSES` list separate from pipeline statuses.

### Risks specific to this feature
1. **Orphaning on rename/retab/delete.** Events inherit the soft-FK problem (Risk 6). The migration step in `move`/`retab` and the cascade in `cascadeDeleteAccount` must be extended, or bookings silently detach from their account.
2. **Two revenue stores.** `orders.amount` and `events.estimated_revenue/actual_revenue` both represent money. Without a clear rule for which counts toward totals, dashboards can double-count. Define ownership: orders = product sales, events = booking fees, and sum them explicitly.
3. **Status-model confusion.** Event statuses must be a separate enum; reusing pipeline `STATUS_VALUES` would pollute account scoring/stale-sweep logic.
4. **No tests today.** Per Section 7 the codebase has one test file; revenue math is exactly the kind of logic that needs unit tests, and currently wouldn't get them by default.
5. **Multi-tenant.** If multi-tenancy is ever pursued (Section 8), `events` needs `workspace_id` like every other table — add it to that list now so it isn't forgotten.

### Effort
Small-to-moderate and largely additive: it reuses the established `orders` patterns (table + API + denormalized account fallback + side-panel surface). The only cross-cutting work is wiring event migration into `move`/`retab`/`cascadeDeleteAccount` and deciding the revenue-rollup rules. No changes to the brittle Gmail/Sheets column machinery are required.
