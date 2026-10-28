-- Add scroll_position to feed_interactions for reader comment strip
-- Records where in the page (0.0000-1.0000) a commenter was when they commented
alter table public.feed_interactions add column if not exists scroll_position decimal(5,4);

-- SELF CHECK
do $$
declare
  col_exists boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'feed_interactions' and column_name = 'scroll_position'
  ) into col_exists;
  if not col_exists then
    raise exception 'FAIL: scroll_position column not added to feed_interactions';
  end if;
  raise notice 'PASS: scroll_position column exists on feed_interactions';
end $$;
