-- ============================================================
-- Gliimu: CRM contact details — the landing page footer
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor).
-- Safe to run more than once.
--
-- WHAT THIS INSTALLS
--   1. contact_info — created here only if the hand-made table is
--      missing, with the seven columns public/assets/js/main.js reads:
--        address, phone, email, youtube, tiktok, facebook, pinterest
--      Each is added with "add column if not exists", so an existing
--      table keeps whatever else it holds. "id" is never added to a
--      table that already exists, because its primary key may be named
--      something else entirely.
--   2. Two CRM RPCs ('super' passes every check):
--        crm_contact()      the seven values, plus has_row
--        crm_set_contact(p_address, p_phone, p_email, p_youtube,
--                        p_tiktok, p_facebook, p_pinterest)
--   3. A lockdown: RLS on, every direct write privilege taken away from
--      public/anon/authenticated, all hand-made policies dropped, and a
--      single public read policy recreated.
--
-- WHY AN RPC AND NOT A POLICY
--   Same reason as sql/operations.sql: the only way to say "CRM owns
--   these columns" is to write a function that names them. RLS cannot
--   see columns. Every failure path returns {ok:false, code:...}
--   instead of raising, so a bad save shows one message rather than
--   blanking the Content screen.
--
-- HOW THE SETTER TREATS ITS ARGUMENTS
--   Omit an argument (or pass null) and that column is left exactly as
--   it is. Pass an empty string and the column is cleared. The admin
--   screen always sends all seven, so this matters most if you ever
--   call the RPC by hand.
--
-- PUBLIC READ IS KEPT
--   anon keeps SELECT, because gliimu.com prints the address, phone
--   number, email and social links without signing in. Only the writes
--   move behind the RPC.
--
-- ONE ROW ONLY
--   main.js reads this table with .single(), which returns nothing at
--   all when the table holds two or more rows. This file never deletes
--   rows, so if the self check reports more than one, remove the extra
--   by hand. A save updates every row, which is deliberate: it is not
--   this file's business to guess which one is real.
--
-- RUN ORDER: after sql/admin.sql (needs admin_has_role) and after
--            sql/operations.sql (needs is_safe_url). Re-running
--            sql/all.sql afterwards does not undo anything here —
--            all.sql never touches contact_info.
-- ============================================================

select pg_advisory_xact_lock(hashtext('gliimu-contact'));


-- ============================================================
-- 1. The table and its seven columns
-- ============================================================

create table if not exists public.contact_info (
  id         uuid primary key default gen_random_uuid(),
  address    text,
  phone      text,
  email      text,
  youtube    text,
  tiktok     text,
  facebook   text,
  pinterest  text,
  created_at timestamptz not null default now()
);

alter table public.contact_info add column if not exists address   text;
alter table public.contact_info add column if not exists phone     text;
alter table public.contact_info add column if not exists email     text;
alter table public.contact_info add column if not exists youtube   text;
alter table public.contact_info add column if not exists tiktok    text;
alter table public.contact_info add column if not exists facebook  text;
alter table public.contact_info add column if not exists pinterest text;
alter table public.contact_info add column if not exists created_at timestamptz not null default now();


-- ============================================================
-- 2. Lockdown — public may read, nobody may write directly
-- ============================================================

do $$
declare
  pol record;
begin
  execute 'alter table public.contact_info enable row level security';
  execute 'revoke all on public.contact_info from public, anon, authenticated';
  execute 'grant select on public.contact_info to anon, authenticated';
  execute 'grant all on public.contact_info to service_role';

  -- Every policy is dropped and only the public read is recreated. The
  -- table was made by hand, so the names of whatever policies sit on it
  -- are not knowable from here.
  for pol in
    select p.polname
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = 'contact_info'
  loop
    execute format('drop policy if exists %I on public.contact_info', pol.polname);
  end loop;

  execute $p$
    create policy "Public read contact info" on public.contact_info
      for select to anon, authenticated using (true)
  $p$;
end $$;


-- ============================================================
-- 3. crm_contact — what the Contact details tab shows
-- ============================================================

create or replace function public.crm_contact()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  v_has_row boolean;
  v_contact jsonb := jsonb_build_object(
    'address', null::text, 'phone', null::text, 'email', null::text,
    'youtube', null::text, 'tiktok', null::text,
    'facebook', null::text, 'pinterest', null::text);
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not public.admin_has_role(uid, 'crm') then
    return jsonb_build_object('ok', false, 'code', 'NOT_CRM');
  end if;
  if to_regclass('public.contact_info') is null then
    return jsonb_build_object('ok', false, 'code', 'MISSING_TABLE',
      'hint', 'The contact_info table is missing. Re-run sql/contact.sql.');
  end if;

  select exists (select 1 from public.contact_info) into v_has_row;

  if v_has_row then
    select jsonb_build_object(
             'address',   c.address,
             'phone',     c.phone,
             'email',     c.email,
             'youtube',   c.youtube,
             'tiktok',    c.tiktok,
             'facebook',  c.facebook,
             'pinterest', c.pinterest)
      into v_contact
      from (select * from public.contact_info limit 1) c;
  end if;

  return jsonb_build_object(
    'ok', true,
    'has_row', v_has_row,
    'contact', v_contact);
end
$$;


-- ============================================================
-- 4. crm_set_contact — validate, then write all seven columns
-- ============================================================

create or replace function public.crm_set_contact(
  p_address   text default null,
  p_phone     text default null,
  p_email     text default null,
  p_youtube   text default null,
  p_tiktok    text default null,
  p_facebook  text default null,
  p_pinterest text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_bad    text;
  v_phone  text := case when p_phone is null then null else btrim(p_phone) end;
  v_email  text := case when p_email is null then null else btrim(p_email) end;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not public.admin_has_role(uid, 'crm') then
    return jsonb_build_object('ok', false, 'code', 'NOT_CRM');
  end if;
  if to_regclass('public.contact_info') is null then
    return jsonb_build_object('ok', false, 'code', 'MISSING_TABLE',
      'hint', 'The contact_info table is missing. Re-run sql/contact.sql.');
  end if;
  if to_regprocedure('public.is_safe_url(text)') is null then
    return jsonb_build_object('ok', false, 'code', 'MISSING_HELPER',
      'hint', 'is_safe_url() is missing. Run sql/operations.sql first.');
  end if;

  -- Length caps first, so a pasted paragraph is refused before it is
  -- looked at any harder.
  if p_address is not null and char_length(btrim(p_address)) > 500 then
    return jsonb_build_object('ok', false, 'code', 'BAD_ADDRESS', 'field', 'Address',
      'hint', 'The address must be 500 characters or fewer.');
  end if;

  if v_email is not null and v_email <> '' then
    if char_length(v_email) > 200
       or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      return jsonb_build_object('ok', false, 'code', 'BAD_EMAIL', 'field', 'Email',
        'hint', 'That does not look like an email address.');
    end if;
  end if;

  -- Digits, spaces and the punctuation a phone number actually uses.
  -- The dash sits last in the bracket so it reads as a literal.
  if v_phone is not null and v_phone <> '' then
    if char_length(v_phone) < 6
       or char_length(v_phone) > 30
       or v_phone !~ '^[0-9+(). -]+$' then
      return jsonb_build_object('ok', false, 'code', 'BAD_PHONE', 'field', 'Phone',
        'hint', 'The phone number may hold digits, spaces and + ( ) . - only, 6 to 30 characters.');
    end if;
  end if;

  select f.field into v_bad
    from (values
      ('YouTube link',  p_youtube),
      ('TikTok link',   p_tiktok),
      ('Facebook link', p_facebook),
      ('Pinterest link', p_pinterest)
    ) as f(field, url)
   where f.url is not null and not public.is_safe_url(f.url)
   limit 1;

  if v_bad is not null then
    return jsonb_build_object('ok', false, 'code', 'BAD_URL', 'field', v_bad,
      'hint', v_bad || ' must start with https:// or http://.');
  end if;

  -- A fresh install has no row to update, so make one. The insert is in
  -- its own block because a hand-made table may have a column this file
  -- does not know about that refuses a default.
  if not exists (select 1 from public.contact_info) then
    begin
      insert into public.contact_info default values;
    exception when others then
      return jsonb_build_object('ok', false, 'code', 'NO_CONTACT_ROW',
        'hint', 'contact_info has no row and a blank one could not be created. Insert one by hand, then save again.');
    end;
  end if;

  update public.contact_info
     set address   = case when p_address is null   then address   else nullif(btrim(p_address), '')   end,
         phone     = case when v_phone is null     then phone     else nullif(v_phone, '')            end,
         email     = case when v_email is null     then email     else nullif(v_email, '')            end,
         youtube   = case when p_youtube is null   then youtube   else nullif(btrim(p_youtube), '')   end,
         tiktok    = case when p_tiktok is null    then tiktok    else nullif(btrim(p_tiktok), '')    end,
         facebook  = case when p_facebook is null  then facebook  else nullif(btrim(p_facebook), '')  end,
         pinterest = case when p_pinterest is null then pinterest else nullif(btrim(p_pinterest), '') end;

  return public.crm_contact();
end
$$;


-- ============================================================
-- 5. Who may call them
-- ============================================================

revoke execute on function public.crm_contact() from public, anon;
revoke execute on function public.crm_set_contact(text, text, text, text, text, text, text) from public, anon;

grant execute on function public.crm_contact() to authenticated, service_role;
grant execute on function public.crm_set_contact(text, text, text, text, text, text, text) to authenticated, service_role;

notify pgrst, 'reload schema';


-- ============================================================
-- 6. SELF CHECK
--     Run the whole file, then look at the Results tab. Every row
--     must read OK. Nothing here writes anything.
-- ============================================================

select '01. contact_info exists' as check_item,
       case when to_regclass('public.contact_info') is null then 'MISSING' else 'OK' end as result
union all
select '02. seven contact columns present',
       case when to_regclass('public.contact_info') is null then 'TABLE MISSING'
            when (select count(*) from information_schema.columns
                   where table_schema = 'public' and table_name = 'contact_info'
                     and column_name in ('address','phone','email',
                                         'youtube','tiktok','facebook','pinterest')) = 7
            then 'OK' else 'MISSING' end
union all
select '03. is_safe_url installed (from operations.sql)',
       case when to_regprocedure('public.is_safe_url(text)') is null
            then 'MISSING — run sql/operations.sql' else 'OK' end
union all
select '04. 2 of 2 contact functions installed',
       (select count(*)::text || ' of 2'
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname in ('crm_contact','crm_set_contact'))
union all
select '05. both are SECURITY DEFINER',
       case when (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.prosecdef
                     and p.proname in ('crm_contact','crm_set_contact')) = 2
            then 'OK' else 'MISSING' end
union all
select '06. anon cannot execute either',
       case when (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public'
                     and p.proname in ('crm_contact','crm_set_contact')
                     and has_function_privilege('anon', p.oid, 'EXECUTE')) = 0
            then 'OK' else 'GRANT FOUND' end
union all
select '07. RLS on contact_info',
       case when (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                   where n.nspname = 'public'
                     and c.relname = 'contact_info'
                     and c.relrowsecurity) = 1
            then 'OK' else 'MISSING' end
union all
select '08. public can still READ it',
       case when has_table_privilege('anon', 'public.contact_info', 'SELECT')
                 and has_table_privilege('authenticated', 'public.contact_info', 'SELECT')
            then 'OK' else 'MISSING — the landing page footer will go blank' end
union all
select '09. authenticated cannot WRITE it',
       case when has_table_privilege('authenticated', 'public.contact_info', 'INSERT')
              or has_table_privilege('authenticated', 'public.contact_info', 'UPDATE')
              or has_table_privilege('authenticated', 'public.contact_info', 'DELETE')
            then 'GRANT FOUND' else 'OK' end
union all
select '10. no write policies left',
       case when (select count(*) from pg_policies
                   where schemaname = 'public'
                     and tablename = 'contact_info'
                     and cmd <> 'SELECT') = 0
            then 'OK' else 'POLICY FOUND' end
union all
select '11. exactly one public read policy',
       case when (select count(*) from pg_policies
                   where schemaname = 'public'
                     and tablename = 'contact_info'
                     and cmd = 'SELECT') = 1
            then 'OK' else 'CHECK BY HAND' end
union all
select '12. row count (main.js uses .single())',
       case when (select count(*) from public.contact_info) = 0
                 then 'EMPTY — a save will create one'
            when (select count(*) from public.contact_info) = 1
                 then 'OK (1 row)'
            else (select count(*)::text || ' ROWS — delete the extras by hand'
                    from public.contact_info) end
union all
select '13. contact values on file',
       case when (select count(*) from public.contact_info) = 0 then 'NOTHING YET'
            else (select (case when coalesce(btrim(address),'')   = '' then 0 else 1 end
                        + case when coalesce(btrim(phone),'')     = '' then 0 else 1 end
                        + case when coalesce(btrim(email),'')     = '' then 0 else 1 end
                        + case when coalesce(btrim(youtube),'')   = '' then 0 else 1 end
                        + case when coalesce(btrim(tiktok),'')    = '' then 0 else 1 end
                        + case when coalesce(btrim(facebook),'')  = '' then 0 else 1 end
                        + case when coalesce(btrim(pinterest),'') = '' then 0 else 1 end)::text
                        || ' of 7 fields filled'
                    from public.contact_info limit 1) end
union all
select '14. admin_has_role() is present (from admin.sql)',
       case when to_regprocedure('public.admin_has_role(uuid,text)') is null
            then 'MISSING — run sql/admin.sql first' else 'OK' end
order by 1;
