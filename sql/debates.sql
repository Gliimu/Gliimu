-- ============================================================
-- Gliimu: Hub debates
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor).
-- Safe to run more than once.
--
-- The Hub is now a debate floor: eligible Gliimaits open a topic
-- ("The earth is flat", "Time is relative", ...) and everyone argues
-- for or against it. Every topic, argument and vote is readable by
-- any signed-in member; only the owner can write to their own rows.
--
-- ELIGIBILITY lives in exactly one place: debate_can_start_topic().
-- Change the rule there and the INSERT policy, the RPC and the
-- member UI all follow. Interim rule: 1000 GP.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Who may open a topic
-- ------------------------------------------------------------
create or replace function public.debate_can_start_topic(p_user uuid default auth.uid())
returns boolean
language sql
stable
as $$
  select coalesce(
    (select p.total_gp from public.profiles p where p.id = p_user),
    0
  ) >= 1000;
$$;

revoke all on function public.debate_can_start_topic(uuid) from public;
grant execute on function public.debate_can_start_topic(uuid) to authenticated, service_role;

-- ------------------------------------------------------------
-- 2. Tables
-- ------------------------------------------------------------
create table if not exists public.debate_topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  statement text not null check (char_length(trim(statement)) between 6 and 140),
  description text check (description is null or char_length(description) <= 1000),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists public.debate_arguments (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.debate_topics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  side text not null check (side in ('for', 'against')),
  body text not null check (char_length(trim(body)) between 2 and 2000),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create table if not exists public.debate_votes (
  argument_id uuid not null references public.debate_arguments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  value smallint not null check (value in (1, -1)),
  created_at timestamptz not null default now(),
  primary key (argument_id, user_id)
);

alter table public.debate_topics enable row level security;
alter table public.debate_arguments enable row level security;
alter table public.debate_votes enable row level security;

create index if not exists debate_topics_status_idx
  on public.debate_topics (status, created_at desc);
create index if not exists debate_arguments_topic_idx
  on public.debate_arguments (topic_id, created_at desc);
create index if not exists debate_votes_argument_idx
  on public.debate_votes (argument_id);
create index if not exists debate_votes_user_idx
  on public.debate_votes (user_id);

-- ------------------------------------------------------------
-- 3. Table grants (RLS still decides which rows)
-- ------------------------------------------------------------
grant select, insert, update, delete on public.debate_topics to authenticated;
grant select, insert, update, delete on public.debate_arguments to authenticated;
grant select, insert, update, delete on public.debate_votes to authenticated;

grant all on public.debate_topics to service_role;
grant all on public.debate_arguments to service_role;
grant all on public.debate_votes to service_role;

-- ------------------------------------------------------------
-- 4. Policies
-- ------------------------------------------------------------
drop policy if exists "Debate topics are public" on public.debate_topics;
drop policy if exists "Eligible users open debate topics" on public.debate_topics;
drop policy if exists "Users edit own debate topics" on public.debate_topics;
drop policy if exists "Users delete own debate topics" on public.debate_topics;

drop policy if exists "Debate arguments are public" on public.debate_arguments;
drop policy if exists "Users post debate arguments" on public.debate_arguments;
drop policy if exists "Users edit own debate arguments" on public.debate_arguments;
drop policy if exists "Users delete own debate arguments" on public.debate_arguments;

drop policy if exists "Debate votes are public" on public.debate_votes;
drop policy if exists "Users cast own debate vote" on public.debate_votes;
drop policy if exists "Users change own debate vote" on public.debate_votes;
drop policy if exists "Users retract own debate vote" on public.debate_votes;

-- The floor is open: every member reads every topic.
create policy "Debate topics are public"
  on public.debate_topics for select
  to authenticated
  using (true);

-- Only eligible members may open one, and only as themselves.
create policy "Eligible users open debate topics"
  on public.debate_topics for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and public.debate_can_start_topic(user_id)
  );

create policy "Users edit own debate topics"
  on public.debate_topics for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users delete own debate topics"
  on public.debate_topics for delete
  to authenticated
  using (auth.uid() = user_id);

create policy "Debate arguments are public"
  on public.debate_arguments for select
  to authenticated
  using (true);

-- Arguments only land on a topic that is still open.
create policy "Users post debate arguments"
  on public.debate_arguments for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.debate_topics t
      where t.id = topic_id and t.status = 'open'
    )
  );

create policy "Users edit own debate arguments"
  on public.debate_arguments for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users delete own debate arguments"
  on public.debate_arguments for delete
  to authenticated
  using (auth.uid() = user_id);

-- Tallies are public; who voted which way is part of the record.
create policy "Debate votes are public"
  on public.debate_votes for select
  to authenticated
  using (true);

create policy "Users cast own debate vote"
  on public.debate_votes for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users change own debate vote"
  on public.debate_votes for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users retract own debate vote"
  on public.debate_votes for delete
  to authenticated
  using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 5. Convenience read: one call returns the whole floor
-- ------------------------------------------------------------
-- SECURITY INVOKER on purpose: the caller's RLS applies. Everything
-- it reads is public to authenticated members anyway.
create or replace function public.debate_board(p_limit integer default 40)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(row_to_json(b)::jsonb order by b.created_at desc), '[]'::jsonb)
  from (
    select
      t.id,
      t.statement,
      t.description,
      t.status,
      t.created_at,
      t.user_id,
      p.full_name as author_name,
      p.avatar_url as author_avatar,
      p.total_gp as author_gp,
      (select count(*) from public.debate_arguments a where a.topic_id = t.id)::integer as argument_count,
      (select count(distinct a.user_id) from public.debate_arguments a where a.topic_id = t.id)::integer as participant_count,
      (select count(*) from public.debate_arguments a
        where a.topic_id = t.id and a.side = 'for')::integer as for_count,
      (select count(*) from public.debate_arguments a
        where a.topic_id = t.id and a.side = 'against')::integer as against_count,
      (select count(*) from public.debate_votes v
        join public.debate_arguments a on a.id = v.argument_id
        where a.topic_id = t.id and v.value = 1)::integer as upvotes,
      (select count(*) from public.debate_votes v
        join public.debate_arguments a on a.id = v.argument_id
        where a.topic_id = t.id and v.value = -1)::integer as downvotes,
      exists (select 1 from public.debate_arguments a
        where a.topic_id = t.id and a.user_id = auth.uid()) as i_have_argued
    from public.debate_topics t
    left join public.profiles p on p.id = t.user_id
    order by t.created_at desc
    limit greatest(1, least(coalesce(p_limit, 40), 100))
  ) b;
$$;

revoke all on function public.debate_board(integer) from public;
grant execute on function public.debate_board(integer) to authenticated, service_role;

-- ------------------------------------------------------------
-- 6. Closing a topic stamps closed_at
-- ------------------------------------------------------------
create or replace function public.debate_close_topic(p_topic uuid)
returns boolean
language plpgsql
as $$
declare
  v_rows integer;
begin
  update public.debate_topics
     set status = 'closed',
         closed_at = now()
   where id = p_topic
     and user_id = auth.uid()
     and status = 'open';
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

revoke all on function public.debate_close_topic(uuid) from public;
grant execute on function public.debate_close_topic(uuid) to authenticated, service_role;

-- Make the new tables and functions visible to the API immediately.
notify pgrst, 'reload schema';

-- ============================================================
-- SELF CHECK — returns a grid. Every row should read OK.
-- Row 13 tells you whether the signed-in editor identity can
-- open a topic; in the SQL Editor auth.uid() is NULL, so it is
-- expected to read NO (that is the gate working, not a failure).
-- ============================================================
select 1 as "#", 'debate_topics table' as item,
       case when to_regclass('public.debate_topics') is null then 'MISSING' else 'OK' end as result
union all select 2, 'debate_arguments table',
       case when to_regclass('public.debate_arguments') is null then 'MISSING' else 'OK' end
union all select 3, 'debate_votes table',
       case when to_regclass('public.debate_votes') is null then 'MISSING' else 'OK' end
union all select 4, 'debate_can_start_topic()',
       case when to_regprocedure('public.debate_can_start_topic(uuid)') is null then 'MISSING' else 'OK' end
union all select 5, 'debate_board()',
       case when to_regprocedure('public.debate_board(integer)') is null then 'MISSING' else 'OK' end
union all select 6, 'debate_close_topic()',
       case when to_regprocedure('public.debate_close_topic(uuid)') is null then 'MISSING' else 'OK' end
union all select 7, 'topics RLS on',
       case when relrowsecurity then 'OK' else 'OFF' end
  from pg_class where oid = to_regclass('public.debate_topics')
union all select 8, 'arguments RLS on',
       case when relrowsecurity then 'OK' else 'OFF' end
  from pg_class where oid = to_regclass('public.debate_arguments')
union all select 9, 'votes RLS on',
       case when relrowsecurity then 'OK' else 'OFF' end
  from pg_class where oid = to_regclass('public.debate_votes')
union all select 10, 'policies on the three tables',
       (select count(*)::text || ' of 12' from pg_policies
         where schemaname = 'public'
           and tablename in ('debate_topics', 'debate_arguments', 'debate_votes'))
union all select 11, 'authenticated can select topics',
       case when has_table_privilege('authenticated', 'public.debate_topics', 'select')
            then 'OK' else 'NO GRANT' end
union all select 12, 'topics on the floor',
       (select count(*)::text from public.debate_topics)
union all select 13, 'editor identity may open a topic',
       case when public.debate_can_start_topic() then 'YES' else 'NO' end
order by "#";
