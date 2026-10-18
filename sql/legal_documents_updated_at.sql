-- Add updated_at to legal_documents so the auth page can show
-- "Last Updated: <date>" from when the admin last edited the terms.

alter table public.legal_documents add column if not exists updated_at timestamptz not null default now();

-- Backfill existing rows: use created_at if present, otherwise now().
update public.legal_documents
set updated_at = coalesce(created_at, now())
where updated_at = now() and created_at is not null;

-- SELF CHECK
select
  'updated_at column' as check_name,
  case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'legal_documents' and column_name = 'updated_at'
  ) then 'OK' else 'MISSING' end as status
union all
select
  'legal_documents rows have updated_at',
  case when exists (select 1 from public.legal_documents limit 1)
    then (select count(*)::text || ' rows' from public.legal_documents where updated_at is not null)
    else 'no rows (OK)' end;
