-- Activity log — every outreach, note, status change, and Gmail/Notion
-- import. Run this in the Supabase SQL editor if the table is missing.
--
-- Notes on shape (matches the live production table):
--   - id is UUID. For idempotency of inbound items (e.g. Gmail messages),
--     lib/gmail/logId.ts deterministically derives a UUID-v5-shaped string
--     from the message id; manual logs use crypto.randomUUID(); event/order
--     logs omit id and let Postgres default to gen_random_uuid().
--   - account_id is a soft FK to accounts.id ("${tabSlug}:${normalizedName}").
--     Not a hard constraint because account IDs change on rename/retab.
--   - is_deleted is a soft-delete flag; reads filter on it.
--   - counts_as_contact is false for notes, true for real outreach.

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  account_id text,
  tab text,
  row_index integer,
  account_name text,
  action_type text,
  note text,
  status_before text,
  status_after text,
  follow_up_date text,
  notion_task_id text,
  next_action_type text,
  source text not null default 'manual',
  activity_kind text,
  counts_as_contact boolean not null default true,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now()
);

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
