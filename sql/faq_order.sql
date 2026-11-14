-- ============================================================
-- FAQ ORDER (safe to re-run)
-- ============================================================
-- The admin Content screen lists FAQs in a drag-to-reorder queue and stores
-- that queue in faqs.display_order. The column was never created, so the very
-- first read — select id, question, answer, display_order … — failed with
-- "42703: column faqs.display_order does not exist" and the whole tab refused
-- to load. That also blocked the Edit button, so nobody could change an answer.
--
--   NEW COLUMN   public.faqs.display_order   integer not null default 0
--
-- Nothing else changes. No function, policy or grant is touched, and no
-- question or answer text is rewritten.
--
-- WHY THE BACKFILL IS GUARDED: adding the column leaves all seven rows at 0,
-- which is a meaningless order. The do block below numbers the existing rows
-- once, by the order they were created. It only runs while every row is still
-- at 0, so re-running this script after the CRM has dragged a queue into place
-- can never shuffle their work back.
--
-- WHY THERE ARE NO GRANTS HERE: Postgres applies the existing table-level
-- SELECT/INSERT/UPDATE/DELETE grants to a newly added column automatically.
-- Only dropping or recreating an object resets privileges. Self-check 6 and 7
-- prove the new column really is readable and writable anyway.
-- ============================================================


-- ============================================================
-- 1. THE COLUMN
-- ============================================================

alter table public.faqs
  add column if not exists display_order integer not null default 0;

comment on column public.faqs.display_order is
  'Position in the landing page FAQ queue, 1 = first. Set by the admin Content screen drag handle.';

-- ============================================================
-- 2. NUMBER THE ROWS THAT ARE STILL AT THE DEFAULT
-- ============================================================

do $$
begin
  if exists (select 1 from public.faqs)
     and not exists (select 1 from public.faqs where display_order <> 0) then

    -- pg-safeupdate refuses an UPDATE without a WHERE clause, so the ranked
    -- ids are joined back to the target rather than updating the whole table.
    update public.faqs f
       set display_order = r.rn
      from (
        select id, row_number() over (order by created_at nulls last, id) as rn
          from public.faqs
      ) r
     where r.id = f.id;
  end if;
end $$;

notify pgrst, 'reload schema';


-- ============================================================
-- 3. SELF CHECK — read-only, run the whole thing, expect every PASS
-- ============================================================

select '1. display_order exists on faqs' as check,
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='faqs'
                            and column_name='display_order')
       then 'PASS' else 'CHECK' end as result
union all
select '2. Column is integer, NOT NULL, defaults to 0',
       case when (select data_type from information_schema.columns
                   where table_schema='public' and table_name='faqs'
                     and column_name='display_order') = 'integer'
            and (select is_nullable from information_schema.columns
                   where table_schema='public' and table_name='faqs'
                     and column_name='display_order') = 'NO'
            and (select column_default from information_schema.columns
                   where table_schema='public' and table_name='faqs'
                     and column_name='display_order') like '%0%'
       then 'PASS' else 'CHECK' end
union all
select '3. No FAQ row is left at 0',
       case when not exists (select 1 from public.faqs where display_order = 0)
       then 'PASS' else 'CHECK' end
union all
select '4. Every row has its own position',
       case when (select count(distinct display_order) from public.faqs)
               = (select count(*) from public.faqs)
       then 'PASS' else 'CHECK' end
union all
select '5. Positions run 1..N with no gap',
       case when (select min(display_order) from public.faqs) = 1
            and (select max(display_order) from public.faqs) = (select count(*) from public.faqs)
       then 'PASS' else 'CHECK' end
union all
select '6. Landing page can read the column',
       case when has_column_privilege('anon', 'public.faqs', 'display_order', 'select')
            and has_column_privilege('authenticated', 'public.faqs', 'display_order', 'select')
       then 'PASS' else 'CHECK' end
union all
select '7. Admins can write the column',
       case when has_column_privilege('authenticated', 'public.faqs', 'display_order', 'update')
       then 'PASS' else 'CHECK' end
union all
select '8. Row Level Security still guards the table',
       case when (select relrowsecurity from pg_class
                   where oid = 'public.faqs'::regclass)
       then 'PASS' else 'CHECK' end
union all
select '9. CRM can still manage FAQs',
       case when exists (select 1 from pg_policies
                          where schemaname='public' and tablename='faqs'
                            and policyname = 'CRM manage faqs')
       then 'PASS' else 'CHECK' end
union all
select '10. Questions and answers survived untouched',
       case when (select count(*) from public.faqs) = 7
            and not exists (select 1 from public.faqs
                             where btrim(question) = '' or btrim(answer) = '')
       then 'PASS' else 'CHECK' end
order by 1;

-- The queue the landing page will now follow, first question at the top.
select display_order, left(question, 70) as question, length(answer) as answer_chars
  from public.faqs
 order by display_order, created_at;
