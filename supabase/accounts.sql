create table if not exists public.accounts (
  id text primary key,
  account_name text not null,
  tab text not null,
  tab_slug text not null,
  row_index integer not null,
  type text,
  location text,
  status text,
  next_steps text,
  next_action_type text,
  contact_date text,
  contact_name text,
  phone text,
  email text,
  est_monthly_order text,
  notes text,
  raw jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists accounts_tab_slug_idx on public.accounts (tab_slug);
create index if not exists accounts_status_idx on public.accounts (status);
create index if not exists accounts_updated_at_idx on public.accounts (updated_at desc);
