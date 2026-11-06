-- ============================================================
-- Live sessions as XpLoRe gliims  [RETIRED — archive copy only]
--
-- Do not run this file. The feature was removed and everything it
-- creates is dropped by sql/remove_live_gliims.sql; this copy is kept
-- because it is where the bodies of the dropped functions live.
--
-- A live session shared to "Everybody" becomes a real gliim card
-- in the XpLoRe feed. The card row lives in feed_gliims, its body
-- is a single block { type: 'live', session_id: ... }, and this
-- script keeps the session <-> post link so the card can be found,
-- de-duplicated, and retired the moment the session stops.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Link table (one card per session)
-- ------------------------------------------------------------
create table if not exists public.live_gliim_links (
  session_id uuid primary key references public.live_requests(id) on delete cascade,
  post_id    uuid not null unique references public.feed_gliims(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_live_gliim_links_user on public.live_gliim_links(user_id);

alter table public.live_gliim_links enable row level security;

-- No client policies on purpose: only the SECURITY DEFINER functions
-- below (owned by postgres, which bypasses RLS) touch this table.
revoke all on public.live_gliim_links from public, anon, authenticated;

-- ------------------------------------------------------------
-- 2. Publish a live session as an approved gliim, instantly.
--    set_feed_gliim_status() normally pushes non-pen members to
--    'pending'; publish_live_gliim() opens a transaction-local flag
--    that the trigger honours, so no client can fake it.
-- ------------------------------------------------------------
create or replace function public.set_feed_gliim_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if new.status = 'draft' then
    return new;
  end if;

  if new.category = 'live'
     and coalesce(current_setting('gliimu.live_publish', true), '') = 'on' then
    new.status      := 'approved';
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_note := null;
    return new;
  end if;

  if public.is_admin() or public.admin_has_role(auth.uid(), 'crm') then
    new.status      := 'approved';
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_note := null;
    return new;
  end if;

  if (select verification_badge from public.profiles where id = new.user_id) = 'pen' then
    new.status      := 'approved';
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_note := null;
    return new;
  end if;

  new.status      := 'pending';
  new.reviewed_by := null;
  new.reviewed_at := null;
  new.review_note := null;
  return new;
end
$fn$;

create or replace function public.publish_live_gliim(
  p_session_id uuid,
  p_title      text default null,
  p_cover_url  text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_uid     uuid := auth.uid();
  v_session record;
  v_existing uuid;
  v_post_id uuid;
  v_title   text;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select id, user_id, title, status
    into v_session
    from public.live_requests
   where id = p_session_id;

  if not found then
    raise exception 'SESSION_NOT_FOUND';
  end if;
  if v_session.user_id is distinct from v_uid then
    raise exception 'NOT_SESSION_OWNER';
  end if;
  if v_session.status is distinct from 'active' then
    raise exception 'SESSION_NOT_ACTIVE';
  end if;

  v_title := left(coalesce(nullif(trim(p_title), ''), nullif(trim(v_session.title), ''), 'Live session'), 120);

  select post_id
    into v_existing
    from public.live_gliim_links
   where session_id = p_session_id;

  if v_existing is not null then
    update public.feed_gliims
       set title     = v_title,
           cover_url = coalesce(nullif(trim(p_cover_url), ''), cover_url)
     where id = v_existing
       and user_id = v_uid;
    return jsonb_build_object('post_id', v_existing, 'created', false);
  end if;

  perform set_config('gliimu.live_publish', 'on', true);

  insert into public.feed_gliims (user_id, title, category, description, cover_url, status)
  values (v_uid, v_title, 'live', null, nullif(trim(p_cover_url), ''), 'approved')
  returning id into v_post_id;

  insert into public.feed_gliim_contents (post_id, blocks)
  values (v_post_id,
          jsonb_build_array(jsonb_build_object('type', 'live', 'session_id', p_session_id::text)));

  insert into public.live_gliim_links (session_id, post_id, user_id)
  values (p_session_id, v_post_id, v_uid);

  return jsonb_build_object('post_id', v_post_id, 'created', true);
end
$fn$;

-- ------------------------------------------------------------
-- 3. Retire the card when the session stops. Runs inside the same
--    transaction that flips live_requests.status, so the card is
--    gone even if the host's browser dies before it can clean up.
-- ------------------------------------------------------------
create or replace function public.retire_live_gliim()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if new.status is distinct from old.status
     and new.status in ('completed', 'cancelled') then
    delete from public.feed_gliims
     where id = (select post_id from public.live_gliim_links where session_id = new.id);
  end if;
  return new;
end
$fn$;

drop trigger if exists trg_retire_live_gliim on public.live_requests;
create trigger trg_retire_live_gliim
  after update of status on public.live_requests
  for each row
  execute function public.retire_live_gliim();

-- Host-side escape hatch (the trigger above is the guarantee).
create or replace function public.remove_live_gliim(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_uid     uuid := auth.uid();
  v_post_id uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select post_id
    into v_post_id
    from public.live_gliim_links
   where session_id = p_session_id
     and user_id = v_uid;

  if v_post_id is null then
    return jsonb_build_object('removed', false);
  end if;

  delete from public.feed_gliims where id = v_post_id;

  return jsonb_build_object('removed', true, 'post_id', v_post_id);
end
$fn$;

-- ------------------------------------------------------------
-- 4. The host adds material to the live gliim while streaming.
--    Appends to the existing block array; returns the new count.
-- ------------------------------------------------------------
create or replace function public.append_live_blocks(p_session_id uuid, p_blocks jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_uid     uuid := auth.uid();
  v_post_id uuid;
  v_count   integer;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_blocks is null or jsonb_typeof(p_blocks) <> 'array'
     or jsonb_array_length(p_blocks) = 0 then
    raise exception 'NO_BLOCKS';
  end if;
  if jsonb_array_length(p_blocks) > 10 then
    raise exception 'TOO_MANY_BLOCKS';
  end if;

  select l.post_id
    into v_post_id
    from public.live_gliim_links l
    join public.live_requests r on r.id = l.session_id
   where l.session_id = p_session_id
     and r.user_id = v_uid
     and r.status = 'active';

  if v_post_id is null then
    raise exception 'LIVE_GLIIM_NOT_FOUND';
  end if;

  insert into public.feed_gliim_contents (post_id, blocks)
  values (v_post_id, p_blocks)
  on conflict (post_id)
  do update set blocks = public.feed_gliim_contents.blocks || excluded.blocks;

  select jsonb_array_length(blocks)
    into v_count
    from public.feed_gliim_contents
   where post_id = v_post_id;

  return v_count;
end
$fn$;

-- ------------------------------------------------------------
-- 5. Chat counts for the feed cards. On a live gliim the comments
--    ARE the session chat, so the card badge must read the number of
--    chat messages, which no client can count directly.
-- ------------------------------------------------------------
create or replace function public.live_chat_counts(p_post_ids uuid[])
returns table (post_id uuid, chat_count bigint)
language sql
security definer
set search_path to 'public'
as $fn$
  select l.post_id, count(m.id)
    from public.live_gliim_links l
    left join public.live_chat_messages m on m.room_id = l.session_id
   where l.post_id = any (coalesce(p_post_ids, '{}'))
   group by l.post_id;
$fn$;

-- ------------------------------------------------------------
-- 6. Function permissions
-- ------------------------------------------------------------
revoke execute on function public.publish_live_gliim(uuid, text, text) from public, anon;
revoke execute on function public.remove_live_gliim(uuid)               from public, anon;
revoke execute on function public.append_live_blocks(uuid, jsonb)       from public, anon;
revoke execute on function public.live_chat_counts(uuid[])              from public, anon;

grant execute on function public.publish_live_gliim(uuid, text, text) to authenticated;
grant execute on function public.remove_live_gliim(uuid)               to authenticated;
grant execute on function public.append_live_blocks(uuid, jsonb)       to authenticated;
grant execute on function public.live_chat_counts(uuid[])              to authenticated;

-- ============================================================
-- SELF CHECK — run this whole block once, every "result" row
-- must read "ok".
-- ============================================================
select item, result from (
  select 1 as ord, 'links table exists' as item,
    case when count(*) = 1 then 'ok' else 'MISSING' end as result
      from information_schema.tables
     where table_schema = 'public' and table_name = 'live_gliim_links'
  union all
  select 2, 'links rls on',
    case when exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'live_gliim_links' and c.relrowsecurity
    ) then 'ok' else 'OFF' end
  union all
  select 3, 'links hidden from clients',
    case when not exists (
      select 1 from pg_policy p join pg_class c on c.oid = p.polrelid
       where c.relname = 'live_gliim_links'
    ) then 'ok' else 'POLICY PRESENT' end
  union all
  select 4, 'publish_live_gliim',
    case when count(*) = 1 then 'ok' else 'MISSING' end
      from pg_proc where proname = 'publish_live_gliim'
  union all
  select 5, 'remove_live_gliim',
    case when count(*) = 1 then 'ok' else 'MISSING' end
      from pg_proc where proname = 'remove_live_gliim'
  union all
  select 6, 'append_live_blocks',
    case when count(*) = 1 then 'ok' else 'MISSING' end
      from pg_proc where proname = 'append_live_blocks'
  union all
  select 7, 'retire trigger live',
    case when count(*) = 1 then 'ok' else 'MISSING' end
      from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where t.tgname = 'trg_retire_live_gliim' and c.relname = 'live_requests'
       and not t.tgisinternal
  union all
  select 8, 'status trigger honours live',
    case when position('gliimu.live_publish' in
      (select pg_get_functiondef(oid) from pg_proc where proname = 'set_feed_gliim_status')) > 0
      then 'ok' else 'NOT PATCHED' end
  union all
  select 9, 'callable by signed-in members',
    case when count(*) = 4 then 'ok' else 'GRANT MISSING' end
      from pg_proc
     where proname in ('publish_live_gliim','remove_live_gliim','append_live_blocks','live_chat_counts')
       and has_function_privilege('authenticated', oid, 'execute')
  union all
  select 10, 'not callable by anon',
    case when count(*) = 0 then 'ok' else 'ANON CAN CALL' end
      from pg_proc
     where proname in ('publish_live_gliim','remove_live_gliim','append_live_blocks','live_chat_counts')
       and has_function_privilege('anon', oid, 'execute')
  union all
  select 11, 'chat counts rpc',
    case when count(*) = 1 then 'ok' else 'MISSING' end
      from pg_proc where proname = 'live_chat_counts'
) checks
order by ord;

-- END OF FILE
