-- LossLens Pass 2 database changes.
-- Apply after the existing 20261110000001 through 20261110000006 migrations.
-- This file is intentionally additive and safe to run more than once.

-- Phase 2: remove the JWT-age password step-up while retaining role checks.
-- RPCs still enforce is_admin() or is_super_admin(); this helper only confirms
-- that the caller is an active administrator for backward compatibility.
create or replace function public.is_recently_authenticated()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.is_active_user() and public.is_admin();
$$;

revoke execute on function public.is_recently_authenticated() from public, anon;
grant execute on function public.is_recently_authenticated() to authenticated;

-- Phase 2: reversible therapist-only role assignment.
create or replace function public.admin_revert_therapist(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_super_admin() or not public.is_active_user() then
    raise exception 'Active super-admin access required';
  end if;

  update public.profiles
  set role = 'user'
  where id = p_user_id and role = 'therapist';
  if not found then
    raise exception 'Therapist account not found';
  end if;

  update public.therapists
  set status = 'suspended', verified_at = null, verified_by = null
  where id = p_user_id;

  perform public.log_admin_action(
    'therapist_reverted_to_user',
    'profiles',
    p_user_id::text,
    '{}'::jsonb
  );
  return p_user_id;
end;
$$;

revoke execute on function public.admin_revert_therapist(uuid) from public, anon;
grant execute on function public.admin_revert_therapist(uuid) to authenticated;

drop policy if exists therapist_self_select on public.therapists;
create policy therapist_self_select on public.therapists for select to authenticated
  using (
    id = auth.uid()
    and public.is_active_user()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'therapist')
  );

drop policy if exists therapist_self_update on public.therapists;
create policy therapist_self_update on public.therapists for update to authenticated
  using (
    id = auth.uid()
    and public.is_active_user()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'therapist')
  )
  with check (
    id = auth.uid()
    and public.is_active_user()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'therapist')
  );

-- Phase 3: profile pictures are shown in the top bar and in admin, insurer
-- and therapist user lists, so any signed-in user may read the avatars bucket.
-- Writes remain restricted to each user's own folder by the existing
-- 20261110000002_rls_grants_storage.sql policies.
drop policy if exists "avatars authenticated read" on storage.objects;
create policy "avatars authenticated read" on storage.objects for select to authenticated
  using (bucket_id = 'avatars');

-- Phase 4 / The Circle: the "Slip & Recovery" and "Family & Friends" rooms
-- are removed from the product. DESTRUCTIVE: deletes their messages,
-- reactions, authors and room-member rows. Room is a free-text column (no
-- check constraint), and circle_room_counts / circle_purge_expired are
-- room-agnostic, so no function changes are needed.
delete from public.circle_message_reactions
  where message_id in (
    select id from public.circle_messages
    where room in ('slip_recovery', 'family_friends')
  );

delete from public.circle_message_authors
  where message_id in (
    select id from public.circle_messages
    where room in ('slip_recovery', 'family_friends')
  );

delete from public.circle_messages
  where room in ('slip_recovery', 'family_friends');

delete from public.circle_room_members
  where room in ('slip_recovery', 'family_friends');

-- Phase 4 / Urge Toolkit: user-chosen distraction challenges
-- ("My challenges"). Owner-only RLS; status is doing/done/dropped.
create table if not exists public.urge_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  challenge text not null,
  status text not null default 'doing' check (status in ('doing', 'done', 'dropped')),
  chosen_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists urge_challenges_user_idx on public.urge_challenges (user_id, chosen_at desc);
alter table public.urge_challenges enable row level security;
drop policy if exists urge_challenges_owner_all on public.urge_challenges;
create policy urge_challenges_owner_all on public.urge_challenges for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Phase 4 / Family supporters: supporter contact details (email, phone) are
-- no longer collected — invitations are shared as links only. The columns
-- stay for compatibility; this re-definition keeps the same signature but
-- always stores NULL for both fields. Safe to run twice.
create or replace function public.create_supporter_invitation(
  p_supporter_name text,
  p_supporter_email text default null,
  p_supporter_phone text default null,
  p_supporter_relation text default null,
  p_permissions jsonb default '["Streak status","Goal progress","General mood"]'::jsonb,
  p_anonymous_mode boolean default false,
  p_crisis_contact boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_count int;
  v_inv public.supporter_invitations;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_active_user() then
    raise exception 'Account is suspended';
  end if;
  if p_supporter_name is null or length(btrim(p_supporter_name)) = 0 then
    raise exception 'Supporter name is required';
  end if;

  select count(*) into v_count
  from public.supporter_invitations
  where user_id = v_uid and status in ('pending', 'active');
  if v_count >= 5 then
    raise exception 'Maximum 5 supporters allowed';
  end if;

  insert into public.supporter_invitations (
    user_id, supporter_name, supporter_email, supporter_phone, supporter_relation,
    permissions, anonymous_mode, crisis_contact, token, status, expires_at
  ) values (
    v_uid, btrim(p_supporter_name), null,
    null, nullif(btrim(coalesce(p_supporter_relation,'')), ''),
    coalesce(p_permissions, '[]'::jsonb), coalesce(p_anonymous_mode, false),
    coalesce(p_crisis_contact, false),
    replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
    'pending', now() + interval '30 days'
  ) returning * into v_inv;

  return to_jsonb(v_inv);
end;
$$;
revoke execute on function public.create_supporter_invitation(text, text, text, text, jsonb, boolean, boolean) from public, anon;
grant execute on function public.create_supporter_invitation(text, text, text, text, jsonb, boolean, boolean) to authenticated;

-- ===========================================================================
-- PHASE 5 — SUBSCRIPTIONS, ENTITLEMENTS, PAYMENTS
-- ===========================================================================

-- Plans catalogue (seeded; code is the stable identifier used by the app).
create table if not exists public.plans (
  code text primary key,
  name text not null,
  description text,
  price_kes numeric,
  billing_period text,
  sort_order integer not null default 0,
  features jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
insert into public.plans (code, name, description, price_kes, billing_period, sort_order, features)
values
  ('free', 'Free', 'Core recovery tools and crisis support — always free.', 0, 'month', 0,
   '["Diary","Urge Toolkit","The Circle","Whispers","Family Portal","AI companion (standard)"]'::jsonb),
  ('premium', 'Premium', 'Everything in Free plus deeper analytics, priority AI and more storage.', null, 'month', 1,
   '["Analytics detail","AI priority","Increased storage","All Free features"]'::jsonb),
  ('company', 'Company', 'B2B seat managed by an organisation.', null, 'month', 2,
   '["Organisation dashboard","Seat management","All Free features"]'::jsonb),
  ('protection_member', 'Protection Member', 'Member of a LossLens Protection insurance plan.', null, 'month', 3,
   '["Therapy sessions via Protection","Pre-authorisation","Claims support"]'::jsonb)
on conflict (code) do nothing;

alter table public.plans enable row level security;
drop policy if exists plans_read_all on public.plans;
create policy plans_read_all on public.plans for select to authenticated using (true);

-- Subscription change history. Read: super_admin sees all, a user sees their
-- own rows. No client writes — only SECURITY DEFINER RPCs insert.
create table if not exists public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  changed_by uuid references public.profiles(id) on delete set null,
  old_plan text,
  new_plan text,
  old_status text,
  new_status text,
  expires_at timestamptz,
  plan_type text,
  reason text,
  source text not null default 'admin' check (source in ('admin','payment','system','company','trial','insurer')),
  created_at timestamptz not null default now()
);
create index if not exists subscription_events_user_idx on public.subscription_events (user_id, created_at desc);
alter table public.subscription_events enable row level security;
drop policy if exists subscription_events_read on public.subscription_events;
create policy subscription_events_read on public.subscription_events for select to authenticated
  using (public.is_super_admin() or user_id = auth.uid());

-- Payments ledger. Users read their own rows; super_admin reads all.
-- Writes happen only via service role / SECURITY DEFINER RPCs.
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null default 'manual',
  reference text unique,
  amount numeric not null,
  currency text not null default 'KES',
  plan text,
  status text not null default 'pending' check (status in ('pending','success','failed','refunded')),
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payments_user_idx on public.payments (user_id, created_at desc);
alter table public.payments enable row level security;
drop policy if exists payments_read on public.payments;
create policy payments_read on public.payments for select to authenticated
  using (public.is_super_admin() or user_id = auth.uid());

-- Allowed values, kept in one place for RPC validation.
create or replace function public.subscription_plan_allowed(p_plan text)
returns boolean language sql immutable as $$
  select p_plan in ('free','premium','company','protection_member')
$$;
create or replace function public.subscription_status_allowed(p_status text)
returns boolean language sql immutable as $$
  select p_status in ('active','trialing','pending','inactive','cancelled','expired')
$$;

-- Set one user's subscription. super_admin only; validates input; writes the
-- profile update, a subscription_events row and an admin audit entry; raises
-- if zero rows changed. Returns the updated profile row.
create or replace function public.admin_set_subscription(
  p_user_id uuid,
  p_plan text,
  p_status text,
  p_expires_at timestamptz default null,
  p_plan_type text default null,
  p_reason text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_old public.profiles;
  v_new public.profiles;
begin
  if not public.is_super_admin() then
    raise exception 'Only super_admin can change subscriptions';
  end if;
  if not public.subscription_plan_allowed(p_plan) then
    raise exception 'Invalid plan: %', p_plan;
  end if;
  if not public.subscription_status_allowed(p_status) then
    raise exception 'Invalid status: %', p_status;
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'A reason is required';
  end if;

  select * into v_old from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'User not found';
  end if;

  update public.profiles
  set subscription_plan = p_plan,
      subscription_status = p_status,
      subscription_expires_at = p_expires_at,
      plan_type = coalesce(nullif(btrim(coalesce(p_plan_type,'')), ''), plan_type)
  where id = p_user_id;
  if not found then
    raise exception 'Subscription update affected 0 rows';
  end if;

  select * into v_new from public.profiles where id = p_user_id;

  insert into public.subscription_events (
    user_id, changed_by, old_plan, new_plan, old_status, new_status,
    expires_at, plan_type, reason, source
  ) values (
    p_user_id, auth.uid(), v_old.subscription_plan, v_new.subscription_plan,
    v_old.subscription_status, v_new.subscription_status,
    v_new.subscription_expires_at, v_new.plan_type, btrim(p_reason), 'admin'
  );

  perform public.log_admin_action('subscription_change', 'profiles', p_user_id::text,
    jsonb_build_object('old_plan', v_old.subscription_plan, 'new_plan', v_new.subscription_plan,
      'old_status', v_old.subscription_status, 'new_status', v_new.subscription_status,
      'reason', btrim(p_reason)));

  return v_new;
end;
$$;
revoke execute on function public.admin_set_subscription(uuid, text, text, timestamptz, text, text) from public, anon;
grant execute on function public.admin_set_subscription(uuid, text, text, timestamptz, text, text) to authenticated;

-- Bulk variant: up to 100 users, atomic (any failure rolls back all).
create or replace function public.admin_set_subscription_bulk(
  p_user_ids uuid[],
  p_plan text,
  p_status text,
  p_expires_at timestamptz default null,
  p_plan_type text default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid;
  v_results jsonb := '[]'::jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Only super_admin can change subscriptions';
  end if;
  if p_user_ids is null or coalesce(array_length(p_user_ids, 1), 0) = 0 then
    raise exception 'No users supplied';
  end if;
  if coalesce(array_length(p_user_ids, 1), 0) > 100 then
    raise exception 'Maximum 100 users per bulk change';
  end if;
  foreach v_uid in array p_user_ids loop
    v_results := v_results || to_jsonb(public.admin_set_subscription(
      v_uid, p_plan, p_status, p_expires_at, p_plan_type, p_reason));
  end loop;
  return v_results;
end;
$$;
revoke execute on function public.admin_set_subscription_bulk(uuid[], text, text, timestamptz, text, text) from public, anon;
grant execute on function public.admin_set_subscription_bulk(uuid[], text, text, timestamptz, text, text) to authenticated;

-- Subscription history for the admin UI. super_admin only.
create or replace function public.admin_get_subscription_history(
  p_user_id uuid default null,
  p_limit integer default 50
)
returns setof public.subscription_events
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only super_admin can view subscription history';
  end if;
  return query
    select * from public.subscription_events
    where (p_user_id is null or user_id = p_user_id)
    order by created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;
revoke execute on function public.admin_get_subscription_history(uuid, integer) from public, anon;
grant execute on function public.admin_get_subscription_history(uuid, integer) to authenticated;

-- Expiry sweep: mark subscriptions past their expiry as 'expired' and write
-- a system event. Run daily via pg_cron (see docs/MIGRATION_NOTES.md) or an
-- api/cron route with the service role.
create or replace function public.expire_subscriptions()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer := 0;
  v_row record;
begin
  for v_row in
    select id, subscription_plan, subscription_status, subscription_expires_at, plan_type
    from public.profiles
    where subscription_expires_at is not null
      and subscription_expires_at <= now()
      and subscription_status is distinct from 'expired'
      and subscription_status is distinct from 'cancelled'
    for update
  loop
    update public.profiles
    set subscription_status = 'expired'
    where id = v_row.id;
    insert into public.subscription_events (
      user_id, changed_by, old_plan, new_plan, old_status, new_status,
      expires_at, plan_type, reason, source
    ) values (
      v_row.id, null, v_row.subscription_plan, v_row.subscription_plan,
      v_row.subscription_status, 'expired',
      v_row.subscription_expires_at, v_row.plan_type,
      'Subscription expired', 'system'
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.expire_subscriptions() from public, anon, authenticated;
grant execute on function public.expire_subscriptions() to service_role;

-- Record a manual/offline payment (admin-entered M-Pesa or bank receipt) and
-- activate the matching plan. super_admin only.
create or replace function public.admin_record_manual_payment(
  p_user_id uuid,
  p_plan text,
  p_amount numeric,
  p_reference text default null,
  p_reason text default 'Manual payment recorded'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_payment public.payments;
  v_profile public.profiles;
begin
  if not public.is_super_admin() then
    raise exception 'Only super_admin can record payments';
  end if;
  if not public.subscription_plan_allowed(p_plan) then
    raise exception 'Invalid plan: %', p_plan;
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be positive';
  end if;

  insert into public.payments (user_id, provider, reference, amount, plan, status)
  values (p_user_id, 'manual', nullif(btrim(coalesce(p_reference, '')), ''), p_amount, p_plan, 'success')
  returning * into v_payment;

  v_profile := public.admin_set_subscription(
    p_user_id, p_plan, 'active', now() + interval '30 days', null, p_reason);

  perform public.log_admin_action('manual_payment', 'payments', v_payment.id::text,
    jsonb_build_object('user_id', p_user_id, 'amount', p_amount, 'plan', p_plan,
      'reference', p_reference));

  return jsonb_build_object('payment', to_jsonb(v_payment), 'profile', to_jsonb(v_profile));
end;
$$;
revoke execute on function public.admin_record_manual_payment(uuid, text, numeric, text, text) from public, anon;
grant execute on function public.admin_record_manual_payment(uuid, text, numeric, text, text) to authenticated;

-- Verification: run as an authenticated administrator after applying.
select
  public.is_active_user() as active_user,
  public.is_admin() as administrator,
  public.is_super_admin() as super_administrator,
  public.is_recently_authenticated() as legacy_step_up_check;

select
  to_regprocedure('public.admin_revert_therapist(uuid)') as revert_therapist_rpc,
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'therapists'
      and policyname = 'therapist_self_update'
  ) as therapist_self_update_policy_exists;
