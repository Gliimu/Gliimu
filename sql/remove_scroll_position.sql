-- Remove scroll_position column from feed_interactions
-- This column was added for the comment strip feature which has been removed

alter table if exists public.feed_interactions drop column if exists scroll_position;

-- SELF CHECK
do $$
declare
  col_exists boolean;
begin
  select exists(
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'feed_interactions'
      and column_name = 'scroll_position'
  ) into col_exists;

  if col_exists then
    raise exception 'FAIL: scroll_position column still exists';
  else
    raise notice 'PASS: scroll_position column removed';
  end if;
end $$;
