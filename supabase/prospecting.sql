create table if not exists public.prospects (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  type text,
  address text,
  website text,
  instagram text,
  notes text,
  source text,
  added_to_sheet boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.prospects add column if not exists channel text;
alter table public.prospects add column if not exists status text not null default 'new';
alter table public.prospects add column if not exists fit_score integer;
alter table public.prospects add column if not exists confidence_score integer;
alter table public.prospects add column if not exists fit_reason text;
alter table public.prospects add column if not exists suggested_pitch text;
alter table public.prospects add column if not exists source_url text;
alter table public.prospects add column if not exists research_query text;
alter table public.prospects add column if not exists trigger_type text;
alter table public.prospects add column if not exists trigger_reason text;
alter table public.prospects add column if not exists trigger_date timestamptz;
alter table public.prospects add column if not exists last_enriched_at timestamptz;
alter table public.prospects add column if not exists duplicate_account_id text;
alter table public.prospects add column if not exists finder_bucket text;
alter table public.prospects add column if not exists rejected_at timestamptz;

create index if not exists prospects_status_idx on public.prospects (status);
create index if not exists prospects_channel_idx on public.prospects (channel);
create index if not exists prospects_fit_score_idx on public.prospects (fit_score desc);
create index if not exists prospects_trigger_date_idx on public.prospects (trigger_date desc);
