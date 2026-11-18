-- ============================================================
-- ONBOARDING TOUR STEPS
-- The guided tour brand-new members see: one step per page, OK
-- carries them to the next page. Operations edits the words and
-- switches steps on/off from the admin Onboarding tour tab.
--
-- Members read every enabled step (authenticated SELECT).
-- Only super/ops admins write (same pattern as sponsor_posts).
--
-- Run order: any time, before or after the client deploy.
-- Idempotent: re-runs never overwrite an admin's edited words.
-- ============================================================

-- ------------------------------------------------------------
-- 1. TABLE
-- ------------------------------------------------------------

create table if not exists public.onboarding_steps (
  id bigserial primary key,
  route text not null unique,
  title text not null,
  body text not null,
  position integer not null default 0,
  is_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

comment on table public.onboarding_steps is
  'Guided first-run tour: one row per described page; members walk them in position order.';

-- ------------------------------------------------------------
-- 2. RLS + POLICIES
-- ------------------------------------------------------------

alter table public.onboarding_steps enable row level security;

-- admin_has_role is SECURITY DEFINER: a policy that reads admin_users
-- directly would die at the grant layer, because admin_users is
-- RLS-locked with no member grants. See fix_onboarding_steps_admin_policies.sql.

drop policy if exists "Members can read onboarding_steps" on public.onboarding_steps;
create policy "Members can read onboarding_steps"
  on public.onboarding_steps
  for select
  to authenticated
  using (true);

drop policy if exists "Admins can insert onboarding_steps" on public.onboarding_steps;
create policy "Admins can insert onboarding_steps"
  on public.onboarding_steps
  for insert
  to authenticated
  with check (admin_has_role(auth.uid(), 'ops'));

drop policy if exists "Admins can update onboarding_steps" on public.onboarding_steps;
create policy "Admins can update onboarding_steps"
  on public.onboarding_steps
  for update
  to authenticated
  using (admin_has_role(auth.uid(), 'ops'))
  with check (admin_has_role(auth.uid(), 'ops'));

drop policy if exists "Admins can delete onboarding_steps" on public.onboarding_steps;
create policy "Admins can delete onboarding_steps"
  on public.onboarding_steps
  for delete
  to authenticated
  using (admin_has_role(auth.uid(), 'ops'));

-- ------------------------------------------------------------
-- 3. SEED — the seven pages, in walk order.
--    on conflict do nothing: a re-run must never clobber the
--    words Operations has already edited.
-- ------------------------------------------------------------

insert into public.onboarding_steps (route, title, body, position) values
  ('/xplore', 'XpLoRe',
   'Your home feed. Everything published on Gliimu lands here — browse gliims, subscribe to creators and save what you love.',
   1),
  ('/publish', 'Publish',
   'Your writing studio. Gliims you publish here appear in XpLoRe for everyone to read.',
   2),
  ('/live', 'Live',
   'Go on air. Host a session, invite your audience in, and they join you with Gliits.',
   3),
  ('/ping', 'Ping',
   'Your private messages. Chats with other members live here, and our support team is one thread away.',
   4),
  ('/profile', 'Profile',
   'Your public page. Your banner, your links and every gliim you have published, all in one place.',
   5),
  ('/wallet', 'Billing',
   'Your Gliits wallet — the currency that pays for live sessions and supports creators. Your wallet starts with a G100 welcome bonus from us.',
   6),
  ('/settings', 'Settings',
   'Make Gliimu yours. Theme, notification sounds and every account control live here.',
   7)
on conflict (route) do nothing;

-- ------------------------------------------------------------
-- 4. SELF-CHECK — zero edits needed; every line should say OK.
-- ------------------------------------------------------------

do $$
declare
  v_rows integer;
  v_enabled integer;
  v_rls boolean;
  v_select_policy integer;
  v_write_policies integer;
  v_seed_slips integer;
begin
  select count(*) into v_rows from public.onboarding_steps;
  select count(*) into v_enabled from public.onboarding_steps where is_enabled;
  select relrowsecurity into v_rls
    from pg_class
    where oid = 'public.onboarding_steps'::regclass;
  select count(*) into v_select_policy
    from pg_policies
    where schemaname = 'public'
      and tablename = 'onboarding_steps'
      and cmd = 'SELECT';
  select count(*) into v_write_policies
    from pg_policies
    where schemaname = 'public'
      and tablename = 'onboarding_steps'
      and cmd in ('INSERT', 'UPDATE', 'DELETE');
  select count(*) into v_seed_slips
    from public.onboarding_steps
    where route not in ('/xplore', '/publish', '/live', '/ping', '/profile', '/wallet', '/settings')
       or position < 1
       or position > 7
       or char_length(trim(body)) < 10;

  raise notice 'SELF-CHECK 1/5 rows .................... % (expect 7)', v_rows;
  raise notice 'SELF-CHECK 2/5 enabled steps ........ % (expect 7)', v_enabled;
  raise notice 'SELF-CHECK 3/5 RLS enabled .......... % (expect t)', v_rls;
  raise notice 'SELF-CHECK 4/5 select + write pols .. % + % (expect 1 + 3)', v_select_policy, v_write_policies;
  raise notice 'SELF-CHECK 5/5 off-grid seed rows ... % (expect 0)', v_seed_slips;

  if v_rows <> 7 or v_enabled <> 7 or not v_rls
     or v_select_policy <> 1 or v_write_policies <> 3 or v_seed_slips <> 0 then
    raise exception 'ONBOARDING SELF-CHECK FAILED — read the notices above';
  end if;
end $$;
