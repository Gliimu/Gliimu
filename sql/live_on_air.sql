-- ============================================================
-- Live sessions wait for the host
--
-- Publishing a gliim with a Live block mints the session in
-- 'open' (announced, card in XpLoRe, nobody on camera yet) and the
-- 1-hour clock only starts when the host goes on air. This is what
-- lets the card be the only entry point once the Live tab and its
-- session list are gone.
--
-- Idempotent — safe to run again.
-- ============================================================

-- ------------------------------------------------------------
-- 1. A card can now be published from either state.
-- ------------------------------------------------------------
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
  if v_session.status not in ('open', 'active') then
    raise exception 'SESSION_NOT_OPEN';
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
-- 2. The host goes on air. Only they can do it, only from 'open',
--    and started_at is stamped here so the stale sweep measures
--    the broadcast, not the publication.
-- ------------------------------------------------------------
create or replace function public.start_live_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_uid uuid := auth.uid();
  v_rec record;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select id, user_id, status, room_id, room_url
    into v_rec
    from public.live_requests
   where id = p_session_id;

  if not found then
    raise exception 'SESSION_NOT_FOUND';
  end if;
  if v_rec.user_id is distinct from v_uid then
    raise exception 'NOT_SESSION_OWNER';
  end if;

  -- Refreshing the studio or double-tapping must not restart the clock.
  if v_rec.status = 'active' then
    return jsonb_build_object('session_id', v_rec.id, 'already_live', true,
                              'room_id', v_rec.room_id, 'room_url', v_rec.room_url);
  end if;
  if v_rec.status <> 'open' then
    raise exception 'SESSION_NOT_OPEN';
  end if;

  update public.live_requests
     set status      = 'active',
         started_at  = now(),
         activated_at = now()
   where id = v_rec.id;

  return jsonb_build_object('session_id', v_rec.id, 'already_live', false,
                            'room_id', v_rec.room_id, 'room_url', v_rec.room_url);
end
$fn$;

-- ------------------------------------------------------------
-- 3. The hour runs from the broadcast. Sessions that never went on
--    air carry a null started_at and are left alone; the coalesce
--    also clears legacy 'active' rows that predate started_at.
-- ------------------------------------------------------------
create or replace function public.end_stale_live_sessions()
returns integer
language plpgsql
security invoker
as $fn$
declare
  ended_count integer;
begin
  update public.live_requests
     set status   = 'completed',
         ended_at = now()
   where status = 'active'
     and coalesce(started_at, created_at) < (now() - interval '1 hour');

  get diagnostics ended_count = row_count;
  return ended_count;
end
$fn$;

-- ------------------------------------------------------------
-- 4. Talking in the chat is allowed while the card is announced,
--    so the comments work before the host appears.
-- ------------------------------------------------------------
drop policy if exists live_chat_insert on public.live_chat_messages;
create policy live_chat_insert
  on public.live_chat_messages for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.live_requests r
      where r.id = live_chat_messages.room_id
        and r.status in ('open', 'active')
        and (
          r.user_id = (select auth.uid())
          or r.sharing_mode = 'general'
          or (r.sharing_mode = 'users'
              and r.invited_user_ids @> jsonb_build_array(((select auth.uid()))::text))
        )
    )
  );

-- ------------------------------------------------------------
-- 5. Deleting the card cancels the session it was announced by, so
--    an 'open' row can never outlive its card and stay joinable by
--    join code. The host ending the session is handled by
--    retire_live_gliim() going the other way.
-- ------------------------------------------------------------
create or replace function public.cancel_orphan_live_session()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  update public.live_requests
     set status      = 'cancelled',
         completed_at = now(),
         ended_at     = now()
   where id = old.session_id
     and status = 'open';
  return old;
end
$fn$;

drop trigger if exists trg_cancel_orphan_live_session on public.live_gliim_links;
create trigger trg_cancel_orphan_live_session
  after delete on public.live_gliim_links
  for each row
  execute function public.cancel_orphan_live_session();

-- ------------------------------------------------------------
-- 6. Two leftovers from the 1-on-1 era. The claim policy let any
--    member flip somebody else's 'open' session to active, and the
--    anon read policy exposed announced sessions on the public site.
--    Nothing reads live_requests anonymously any more.
-- ------------------------------------------------------------
drop policy if exists "Users claim open live requests" on public.live_requests;
drop policy if exists "Public read open live requests" on public.live_requests;

-- ------------------------------------------------------------
-- 7. Function permissions
-- ------------------------------------------------------------
revoke execute on function public.publish_live_gliim(uuid, text, text) from public, anon;
revoke execute on function public.start_live_session(uuid)              from public, anon;
grant execute on function public.publish_live_gliim(uuid, text, text) to authenticated;
grant execute on function public.start_live_session(uuid)              to authenticated;

-- ============================================================
-- SELF CHECK — run this whole block once, every "result" row
-- must read "ok".
-- ============================================================
select ord, item, result from (
  select 1 as ord, 'publish accepts open' as item,
    case when position('not in (''open'', ''active'')' in
      (select pg_get_functiondef(oid) from pg_proc where proname = 'publish_live_gliim')) > 0
      then 'ok' else 'NOT PATCHED' end as result
  union all
  select 2, 'start_live_session exists',
    case when count(*) = 1 then 'ok' else 'MISSING' end
      from pg_proc where proname = 'start_live_session'
  union all
  select 3, 'start stamps started_at',
    case when position('started_at' in
      (select pg_get_functiondef(oid) from pg_proc where proname = 'start_live_session')) > 0
      then 'ok' else 'MISSING' end
  union all
  select 4, 'start is owner-only',
    case when position('NOT_SESSION_OWNER' in
      (select pg_get_functiondef(oid) from pg_proc where proname = 'start_live_session')) > 0
      then 'ok' else 'NO OWNERSHIP CHECK' end
  union all
  select 5, 'stale sweep uses broadcast clock',
    case when position('coalesce(started_at, created_at)' in
      (select pg_get_functiondef(oid) from pg_proc where proname = 'end_stale_live_sessions')) > 0
      then 'ok' else 'NOT PATCHED' end
  union all
  select 6, 'chat allows open sessions',
    case when exists (
      select 1 from pg_policy p join pg_class c on c.oid = p.polrelid
       where c.relname = 'live_chat_messages' and p.polname = 'live_chat_insert'
         and pg_get_expr(p.polwithcheck, p.polrelid) like '%open%'
    ) then 'ok' else 'WRONG' end
  union all
  select 7, 'chat policies still three',
    case when count(*) = 3 then 'ok' else 'STALE POLICIES (' || count(*)::text || ')' end
      from pg_policy p join pg_class c on c.oid = p.polrelid
     where c.relname = 'live_chat_messages'
  union all
  select 8, 'orphan cancel trigger live',
    case when count(*) = 1 then 'ok' else 'MISSING' end
      from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where t.tgname = 'trg_cancel_orphan_live_session' and c.relname = 'live_gliim_links'
       and not t.tgisinternal
  union all
  select 9, 'claim policy dropped',
    case when count(*) = 0 then 'ok' else 'STILL PRESENT' end
      from pg_policy p join pg_class c on c.oid = p.polrelid
     where c.relname = 'live_requests' and p.polname = 'Users claim open live requests'
  union all
  select 10, 'anon read policy dropped',
    case when count(*) = 0 then 'ok' else 'STILL PRESENT' end
      from pg_policy p join pg_class c on c.oid = p.polrelid
     where c.relname = 'live_requests' and p.polname = 'Public read open live requests'
  union all
  select 11, 'members can call both',
    case when count(*) = 2 then 'ok' else 'GRANT MISSING' end
      from pg_proc
     where proname in ('publish_live_gliim','start_live_session')
       and has_function_privilege('authenticated', oid, 'execute')
  union all
  select 12, 'anon cannot call either',
    case when count(*) = 0 then 'ok' else 'ANON CAN CALL' end
      from pg_proc
     where proname in ('publish_live_gliim','start_live_session')
       and has_function_privilege('anon', oid, 'execute')
  union all
  select 13, 'status check still allows open',
    case when exists (
      select 1 from pg_constraint
       where conrelid = 'public.live_requests'::regclass
         and conname = 'live_requests_status_check'
         and pg_get_constraintdef(oid) like '%open%'
    ) then 'ok' else 'CONSTRAINT CHANGED' end
  union all
  select 14, 'no open session stranded without a card',
    case when count(*) = 0 then 'ok' else 'ORPHANS (' || count(*)::text || ')' end
      from public.live_requests r
     where r.status = 'open'
       and not exists (select 1 from public.live_gliim_links l where l.session_id = r.id)
) checks
order by ord;

-- END OF FILE
