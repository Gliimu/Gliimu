-- ============================================================
-- referral_list() — returns the current user's referrals with
-- referee names, status, and rewards.
-- Safe to run more than once (idempotent).
-- ============================================================

create or replace function public.referral_list()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_rows jsonb;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'detail', 'Not authenticated.');
  end if;

  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.created_at desc), '[]'::jsonb)
    into v_rows
    from (
      select r.id,
             p.full_name  as referee_name,
             r.status,
             r.signup_reward_gp,
             r.created_at,
             r.vested_at
        from public.referrals r
        join public.profiles  p on p.id = r.referee_id
       where r.referrer_id = uid
    ) t;

  return jsonb_build_object('ok', true, 'rows', v_rows);
end $$;

revoke execute on function public.referral_list() from public, anon;
grant execute on function public.referral_list() to authenticated, service_role;

-- SELF CHECK
select 'referral_list' as fn, case when count(*) = 1 then 'OK' else 'MISSING' end as status
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'referral_list';
