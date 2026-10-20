-- ============================================================
-- DEFAULT EVENT CATEGORIES
-- Run this after sql/events.sql to populate the categories table
-- ============================================================

insert into public.event_categories (name, description, icon_url, display_order) values
  ('Technology', 'Software, hardware, AI, and digital innovation events', null, 1),
  ('Business', 'Entrepreneurship, startups, finance, and commerce', null, 2),
  ('Education', 'Learning, teaching, courses, and academic competitions', null, 3),
  ('Creative Arts', 'Design, writing, music, film, and visual arts', null, 4),
  ('Sports & Fitness', 'Athletic competitions, fitness challenges, and health events', null, 5),
  ('Science', 'Research, experiments, discoveries, and academic science', null, 6),
  ('Gaming', 'Video games, esports, board games, and interactive entertainment', null, 7),
  ('Social Impact', 'Community service, environmental, and humanitarian initiatives', null, 8),
  ('Media', 'Content creation, broadcasting, journalism, and entertainment', null, 9),
  ('Lifestyle', 'Fashion, food, travel, and personal development', null, 10)
on conflict (name) do nothing;

-- Verify
select 'Event categories created' as status, count(*) as total from public.event_categories;
