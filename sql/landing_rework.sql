-- ============================================================
-- Landing page rework: new highlights + contact socials expansion
-- Safe to run more than once.
--
-- 1. contact_info: add twitter, instagram, linkedin columns
-- 2. crm_contact() / crm_set_contact(): include 3 new socials
-- 3. landing_highlights(): contest + cohort + top 3 GP
-- ============================================================

select pg_advisory_xact_lock(hashtext('gliimu-landing-rework'));

-- ============================================================
-- 1. Add 3 new social columns to contact_info
-- ============================================================

alter table public.contact_info add column if not exists twitter   text;
alter table public.contact_info add column if not exists instagram text;
alter table public.contact_info add column if not exists linkedin  text;

-- ============================================================
-- 2. Update CRM RPCs to include the new socials
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
    'facebook', null::text, 'pinterest', null::text,
    'twitter', null::text, 'instagram', null::text, 'linkedin', null::text);
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
             'pinterest', c.pinterest,
             'twitter',   c.twitter,
             'instagram', c.instagram,
             'linkedin',  c.linkedin)
      into v_contact
      from (select * from public.contact_info limit 1) c;
  end if;

  return jsonb_build_object(
    'ok', true,
    'has_row', v_has_row,
    'contact', v_contact);
end
$$;

create or replace function public.crm_set_contact(
  p_address   text default null,
  p_phone     text default null,
  p_email     text default null,
  p_youtube   text default null,
  p_tiktok    text default null,
  p_facebook  text default null,
  p_pinterest text default null,
  p_twitter   text default null,
  p_instagram text default null,
  p_linkedin  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_bad    text;
  v_id     bigint;
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
      ('YouTube link',   p_youtube),
      ('TikTok link',    p_tiktok),
      ('Facebook link',  p_facebook),
      ('Pinterest link', p_pinterest),
      ('Twitter link',   p_twitter),
      ('Instagram link', p_instagram),
      ('LinkedIn link',  p_linkedin)
    ) as f(field, url)
   where f.url is not null and not public.is_safe_url(f.url)
   limit 1;

  if v_bad is not null then
    return jsonb_build_object('ok', false, 'code', 'BAD_URL', 'field', v_bad,
      'hint', v_bad || ' must start with https:// or http://.');
  end if;

  select c.id into v_id from public.contact_info c order by c.id limit 1;

  if v_id is null then
    begin
      insert into public.contact_info default values returning id into v_id;
    exception when others then
      return jsonb_build_object('ok', false, 'code', 'NO_CONTACT_ROW',
        'hint', 'contact_info has no row and a blank one could not be created. Insert one by hand, then save again.');
    end;
  end if;

  update public.contact_info
     set address   = case when p_address   is null then address   else nullif(btrim(p_address), '')   end,
         phone     = case when v_phone     is null then phone     else nullif(v_phone, '')            end,
         email     = case when v_email     is null then email     else nullif(v_email, '')            end,
         youtube   = case when p_youtube   is null then youtube   else nullif(btrim(p_youtube), '')   end,
         tiktok    = case when p_tiktok    is null then tiktok    else nullif(btrim(p_tiktok), '')    end,
         facebook  = case when p_facebook  is null then facebook  else nullif(btrim(p_facebook), '')  end,
         pinterest = case when p_pinterest is null then pinterest else nullif(btrim(p_pinterest), '') end,
         twitter   = case when p_twitter   is null then twitter   else nullif(btrim(p_twitter), '')   end,
         instagram = case when p_instagram is null then instagram else nullif(btrim(p_instagram), '') end,
         linkedin  = case when p_linkedin  is null then linkedin  else nullif(btrim(p_linkedin), '')  end
   where id = v_id;

  return public.crm_contact();
end
$$;

revoke execute on function public.crm_contact() from public, anon;
revoke execute on function public.crm_set_contact(text, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.crm_contact() to authenticated, service_role;
grant execute on function public.crm_set_contact(text, text, text, text, text, text, text, text, text, text) to authenticated, service_role;

-- ============================================================
-- 3. Rewrite landing_highlights() — contest + cohort + top 3 GP
-- ============================================================

create or replace function public.landing_highlights()
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $$
declare
  v_contest jsonb;
  v_cohort  jsonb;
  v_top3    jsonb;
begin
  -- 1. Most recently started active contest
  select jsonb_build_object(
    'id', c.id,
    'title', c.title,
    'description', c.description,
    'metric', c.metric,
    'starts_at', c.starts_at,
    'ends_at', c.ends_at,
    'prize_text', c.prize_text,
    'entries_count', coalesce(e.cnt, 0)
  ) into v_contest
  from public.contests c
  left join (
    select contest_id, count(*)::bigint as cnt
    from public.contest_entries
    group by contest_id
  ) e on e.contest_id = c.id
  where c.is_archived = false
    and c.starts_at <= now()
    and (c.ends_at is null or c.ends_at > now())
  order by c.starts_at desc
  limit 1;

  -- 2. Latest created cohort (not archived)
  select jsonb_build_object(
    'id', co.id,
    'title', co.title,
    'description', co.description,
    'seats', co.seats,
    'seats_taken', coalesce(cr.cnt, 0),
    'starts_at', co.starts_at
  ) into v_cohort
  from public.cohorts co
  left join (
    select cohort_id, count(*)::bigint as cnt
    from public.cohort_requests
    where status = 'approved'
    group by cohort_id
  ) cr on cr.cohort_id = co.id
  where co.is_archived = false
  order by co.created_at desc
  limit 1;

  -- 3. Top 3 all-time users by GP
  select coalesce(jsonb_agg(r), '[]'::jsonb) into v_top3
  from (
    select jsonb_build_object(
      'user_id', p.id,
      'full_name', p.full_name,
      'avatar_url', p.avatar_url,
      'total_gp', p.total_gp
    ) as r
    from public.profiles p
    where p.total_gp is not null and p.total_gp > 0
    order by p.total_gp desc
    limit 3
  ) r;

  return jsonb_build_object(
    'contest', v_contest,
    'cohort', v_cohort,
    'top3', v_top3
  );
end $$;

grant execute on function public.landing_highlights() to anon;
grant execute on function public.landing_highlights() to authenticated;
grant execute on function public.landing_highlights() to service_role;

-- ============================================================
-- SELF CHECK
-- ============================================================

select '01. contact_info has twitter column' as check_item,
       case when exists (select 1 from information_schema.columns where table_schema='public' and table_name='contact_info' and column_name='twitter') then 'OK' else 'MISSING' end as result
union all
select '02. contact_info has instagram column',
       case when exists (select 1 from information_schema.columns where table_schema='public' and table_name='contact_info' and column_name='instagram') then 'OK' else 'MISSING' end
union all
select '03. contact_info has linkedin column',
       case when exists (select 1 from information_schema.columns where table_schema='public' and table_name='contact_info' and column_name='linkedin') then 'OK' else 'MISSING' end
union all
select '04. crm_contact() returns 11 social+contact fields',
       case when (select count(*) = 11 from jsonb_object_keys((public.crm_contact() -> 'contact')::jsonb))
            then 'OK' else 'CHECK BY HAND' end
union all
select '05. landing_highlights() runs',
       case when public.landing_highlights() ? 'contest' then 'OK' else 'MISSING' end
union all
select '06. landing_highlights() has cohort key',
       case when public.landing_highlights() ? 'cohort' then 'OK' else 'MISSING' end
union all
select '07. landing_highlights() has top3 key',
       case when public.landing_highlights() ? 'top3' then 'OK' else 'MISSING' end
order by 1;
