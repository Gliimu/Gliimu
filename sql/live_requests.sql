-- Live Learning: 1-on-1 session requests
-- Run this in the Supabase SQL Editor.
-- Note: the `increment_wallet` RPC must accept negative amounts (it is used
-- to charge the poster the ₦100 session fee).

create table if not exists public.live_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  description text,
  status text not null default 'open' check (status in ('open', 'active', 'cancelled', 'completed')),
  partner_id uuid,
  completed_by uuid,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  completed_at timestamptz,
  constraint live_requests_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade,
  constraint live_requests_partner_id_fkey foreign key (partner_id) references public.profiles(id) on delete set null,
  constraint live_requests_completed_by_fkey foreign key (completed_by) references public.profiles(id) on delete set null
);

create index if not exists live_requests_status_idx on public.live_requests (status, created_at desc);

alter table public.live_requests enable row level security;

-- Everyone signed in can browse the request board
create policy "Authenticated read live requests"
  on public.live_requests for select
  to authenticated using (true);

-- Post your own request
create policy "Users insert own live requests"
  on public.live_requests for insert
  to authenticated with check (auth.uid() = user_id);

-- Owners manage their own requests (edit / complete / cancel)
create policy "Owners update own live requests"
  on public.live_requests for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Owners delete own live requests"
  on public.live_requests for delete
  to authenticated using (auth.uid() = user_id);

-- Claiming: a signed-in user (not the poster) can claim an OPEN request
create policy "Users claim open live requests"
  on public.live_requests for update
  to authenticated
  using (status = 'open' and auth.uid() <> user_id)
  with check (status = 'active' and partner_id = auth.uid());

-- Partners (teachers) can complete or cancel the session they accepted
create policy "Partners complete their sessions"
  on public.live_requests for update
  to authenticated
  using (auth.uid() = partner_id)
  with check (auth.uid() = partner_id);

-- Realtime board updates
do $$ begin
  alter publication supabase_realtime add table public.live_requests;
exception when duplicate_object then null; end $$;
