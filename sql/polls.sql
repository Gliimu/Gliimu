-- ============================================================
-- POLLS — voting on "pool" blocks inside a gliim
-- Run in the Supabase SQL editor. Idempotent: safe to re-run.
--
-- A poll is a block in feed_gliim_contents.blocks:
--   { "type": "poll", "question": "...", "options": ["A", "B"] }
-- Each member keeps one vote per gliim (poll_votes, unique on
-- post_id + user_id). Changing your pick overwrites the old one.
-- Results are tallied by SECURITY DEFINER RPCs so everyone sees
-- the counts without anyone seeing who voted for what.
-- ============================================================

-- 1. Votes ---------------------------------------------------

create table if not exists public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feed_gliims(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  option_index integer not null check (option_index >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, user_id)
);

create index if not exists poll_votes_post_idx on public.poll_votes (post_id);

alter table public.poll_votes enable row level security;

revoke all on public.poll_votes from anon;
grant select, insert, update on public.poll_votes to authenticated;
grant all on public.poll_votes to service_role;

drop policy if exists "poll votes read own" on public.poll_votes;
create policy "poll votes read own" on public.poll_votes
  for select to authenticated
  using ( user_id = (select auth.uid()) );

drop policy if exists "poll votes insert own" on public.poll_votes;
create policy "poll votes insert own" on public.poll_votes
  for insert to authenticated
  with check ( user_id = (select auth.uid()) );

drop policy if exists "poll votes update own" on public.poll_votes;
create policy "poll votes update own" on public.poll_votes
  for update to authenticated
  using ( user_id = (select auth.uid()) )
  with check ( user_id = (select auth.uid()) );

-- 2. RPCs ----------------------------------------------------
-- poll_results: total votes + per-option count/percent.
-- poll_vote: upserts your pick (so switching options works),
-- validates the index against the block's own options, then
-- returns the fresh results in the same response.

create or replace function public.poll_results(p_post_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_blocks jsonb;
  v_poll jsonb;
  v_options integer;
  v_idx integer;
  v_count integer;
  v_total integer;
  v_counts jsonb := '[]'::jsonb;
begin
  select c.blocks into v_blocks
  from public.feed_gliim_contents c
  where c.post_id = p_post_id;

  if v_blocks is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  select b into v_poll
  from jsonb_array_elements(v_blocks) b
  where b->>'type' = 'poll'
  limit 1;

  if v_poll is null or jsonb_typeof(v_poll->'options') is distinct from 'array' then
    return jsonb_build_object('ok', false, 'code', 'NOT_A_POLL');
  end if;

  select count(*) into v_total
  from public.poll_votes
  where post_id = p_post_id;

  v_options := jsonb_array_length(v_poll->'options');
  for v_idx in 0 .. v_options - 1 loop
    select count(*) into v_count
    from public.poll_votes
    where post_id = p_post_id and option_index = v_idx;
    v_counts := v_counts || jsonb_build_array(jsonb_build_object(
      'index', v_idx,
      'label', v_poll->'options'->v_idx,
      'count', v_count,
      'percent', case when v_total > 0 then round(v_count * 100.0 / v_total)::int else 0 end
    ));
  end loop;

  return jsonb_build_object('ok', true, 'total', v_total, 'options', v_counts);
end $$;

create or replace function public.poll_vote(p_post_id uuid, p_option_index integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_poll jsonb;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  select b into v_poll
  from public.feed_gliim_contents c,
       jsonb_array_elements(c.blocks) b
  where c.post_id = p_post_id
    and b->>'type' = 'poll'
  limit 1;

  if v_poll is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_A_POLL');
  end if;

  if p_option_index is null
     or p_option_index < 0
     or p_option_index >= jsonb_array_length(v_poll->'options') then
    return jsonb_build_object('ok', false, 'code', 'BAD_OPTION');
  end if;

  insert into public.poll_votes (post_id, user_id, option_index)
  values (p_post_id, uid, p_option_index)
  on conflict (post_id, user_id)
  do update set option_index = excluded.option_index, updated_at = now();

  return public.poll_results(p_post_id);
end $$;

-- ============================================================
-- 3. SELF CHECK — run each SELECT, expect the value in the comment.
-- ============================================================

-- Expect: poll_votes
select to_regclass('public.poll_votes')::text as votes_table;

-- Expect: two rows, poll_results:1 and poll_vote:2
select proname, pronargs
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('poll_results', 'poll_vote')
order by proname;

-- Expect: 3
select count(*) as vote_policies
from pg_policies
where schemaname = 'public' and tablename = 'poll_votes';

-- Expect: authenticated
select distinct grantee
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'poll_votes'
  and grantee in ('anon', 'authenticated')
order by grantee;
