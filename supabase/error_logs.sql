-- Internal error log so silent failures become visible in the UI.
-- Run this once in the Supabase SQL editor.

create table if not exists public.error_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null,          -- e.g. 'gmail-poll', 'sheets-update', 'prospect-daily-drip'
  severity text not null default 'error',  -- 'error' | 'warn'
  message text not null,
  details jsonb,                 -- stack, context, whatever is useful
  acknowledged boolean not null default false
);

create index if not exists error_logs_created_at_idx
  on public.error_logs (created_at desc);

create index if not exists error_logs_acknowledged_idx
  on public.error_logs (acknowledged, created_at desc);
