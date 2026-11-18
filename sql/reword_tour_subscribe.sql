-- Reword the XpLoRe tour step to the platform's subscribe vocabulary
-- (2026-11-18: "subscribe" replaces "follow" everywhere).
-- Idempotent: replace() is a no-op once the phrase is gone, and it only
-- touches rows that still contain the phrase — Operations-edited copy with
-- different wording is left alone.

update public.onboarding_steps
set body = replace(body, 'follow creators', 'subscribe to creators')
where body like '%follow creators%';

-- ------------------------------------------------------------
-- SELF-CHECK — run the whole file as ONE batch; every check must
-- print pass. Any failure rolls the entire script back.
-- ------------------------------------------------------------
do $$
declare
  v_left int;
  v_new  int;
begin
  select count(*) into v_left from public.onboarding_steps where body like '%follow creators%';
  select count(*) into v_new  from public.onboarding_steps where body like '%subscribe to creators%';
  if v_left <> 0 then
    raise exception 'SELF-CHECK FAIL: % step(s) still say "follow creators"', v_left;
  end if;
  if v_new = 0 then
    raise exception 'SELF-CHECK FAIL: no step says "subscribe to creators"';
  end if;
  raise notice 'SELF-CHECK 1/2 pass: 0 steps say "follow creators"';
  raise notice 'SELF-CHECK 2/2 pass: % step(s) say "subscribe to creators"', v_new;
end $$;
