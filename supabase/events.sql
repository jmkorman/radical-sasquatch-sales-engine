-- Events table — first-class bookings that belong to an account.
-- One account can have many events. Modeled on /supabase/orders.sql for
-- consistency (same denormalized account_id + account_name fallback so a
-- rename/retab can recover by name when the soft FK drifts).
--
-- Run this in the Supabase SQL editor if the API returns
-- "Supabase 'events' table is missing".

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  account_id text not null,
  account_name text not null,
  tab text,
  tab_slug text,
  row_index integer,
  title text not null default 'Untitled event',
  event_date date not null,
  event_end_date date,
  location text,
  status text not null default 'Inquiry',
  quoted_amount numeric not null default 0,
  actual_amount numeric,
  deposit numeric not null default 0,
  deposit_paid boolean not null default false,
  commission numeric not null default 0,
  contact_name text,
  phone text,
  email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now()
);

create index if not exists events_account_id_idx on public.events (account_id);
create index if not exists events_account_name_idx on public.events (account_name);
create index if not exists events_status_idx on public.events (status);
create index if not exists events_event_date_idx on public.events (event_date desc);
create index if not exists events_created_at_idx on public.events (created_at desc);
