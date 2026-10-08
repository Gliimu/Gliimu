-- ============================================================
-- Gliimu: Captain — instructor role, Triads and apprentices
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor).
-- Safe to run more than once.
--
-- WHAT THIS INSTALLS
--   1. triads          — a named group run by one captain.
--   2. triad_members   — who is in which triad, and their stage.
--                        One row per apprentice: a member can only
--                        ever be in a single triad at a time.
--   3. triad_progress  — append-only log of every stage change,
--                        with who recorded it and the note they wrote.
--   4. Captain RPCs ('super' passes every check):
--        captain_queue(p_limit)                 applicants awaiting a triad
--        captain_my_triads()                    the triads you run
--        captain_create_triad(p_name)           name a new triad
--        captain_rename_triad(p_triad, p_name)
--        captain_add_member(p_triad, p_user)    hand-pick from the queue
--        captain_remove_member(p_triad, p_user)
--        captain_roster(p_triad)                members + stage history
--        captain_set_progress(p_triad, p_user, p_progress, p_note)
--   5. public_triads() — the member-facing Triad tab on the Queue
--        page. Returns triad names and members only. Captain identity
--        is deliberately NOT exposed to members.
--
-- WHY EVERYTHING IS AN RPC
--   The three new tables have row level security on, no policies and
--   every privilege revoked, exactly like admin_users and
--   admin_adjustments. Nothing reaches them except these SECURITY
--   DEFINER functions, and each one checks admin_has_role() itself.
--   Every failure path returns {ok:false, code:...} instead of raising,
--   so one broken card never blanks a whole screen.
--
-- THE applications TABLE
--   Apprentice requests are written by the dashboard Queue page
--   (public/dashboard/assets/js/views/applications.js) into a table
--   called applications with type='apprentice' and status='pending'.
--   That table was created by hand and is not in any of the other
--   scripts, so this file only ever READS it — it never alters it, to
--   avoid colliding with a shape we cannot see from here. Placement is
--   tracked in triad_members instead.
--
-- RUN ORDER: after sql/all.sql, sql/billing.sql, sql/admin.sql and
--            sql/registrar.sql. It needs admin_has_role() from
--            admin.sql.
-- ============================================================

select pg_advisory_xact_lock(hashtext('gliimu-captain'));


-- ============================================================
-- 1. triads
-- ============================================================

create table if not exists public.triads (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  captain_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.triads add column if not exists name text;
alter table public.triads add column if not exists captain_id uuid references public.profiles(id) on delete cascade;
alter table public.triads add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.triads add column if not exists created_at timestamptz not null default now();

-- No two triads may share a name.
create unique index if not exists triads_name_key
  on public.triads (lower(btrim(name)));

create index if not exists triads_captain_idx on public.triads (captain_id, created_at desc);


-- ============================================================
-- 2. triad_members
-- ============================================================

create table if not exists public.triad_members (
  triad_id  uuid not null references public.triads(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  progress  text not null default 'placed',
  joined_at timestamptz not null default now(),
  added_by  uuid references public.profiles(id) on delete set null,
  primary key (triad_id, user_id)
);

alter table public.triad_members add column if not exists progress text not null default 'placed';
alter table public.triad_members add column if not exists joined_at timestamptz not null default now();
alter table public.triad_members add column if not exists added_by uuid references public.profiles(id) on delete set null;

alter table public.triad_members drop constraint if exists triad_members_progress_check;
alter table public.triad_members
  add constraint triad_members_progress_check
  check (progress in ('placed', 'training', 'graduated', 'released')) not valid;

-- A triad is three. One seat per apprentice across the whole platform,
-- so nobody can sit in two triads at once.
create unique index if not exists triad_members_one_triad_key
  on public.triad_members (user_id);

create index if not exists triad_members_triad_idx on public.triad_members (triad_id, joined_at);


-- ============================================================
-- 3. triad_progress — the stage history
-- ============================================================

create table if not exists public.triad_progress (
  id          bigint generated always as identity primary key,
  triad_id    uuid not null references public.triads(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  progress    text not null,
  note        text,
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists triad_progress_member_idx
  on public.triad_progress (triad_id, user_id, created_at desc);


-- ============================================================
-- 4. Lock all three down: RLS on, no policies, nothing granted.
--    The RPCs below are the only door in.
-- ============================================================

alter table public.triads          enable row level security;
alter table public.triad_members   enable row level security;
alter table public.triad_progress  enable row level security;

revoke all on public.triads         from public, anon, authenticated;
revoke all on public.triad_members  from public, anon, authenticated;
revoke all on public.triad_progress from public, anon, authenticated;

grant all on public.triads         to service_role;
grant all on public.triad_members  to service_role;
grant all on public.triad_progress to service_role;


-- ============================================================
-- 5. captain_queue — applicants waiting for a triad
--    Ordered highest GP first, matching the leaderboard the
--    members already see on the Queue page.
-- ============================================================

create or replace function public.captain_queue(p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 300);
  v_total bigint;
  v_rows  jsonb;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not public.admin_has_role(uid, 'captain') then
    return jsonb_build_object('ok', false, 'code', 'NOT_CAPTAIN');
  end if;
  if to_regclass('public.applications') is null then
    return jsonb_build_object('ok', false, 'code', 'MISSING_TABLE',
      'hint', 'The applications table is missing. It holds the apprentice requests.');
  end if;

  select count(*) into v_total
    from public.applications a
   where a.type = 'apprentice'
     and a.status = 'pending'
     and not exists (select 1 from public.triad_members m
                              where m.user_id = a.user_id and m.progress <> 'released');

  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', s.user_id, 'name', s.name, 'avatar', s.avatar,
           'gp', s.gp, 'motivation', s.motivation, 'created_at', s.created_at)
           order by s.gp desc, s.created_at asc), '[]'::jsonb)
    into v_rows
    from (select a.user_id,
                 coalesce(p.full_name, p.username, 'Gliimait') as name,
                 p.avatar_url as avatar,
                 coalesce(p.total_gp, 0) as gp,
                 a.motivation,
                 a.created_at
            from public.applications a
            left join public.profiles p on p.id = a.user_id
           where a.type = 'apprentice'
             and a.status = 'pending'
             and not exists (select 1 from public.triad_members m
                              where m.user_id = a.user_id and m.progress <> 'released')
           order by coalesce(p.total_gp, 0) desc, a.created_at asc
           limit v_limit) s;

  return jsonb_build_object('ok', true, 'total', v_total, 'rows', v_rows);
end
$$;


-- ============================================================
-- 6. captain_my_triads — the triads you run.
--    A super admin sees every triad on the platform.
-- ============================================================

create or replace function public.captain_my_triads()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  v_all boolean;
  v_rows jsonb;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not public.admin_has_role(uid, 'captain') then
    return jsonb_build_object('ok', false, 'code', 'NOT_CAPTAIN');
  end if;

  v_all := public.admin_has_role(uid, 'super');

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'name', s.name,
           'captain', s.captain, 'captain_id', s.captain_id,
           'seats', s.seats, 'created_at', s.created_at)
           order by s.created_at asc), '[]'::jsonb)
    into v_rows
    from (select t.id, t.name, t.captain_id, t.created_at,
                 coalesce(c.full_name, c.username, '—') as captain,
                 (select count(*) from public.triad_members m
                   where m.triad_id = t.id and m.progress <> 'released') as seats
            from public.triads t
            left join public.profiles c on c.id = t.captain_id
           where v_all or t.captain_id = uid
           order by t.created_at asc) s;

  return jsonb_build_object('ok', true, 'sees_all', v_all, 'triads', v_rows);
end
$$;


-- ============================================================
-- 7. captain_create_triad — the captain names it.
-- ============================================================

create or replace function public.captain_create_triad(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_id  uuid;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not public.admin_has_role(uid, 'captain') then
    return jsonb_build_object('ok', false, 'code', 'NOT_CAPTAIN');
  end if;
  if char_length(v_name) < 3 or char_length(v_name) > 40 then
    return jsonb_build_object('ok', false, 'code', 'BAD_NAME',
      'hint', 'The triad name must be between 3 and 40 characters.');
  end if;

  if exists (select 1 from public.triads t
              where lower(btrim(t.name)) = lower(v_name)) then
    return jsonb_build_object('ok', false, 'code', 'NAME_TAKEN',
      'hint', 'Another triad already uses that name.');
  end if;

  insert into public.triads (name, captain_id, created_by)
  values (v_name, uid, uid)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'name', v_name);
end
$$;


-- ============================================================
-- 8. captain_rename_triad
-- ============================================================

create or replace function public.captain_rename_triad(p_triad uuid, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_row  public.triads;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not public.admin_has_role(uid, 'captain') then
    return jsonb_build_object('ok', false, 'code', 'NOT_CAPTAIN');
  end if;
  if char_length(v_name) < 3 or char_length(v_name) > 40 then
    return jsonb_build_object('ok', false, 'code', 'BAD_NAME',
      'hint', 'The triad name must be between 3 and 40 characters.');
  end if;

  select * into v_row from public.triads t where t.id = p_triad for update;
  if v_row.id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if v_row.captain_id <> uid and not public.admin_has_role(uid, 'super') then
    return jsonb_build_object('ok', false, 'code', 'NOT_YOURS',
      'hint', 'Only the captain who runs this triad can rename it.');
  end if;
  if exists (select 1 from public.triads t
              where t.id <> v_row.id
                and lower(btrim(t.name)) = lower(v_name)) then
    return jsonb_build_object('ok', false, 'code', 'NAME_TAKEN',
      'hint', 'Another triad already uses that name.');
  end if;

  update public.triads set name = v_name where id = v_row.id;

  return jsonb_build_object('ok', true, 'id', v_row.id, 'name', v_name);
end
$$;


-- ============================================================
-- 9. captain_add_member — hand-pick from the queue
-- ============================================================

create or replace function public.captain_add_member(p_triad uuid, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  v_row public.triads;
  v_seats bigint;
  v_name text;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not public.admin_has_role(uid, 'captain') then
    return jsonb_build_object('ok', false, 'code', 'NOT_CAPTAIN');
  end if;
  if p_user is null then
    return jsonb_build_object('ok', false, 'code', 'BAD_USER');
  end if;

  select * into v_row from public.triads t where t.id = p_triad for update;
  if v_row.id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if v_row.captain_id <> uid and not public.admin_has_role(uid, 'super') then
    return jsonb_build_object('ok', false, 'code', 'NOT_YOURS',
      'hint', 'Only the captain who runs this triad can place apprentices in it.');
  end if;

  select count(*) into v_seats from public.triad_members m
   where m.triad_id = v_row.id and m.progress <> 'released';
  if v_seats >= 3 then
    return jsonb_build_object('ok', false, 'code', 'TRIAD_FULL',
      'hint', 'A triad holds three apprentices. Release a seat or start a new triad.');
  end if;

  if not exists (select 1 from public.profiles p where p.id = p_user) then
    return jsonb_build_object('ok', false, 'code', 'NO_SUCH_MEMBER');
  end if;

  -- user_id is unique across every triad, so two captains placing the same
  -- apprentice at once would raise instead of returning a code. Serialise
  -- on the apprentice, the way registrar_verify_topup serialises on the txn.
  perform pg_advisory_xact_lock(hashtext('triad_place:' || p_user::text));

  if exists (select 1 from public.triad_members m
              where m.user_id = p_user and m.progress <> 'released') then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_PLACED',
      'hint', 'That apprentice is already in a triad.');
  end if;

  if to_regclass('public.applications') is null then
    return jsonb_build_object('ok', false, 'code', 'MISSING_TABLE',
      'hint', 'The applications table is missing. It holds the apprentice requests.');
  end if;

  if not exists (select 1 from public.applications a
                  where a.user_id = p_user and a.type = 'apprentice'
                    and a.status = 'pending') then
    return jsonb_build_object('ok', false, 'code', 'NOT_IN_QUEUE',
      'hint', 'Only members with a pending apprenticeship request can be placed.');
  end if;

  -- A 'released' seat still owns the row, and user_id is unique across all
  -- triads, so clear it first or re-placing into a different triad would
  -- raise instead of returning a code.
  delete from public.triad_members
   where user_id = p_user and progress = 'released';

  insert into public.triad_members (triad_id, user_id, progress, added_by)
  values (v_row.id, p_user, 'placed', uid)
  on conflict (triad_id, user_id) do update
     set progress = 'placed', added_by = uid, joined_at = now();

  insert into public.triad_progress (triad_id, user_id, progress, note, recorded_by)
  values (v_row.id, p_user, 'placed', 'Placed in the triad.', uid);

  select coalesce(p.full_name, p.username, 'Gliimait') into v_name
    from public.profiles p where p.id = p_user;

  return jsonb_build_object('ok', true, 'triad_id', v_row.id,
    'user_id', p_user, 'name', v_name, 'progress', 'placed');
end
$$;


-- ============================================================
-- 10. captain_remove_member — frees the seat
-- ============================================================

create or replace function public.captain_remove_member(p_triad uuid, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  v_row public.triads;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not public.admin_has_role(uid, 'captain') then
    return jsonb_build_object('ok', false, 'code', 'NOT_CAPTAIN');
  end if;

  select * into v_row from public.triads t where t.id = p_triad for update;
  if v_row.id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if v_row.captain_id <> uid and not public.admin_has_role(uid, 'super') then
    return jsonb_build_object('ok', false, 'code', 'NOT_YOURS',
      'hint', 'Only the captain who runs this triad can remove apprentices from it.');
  end if;

  if not exists (select 1 from public.triad_members m
                  where m.triad_id = v_row.id and m.user_id = p_user) then
    return jsonb_build_object('ok', false, 'code', 'NOT_A_MEMBER');
  end if;

  delete from public.triad_members
   where triad_id = v_row.id and user_id = p_user;

  insert into public.triad_progress (triad_id, user_id, progress, note, recorded_by)
  values (v_row.id, p_user, 'released', 'Removed from the triad; the seat is free again.', uid);

  return jsonb_build_object('ok', true, 'triad_id', v_row.id, 'user_id', p_user);
end
$$;


-- ============================================================
-- 11. captain_roster — members with their stage history
-- ============================================================

create or replace function public.captain_roster(p_triad uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  v_row  public.triads;
  v_rows jsonb;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not public.admin_has_role(uid, 'captain') then
    return jsonb_build_object('ok', false, 'code', 'NOT_CAPTAIN');
  end if;

  select * into v_row from public.triads t where t.id = p_triad;
  if v_row.id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if v_row.captain_id <> uid and not public.admin_has_role(uid, 'super') then
    return jsonb_build_object('ok', false, 'code', 'NOT_YOURS',
      'hint', 'Only the captain who runs this triad can see its roster.');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', s.user_id, 'name', s.name, 'avatar', s.avatar,
           'gp', s.gp, 'progress', s.progress, 'joined_at', s.joined_at,
           'history', s.history)
           order by s.joined_at asc), '[]'::jsonb)
    into v_rows
    from (select m.user_id,
                 coalesce(p.full_name, p.username, 'Gliimait') as name,
                 p.avatar_url as avatar,
                 coalesce(p.total_gp, 0) as gp,
                 m.progress,
                 m.joined_at,
                 coalesce((select jsonb_agg(jsonb_build_object(
                              'progress', g.progress, 'note', g.note,
                              'recorded_at', g.created_at, 'recorder', g.recorder)
                              order by g.created_at desc)
                     from (select tp.progress, tp.note, tp.created_at,
                                  coalesce(rp.full_name, rp.username, '—') as recorder
                             from public.triad_progress tp
                             left join public.profiles rp on rp.id = tp.recorded_by
                            where tp.triad_id = m.triad_id and tp.user_id = m.user_id
                            order by tp.created_at desc
                            limit 20) g), '[]'::jsonb) as history
            from public.triad_members m
            left join public.profiles p on p.id = m.user_id
           where m.triad_id = v_row.id
           order by m.joined_at asc) s;

  return jsonb_build_object('ok', true, 'id', v_row.id, 'name', v_row.name,
    'members', v_rows);
end
$$;


-- ============================================================
-- 12. captain_set_progress — mark an apprentice's stage
-- ============================================================

create or replace function public.captain_set_progress(
  p_triad uuid, p_user uuid, p_progress text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  v_row public.triads;
  v_stage text := lower(btrim(coalesce(p_progress, '')));
  v_note  text := btrim(coalesce(p_note, ''));
  v_old   text;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not public.admin_has_role(uid, 'captain') then
    return jsonb_build_object('ok', false, 'code', 'NOT_CAPTAIN');
  end if;
  if v_stage not in ('placed', 'training', 'graduated', 'released') then
    return jsonb_build_object('ok', false, 'code', 'BAD_PROGRESS',
      'hint', 'Use placed, training, graduated or released.');
  end if;
  if char_length(v_note) > 1000 then
    return jsonb_build_object('ok', false, 'code', 'NOTE_TOO_LONG',
      'hint', 'Keep the note under 1000 characters.');
  end if;

  select * into v_row from public.triads t where t.id = p_triad for update;
  if v_row.id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if v_row.captain_id <> uid and not public.admin_has_role(uid, 'super') then
    return jsonb_build_object('ok', false, 'code', 'NOT_YOURS',
      'hint', 'Only the captain who runs this triad can record progress.');
  end if;

  select m.progress into v_old from public.triad_members m
   where m.triad_id = v_row.id and m.user_id = p_user for update;
  if v_old is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_A_MEMBER');
  end if;

  update public.triad_members
     set progress = v_stage
   where triad_id = v_row.id and user_id = p_user;

  insert into public.triad_progress (triad_id, user_id, progress, note, recorded_by)
  values (v_row.id, p_user, v_stage, nullif(v_note, ''), uid);

  return jsonb_build_object('ok', true, 'triad_id', v_row.id, 'user_id', p_user,
    'progress', v_stage, 'previous', v_old);
end
$$;


-- ============================================================
-- 13. public_triads — the member-facing Triad tab
--     Captain identity is never returned: instructors are admin
--     identities and stay off member-facing surfaces.
-- ============================================================

create or replace function public.public_triads()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'name', s.name, 'total_gp', s.total_gp,
           'members', s.members)
           order by s.total_gp desc), '[]'::jsonb)
    into v_rows
    from (select t.id, t.name,
                 coalesce(sum(coalesce(p.total_gp, 0)), 0) as total_gp,
                 coalesce(jsonb_agg(jsonb_build_object(
                   'user_id', m.user_id,
                   'name', coalesce(p.full_name, p.username, 'Gliimait'),
                   'avatar', p.avatar_url,
                   'gp', coalesce(p.total_gp, 0),
                   'progress', m.progress)
                   order by coalesce(p.total_gp, 0) desc), '[]'::jsonb) as members
            from public.triads t
            join public.triad_members m on m.triad_id = t.id
            left join public.profiles p on p.id = m.user_id
           where m.progress <> 'released'
           group by t.id, t.name) s;

  return jsonb_build_object('ok', true, 'triads', v_rows);
end
$$;


-- ============================================================
-- 14. Privileges
-- ============================================================

revoke execute on function public.captain_queue(integer)                  from public, anon;
revoke execute on function public.captain_my_triads()                      from public, anon;
revoke execute on function public.captain_create_triad(text)               from public, anon;
revoke execute on function public.captain_rename_triad(uuid, text)         from public, anon;
revoke execute on function public.captain_add_member(uuid, uuid)           from public, anon;
revoke execute on function public.captain_remove_member(uuid, uuid)        from public, anon;
revoke execute on function public.captain_roster(uuid)                     from public, anon;
revoke execute on function public.captain_set_progress(uuid, uuid, text, text) from public, anon;
revoke execute on function public.public_triads()                          from public, anon;

grant execute on function public.captain_queue(integer)                  to authenticated, service_role;
grant execute on function public.captain_my_triads()                      to authenticated, service_role;
grant execute on function public.captain_create_triad(text)               to authenticated, service_role;
grant execute on function public.captain_rename_triad(uuid, text)         to authenticated, service_role;
grant execute on function public.captain_add_member(uuid, uuid)           to authenticated, service_role;
grant execute on function public.captain_remove_member(uuid, uuid)        to authenticated, service_role;
grant execute on function public.captain_roster(uuid)                     to authenticated, service_role;
grant execute on function public.captain_set_progress(uuid, uuid, text, text) to authenticated, service_role;
grant execute on function public.public_triads()                          to authenticated, service_role;

notify pgrst, 'reload schema';


-- ============================================================
-- 15. SELF CHECK
--     Run the whole file, then look at the Results tab. Every row
--     must read OK. Nothing here writes anything.
-- ============================================================

select '01. triads exists' as check_item,
       case when to_regclass('public.triads') is null then 'MISSING' else 'OK' end as result
union all
select '02. triad_members exists',
       case when to_regclass('public.triad_members') is null then 'MISSING' else 'OK' end
union all
select '03. triad_progress exists',
       case when to_regclass('public.triad_progress') is null then 'MISSING' else 'OK' end
union all
select '04. one triad per apprentice',
       case when (select count(*) from pg_indexes
                   where schemaname = 'public'
                     and tablename = 'triad_members'
                     and indexname = 'triad_members_one_triad_key') = 1
            then 'OK' else 'MISSING' end
union all
select '05. triad names unique',
       case when (select count(*) from pg_indexes
                   where schemaname = 'public'
                     and tablename = 'triads'
                     and indexname = 'triads_name_key') = 1
            then 'OK' else 'MISSING' end
union all
select '06. stage check constraint',
       case when (select count(*) from pg_constraint
                   where conname = 'triad_members_progress_check') = 1
            then 'OK' else 'MISSING' end
union all
select '07. RLS on all three tables',
       case when (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                   where n.nspname = 'public'
                     and c.relname in ('triads','triad_members','triad_progress')
                     and c.relrowsecurity) = 3
            then 'OK' else 'MISSING' end
union all
select '08. no policies leaked through',
       case when (select count(*) from pg_policies
                   where schemaname = 'public'
                     and tablename in ('triads','triad_members','triad_progress')) = 0
            then 'OK' else 'POLICY FOUND' end
union all
select '09. authenticated cannot read triads',
       case when has_table_privilege('authenticated', 'public.triads', 'SELECT')
            then 'GRANT FOUND' else 'OK' end
union all
select '10. 9 of 9 functions installed',
       (select count(*)::text || ' of 9'
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname in ('captain_queue','captain_my_triads','captain_create_triad',
                             'captain_rename_triad','captain_add_member','captain_remove_member',
                             'captain_roster','captain_set_progress','public_triads'))
union all
select '11. all nine are SECURITY DEFINER',
       case when (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.prosecdef
                     and p.proname in ('captain_queue','captain_my_triads','captain_create_triad',
                                       'captain_rename_triad','captain_add_member','captain_remove_member',
                                       'captain_roster','captain_set_progress','public_triads')) = 9
            then 'OK' else 'MISSING' end
union all
select '12. anon cannot execute any of them',
       case when (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public'
                     and p.proname in ('captain_queue','captain_my_triads','captain_create_triad',
                                       'captain_rename_triad','captain_add_member','captain_remove_member',
                                       'captain_roster','captain_set_progress','public_triads')
                     and has_function_privilege('anon', p.oid, 'EXECUTE')) = 0
            then 'OK' else 'GRANT FOUND' end
union all
select '13. admin_has_role() is present (from admin.sql)',
       case when to_regprocedure('public.admin_has_role(uuid,text)') is null
            then 'MISSING — run sql/admin.sql first' else 'OK' end
union all
select '14. applications table present for the queue',
       case when to_regclass('public.applications') is null
            then 'MISSING' else 'OK' end
order by 1;
