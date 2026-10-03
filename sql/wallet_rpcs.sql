-- ============================================================
-- Gliimu: wallet + GP RPCs
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor).
-- Safe to run more than once. Standalone — run it in any order
-- relative to the other sql/ scripts.
--
-- The dashboard moves money and points through two database functions
-- that are called over RPC (they are not part of the repo):
--
--   increment_wallet(user_id, amount)      -- credit OR debit a wallet
--   add_gp(target_user_id, points_to_add)  -- award Gliimu Points
--
-- `increment_wallet` MUST accept negative amounts: the Live page charges
-- the poster the ₦100 session fee with amount = -100.
--
-- PostgREST matches RPC arguments by NAME, so the parameters must stay
-- named exactly user_id/amount and target_user_id/points_to_add.
--
-- This script:
--   1. Prints the definitions currently deployed so you can eyeball them.
--   2. Creates either function if it is missing.
--   3. Checks the transactions table for drift caused by the app's
--      transaction types (purchase, support, live_session, topup).
-- ============================================================

-- 1. What is deployed right now? Read the "Notices" panel of the output.
do $$
declare
  names text[] := array['increment_wallet', 'add_gp'];
  nm text;
  cnt integer;
  f record;
begin
  foreach nm in array names loop
    select count(*) into cnt
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = nm;

    if cnt = 0 then
      raise notice '--- %: NOT INSTALLED (will be created below) ---', nm;
    else
      if cnt > 1 then
        raise warning '--- %: % overloads exist — PostgREST RPC calls may be ambiguous ---', nm, cnt;
      end if;
      for f in
        select p.oid::regprocedure as sig, pg_get_functiondef(p.oid) as def
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = nm
      loop
        raise notice E'--- % ---\n%', f.sig, f.def;
      end loop;
    end if;
  end loop;
end $$;

-- 2. Create either function if the project does not have it yet.
do $$ begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'increment_wallet'
  ) then
    execute $fn$
      create function public.increment_wallet(user_id uuid, amount integer)
      returns void
      language plpgsql
      security definer
      set search_path = public
      as $body$
      begin
        update public.profiles
           set wallet_balance = coalesce(wallet_balance, 0) + increment_wallet.amount
         where id = increment_wallet.user_id;
      end;
      $body$;
    $fn$;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'add_gp'
  ) then
    execute $fn$
      create function public.add_gp(target_user_id uuid, points_to_add integer)
      returns void
      language plpgsql
      security definer
      set search_path = public
      as $body$
      begin
        update public.profiles
           set total_gp = coalesce(total_gp, 0) + add_gp.points_to_add
         where id = add_gp.target_user_id;
      end;
      $body$;
    $fn$;
  end if;
end $$;

-- Only signed-in users move funds/points (the service role keeps access).
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('increment_wallet', 'add_gp')
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end $$;

-- 3. Transactions columns + type checks used by the current app.
do $$ begin
  if to_regclass('public.transactions') is null then
    raise warning 'public.transactions does not exist — wallet and live transactions will fail.';
  end if;
end $$;

do $$ begin
  alter table public.transactions add column if not exists points integer not null default 0;
exception when others then raise notice 'points column check skipped: %', sqlerrm; end $$;

do $$ begin
  alter table public.transactions add column if not exists reference text;
exception when others then raise notice 'reference column check skipped: %', sqlerrm; end $$;

-- Warn when a CHECK constraint on `type` would reject one of the app's types.
do $$
declare
  c record;
  t text;
  needed text[] := array['purchase', 'support', 'live_session', 'topup'];
  missing text;
begin
  for c in
    select con.conname as name, pg_get_constraintdef(con.oid) as def
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
     where nsp.nspname = 'public'
       and rel.relname = 'transactions'
       and con.contype = 'c'
       and position('type' in pg_get_constraintdef(con.oid)) > 0
  loop
    missing := '';
    foreach t in array needed loop
      if position(quote_literal(t) in c.def) = 0 then
        missing := missing || t || ' ';
      end if;
    end loop;
    if missing <> '' then
      raise warning 'transactions constraint "%" does not mention: % — inserts with those types will be rejected. Definition: %',
        c.name, missing, c.def;
    else
      raise notice 'transactions constraint "%" allows all app types.', c.name;
    end if;
  end loop;
end $$;

-- Also surface any CHECK on profiles.wallet_balance that could block a debit.
do $$
declare c record;
begin
  for c in
    select con.conname as name, pg_get_constraintdef(con.oid) as def
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
     where nsp.nspname = 'public'
       and rel.relname = 'profiles'
       and con.contype = 'c'
       and position('wallet_balance' in pg_get_constraintdef(con.oid)) > 0
  loop
    raise notice 'profiles constraint "%": %', c.name, c.def;
  end loop;
end $$;

-- 4. Optional: if the printed definition of increment_wallet refuses negative
--    amounts (e.g. it raises when amount < 0, or clamps with greatest()), it is
--    safe to replace it with this version. Make the parameter list match the
--    signature printed in step 1 (adjust arg types if they differ), then
--    uncomment the whole block:
--
-- create or replace function public.increment_wallet(user_id uuid, amount integer)
-- returns void
-- language plpgsql
-- security definer
-- set search_path = public
-- as $body$
-- begin
--   update public.profiles
--      set wallet_balance = coalesce(wallet_balance, 0) + increment_wallet.amount
--    where id = increment_wallet.user_id;
-- end;
-- $body$;

-- Make the functions visible to the API immediately.
notify pgrst, 'reload schema';
