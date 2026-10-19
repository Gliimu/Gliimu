-- Owner-initiated delete for feed_items (books / audiolites).
-- Password is verified client-side via signInWithPassword (same pattern as
-- gliim delete). This RPC only checks ownership and cleans up related rows.

create or replace function public.user_delete_feed_item(
  p_item_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_owner  uuid;
begin
  select fi.owner_id into v_owner
  from public.feed_items fi
  where fi.id = p_item_id;

  if not found then
    raise exception 'ITEM_NOT_FOUND';
  end if;

  if v_owner is distinct from v_caller then
    raise exception 'NOT_OWNER';
  end if;

  delete from public.saved_items where item_id = p_item_id;
  delete from public.purchases where item_id = p_item_id;
  delete from public.billing_events where event_type in ('premium_unlock','library_unlock') and item_id = p_item_id::text;
  delete from public.reports where target_type = 'library_item' and target_id = p_item_id;
  delete from public.feed_items where id = p_item_id;

  return jsonb_build_object('deleted', true, 'item_id', p_item_id);

exception
  when others then
    return jsonb_build_object('deleted', false, 'error', sqlerrm);
end;
$$;

grant execute on function public.user_delete_feed_item(uuid) to authenticated;

-- SELF CHECK
select '01. user_delete_feed_item exists' as check_item,
       case when exists (select 1 from pg_proc where proname = 'user_delete_feed_item') then 'OK' else 'MISSING' end as result
union all
select '02. grant to authenticated',
       case when has_function_privilege('authenticated', 'public.user_delete_feed_item(uuid)', 'execute') then 'OK' else 'MISSING' end
order by 1;
