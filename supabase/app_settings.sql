-- Generic key/value settings store. Used by:
--   - Notion sync cron (key "last_notion_sync" stores the last sync ISO).
--   - lib/contacts/store.ts — per-account contact lists are stored as
--     JSON strings under "account_contacts:{accountId}". There is no
--     separate `contacts` table; the contact data model lives here.
--
-- Run this in the Supabase SQL editor if the table is missing.

create table if not exists public.app_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

create index if not exists app_settings_updated_at_idx
  on public.app_settings (updated_at desc);
