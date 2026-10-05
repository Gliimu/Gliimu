-- Admin role: who may curate the landing page, manage the partner wall,
-- publish app releases and close deals on the queue board.
--
-- Run this in the Supabase SQL Editor. Safe to run more than once.
--
-- To make an account an admin, run this once (username is chosen at signup):
--   update public.profiles set is_admin = true where username = 'yourusername';
-- Then sign out and back in so the dashboard picks the flag up.

-- 1. The flag itself.
alter table public.profiles add column if not exists is_admin boolean not null default false;

-- 2. Helper used by every admin policy below. SECURITY DEFINER so a policy
--    can read profiles without re-entering the profiles RLS policies.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

grant execute on function public.is_admin() to anon, authenticated;

-- 3. Close the self-promotion hole: a user's normal "update own profile"
--    policy would otherwise let them flip their own is_admin to true.
--    Only an existing admin, the service role, or a direct SQL session
--    (auth.uid() is null) may change the column.
create or replace function public.guard_is_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_admin is distinct from old.is_admin
     and auth.uid() is not null
     and coalesce(auth.role(), '') <> 'service_role'
     and not public.is_admin() then
    raise exception 'Only an admin can change admin rights';
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_is_admin on public.profiles;
create trigger profiles_guard_is_admin
  before update on public.profiles
  for each row execute function public.guard_is_admin();

-- 4. Partners — the "Trusted By" wall on the landing page.
alter table public.partners add column if not exists name text;
alter table public.partners add column if not exists logo_url text;
alter table public.partners add column if not exists display_order integer not null default 0;
alter table public.partners enable row level security;

grant select on public.partners to anon, authenticated;
grant insert, update, delete on public.partners to authenticated;

do $$ begin
  create policy "Public read partners"
    on public.partners for select
    to anon, authenticated using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Admins manage partners"
    on public.partners for all
    to authenticated using (public.is_admin()) with check (public.is_admin());
exception when duplicate_object then null; end $$;

-- 5. Site settings — hero media, app download links, app version.
alter table public.site_settings enable row level security;

grant select on public.site_settings to anon, authenticated;
grant update on public.site_settings to authenticated;

do $$ begin
  create policy "Public read site settings"
    on public.site_settings for select
    to anon, authenticated using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Admins update site settings"
    on public.site_settings for update
    to authenticated using (public.is_admin()) with check (public.is_admin());
exception when duplicate_object then null; end $$;

-- 6. Landing-page assets (partner logos, app download background).
--    Public to read, admin-only to write.
do $$ begin
  insert into storage.buckets (id, name, public)
  values ('site_assets', 'site_assets', true)
  on conflict (id) do update set public = true;
exception when others then raise notice 'create the site_assets bucket by hand: %', sqlerrm; end $$;

do $$ begin
  execute 'drop policy if exists "Public read site assets" on storage.objects';
  execute 'create policy "Public read site assets" on storage.objects
             for select to anon, authenticated using (bucket_id = ''site_assets'')';
exception when others then raise notice 'add the site_assets read policy by hand: %', sqlerrm; end $$;

do $$ begin
  execute 'drop policy if exists "Admins manage site assets" on storage.objects';
  execute 'create policy "Admins manage site assets" on storage.objects
             for all to authenticated
             using (bucket_id = ''site_assets'' and public.is_admin())
             with check (bucket_id = ''site_assets'' and public.is_admin())';
exception when others then raise notice 'add the site_assets admin policy by hand: %', sqlerrm; end $$;

notify pgrst, 'reload schema';
