-- ============================================================
-- ARCHIVED DDL — the gliim mention queue
-- ============================================================
-- Retired by sql/instant_publish.sql (2026-11-07). Publishing is instant now,
-- so a tag has nothing to wait for: the composer writes straight into
-- public.notifications and the queue, its policies, its fan-out function and
-- its trigger were all dropped.
--
-- This file is a reference copy of what used to exist. Do not run it — running
-- it would resurrect a queue nothing empties, and tagged members would stop
-- getting their Alerts.
--
-- Original source: sql/notifications.sql sections 2 and 3.

-- ------------------------------------------------------------
-- The queue
-- ------------------------------------------------------------
create table if not exists public.feed_gliim_mentions (
  post_id uuid not null references public.feed_gliims(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  mentioned_by uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'tag' check (kind in ('tag', 'mention')),
  comment_id uuid,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists feed_gliim_mentions_user_idx
  on public.feed_gliim_mentions (user_id);

alter table public.feed_gliim_mentions enable row level security;

revoke all on public.feed_gliim_mentions from anon;
grant select, insert on public.feed_gliim_mentions to authenticated;
grant all on public.feed_gliim_mentions to service_role;

drop policy if exists "Members queue their own mentions" on public.feed_gliim_mentions;
create policy "Members queue their own mentions"
  on public.feed_gliim_mentions
  for insert
  to authenticated
  with check (mentioned_by = auth.uid());

drop policy if exists "Mention parties read their rows" on public.feed_gliim_mentions;
create policy "Mention parties read their rows"
  on public.feed_gliim_mentions
  for select
  to authenticated
  using (user_id = auth.uid() or mentioned_by = auth.uid());

-- ------------------------------------------------------------
-- The fan-out that ran when an approver pressed Approve
-- ------------------------------------------------------------
create or replace function public.fan_out_gliim_mentions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, actor_id, kind, title, link_post, link_comment)
  select m.user_id, m.mentioned_by, m.kind,
         format('%s tagged you in the hub page: "%s"',
                (select full_name from public.profiles where id = m.mentioned_by),
                coalesce(new.title, 'a gliim')),
         new.id, m.comment_id
    from public.feed_gliim_mentions m
   where m.post_id = new.id
  on conflict do nothing;

  delete from public.feed_gliim_mentions where post_id = new.id;
  return null;
end;
$$;

drop trigger if exists trg_fan_out_gliim_mentions on public.feed_gliims;
create trigger trg_fan_out_gliim_mentions
  after update of status on public.feed_gliims
  for each row
  when (old.status = 'pending' and new.status = 'approved')
  execute function public.fan_out_gliim_mentions();
