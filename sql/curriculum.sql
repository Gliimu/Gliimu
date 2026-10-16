-- ============================================================
-- Gliimu: Curriculum (courses interns can view)
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor).
-- Safe to run more than once.
--
-- This replaces the old Argue/debate tab with a Curriculum page.
-- It adds ONE new table, public.courses, seeded with the full
-- Full Stack Media Architect track. It never touches your
-- pre-existing tables (including the old, unused `curriculum`
-- table) — it only adds what is missing.
--
-- Every signed-in member (intern) can READ published courses.
-- Only admins can add, edit or unpublish them, enforced by RLS
-- through public.is_admin().
--
-- RUN ORDER: any time after sql/all.sql (it relies on is_admin()).
-- ============================================================

select pg_advisory_xact_lock(hashtext('gliimu-curriculum'));

-- ------------------------------------------------------------
-- 1. Table
-- ------------------------------------------------------------
create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  module_no integer not null default 1,
  title text not null check (char_length(trim(title)) between 2 and 160),
  summary text,
  level text not null default 'Beginner' check (level in ('Beginner', 'Intermediate', 'Advanced')),
  duration_mins integer not null default 0 check (duration_mins >= 0),
  cover_url text,
  gp_cost integer not null default 0 check (gp_cost >= 0),  -- 0 = free to every intern
  lessons jsonb not null default '[]'::jsonb,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.courses enable row level security;

create index if not exists courses_module_idx on public.courses (module_no, created_at);
create index if not exists courses_published_idx on public.courses (is_published);

-- ------------------------------------------------------------
-- 2. Grants (RLS still decides which rows)
-- ------------------------------------------------------------
grant select, insert, update, delete on public.courses to authenticated;
grant all on public.courses to service_role;

-- ------------------------------------------------------------
-- 3. Policies
-- ------------------------------------------------------------
drop policy if exists "Interns read published courses" on public.courses;
drop policy if exists "Admins insert courses" on public.courses;
drop policy if exists "Admins update courses" on public.courses;
drop policy if exists "Admins delete courses" on public.courses;

-- Members see every published course; admins also see drafts.
create policy "Interns read published courses"
  on public.courses for select
  to authenticated
  using (is_published or public.is_admin());

create policy "Admins insert courses"
  on public.courses for insert
  to authenticated
  with check (public.is_admin());

create policy "Admins update courses"
  on public.courses for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins delete courses"
  on public.courses for delete
  to authenticated
  using (public.is_admin());

-- ------------------------------------------------------------
-- 4. Convenience read: one call returns the whole curriculum
-- ------------------------------------------------------------
-- SECURITY INVOKER on purpose: the caller's RLS applies. Everything
-- it returns is published, so any signed-in member can read it.
create or replace function public.curriculum_board(p_level text default null)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(row_to_json(c)::jsonb order by c.module_no, c.created_at), '[]'::jsonb)
  from (
    select
      id,
      module_no,
      title,
      summary,
      level,
      duration_mins,
      cover_url,
      gp_cost,
      lessons,
      jsonb_array_length(lessons) as lesson_count
    from public.courses
    where is_published
      and (p_level is null or level = p_level)
    order by module_no, created_at
  ) c;
$$;

revoke all on function public.curriculum_board(text) from public;
grant execute on function public.curriculum_board(text) to authenticated, service_role;

-- ------------------------------------------------------------
-- 5. Seed the track — only on an empty table, so re-running is safe
-- ------------------------------------------------------------
insert into public.courses (module_no, title, summary, level, duration_mins, gp_cost, lessons)
select v.module_no, v.title, v.summary, v.level, v.duration_mins, v.gp_cost, v.lessons::jsonb
from (values
  (1, 'Welcome to Full Stack Media Architecture',
      'What the track is, how Gliimu works, and the tools you need before you create anything.',
      'Beginner', 35, 0,
      '[{"title":"What is a Full Stack Media Architect","minutes":8},{"title":"The Gliimu workflow","minutes":9},{"title":"Tools and kit you need","minutes":10},{"title":"Publishing your first piece","minutes":8}]'),
  (1, 'Story First: Structuring a Media Piece',
      'Every strong piece starts with a story. Learn to find the angle and structure the beats.',
      'Beginner', 50, 0,
      '[{"title":"Finding the angle","minutes":12},{"title":"The hook that earns attention","minutes":12},{"title":"Beats and pacing","minutes":14},{"title":"The close and call to action","minutes":12}]'),
  (2, 'Camera and Framing Essentials',
      'Exposure, composition and movement, and how to shoot so the edit is easy later.',
      'Beginner', 65, 0,
      '[{"title":"The exposure triangle","minutes":16},{"title":"Composition that guides the eye","minutes":16},{"title":"Camera movement with intent","minutes":16},{"title":"Shooting for the edit","minutes":17}]'),
  (2, 'Lighting on Any Budget',
      'From available light to a three-point setup: make your subject look deliberate, not lucky.',
      'Intermediate', 45, 0,
      '[{"title":"Reading natural light","minutes":11},{"title":"The one-light setup","minutes":11},{"title":"Three-point lighting","minutes":12},{"title":"Colour and mood","minutes":11}]'),
  (2, 'Clean Audio Field Recording',
      'Bad audio kills a video faster than bad picture. Get clean, usable sound every time.',
      'Intermediate', 40, 0,
      '[{"title":"Mics and placement","minutes":10},{"title":"Taming the room","minutes":10},{"title":"Gain and levels","minutes":10},{"title":"Capturing room tone","minutes":10}]'),
  (3, 'Editing: Cutting for Rhythm',
      'Assembly to fine cut. Learn J and L cuts, b-roll layering and transitions that serve the story.',
      'Intermediate', 70, 0,
      '[{"title":"Assembly versus rough cut","minutes":16},{"title":"J cuts and L cuts","minutes":18},{"title":"Layering b-roll","minutes":18},{"title":"Transitions that work","minutes":18}]'),
  (3, 'Colour, Sound and Finish',
      'Correction, grading, sound design and export settings that keep quality across platforms.',
      'Advanced', 55, 0,
      '[{"title":"Colour correction basics","minutes":14},{"title":"Grading for mood","minutes":14},{"title":"Sound design and mix","minutes":14},{"title":"Export settings per platform","minutes":13}]'),
  (4, 'Packaging Work for Every Platform',
      'Specs, thumbnails, titles and repurposing: one idea, many platforms, no extra shoots.',
      'Intermediate', 45, 0,
      '[{"title":"Platform specs and safe areas","minutes":11},{"title":"Thumbnails and titles","minutes":11},{"title":"Repurposing one idea","minutes":12},{"title":"Scheduling and consistency","minutes":11}]'),
  (5, 'Pitching Clients and Pricing Your Work',
      'The short pitch, reading a brief, pricing models and delivering without scope creep.',
      'Advanced', 50, 0,
      '[{"title":"The five-sentence pitch","minutes":12},{"title":"Reading a brief","minutes":12},{"title":"Pricing models","minutes":13},{"title":"Contracts and delivery","minutes":13}]'),
  (5, 'Capstone: Your Portfolio Piece',
      'Plan, produce, edit and publish one complete piece that proves the whole stack.',
      'Advanced', 90, 0,
      '[{"title":"Choosing the project","minutes":18},{"title":"Production plan","minutes":24},{"title":"The edit","minutes":24},{"title":"Publishing and presenting","minutes":24}]')
) as v(module_no, title, summary, level, duration_mins, gp_cost, lessons)
where not exists (select 1 from public.courses);

-- Make the new table and function visible to the API immediately.
notify pgrst, 'reload schema';

-- ============================================================
-- SELF CHECK — returns a grid. Every row should read OK.
-- ============================================================
select 1 as "#", 'courses table' as item,
       case when to_regclass('public.courses') is null then 'MISSING' else 'OK' end as result
union all select 2, 'curriculum_board()',
       case when to_regprocedure('public.curriculum_board(text)') is null then 'MISSING' else 'OK' end
union all select 3, 'courses RLS on',
       case when relrowsecurity then 'OK' else 'OFF' end
  from pg_class where oid = to_regclass('public.courses')
union all select 4, 'policies on courses',
       (select count(*)::text || ' of 4' from pg_policies
         where schemaname = 'public' and tablename = 'courses')
union all select 5, 'authenticated can select',
       case when has_table_privilege('authenticated', 'public.courses', 'select')
            then 'OK' else 'NO GRANT' end
union all select 6, 'published courses',
       (select count(*)::text from public.courses where is_published)
union all select 7, 'modules covered',
       (select count(distinct module_no)::text from public.courses where is_published)
union all select 8, 'total lessons',
       (select coalesce(sum(jsonb_array_length(lessons)), 0)::text from public.courses where is_published)
order by "#";
