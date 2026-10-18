-- FAQ drag-reorder: add display_order column so admins can arrange the
-- landing-page FAQ list. Rows with no value sort to the end (nulls last).
-- Existing FAQs are backfilled in their created_at order.

alter table public.faqs add column if not exists display_order int not null default 0;

-- Backfill: assign sequential positions to rows that still have the default 0.
with numbered as (
  select id, row_number() over (order by created_at) as rn
  from public.faqs
  where display_order = 0
)
update public.faqs f
set display_order = numbered.rn
from numbered
where f.id = numbered.id;

-- SELF CHECK
select 'faqs with display_order' as check_name,
       count(*) as total,
       count(nullif(display_order, 0)) as ordered
from public.faqs;
