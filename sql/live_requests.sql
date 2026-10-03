-- Live Learning: 1-on-1 session requests
-- Run this in the Supabase SQL Editor. Safe to run more than once.
--
-- An earlier Live page design left a `live_requests` table in this project
-- with a different set of columns (requester_id, topic, ...). This script
-- migrates that table in place: it never drops the table or deletes data.
-- Rows left over from the old design (user_id is null) are marked
-- 'cancelled' so they stay off the board.
--
-- Note: the `increment_wallet` RPC must accept negative amounts (it is used
-- to charge the poster the ₦100 session fee).

-- 1. Fresh installs: create the full table.
create table if not exists public.live_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  description text,
  status text not null default 'open' check (status in ('open', 'active', 'cancelled', 'completed')),
  partner_id uuid,
  completed_by uuid,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  completed_at timestamptz,
  constraint live_requests_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade,
  constraint live_requests_partner_id_fkey foreign key (partner_id) references public.profiles(id) on delete set null,
  constraint live_requests_completed_by_fkey foreign key (completed_by) references public.profiles(id) on delete set null
);

-- 2. Older installs: add whatever the previous table is missing.
alter table public.live_requests add column if not exists user_id uuid;
alter table public.live_requests add column if not exists title text;
alter table public.live_requests add column if not exists description text;
alter table public.live_requests add column if not exists status text not null default 'open';
alter table public.live_requests add column if not exists partner_id uuid;
alter table public.live_requests add column if not exists completed_by uuid;
alter table public.live_requests add column if not exists created_at timestamptz not null default now();
alter table public.live_requests add column if not exists activated_at timestamptz;
alter table public.live_requests add column if not exists completed_at timestamptz;

alter table public.live_requests alter column status set default 'open';

-- Make sure inserts can generate their own id even if the old table lacked a default.
do $$ begin
  alter table public.live_requests alter column id set default gen_random_uuid();
exception when others then raise notice 'could not set id default: %', sqlerrm; end $$;

-- 3. Replace any legacy status CHECK constraint with the current set of states.
do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'live_requests'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%status%'
  loop
    execute format('alter table public.live_requests drop constraint %I', c.conname);
  end loop;
end $$;

do $$ begin
  alter table public.live_requests
    add constraint live_requests_status_check
    check (status in ('open', 'active', 'cancelled', 'completed')) not valid;
exception when duplicate_object then null; end $$;

-- 4. Foreign keys (guarded — fresh installs already have them).
do $$ begin
  alter table public.live_requests
    add constraint live_requests_user_id_fkey foreign key (user_id)
    references public.profiles(id) on delete cascade;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.live_requests
    add constraint live_requests_partner_id_fkey foreign key (partner_id)
    references public.profiles(id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.live_requests
    add constraint live_requests_completed_by_fkey foreign key (completed_by)
    references public.profiles(id) on delete set null;
exception when duplicate_object then null; end $$;

-- Legacy-only columns (requester_id, topic, ...) may still be NOT NULL
-- without a default. Relax those so the new inserts can succeed.
do $$
declare c record;
begin
  for c in
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'live_requests'
      and is_nullable = 'NO'
      and column_default is null
      and column_name not in ('id', 'user_id', 'title')
  loop
    execute format('alter table public.live_requests alter column %I drop not null', c.column_name);
  end loop;
end $$;

create index if not exists live_requests_status_idx on public.live_requests (status, created_at desc);

-- 5. Keep rows from the old design off the board.
do $$ begin
  update public.live_requests
     set status = 'cancelled'
   where user_id is null
     and status is distinct from 'cancelled';
exception when others then raise notice 'legacy row cleanup skipped: %', sqlerrm; end $$;

-- 6. Row Level Security.
alter table public.live_requests enable row level security;

-- Start from a clean slate: drop any policies left over from the old design.
do $$
declare p record;
begin
  for p in select policyname from pg_policies
            where schemaname = 'public' and tablename = 'live_requests'
  loop
    execute format('drop policy %I on public.live_requests', p.policyname);
  end loop;
end $$;

-- Table grants (the old table is missing some, which caused 42501 errors).
grant select on public.live_requests to anon;
grant select, insert, update, delete on public.live_requests to authenticated;
grant all on public.live_requests to service_role;

-- Everyone signed in can browse the request board.
create policy "Authenticated read live requests"
  on public.live_requests for select
  to authenticated using (true);

-- The public landing page shows the newest open request.
create policy "Public read open live requests"
  on public.live_requests for select
  to anon using (status = 'open');

-- Post your own request.
create policy "Users insert own live requests"
  on public.live_requests for insert
  to authenticated with check (auth.uid() = user_id);

-- Owners manage their own requests (edit / complete / cancel).
create policy "Owners update own live requests"
  on public.live_requests for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Owners delete own live requests"
  on public.live_requests for delete
  to authenticated using (auth.uid() = user_id);

-- Claiming: a signed-in user (not the poster) can claim an OPEN request.
create policy "Users claim open live requests"
  on public.live_requests for update
  to authenticated
  using (status = 'open' and auth.uid() <> user_id)
  with check (status = 'active' and partner_id = auth.uid());

-- Partners (teachers) can complete or cancel the session they accepted.
create policy "Partners complete their sessions"
  on public.live_requests for update
  to authenticated
  using (auth.uid() = partner_id)
  with check (auth.uid() = partner_id);

-- Realtime board updates.
do $$ begin
  alter publication supabase_realtime add table public.live_requests;
exception when duplicate_object then null; end $$;

-- Make the new columns and foreign keys visible to the API immediately.
notify pgrst, 'reload schema';
