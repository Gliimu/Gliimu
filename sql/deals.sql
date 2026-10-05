-- ============================================================
-- Gliimu: Deals (the Requests page queue board)
-- Run this in the Supabase SQL Editor. Safe to run more than once.
--
-- A "deal" is work brought to Gliimu by an individual (personal)
-- or an organisation (corporate). Deals queue up FIFO; an admin
-- marks one done and the next one moves to the front.
-- ============================================================

-- 1. The table.
create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  deal_type text not null default 'personal',
  relationship text,
  company_name text,
  company_logo_url text,
  job_description text,
  budget text,
  timeline text,
  status text not null default 'queued',
  queue_position bigint,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  completed_by uuid,
  constraint deals_user_id_fkey foreign key (user_id)
    references public.profiles(id) on delete cascade,
  constraint deals_completed_by_fkey foreign key (completed_by)
    references public.profiles(id) on delete set null
);

-- 2. Older installs / re-runs: add anything missing.
alter table public.deals add column if not exists user_id uuid;
alter table public.deals add column if not exists deal_type text not null default 'personal';
alter table public.deals add column if not exists relationship text;
alter table public.deals add column if not exists company_name text;
alter table public.deals add column if not exists company_logo_url text;
alter table public.deals add column if not exists job_description text;
alter table public.deals add column if not exists budget text;
alter table public.deals add column if not exists timeline text;
alter table public.deals add column if not exists status text not null default 'queued';
alter table public.deals add column if not exists queue_position bigint;
alter table public.deals add column if not exists created_at timestamptz not null default now();
alter table public.deals add column if not exists started_at timestamptz;
alter table public.deals add column if not exists completed_at timestamptz;
alter table public.deals add column if not exists completed_by uuid;

-- 3. Replace any legacy CHECK constraints with the current state sets.
do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'deals'
      and con.contype = 'c'
  loop
    execute format('alter table public.deals drop constraint %I', c.conname);
  end loop;
end $$;

do $$ begin
  alter table public.deals
    add constraint deals_status_check
    check (status in ('queued', 'in_progress', 'completed', 'cancelled')) not valid;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.deals
    add constraint deals_type_check
    check (deal_type in ('personal', 'corporate')) not valid;
exception when duplicate_object then null; end $$;

-- 4. Foreign keys (guarded — fresh installs already have them).
do $$ begin
  alter table public.deals
    add constraint deals_user_id_fkey foreign key (user_id)
    references public.profiles(id) on delete cascade;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.deals
    add constraint deals_completed_by_fkey foreign key (completed_by)
    references public.profiles(id) on delete set null;
exception when duplicate_object then null; end $$;

-- 5. FIFO queue. A sequence guarantees the "next up" order without a
--    read-then-write race between two people posting at the same time.
create sequence if not exists public.deals_queue_seq;

do $$ begin
  alter table public.deals
    alter column queue_position set default nextval('public.deals_queue_seq');
exception when others then raise notice 'could not set queue default: %', sqlerrm; end $$;

update public.deals set queue_position = nextval('public.deals_queue_seq') where queue_position is null;

create index if not exists deals_status_idx on public.deals (status, queue_position);
create index if not exists deals_user_idx on public.deals (user_id, created_at desc);

-- 6. Row Level Security.
alter table public.deals enable row level security;

drop policy if exists "Authenticated read deals" on public.deals;
drop policy if exists "Public read active deals" on public.deals;
drop policy if exists "Users insert own deals" on public.deals;
drop policy if exists "Owners update own deals" on public.deals;
drop policy if exists "Owners delete own deals" on public.deals;
drop policy if exists "Admins update any deal" on public.deals;
drop policy if exists "Admins delete any deal" on public.deals;

grant select on public.deals to anon;
grant select, insert, update, delete on public.deals to authenticated;
grant all on public.deals to service_role;
grant usage, select on sequence public.deals_queue_seq to authenticated;

-- Everyone signed in can see the whole queue.
create policy "Authenticated read deals"
  on public.deals for select
  to authenticated using (true);

-- The public landing page shows the newest active deal.
create policy "Public read active deals"
  on public.deals for select
  to anon using (status in ('queued', 'in_progress'));

-- Post a deal.
create policy "Users insert own deals"
  on public.deals for insert
  to authenticated with check (auth.uid() = user_id);

-- Owners edit or cancel their own deal while it is still waiting.
create policy "Owners update own deals"
  on public.deals for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Owners delete own deals"
  on public.deals for delete
  to authenticated using (auth.uid() = user_id);

-- Admins work the queue: mark done, cancel, clean up.
-- (Guarded: public.is_admin() is created by sql/admin.sql. If that script has
--  not been run yet, skip these policies with a notice instead of failing —
--  a failure would roll back this whole script, including the create table.)
do $$ begin
  execute 'create policy "Admins update any deal"
    on public.deals for update
    to authenticated using (public.is_admin()) with check (public.is_admin())';
exception
  when undefined_function then raise notice 'is_admin() not found: run sql/admin.sql, then re-run this file';
end $$;

do $$ begin
  execute 'create policy "Admins delete any deal"
    on public.deals for delete
    to authenticated using (public.is_admin())';
exception
  when undefined_function then raise notice 'is_admin() not found: run sql/admin.sql, then re-run this file';
end $$;

-- 7. Realtime board updates.
do $$ begin
  alter publication supabase_realtime add table public.deals;
exception when duplicate_object then null; end $$;

-- 8. Company logo bucket.
do $$ begin
  insert into storage.buckets (id, name, public)
  values ('deal_logos', 'deal_logos', true)
  on conflict (id) do update set public = true;
exception when others then raise notice 'create the deal_logos bucket by hand: %', sqlerrm; end $$;

do $$ begin
  execute 'drop policy if exists "Public read deal logos" on storage.objects';
  execute 'create policy "Public read deal logos" on storage.objects
             for select to anon, authenticated using (bucket_id = ''deal_logos'')';
exception when others then raise notice 'add the deal_logos storage policies by hand: %', sqlerrm; end $$;

do $$ begin
  execute 'drop policy if exists "Users upload deal logos" on storage.objects';
  execute 'create policy "Users upload deal logos" on storage.objects
             for insert to authenticated with check (bucket_id = ''deal_logos'')';
exception when others then raise notice 'add the deal_logos storage policies by hand: %', sqlerrm; end $$;

notify pgrst, 'reload schema';
