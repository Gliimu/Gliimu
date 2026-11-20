-- ============================================================
--  PARTLY SUPERSEDED by sql/plan_lineup.sql (2026-11-19): the guard still
--  runs, but plan_monthly_price_gliits and plan_yearly_price_gliits are now
--  dead keys — only per_minute_rate_gliits and the new
--  live_host_fee_gliits gate money. Re-read the guard body before typing a
--  price you cannot find on the billing page.
-- ============================================================
-- ============================================================
--  Gliits pricing guard — sql/gliits_rate_guard.sql
--
--  WHY THIS EXISTS
--  exchange_rate_naira_to_gliits is the ONE number that decides both
--  directions of money:
--
--    money in  (server/src/index.js, /api/gliits/topup-init)
--              naira charged = ceil(gliits * rate)
--    money out (public.request_withdrawal)
--              naira sent    = round(gliits * rate, 2)
--
--  Both multiply, so the rate reads as NAIRA PER 1 GLIT. Until 2026-11-15
--  the payout side divided instead, which meant a registrar typing 100
--  charged ₦20,000 for G200 and paid ₦2 back for it — and typing 0.01
--  would have paid out 10,000 times what the same Gliits cost to buy.
--  The direction is fixed. This script makes the same class of mistake
--  impossible to SAVE: the pricing editor refuses any value that leaves
--  those two formulas disagreeing, or that produces money the platform
--  cannot actually move.
--
--  WHAT IT REFUSES (hard block, nothing is written)
--    VALUE_REQUIRED      nothing typed
--    BAD_CONFIG_KEY      a key that is not a column of gliits_config
--    VALUE_TOO_PRECISE   more decimals than the column can hold, so the
--                        save would silently store a different number
--    VALUE_TOO_LARGE     outside the column's range
--    VALUE_NEGATIVE      below zero
--    AMOUNT_MUST_EXCEED_ZERO  zero for a money key (rate, min topup,
--                        min/max withdrawal) — zero makes every amount
--                        that depends on it meaningless
--    ROUND_TRIP          the naira charged for the smallest top-up and the
--                        naira that same holding would pay out disagree by
--                        more than 5% of the money moved
--    TOPUP_TOO_CHEAP     the smallest top-up would cost under ₦1
--    PAYOUT_TOO_SMALL    the smallest withdrawal would pay under ₦1
--    WITHDRAWAL_RANGE    min_withdrawal_gliits above max_withdrawal_gliits,
--                        which leaves no legal amount to withdraw at all
--    NO_CONFIG_ROW       gliits_config id = 1 is missing
--
--  WHAT IT ONLY WARNS ABOUT (the save still happens, the numbers come back
--  in the payload so a screen can show them)
--    RATE_JUMP           the rate moves more than 10x in one save. Pricing
--                        changes apply to what members buy from now on, but
--                        balances bought at the old rate cash out at the new
--                        one, so a single huge jump can be arbitraged.
--    CHARGE_BELOW_100    the smallest top-up would charge under ₦100
--    PAYOUT_BELOW_100    the smallest withdrawal would pay under ₦100
--                        NOTE: these two thresholds are our own judgement,
--                        NOT a Paystack figure. Paystack's real minimum
--                        charge and minimum transfer amounts could not be
--                        confirmed from their docs while this was written,
--                        so they are surfaced as warnings rather than
--                        hardcoded as a wall. Verify them on the live
--                        account before relying on either direction.
--
--  The guard runs inside BOTH config writers, so no caller can skip it:
--    public.registrar_set_config(text, numeric, text)  -> answers {ok:false}
--    public.gliits_set_config(text, numeric)           -> raises
--
--  Run once in the Supabase SQL editor. Idempotent — safe to re-run.
--  Nothing here drops or updates data. The live rate is left exactly as it is.
--
--  On a fresh install this file must run AFTER sql/gliits_billing.sql and
--  sql/withdrawals.sql, because it replaces the copy of each writer those
--  two scripts install. Those scripts keep their own unguarded copies, so
--  running this last is what makes the guard live.
-- ============================================================


-- ============================================================
-- 1. The rule book
-- ============================================================
create or replace function public.gliits_config_guard(
  p_key   text,
  p_value numeric
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_dtype    text;
  v_scale    integer;
  v_prec     integer;
  v_quantum  numeric;
  v_absmax   numeric;
  cfg        public.gliits_config;
  v_guarded  boolean;
  old_rate   numeric;
  rate       numeric;   -- rate as it would read AFTER this write
  topup      numeric;   -- min_topup_gliits after this write
  minw       numeric;   -- min_withdrawal_gliits after this write
  maxw       numeric;   -- max_withdrawal_gliits after this write
  in_naira   numeric;   -- what the smallest top-up would charge
  out_exact  numeric;   -- what the same Gliits would pay out
  min_pay    numeric;   -- what the smallest withdrawal would pay
  max_pay    numeric;   -- what one maximum withdrawal would pay
  v_jump     numeric;
  v_errors   jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_preview  jsonb;
begin
  -- ---- the key must be a real column, and we take its own limits from it --
  select c.data_type, coalesce(c.numeric_scale, 0), coalesce(c.numeric_precision, 0)
    into v_dtype, v_scale, v_prec
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name   = 'gliits_config'
    and c.column_name  = p_key;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'BAD_CONFIG_KEY',
      'hint', 'That setting is not part of the pricing table, so there is nothing to save it into.');
  end if;

  if p_value is null then
    return jsonb_build_object('ok', false, 'code', 'VALUE_REQUIRED',
      'hint', 'Type a number before saving this setting.');
  end if;

  v_quantum := power(10::numeric, (-v_scale)::numeric);
  v_absmax  := case
                 when v_dtype = 'integer' then 2147483647
                 when v_dtype = 'bigint'  then 9223372036854775807
                 else power(10::numeric, (v_prec - v_scale)::numeric) - v_quantum
               end;

  -- ---- the value must fit the column it is going into -------------------
  if p_value < 0 then
    return jsonb_build_object('ok', false, 'code', 'VALUE_NEGATIVE',
      'hint', 'A negative number is not a price. This would have been rejected on save anyway.');
  end if;

  if p_value <> round(p_value, v_scale) then
    return jsonb_build_object('ok', false, 'code', 'VALUE_TOO_PRECISE',
      'hint', case when v_scale = 0 then 'This setting is a whole number'
                   else 'This setting holds at most ' || v_scale || ' decimal place'
                        || case when v_scale = 1 then '' else 's' end end
                   || ', so ' || p_value::text || ' would have been saved as '
                   || round(p_value, v_scale)::text || ' instead.',
      'detail', 'Type ' || round(p_value, v_scale)::text || ' if that is the figure you want.');
  end if;

  if p_value > v_absmax then
    return jsonb_build_object('ok', false, 'code', 'VALUE_TOO_LARGE',
      'hint', p_value::text || ' is larger than this setting can hold (the limit is '
                   || v_absmax::text || ').',
      'detail', 'A value this big would have been rejected by the database on save.');
  end if;

  -- ---- the four keys that decide how money moves ------------------------
  v_guarded := p_key in ('exchange_rate_naira_to_gliits', 'min_topup_gliits',
                         'min_withdrawal_gliits', 'max_withdrawal_gliits');

  if not v_guarded then
    return jsonb_build_object('ok', true, 'warnings', v_warnings,
      'preview', jsonb_build_object('guarded', false));
  end if;

  select * into cfg from public.gliits_config where id = 1;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NO_CONFIG_ROW',
      'hint', 'The single pricing row (gliits_config id = 1) is missing, so nothing can be checked. Re-run the config section of sql/gliits_billing.sql.');
  end if;

  old_rate := coalesce(nullif(cfg.exchange_rate_naira_to_gliits, 0), 1);
  rate     := case when p_key = 'exchange_rate_naira_to_gliits' then p_value else old_rate end;
  topup    := case when p_key = 'min_topup_gliits'       then p_value else coalesce(nullif(cfg.min_topup_gliits, 0), 1)       end;
  minw     := case when p_key = 'min_withdrawal_gliits'  then p_value else coalesce(nullif(cfg.min_withdrawal_gliits, 0), 1)  end;
  maxw     := case when p_key = 'max_withdrawal_gliits'  then p_value else coalesce(nullif(cfg.max_withdrawal_gliits, 0), 1)  end;

  if rate <= 0 then
    v_errors := v_errors || jsonb_build_object(
      'code', 'AMOUNT_MUST_EXCEED_ZERO',
      'hint', 'The exchange rate is what one Glit is worth in naira, so it has to be above zero. Zero would make every top-up free and every payout worth nothing.');
  end if;
  if topup <= 0 then
    v_errors := v_errors || jsonb_build_object(
      'code', 'AMOUNT_MUST_EXCEED_ZERO',
      'hint', 'The minimum top-up has to be above zero, otherwise a member can open a payment for nothing.');
  end if;
  if minw <= 0 then
    v_errors := v_errors || jsonb_build_object(
      'code', 'AMOUNT_MUST_EXCEED_ZERO',
      'hint', 'The minimum withdrawal has to be above zero, otherwise the payout queue fills with requests that pay nothing.');
  end if;
  if maxw <= 0 then
    v_errors := v_errors || jsonb_build_object(
      'code', 'AMOUNT_MUST_EXCEED_ZERO',
      'hint', 'The maximum withdrawal has to be above zero, otherwise no member can ever withdraw.');
  end if;

  if minw > maxw then
    v_errors := v_errors || jsonb_build_object(
      'code', 'WITHDRAWAL_RANGE',
      'hint', 'The minimum withdrawal (' || minw::text || ' G) would end up above the maximum withdrawal (' || maxw::text || ' G), so there would be no legal amount a member could take out.',
      'detail', 'Set the maximum at least as high as the minimum.');
  end if;

  -- ---- the round trip: same Gliits, both directions, one rate -----------
  in_naira  := ceil(topup * rate);
  out_exact := round(topup * rate, 2);
  min_pay   := round(minw * rate, 2);
  max_pay   := round(maxw * rate, 2);

  if rate > 0 and topup > 0 then
    if in_naira < 1 then
      v_errors := v_errors || jsonb_build_object(
        'code', 'TOPUP_TOO_CHEAP',
        'hint', 'At this rate the smallest top-up (' || topup::text || ' G) would cost ₦' || out_exact::text
                     || ', which is less than one naira, so there is nothing to charge.',
        'detail', 'G1 would be worth ₦' || rate::text || '. Raise the rate or raise the minimum top-up.');
    elsif abs(in_naira - out_exact) > 0.05 * out_exact then
      v_errors := v_errors || jsonb_build_object(
        'code', 'ROUND_TRIP',
        'hint', 'The two sides of the money would stop agreeing: ' || topup::text || ' Gliits would be charged at ₦'
                     || in_naira::text || ' (the top-up rounds up to a whole naira) but paid back at ₦'
                     || out_exact::text || ' on a withdrawal — more than 5% apart.',
        'detail', 'At ₦' || round(in_naira / topup, 4)::text || ' per Glit the smallest top-up is exactly ₦' || in_naira::text
                     || ', which is the nearest rate that round-trips cleanly. Or raise the minimum top-up so the rounding stops mattering.');
    end if;
  end if;

  if rate > 0 and minw > 0 and min_pay < 1 then
    v_errors := v_errors || jsonb_build_object(
      'code', 'PAYOUT_TOO_SMALL',
      'hint', 'At this rate the smallest withdrawal (' || minw::text || ' G) would pay ₦' || min_pay::text
                   || ', which is less than one naira, so there would be nothing to send.',
      'detail', 'G1 would be worth ₦' || rate::text || '. Raise the rate or raise the minimum withdrawal.');
  end if;

  -- ---- worth seeing, not worth blocking --------------------------------
  if p_key = 'exchange_rate_naira_to_gliits' and old_rate > 0 and rate > 0 then
    v_jump := greatest(rate / old_rate, old_rate / rate);
    if v_jump > 10 then
      v_warnings := v_warnings || jsonb_build_object(
        'code', 'RATE_JUMP',
        'hint', 'This moves the price of a Glit ' || round(v_jump, 2)::text
                     || 'x in one save (₦' || old_rate::text || ' to ₦' || rate::text
                     || '). Balances members already hold cash out at the new rate, so anyone who bought Gliits cheaply before the change can withdraw them dear. If that is not the intention, step the rate over several saves.');
    end if;
  end if;

  if in_naira >= 1 and in_naira < 100 then
    v_warnings := v_warnings || jsonb_build_object(
      'code', 'CHARGE_BELOW_100',
      'hint', 'The smallest top-up would charge ₦' || in_naira::text
                   || '. Check that against the minimum card charge your Paystack account accepts before members start trying it.');
  end if;

  if min_pay >= 1 and min_pay < 100 then
    v_warnings := v_warnings || jsonb_build_object(
      'code', 'PAYOUT_BELOW_100',
      'hint', 'The smallest withdrawal would pay ₦' || min_pay::text
                   || '. Check that against the minimum transfer your Paystack account allows before a member asks for it.');
  end if;

  v_preview := jsonb_build_object(
    'guarded', true,
    'rate', rate,
    'previous_rate', old_rate,
    'min_topup_gliits', topup,
    'min_topup_naira', in_naira,
    'min_withdrawal_gliits', minw,
    'min_withdrawal_naira', min_pay,
    'max_withdrawal_gliits', maxw,
    'max_withdrawal_naira', max_pay);

  if jsonb_array_length(v_errors) > 0 then
    return jsonb_build_object(
      'ok', false,
      'code', v_errors -> 0 ->> 'code',
      'hint', v_errors -> 0 ->> 'hint',
      'detail', case when jsonb_array_length(v_errors) = 1
                     then v_errors -> 0 ->> 'detail'
                     else (select string_agg(coalesce(e ->> 'detail', e ->> 'hint'), ' ')
                             from jsonb_array_elements(v_errors) e)
                end,
      'errors', v_errors,
      'preview', v_preview);
  end if;

  return jsonb_build_object('ok', true, 'warnings', v_warnings, 'preview', v_preview);
end;
$$;

-- Anyone who can read the pricing can ask the question, but the pricing
-- table itself stays read-only to members: this function only reads it.
revoke execute on function public.gliits_config_guard(text, numeric)
  from public, anon;
grant execute on function public.gliits_config_guard(text, numeric)
  to authenticated, service_role;


-- ============================================================
-- 2. registrar_set_config — the writer the Config tab uses
--    Body is the live one, with the guard hooked in after the
--    allowlist check and its warnings carried into the reply.
-- ============================================================
create or replace function public.registrar_set_config(
  p_key text,
  p_value numeric,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid  uuid := auth.uid();
  v_old numeric;
  v_guard jsonb;
  v_allowlist text[] := array[
    'exchange_rate_naira_to_gliits', 'per_minute_rate_gliits',
    'plan_monthly_price_gliits', 'plan_yearly_price_gliits',
    'signup_credit_gliits', 'min_topup_gliits',
    'creator_rate_per_minute', 'creator_cap_per_post_session',
    'idle_timeout_minutes', 'gp_to_gliits_ratio', 'gp_to_gliits_threshold',
    'min_withdrawal_gliits', 'max_withdrawal_gliits', 'withdrawal_hold_hours'
  ];
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not public.admin_has_role(uid, 'registrar') then
    return jsonb_build_object('ok', false, 'code', 'NOT_REGISTRAR');
  end if;
  if coalesce(btrim(coalesce(p_reason, '')), '') = '' then
    return jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED');
  end if;
  if not (p_key = any(v_allowlist)) then
    return jsonb_build_object('ok', false, 'code', 'BAD_EVENT_TYPE');
  end if;

  v_guard := public.gliits_config_guard(p_key, p_value);
  if coalesce((v_guard ->> 'ok')::boolean, false) is not true then
    return v_guard || jsonb_build_object('key', p_key, 'attempted', p_value);
  end if;

  execute format('select %I from public.gliits_config where id = 1', p_key) into v_old;

  execute format(
    'update public.gliits_config set %I = $1, updated_at = now() where id = 1',
    p_key
  ) using p_value;

  insert into public.admin_adjustments (kind, amount, reason, reference, applied_by)
  values ('price', p_value::integer, p_reason,
          p_key || ': ' || coalesce(v_old::text, '?') || ' -> ' || p_value::text, uid);

  return jsonb_build_object('ok', true, 'key', p_key, 'previous', v_old, 'amount', p_value,
                            'warnings', v_guard -> 'warnings',
                            'preview', v_guard -> 'preview');
end;
$$;

revoke execute on function public.registrar_set_config(text, numeric, text)
  from public, anon;
grant execute on function public.registrar_set_config(text, numeric, text)
  to authenticated, service_role;


-- ============================================================
-- 3. gliits_set_config — the older writer, still granted to
--    authenticated, so it has to answer to the same rule book.
--    Body is the live one, guard added after the allowlist.
-- ============================================================
create or replace function public.gliits_set_config(p_key text, p_value numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_registrar boolean;
  v_guard jsonb;
begin
  select exists (
    select 1 from public.admin_users
    where user_id = auth.uid()
      and role in ('super', 'registrar')
  ) into v_is_registrar;

  if not v_is_registrar then
    raise exception 'REGISTRAR_ONLY';
  end if;

  -- Allowlist: only these columns can be updated
  if p_key not in (
    'exchange_rate_naira_to_gliits', 'per_minute_rate_gliits',
    'plan_monthly_price_gliits', 'plan_yearly_price_gliits',
    'signup_credit_gliits', 'min_topup_gliits',
    'creator_rate_per_minute', 'creator_cap_per_post_session',
    'idle_timeout_minutes', 'gp_to_gliits_ratio', 'gp_to_gliits_threshold'
  ) then
    raise exception 'INVALID_CONFIG_KEY';
  end if;

  v_guard := public.gliits_config_guard(p_key, p_value);
  if coalesce((v_guard ->> 'ok')::boolean, false) is not true then
    raise exception 'PRICING_GUARD %', coalesce(v_guard ->> 'code', 'BLOCKED');
  end if;

  execute format(
    'update public.gliits_config set %I = $1, updated_at = now() where id = 1',
    p_key
  ) using p_value;

  return public.gliits_get_config();
end;
$$;

grant execute on function public.gliits_set_config(text, numeric) to authenticated;


-- ============================================================
-- SELF CHECK — paste from "with t as (" to the last line and run it.
-- Nothing to edit. Every row must read PASS.
--
-- The ROUND_TRIP row assumes min_topup_gliits is still 100. If you have
-- since raised the minimum top-up above about 9,500 G, that one row can
-- legitimately read PASS on its own terms; the rest do not depend on it.
-- ============================================================
with t(key_name, typed, want, why) as (
  values
    ('exchange_rate_naira_to_gliits', 1::numeric,      'allow', 'the launch rate'),
    ('exchange_rate_naira_to_gliits', 100::numeric,    'allow', 'G1 = ₦100, both directions multiply'),
    ('exchange_rate_naira_to_gliits', 0::numeric,      'block', 'a free Glit'),
    ('exchange_rate_naira_to_gliits', 0.01::numeric,   'allow', 'G100 is exactly ₦1 — legal but tiny, warns only'),
    ('exchange_rate_naira_to_gliits', 0.005::numeric,  'block', 'G100 costs ₦0.50, charged as ₦1'),
    ('exchange_rate_naira_to_gliits', 0.0001::numeric, 'block', 'the 10,000x shape of the old bug'),
    ('exchange_rate_naira_to_gliits', 1000000::numeric,'block', 'past numeric(10,4)'),
    ('exchange_rate_naira_to_gliits', 0.00005::numeric,'block', 'finer than 4 decimal places'),
    ('min_topup_gliits',              0::numeric,      'block', 'a zero-size top-up'),
    ('min_topup_gliits',              100.5::numeric,  'block', 'an integer column'),
    ('min_withdrawal_gliits',         500000::numeric, 'block', 'above the 200,000 G maximum'),
    ('max_withdrawal_gliits',         5000::numeric,   'block', 'below the 10,000 G minimum'),
    ('min_withdrawal_gliits',         10000::numeric,  'allow', 'the live threshold'),
    ('per_minute_rate_gliits',        3.75::numeric,   'allow', 'not a money-movement key'),
    ('idle_timeout_minutes',          3::numeric,      'allow', 'plain integer setting'),
    ('bogus_key',                     1::numeric,      'block', 'not a column at all')
)
select
  case when g.verdict = t.want then 'PASS' else 'FAIL' end as result,
  t.key_name,
  t.typed as value,
  t.want  as expected,
  g.verdict,
  g.code,
  t.why
from t
cross join lateral (select public.gliits_config_guard(t.key_name, t.typed) as gr) x
cross join lateral (
  select case when (x.gr ->> 'ok')::boolean then 'allow' else 'block' end as verdict,
         coalesce(x.gr ->> 'code', '-') as code
) g
order by result desc, t.key_name, t.typed;

-- What the current table actually means in money, right now:
select
  exchange_rate_naira_to_gliits                        as "naira per G1",
  ceil(min_topup_gliits * exchange_rate_naira_to_gliits)         as "smallest topup charges",
  round(min_withdrawal_gliits * exchange_rate_naira_to_gliits, 2) as "smallest withdrawal pays",
  round(max_withdrawal_gliits * exchange_rate_naira_to_gliits, 2) as "one payout can pay",
  case when min_withdrawal_gliits <= max_withdrawal_gliits then 'PASS' else 'FAIL' end as "range",
  case when abs(ceil(min_topup_gliits * exchange_rate_naira_to_gliits)
                - round(min_topup_gliits * exchange_rate_naira_to_gliits, 2)) <= 0.005
       then 'PASS' else 'CHECK' end as "round trip is exact"
from public.gliits_config where id = 1;

-- Both writers must now consult the guard:
select
  p.proname,
  case when position('gliits_config_guard' in p.prosrc) > 0 then 'PASS' else 'FAIL' end as "calls the guard",
  p.prosecdef as "security definer"
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('registrar_set_config', 'gliits_set_config', 'gliits_config_guard')
order by p.proname;
