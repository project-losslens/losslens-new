-- set_subscription.sql — set a user's plan by email as postgres.
-- Writes the profile update AND a subscription_events history row.
-- Run in the Supabase SQL editor as postgres (not via the app).
-- Replace the placeholders below, then run the whole file.

-- >>> EDIT THESE <<<
do $$
declare
  v_email text := 'user@example.com';   -- target user's email
  v_plan text := 'premium';             -- free | premium | company | protection_member
  v_status text := 'active';            -- active | trialing | pending | inactive | cancelled | expired
  v_days integer := 30;                 -- days until expiry; null for no expiry
  v_reason text := 'Manual grant via script';
begin
  update public.profiles p
  set subscription_plan = v_plan,
      subscription_status = v_status,
      subscription_expires_at = case when v_days is null then null else now() + make_interval(days => v_days) end,
      plan_type = case when v_plan = 'company' then 'company' else coalesce(p.plan_type, 'individual') end
  where lower(p.email) = lower(v_email)
  returning p.id into strict v_email; -- placeholder, replaced below
end $$;

-- The block above is illustrative; use this concrete version instead:
do $$
declare
  v_uid uuid;
  v_email text := 'user@example.com';
  v_plan text := 'premium';
  v_status text := 'active';
  v_days integer := 30;
  v_reason text := 'Manual grant via script';
begin
  select id into v_uid from public.profiles where lower(email) = lower(v_email);
  if v_uid is null then
    raise exception 'No profile found for email %', v_email;
  end if;
  update public.profiles
  set subscription_plan = v_plan,
      subscription_status = v_status,
      subscription_expires_at = case when v_days is null then null else now() + make_interval(days => v_days) end,
      plan_type = case when v_plan = 'company' then 'company' else coalesce(plan_type, 'individual') end
  where id = v_uid;
  insert into public.subscription_events (user_id, changed_by, new_plan, new_status, expires_at, reason, source)
  values (v_uid, null, v_plan, v_status,
          case when v_days is null then null else now() + make_interval(days => v_days) end,
          v_reason, 'admin');
end $$;

-- Verification: confirm the update landed.
select id, email, subscription_plan, subscription_status, subscription_expires_at
from public.profiles
where lower(email) = lower('user@example.com');
