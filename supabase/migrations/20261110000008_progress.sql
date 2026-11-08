-- FN-09: idempotent progress recompute anchored to Africa/Nairobi, with a
-- one-day grace and an idempotent streak-freeze bridge.

alter table public.profiles
  add column if not exists streak_freeze_bridged_date date;

create or replace function public.recompute_progress()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Africa/Nairobi')::date;
  v_profile public.profiles;
  v_streak int := 0;
  v_cur date;
  v_freeze_used boolean;
  v_freeze_reset date;
  v_freeze_activated boolean := false;
  v_freeze_bridged date;
  v_clean_since date;
  v_money_saved numeric;
  v_diary_count int;
  v_clean_count int;
  v_cbt_count int;
  v_trigger_count int;
  v_badges jsonb;
  v_new_badges jsonb := '[]'::jsonb;
  v_badge_row record;
  v_earned text[];
  v_day_count int;
  v_day_clean boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if not found then
    raise exception 'Profile not found';
  end if;

  v_freeze_used := coalesce(v_profile.streak_freeze_used, false);
  v_freeze_reset := v_profile.streak_freeze_reset_date;
  v_freeze_bridged := v_profile.streak_freeze_bridged_date;
  if v_freeze_used and v_freeze_reset is not null and v_freeze_reset <= v_today then
    v_freeze_used := false;
    v_freeze_reset := null;
    v_freeze_bridged := null;
  end if;

  -- Streak walk starts at today if an entry exists today, else yesterday
  -- (one day of grace), else the streak is 0.
  if exists (select 1 from public.diary_entries where user_id = v_uid and date = v_today) then
    v_cur := v_today;
  elsif exists (select 1 from public.diary_entries where user_id = v_uid and date = v_today - 1) then
    v_cur := v_today - 1;
  else
    v_cur := null;
  end if;

  while v_cur is not null loop
    select count(*), bool_or(not d.gambled)
    into v_day_count, v_day_clean
    from public.diary_entries d
    where d.user_id = v_uid and d.date = v_cur;

    if v_day_count = 0 then
      exit;
    elsif v_day_clean then
      v_streak := v_streak + 1;
      v_cur := v_cur - 1;
    else
      -- A single missed/relapse day may be bridged once per calendar date by
      -- the streak freeze; streak_freeze_bridged_date makes it idempotent.
      if not v_freeze_used or v_freeze_bridged = v_cur then
        if not v_freeze_used then
          v_freeze_used := true;
          v_freeze_reset := v_today + 30;
          v_freeze_activated := true;
        end if;
        v_freeze_bridged := v_cur;
        v_cur := v_cur - 1;
      else
        exit;
      end if;
    end if;
  end loop;

  v_clean_since := case when v_streak > 0 then v_cur + 1 else null end;

  select coalesce(sum(d.money_spent), 0) into v_money_saved
  from public.diary_entries d
  where d.user_id = v_uid and d.gambled = false;

  select count(*), count(*) filter (where not d.gambled)
    into v_diary_count, v_clean_count
  from public.diary_entries d where d.user_id = v_uid;

  select count(*) into v_cbt_count
  from public.cbt_progress c where c.user_id = v_uid and c.completed = true;

  select count(distinct t) into v_trigger_count
  from public.diary_entries d,
       lateral jsonb_array_elements_text(coalesce(d.triggers, '[]'::jsonb)) t
  where d.user_id = v_uid;

  v_earned := coalesce(
    (select array_agg(x) from jsonb_array_elements_text(coalesce(v_profile.badges, '[]'::jsonb)) x),
    '{}'::text[]
  );

  for v_badge_row in
    select * from (values
      ('first_entry',     v_diary_count >= 1),
      ('week_streak',     v_streak >= 7),
      ('month_streak',    v_streak >= 30),
      ('diary_10',        v_diary_count >= 10),
      ('diary_30',        v_diary_count >= 30),
      ('cbt_1',           v_cbt_count >= 1),
      ('cbt_4',           v_cbt_count >= 4),
      ('cbt_all',         v_cbt_count >= 8),
      ('first_no',        v_clean_count >= 1),
      ('trigger_master',  v_trigger_count >= 5),
      ('saved_1000',      v_money_saved >= 1000),
      ('saved_10000',     v_money_saved >= 10000)
    ) as checks(badge_id, earned)
    where checks.earned and not (checks.badge_id = any(v_earned))
  loop
    v_new_badges := v_new_badges || to_jsonb(v_badge_row.badge_id);
    v_earned := v_earned || v_badge_row.badge_id;
  end loop;

  select coalesce(jsonb_agg(x order by ord), '[]'::jsonb) into v_badges
  from (
    select x, ord from (
      select value as x, ordinality as ord
      from jsonb_array_elements(coalesce(v_profile.badges, '[]'::jsonb)) with ordinality
      union all
      select value, 1000 + ordinality
      from jsonb_array_elements(v_new_badges) with ordinality
    ) s
  ) t;

  update public.profiles
  set streak_days = v_streak,
      money_saved = v_money_saved,
      clean_since = v_clean_since,
      streak_freeze_used = v_freeze_used,
      streak_freeze_reset_date = v_freeze_reset,
      streak_freeze_bridged_date = v_freeze_bridged,
      badges = v_badges
  where id = v_uid;

  return jsonb_build_object(
    'streak_days', v_streak,
    'money_saved', v_money_saved,
    'clean_since', v_clean_since,
    'new_badges', v_new_badges,
    'freeze_activated', v_freeze_activated
  );
end;
$$;

revoke execute on function public.recompute_progress() from public, anon;
grant execute on function public.recompute_progress() to authenticated;

notify pgrst, 'reload schema';
