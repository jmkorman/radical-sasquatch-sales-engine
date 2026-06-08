-- migrate_activity_logs.sql
--
-- Idempotent migration to bring an older production `activity_logs` table up
-- to the shape that `supabase/activity_logs.sql` documents.
--
-- WHY THIS EXISTS
-- ---------------
-- `activity_logs.sql` is a `create table if not exists` — it will NOT add a
-- column that already-exists-with-missing-fields. The events feature relies
-- on three columns in particular:
--
--   * `source`            — `deleteActivityLogsForEvent` filters on
--                           `source = 'event'`. Missing the column means the
--                           filter matches nothing and timeline entries for
--                           deleted events stay orphaned.
--   * `is_deleted`        — both the event-delete cascade and the
--                           account-delete cascade do
--                           `update({ is_deleted: true })`. Missing the
--                           column makes the cascade throw (PGRST204).
--   * `activity_kind`     — the event-insert path writes
--                           `activity_kind: "event"` and the read path
--                           filters on it. The `insertActivityLog` column-
--                           missing retry will drop it silently, so writes
--                           survive, but reads can't filter for events.
--
-- Plus `counts_as_contact`, `notion_task_id`, `next_action_type`, and
-- `follow_up_date`, which the broader CRM relies on but which a very old
-- table predating those features may lack.
--
-- Every statement is `ADD COLUMN IF NOT EXISTS` / `CREATE INDEX IF NOT
-- EXISTS`, so this file is safe to run repeatedly and safe to run on a
-- brand-new database (in which case `activity_logs.sql` should be run
-- first to create the table).
--
-- USAGE
-- -----
--   1. Run supabase/activity_logs.sql       (no-op if the table exists)
--   2. Run supabase/migrate_activity_logs.sql  (this file; fills in gaps)

-- ---------------------------------------------------------------------------
-- Columns that the events code path requires
-- ---------------------------------------------------------------------------

alter table public.activity_logs
  add column if not exists source text not null default 'manual';

alter table public.activity_logs
  add column if not exists activity_kind text;

alter table public.activity_logs
  add column if not exists counts_as_contact boolean not null default true;

alter table public.activity_logs
  add column if not exists is_deleted boolean not null default false;

-- ---------------------------------------------------------------------------
-- Columns the broader CRM uses; harmless if already present
-- ---------------------------------------------------------------------------

alter table public.activity_logs
  add column if not exists status_before text;

alter table public.activity_logs
  add column if not exists status_after text;

alter table public.activity_logs
  add column if not exists follow_up_date text;

alter table public.activity_logs
  add column if not exists notion_task_id text;

alter table public.activity_logs
  add column if not exists next_action_type text;

alter table public.activity_logs
  add column if not exists tab text;

alter table public.activity_logs
  add column if not exists row_index integer;

alter table public.activity_logs
  add column if not exists account_name text;

alter table public.activity_logs
  add column if not exists action_type text;

alter table public.activity_logs
  add column if not exists note text;

alter table public.activity_logs
  add column if not exists created_at timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- Indexes — `create index if not exists` is built in, so these are safe to
-- re-run. Mirrors supabase/activity_logs.sql.
-- ---------------------------------------------------------------------------

create index if not exists activity_logs_account_id_idx
  on public.activity_logs (account_id);

create index if not exists activity_logs_tab_row_idx
  on public.activity_logs (tab, row_index);

create index if not exists activity_logs_account_name_idx
  on public.activity_logs (account_name);

create index if not exists activity_logs_created_at_idx
  on public.activity_logs (created_at desc);

create index if not exists activity_logs_not_deleted_idx
  on public.activity_logs (is_deleted, created_at desc);

create index if not exists activity_logs_notion_task_id_idx
  on public.activity_logs (notion_task_id)
  where notion_task_id is not null;
