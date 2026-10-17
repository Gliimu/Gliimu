-- messages_admin.sql — flag admin-originated messages so members see @gliimu branding
-- Safe to run more than once.

-- 1. Add is_admin column to messages (default false — existing rows stay member messages)
alter table messages add column if not exists is_admin boolean not null default false;

-- 2. Self-check grid
select
  'column exists' as check_name,
  (select true from information_schema.columns
   where table_schema = 'public' and table_name = 'messages' and column_name = 'is_admin') as ok;

select
  'default is false' as check_name,
  (select column_default from information_schema.columns
   where table_schema = 'public' and table_name = 'messages' and column_name = 'is_admin')
  like '%false%' as ok;
