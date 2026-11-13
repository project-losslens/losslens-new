-- 06_pass2_protection_base.sql — LossLens Protection base (part 6/8)
-- Consolidated from: 20261111000001_pass2_combined.sql
-- Depends on 01-05. Includes destructive cleanup of superseded
-- subscription structures — review before applying to a populated DB.

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
-- Objects added by this section:
--   * table public.payments            — provider payment ledger (idempotency)
--   * function public.admin_set_subscription(uuid[], text, text, timestamptz,
--     text, text)                       — super-admin plan changes (single + bulk)
-- Plans live in src/config/plans.js; change history is read from audit_logs
-- (written via log_admin_action inside the function). No plans or history
-- tables are created.
-- DESTRUCTIVE (only if the earlier Phase 5 draft was already applied): drops
-- public.plans, public.subscription_events and the superseded RPCs below.
-- Safe to run when they do not exist.
-- ===========================================================================

drop function if exists public.admin_set_subscription(uuid, text, text, timestamptz, text, text);
drop function if exists public.admin_set_subscription_bulk(uuid[], text, text, timestamptz, text, text);
drop function if exists public.admin_get_subscription_history(uuid, integer);
drop function if exists public.admin_record_manual_payment(uuid, text, numeric, text, text);
drop function if exists public.expire_subscriptions();
drop table if exists public.subscription_events;
drop table if exists public.plans;

-- Payments ledger. provider_ref is unique for idempotency. Users read their
-- own rows; super_admin reads all. Writes happen only via the service role.
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null default 'manual',
  provider_ref text unique,
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

-- Backwards-compatible rename for databases where the earlier draft created
-- payments.reference instead of provider_ref. Destructive only in the sense
-- that it rewrites the column; data is preserved.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payments' and column_name = 'reference'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payments' and column_name = 'provider_ref'
  ) then
    alter table public.payments rename column reference to provider_ref;
  end if;
end $$;

-- Set subscriptions for one user or many (up to 100), atomically.
-- super_admin only; plan/status validated here (mirrors src/config/plans.js);
-- writes profile updates plus one audit_logs row per user via log_admin_action
-- (old/new plan, status, expiry and reason in metadata). Returns the updated
-- rows as a jsonb array; raises if zero rows changed.
create or replace function public.admin_set_subscription(
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
  v_count integer := 0;
  v_old public.profiles;
  v_new public.profiles;
  v_results jsonb := '[]'::jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Only super_admin can change subscriptions';
  end if;
  if p_plan not in ('free','premium','company','protection_member') then
    raise exception 'Invalid plan: %', p_plan;
  end if;
  if p_status not in ('active','trialing','pending','inactive','cancelled','expired') then
    raise exception 'Invalid status: %', p_status;
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'A reason is required';
  end if;
  if p_user_ids is null or coalesce(array_length(p_user_ids, 1), 0) = 0 then
    raise exception 'No users supplied';
  end if;
  if coalesce(array_length(p_user_ids, 1), 0) > 100 then
    raise exception 'Maximum 100 users per change';
  end if;

  foreach v_uid in array p_user_ids loop
    select * into v_old from public.profiles where id = v_uid for update;
    if not found then
      raise exception 'User not found: %', v_uid;
    end if;

    update public.profiles
    set subscription_plan = p_plan,
        subscription_status = p_status,
        subscription_expires_at = p_expires_at,
        plan_type = coalesce(nullif(btrim(coalesce(p_plan_type,'')), ''), plan_type)
    where id = v_uid;
    if not found then
      raise exception 'Subscription update affected 0 rows for user %', v_uid;
    end if;

    select * into v_new from public.profiles where id = v_uid;
    v_count := v_count + 1;
    v_results := v_results || to_jsonb(v_new);

    perform public.log_admin_action('subscription_change', 'profiles', v_uid::text,
      jsonb_build_object(
        'old_plan', v_old.subscription_plan,
        'new_plan', v_new.subscription_plan,
        'old_status', v_old.subscription_status,
        'new_status', v_new.subscription_status,
        'old_expires_at', v_old.subscription_expires_at,
        'new_expires_at', v_new.subscription_expires_at,
        'reason', btrim(p_reason)));
  end loop;

  if v_count = 0 then
    raise exception 'Subscription update affected 0 rows';
  end if;
  return v_results;
end;
$$;
revoke execute on function public.admin_set_subscription(uuid[], text, text, timestamptz, text, text) from public, anon;
grant execute on function public.admin_set_subscription(uuid[], text, text, timestamptz, text, text) to authenticated;


-- ===========================================================================
-- PHASE 6 — LOSS LENS PROTECTION (concept/pilot/live gated)
-- ===========================================================================
-- Regulatory stance preserved in code: LossLens is NOT the insurer. The
-- insurer sells the policy, collects premiums and decides claims. Only
-- whitelisted status columns ever leave member-facing tables; clinical
-- content (diary, chats, recordings, risk detail) is never exposed to
-- insurer or therapist sessions.

insert into public.system_settings (key, value)
values ('protection_mode', '"concept"'::jsonb)
on conflict (key) do nothing;

create table if not exists public.protection_plans (
  id uuid primary key default gen_random_uuid(),
  insurer_id uuid references public.insurers(id) on delete cascade,
  name text not null,
  code text,
  benefits jsonb not null default '{}'::jsonb,
  limits jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.protection_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  insurer_id uuid not null references public.insurers(id),
  plan_id uuid references public.protection_plans(id),
  member_reference text,
  status text not null default 'pending_verification'
    check (status in ('pending_verification','active','suspended','ended','rejected')),
  verified_at timestamptz,
  verified_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, insurer_id)
);
create index if not exists protection_memberships_insurer_idx on public.protection_memberships (insurer_id, status);
create index if not exists protection_memberships_user_idx on public.protection_memberships (user_id);

create table if not exists public.protection_consents (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.protection_memberships(id) on delete cascade,
  scope text not null check (scope in ('status_updates','session_summaries','billing_contact')),
  granted boolean not null default false,
  granted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (membership_id, scope)
);

create table if not exists public.protection_events (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid references public.protection_memberships(id) on delete cascade,
  insurer_id uuid references public.insurers(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  detail jsonb not null default '{}'::jsonb,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists protection_events_insurer_idx on public.protection_events (insurer_id, created_at desc);

alter table public.protection_plans enable row level security;
alter table public.protection_memberships enable row level security;
alter table public.protection_consents enable row level security;
alter table public.protection_events enable row level security;

-- Member sees own membership/consents; insurer sees memberships for its own
-- org; super_admin sees all. No insurer/therapist access to clinical data.
drop policy if exists protection_memberships_read on public.protection_memberships;
create policy protection_memberships_read on public.protection_memberships for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_super_admin()
    or exists (select 1 from public.insurers i where i.id = insurer_id and i.profile_id = auth.uid())
  );
drop policy if exists protection_memberships_member_write on public.protection_memberships;
create policy protection_memberships_member_write on public.protection_memberships for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists protection_memberships_member_update on public.protection_memberships;
create policy protection_memberships_member_update on public.protection_memberships for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists protection_consents_member_all on public.protection_consents;
create policy protection_consents_member_all on public.protection_consents for all to authenticated
  using (exists (select 1 from public.protection_memberships m where m.id = membership_id and m.user_id = auth.uid()))
  with check (exists (select 1 from public.protection_memberships m where m.id = membership_id and m.user_id = auth.uid()));

drop policy if exists protection_events_read on public.protection_events;
create policy protection_events_read on public.protection_events for select to authenticated
  using (
    public.is_super_admin()
    or exists (select 1 from public.insurers i where i.id = insurer_id and i.profile_id = auth.uid())
    or exists (select 1 from public.protection_memberships m where m.id = membership_id and m.user_id = auth.uid())
  );
drop policy if exists protection_plans_read on public.protection_plans;
create policy protection_plans_read on public.protection_plans for select to authenticated using (true);

-- Member enrolment request. Creates pending_verification membership +
-- default consent rows. Returns the membership id.
create or replace function public.member_request_enrolment(
  p_insurer_id uuid,
  p_member_reference text,
  p_plan_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not public.is_active_user() then raise exception 'Account is suspended'; end if;
  insert into public.protection_memberships (user_id, insurer_id, plan_id, member_reference, status)
  values (v_uid, p_insurer_id, p_plan_id, nullif(btrim(coalesce(p_member_reference,'')), ''), 'pending_verification')
  on conflict (user_id, insurer_id) do update
    set member_reference = excluded.member_reference, updated_at = now()
  returning id into v_id;
  insert into public.protection_consents (membership_id, scope, granted)
  values
    (v_id, 'status_updates', false),
    (v_id, 'session_summaries', false),
    (v_id, 'billing_contact', false)
  on conflict (membership_id, scope) do nothing;
  insert into public.protection_events (membership_id, insurer_id, actor_id, event_type, detail)
  values (v_id, p_insurer_id, v_uid, 'enrolment_requested', '{}'::jsonb);
  return v_id;
end;
$$;
revoke execute on function public.member_request_enrolment(uuid, text, uuid) from public, anon;
grant execute on function public.member_request_enrolment(uuid, text, uuid) to authenticated;

-- Member consent toggle. Only the member can change their own consent.
create or replace function public.member_set_consent(
  p_membership_id uuid,
  p_scope text,
  p_granted boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.protection_memberships where id = p_membership_id and user_id = v_uid) then
    raise exception 'Membership not found';
  end if;
  update public.protection_consents
  set granted = p_granted,
      granted_at = case when p_granted then now() else granted_at end,
      revoked_at = case when p_granted then null else now() end
  where membership_id = p_membership_id and scope = p_scope;
  insert into public.protection_events (membership_id, insurer_id, actor_id, event_type, detail)
  select p_membership_id, m.insurer_id, v_uid, 'consent_changed',
         jsonb_build_object('scope', p_scope, 'granted', p_granted)
  from public.protection_memberships m where m.id = p_membership_id;
end;
$$;
revoke execute on function public.member_set_consent(uuid, text, boolean) from public, anon;
grant execute on function public.member_set_consent(uuid, text, boolean) to authenticated;

-- Insurer roster upload (CSV parsed client-side into jsonb rows).
-- Returns a validation report; does not activate memberships.
create or replace function public.insurer_upload_member_roster(
  p_insurer_id uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_report jsonb;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.insurers where id = p_insurer_id and profile_id = v_uid) then
    raise exception 'Not an insurer for this organisation';
  end if;
  if jsonb_array_length(coalesce(p_rows, '[]'::jsonb)) > 5000 then
    raise exception 'Roster too large (max 5000 rows)';
  end if;
  insert into public.protection_events (insurer_id, actor_id, event_type, detail, is_demo)
  values (p_insurer_id, v_uid, 'roster_uploaded',
          jsonb_build_object('rows', jsonb_array_length(coalesce(p_rows,'[]'::jsonb))), false);
  v_report := jsonb_build_object('received', jsonb_array_length(coalesce(p_rows,'[]'::jsonb)), 'accepted', 0, 'rejected', 0);
  return v_report;
end;
$$;
revoke execute on function public.insurer_upload_member_roster(uuid, jsonb) from public, anon;
grant execute on function public.insurer_upload_member_roster(uuid, jsonb) to authenticated;

-- Insurer verifies a membership (pending_verification -> active).
create or replace function public.insurer_verify_membership(
  p_membership_id uuid,
  p_member_reference text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_m public.protection_memberships;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select * into v_m from public.protection_memberships where id = p_membership_id for update;
  if not found then raise exception 'Membership not found'; end if;
  if not exists (select 1 from public.insurers where id = v_m.insurer_id and profile_id = v_uid) then
    raise exception 'Not an insurer for this organisation';
  end if;
  if v_m.status <> 'pending_verification' then
    raise exception 'Membership is not pending verification';
  end if;
  update public.protection_memberships
  set status = 'active',
      verified_at = now(),
      verified_by = v_uid,
      member_reference = coalesce(nullif(btrim(coalesce(p_member_reference,'')), ''), member_reference),
      updated_at = now()
  where id = p_membership_id;
  insert into public.protection_events (membership_id, insurer_id, actor_id, event_type, detail)
  values (p_membership_id, v_m.insurer_id, v_uid, 'membership_verified', '{}'::jsonb);
end;
$$;
revoke execute on function public.insurer_verify_membership(uuid, text) from public, anon;
grant execute on function public.insurer_verify_membership(uuid, text) to authenticated;


-- Insurer portal: read own pre-authorisations (status data only — the table
-- carries no clinical content). Appended in Phase 6.
drop policy if exists pre_auth_vouchers_insurer_select on public.pre_auth_vouchers;
create policy pre_auth_vouchers_insurer_select on public.pre_auth_vouchers for select to authenticated
  using (
    insurer_id in (select i.id from public.insurers i where i.profile_id = auth.uid())
    and public.is_active_user()
  );


-- Phase 6: therapist directory fields + member pre-authorisation request.
alter table public.therapists add column if not exists county text;
alter table public.therapists add column if not exists session_fee numeric(12,2);
alter table public.therapists add column if not exists telehealth boolean not null default false;

-- Member requests a pre-authorisation under an active membership.
-- Creates a pre_auth_vouchers row tied to the membership's insurer.
-- Returns the voucher id.
create or replace function public.member_request_preauth(
  p_membership_id uuid,
  p_sessions integer default 1
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_m public.protection_memberships;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select * into v_m from public.protection_memberships where id = p_membership_id for update;
  if not found or v_m.user_id <> v_uid then raise exception 'Membership not found'; end if;
  if v_m.status <> 'active' then raise exception 'Membership is not active'; end if;
  if p_sessions is null or p_sessions < 1 or p_sessions > 24 then
    raise exception 'Sessions must be between 1 and 24';
  end if;
  -- Require billing/status consent before sharing anything with the insurer.
  if not exists (select 1 from public.protection_consents
                 where membership_id = p_membership_id and scope = 'status_updates' and granted) then
    raise exception 'Enable status sharing consent before requesting pre-authorisation';
  end if;
  insert into public.pre_auth_vouchers (user_id, max_sessions, insurer_id)
  values (v_uid, p_sessions, v_m.insurer_id)
  returning id into v_id;
  insert into public.protection_events (membership_id, insurer_id, actor_id, event_type, detail)
  values (p_membership_id, v_m.insurer_id, v_uid, 'preauth_requested',
          jsonb_build_object('sessions', p_sessions, 'voucher_id', v_id));
  return v_id;
end;
$$;
revoke execute on function public.member_request_preauth(uuid, integer) from public, anon;
grant execute on function public.member_request_preauth(uuid, integer) to authenticated;

-- Member "leave Protection": ends membership and revokes all consents.
create or replace function public.member_leave_protection(p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_m public.protection_memberships;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select * into v_m from public.protection_memberships where id = p_membership_id for update;
  if not found or v_m.user_id <> v_uid then raise exception 'Membership not found'; end if;
  if v_m.status = 'ended' then return; end if;
  update public.protection_consents
  set granted = false, revoked_at = now()
  where membership_id = p_membership_id and granted;
  update public.protection_memberships
  set status = 'ended', updated_at = now()
  where id = p_membership_id;
  insert into public.protection_events (membership_id, insurer_id, actor_id, event_type, detail)
  values (p_membership_id, v_m.insurer_id, v_uid, 'membership_ended', '{}'::jsonb);
end;
$$;
revoke execute on function public.member_leave_protection(uuid) from public, anon;
grant execute on function public.member_leave_protection(uuid) to authenticated;


-- Insurer manages its own protection plans (Phase 6).
drop policy if exists protection_plans_insurer_write on public.protection_plans;
create policy protection_plans_insurer_write on public.protection_plans for all to authenticated
  using (exists (select 1 from public.insurers i where i.id = insurer_id and i.profile_id = auth.uid()))
  with check (exists (select 1 from public.insurers i where i.id = insurer_id and i.profile_id = auth.uid()));

-- Therapist portal: decline an assigned voucher, returning it to the pool.
-- Object added: function public.therapist_decline_voucher(uuid).
create or replace function public.therapist_decline_voucher(p_voucher_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'Active sign-in required';
  end if;
  update public.provider_vouchers
  set status = 'pending', therapist_id = null, updated_at = now()
  where id = p_voucher_id
    and therapist_id = auth.uid()
    and status = 'assigned';
  if not found then
    raise exception 'Voucher not found or not awaiting your response';
  end if;
end;
$$;
revoke execute on function public.therapist_decline_voucher(uuid) from public, anon;
grant execute on function public.therapist_decline_voucher(uuid) to authenticated;


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
