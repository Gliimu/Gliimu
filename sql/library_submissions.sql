-- ============================================================
-- Gliimu: Library submissions
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor).
-- Users submit items here from the Library FAB; the (future)
-- admin dashboard reviews rows with status = 'pending'.
-- ============================================================

create table if not exists public.library_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  type text not null default 'publication',
  description text,
  price integer not null default 0,
  cover_url text,
  file_url text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

alter table public.library_submissions enable row level security;

-- Users can submit as themselves
create policy "Users insert own library submissions"
  on public.library_submissions for insert
  with check (auth.uid() = user_id);

-- Users can view their own submissions (admin review runs server-side
-- with the service role key, which bypasses RLS)
create policy "Users read own library submissions"
  on public.library_submissions for select
  using (auth.uid() = user_id);

create index if not exists library_submissions_status_idx
  on public.library_submissions (status, created_at desc);
