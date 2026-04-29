-- Orders table — single source of truth for order records.
-- Run this in the Supabase SQL editor if the API returns
-- "Supabase 'orders' table is missing".

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  account_id text not null,
  account_name text not null,
  tab text not null,
  row_index integer,
  account_type text,
  contact_name text,
  phone text,
  email text,
  order_name text,
  order_date date not null,
  due_date date,
  fulfillment_date date,
  status text not null default 'New',
  priority text default 'Normal',
  owner text,
  details text,
  production_notes text,
  notes text,
  amount numeric not null default 0,
  history text,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now()
);

create index if not exists orders_account_id_idx on public.orders (account_id);
create index if not exists orders_account_name_idx on public.orders (account_name);
create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_order_date_idx on public.orders (order_date desc);
create index if not exists orders_created_at_idx on public.orders (created_at desc);
