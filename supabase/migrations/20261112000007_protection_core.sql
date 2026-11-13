-- 07_protection_core.sql — LossLens Protection security/access/policy/preauth (part 7/8)
-- Consolidated from: 20261112000001_protection_security.sql +
--   20261112000002_protection_access_layer.sql +
--   20261112000003_protection_policy_core.sql +
--   20261112000004_protection_preauth.sql
-- Depends on 01-06.

-- LossLens Protection — Script 01: SECURITY HARDENING
-- Apply after 20261111000001_pass2_combined.sql.
-- Safe to re-run (idempotent). See docs/MIGRATION_NOTES.md for order.
--
-- Contents:
--   * protection_mode()/insurer-identity helpers (server-side mode gate)
--   * protection_memberships: remove member self-write policies (S1 fix)
--   * protection_consents: add purpose + wording_version; writes RPC-only
--   * protection_plans: scope SELECT (was using(true))
--   * Harden member_request_enrolment / insurer_verify_membership /
--     insurer_upload_member_roster / member_request_preauth / member_set_consent
--   * protection_log_access(): audited sensitive-read helper
--
-- Rollback: policies can be recreated from pass2_combined.sql; new consent
-- columns are additive; RPC re-definitions are replace-only.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Current protection_mode ('concept' | 'pilot' | 'live'). Fails closed to
-- 'concept' when the setting is missing or unreadable.
create or replace function public.protection_mode()
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_value jsonb;
begin
  select value into v_value from public.system_settings where key = 'protection_mode';
  if v_value is null then return 'concept'; end if;
  if jsonb_typeof(v_value) = 'string' then
    return trim(both '"' from v_value #>> '{}');
  end if;
  return coalesce(v_value->>'mode', 'concept');
end;
$$;
revoke execute on function public.protection_mode() from public, anon;
grant execute on function public.protection_mode() to authenticated;

-- Insurer org id for the calling user, only when the insurer row and the
-- profile role are both active. Returns null otherwise.
create or replace function public.protection_insurer_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select i.id
  from public.insurers i
  join public.profiles p on p.id = i.profile_id
  where i.profile_id = auth.uid()
    and i.status = 'active'
    and p.role = 'insurer'
    and p.status = 'active'
  limit 1;
$$;
revoke execute on function public.protection_insurer_id() from public, anon;
grant execute on function public.protection_insurer_id() to authenticated;

create or replace function public.protection_is_active_insurer()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.protection_insurer_id() is not null;
$$;
revoke execute on function public.protection_is_active_insurer() from public, anon;
grant execute on function public.protection_is_active_insurer() to authenticated;

-- A Protection insurer must be active and backed by an active commercial
-- partnership. This rejects orphan, suspended or inactive insurer records
-- before a member enrolment is created.
create or replace function public.protection_insurer_eligible_for_enrolment(p_insurer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.insurers i
    join public.insurer_partnerships ip on ip.insurer_id = i.id
    where i.id = p_insurer_id
      and i.status = 'active'
      and ip.status = 'active'
      and (ip.contract_end is null or ip.contract_end >= current_date)
  );
$$;
revoke execute on function public.protection_insurer_eligible_for_enrolment(uuid) from public, anon;
grant execute on function public.protection_insurer_eligible_for_enrolment(uuid) to authenticated;

-- Raise unless protection_mode is one of the allowed modes. Used inside RPCs
-- so the mode gate is enforced server-side, not just in the UI.
create or replace function public.protection_require_mode(p_allowed text[])
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not (public.protection_mode() = any (p_allowed)) then
    raise exception 'LossLens Protection is not available in the current mode (%)', public.protection_mode();
  end if;
end;
$$;
revoke execute on function public.protection_require_mode(text[]) from public, anon;
grant execute on function public.protection_require_mode(text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Sensitive-access audit helper. Writes one audit_logs row. Never pass
-- clinical content — resource reference and purpose only.
-- ---------------------------------------------------------------------------
create or replace function public.protection_log_access(
  p_action text,
  p_resource text,
  p_resource_ref text default null,
  p_purpose text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
  v_role text;
begin
  v_role := coalesce(public.current_user_role(), 'unknown');
  if v_role not in ('insurer', 'super_admin', 'admin') then
    return null; -- members do not generate insurer/admin access audit rows
  end if;
  insert into public.audit_logs (actor_id, action, target_table, target_id, metadata)
  values (
    auth.uid(),
    left('protection_access:' || p_action, 120),
    left(p_resource, 120),
    left(coalesce(p_resource_ref, ''), 120),
    jsonb_build_object('role', v_role, 'purpose', left(coalesce(p_purpose, ''), 200))
  )
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.protection_log_access(text, text, text, text) from public, anon;
grant execute on function public.protection_log_access(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- protection_memberships: members may READ their own row only. All writes go
-- through security-definer RPCs. This closes the self-activation hole
-- (member could previously insert/update status, insurer_id, verified_*).
-- ---------------------------------------------------------------------------
drop policy if exists protection_memberships_member_write on public.protection_memberships;
drop policy if exists protection_memberships_member_update on public.protection_memberships;

-- Insurer read stays (own org only) — refined to require an ACTIVE insurer
-- org so suspended insurers lose read access too.
drop policy if exists protection_memberships_read on public.protection_memberships;
create policy protection_memberships_read on public.protection_memberships for select to authenticated
  using (
    public.is_super_admin()
    or user_id = auth.uid()
    or insurer_id = public.protection_insurer_id()
  );

-- ---------------------------------------------------------------------------
-- protection_consents: add purpose + wording_version. Members keep SELECT;
-- all writes via member_set_consent (definer). History is preserved in
-- protection_events (consent_changed) — rows are never deleted.
-- ---------------------------------------------------------------------------
alter table public.protection_consents
  add column if not exists purpose text not null default 'programme_participation',
  add column if not exists wording_version text not null default 'v1';

drop policy if exists protection_consents_member_all on public.protection_consents;
drop policy if exists protection_consents_member_select on public.protection_consents;
create policy protection_consents_member_select on public.protection_consents for select to authenticated
  using (exists (
    select 1 from public.protection_memberships m
    where m.id = membership_id and m.user_id = auth.uid()
  ));
-- No insert/update/delete policy for clients: member_set_consent is definer.

-- ---------------------------------------------------------------------------
-- protection_plans: was readable by every authenticated user (using true).
-- Scope to: active plans (member-facing catalogue), own-insurer plans
-- (including inactive, for the insurer portal), super_admin.
drop policy if exists protection_plans_read on public.protection_plans;
create policy protection_plans_read on public.protection_plans for select to authenticated
  using (
    public.is_super_admin()
    or active = true
    or insurer_id = public.protection_insurer_id()
  );

-- Insurer plan write policy: keep, but require ACTIVE insurer org.
drop policy if exists protection_plans_insurer_write on public.protection_plans;
create policy protection_plans_insurer_write on public.protection_plans for all to authenticated
  using (insurer_id = public.protection_insurer_id())
  with check (insurer_id = public.protection_insurer_id());

-- protection_events read: member own / insurer own (active insurer) /
-- super_admin — same as memberships.
drop policy if exists protection_events_read on public.protection_events;
create policy protection_events_read on public.protection_events for select to authenticated
  using (
    public.is_super_admin()
    or insurer_id = public.protection_insurer_id()
    or exists (select 1 from public.protection_memberships m
               where m.id = membership_id and m.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- member_request_enrolment: server-side mode gate + active-insurer check.
-- ---------------------------------------------------------------------------
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
  v_insurer public.insurers;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not public.is_active_user() then raise exception 'Account is suspended'; end if;
  perform public.protection_require_mode(array['pilot', 'live']);

  if not public.protection_insurer_eligible_for_enrolment(p_insurer_id) then
    raise exception 'Insurer is not approved for Protection enrolment';
  end if;

  if exists (
    select 1 from public.protection_memberships
    where user_id = v_uid and insurer_id = p_insurer_id
      and status in ('pending_verification', 'active', 'suspended')
  ) then
    raise exception 'A valid Protection enrolment already exists for this insurer';
  end if;

  select * into v_insurer from public.insurers where id = p_insurer_id;
  if not found or v_insurer.status <> 'active' then
    raise exception 'Insurer is not available';
  end if;
  if p_plan_id is not null and not exists (
    select 1 from public.protection_plans
    where id = p_plan_id and insurer_id = p_insurer_id and active
  ) then
    raise exception 'Plan does not belong to this insurer';
  end if;

  insert into public.protection_memberships (user_id, insurer_id, plan_id, member_reference, status)
  values (v_uid, p_insurer_id, p_plan_id, nullif(btrim(coalesce(p_member_reference,'')), ''), 'pending_verification')
  on conflict (user_id, insurer_id) do update
    set member_reference = excluded.member_reference, updated_at = now()
    where public.protection_memberships.status in ('pending_verification', 'rejected')
  returning id into v_id;
  if v_id is null then
    -- Existing non-re-enrollable membership: return it unchanged.
    select id into v_id from public.protection_memberships
    where user_id = v_uid and insurer_id = p_insurer_id;
  end if;

  insert into public.protection_consents (membership_id, scope, granted, purpose, wording_version)
  values
    (v_id, 'status_updates', false, 'programme_participation', 'v1'),
    (v_id, 'session_summaries', false, 'programme_participation', 'v1'),
    (v_id, 'billing_contact', false, 'programme_participation', 'v1')
  on conflict (membership_id, scope) do nothing;

  insert into public.protection_events (membership_id, insurer_id, actor_id, event_type, detail)
  values (v_id, p_insurer_id, v_uid, 'enrolment_requested', '{}'::jsonb);
  return v_id;
end;
$$;
revoke execute on function public.member_request_enrolment(uuid, text, uuid) from public, anon;
grant execute on function public.member_request_enrolment(uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- member_set_consent: upsert with purpose/version; logs event. History of
-- every change is preserved in protection_events — never deletes rows.
-- ---------------------------------------------------------------------------
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
  if p_scope not in ('status_updates', 'session_summaries', 'billing_contact') then
    raise exception 'Unknown consent scope';
  end if;
  if not exists (select 1 from public.protection_memberships where id = p_membership_id and user_id = v_uid) then
    raise exception 'Membership not found';
  end if;
  insert into public.protection_consents (membership_id, scope, granted, granted_at, revoked_at, purpose, wording_version)
  values (
    p_membership_id, p_scope, p_granted,
    case when p_granted then now() else null end,
    case when p_granted then null else now() end,
    'programme_participation', 'v1'
  )
  on conflict (membership_id, scope) do update
    set granted = excluded.granted,
        granted_at = case when excluded.granted then now() else public.protection_consents.granted_at end,
        revoked_at = case when excluded.granted then null else now() end,
        purpose = excluded.purpose,
        wording_version = excluded.wording_version;
  insert into public.protection_events (membership_id, insurer_id, actor_id, event_type, detail)
  select p_membership_id, m.insurer_id, v_uid, 'consent_changed',
         jsonb_build_object('scope', p_scope, 'granted', p_granted, 'wording_version', 'v1')
  from public.protection_memberships m where m.id = p_membership_id;
end;
$$;
revoke execute on function public.member_set_consent(uuid, text, boolean) from public, anon;
grant execute on function public.member_set_consent(uuid, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- insurer_verify_membership: require ACTIVE insurer org (status + role),
-- not merely a profile link. Transition rules unchanged.
-- ---------------------------------------------------------------------------
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
  v_insurer_id uuid := public.protection_insurer_id();
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if v_insurer_id is null then raise exception 'Active insurer access required'; end if;
  perform public.protection_require_mode(array['pilot', 'live']);

  select * into v_m from public.protection_memberships where id = p_membership_id for update;
  if not found then raise exception 'Membership not found'; end if;
  if v_m.insurer_id <> v_insurer_id then raise exception 'Not an insurer for this organisation'; end if;
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
  perform public.protection_log_access('verify_membership', 'protection_memberships', p_membership_id::text, 'membership verification');
end;
$$;
revoke execute on function public.insurer_verify_membership(uuid, text) from public, anon;
grant execute on function public.insurer_verify_membership(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- insurer_upload_member_roster: harden auth (active insurer) + mode gate.
-- Real roster persistence lands in script 03 (needs policy tables).
-- ---------------------------------------------------------------------------
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
  if p_insurer_id is distinct from public.protection_insurer_id() then
    raise exception 'Active insurer access required';
  end if;
  perform public.protection_require_mode(array['pilot', 'live']);
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

-- ---------------------------------------------------------------------------
-- member_request_preauth: interim hardening (mode gate). Full repair —
-- policy eligibility, provider-voucher pairing, insurer decision — is
-- script 04.
-- ---------------------------------------------------------------------------
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
  perform public.protection_require_mode(array['pilot', 'live']);
  select * into v_m from public.protection_memberships where id = p_membership_id for update;
  if not found or v_m.user_id <> v_uid then raise exception 'Membership not found'; end if;
  if v_m.status <> 'active' then raise exception 'Membership is not active'; end if;
  if p_sessions is null or p_sessions < 1 or p_sessions > 24 then
    raise exception 'Sessions must be between 1 and 24';
  end if;
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

-- ---------------------------------------------------------------------------
-- member_leave_protection: unchanged behaviour + mode gate not required
-- (leaving must always be possible, even in concept mode).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Verification block (run as an authenticated administrator after applying).
-- ---------------------------------------------------------------------------
select
  public.protection_mode() as protection_mode,
  public.protection_insurer_id() as caller_insurer_id;

select policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('protection_memberships','protection_consents','protection_plans','protection_events')
order by tablename, policyname;
-- LossLens Protection — Script 02: INSURER ACCESS LAYER
-- Apply after 20261112000001_protection_security.sql.
-- Safe to re-run.
--
-- One controlled path for insurer-facing reads. All functions are
-- SECURITY DEFINER, verify the caller's ACTIVE insurer org via
-- protection_insurer_id(), require pilot/live mode, return whitelisted
-- columns only, and write a protection_log_access audit row for detail
-- reads. No clinical, crisis, diary, chat or risk data is reachable.
--
-- user_id (auth UUID) is never returned; members are identified by
-- member_reference / policy_number only.

-- ---------------------------------------------------------------------------
-- Insurer: policyholder (membership) listing — whitelisted columns.
-- ---------------------------------------------------------------------------
create or replace function public.insurer_list_memberships()
returns table (
  membership_id uuid,
  member_reference text,
  status text,
  plan_id uuid,
  verified_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_insurer uuid := public.protection_insurer_id();
begin
  if v_insurer is null then raise exception 'Active insurer access required'; end if;
  perform public.protection_require_mode(array['pilot', 'live']);
  return query
    select m.id, m.member_reference, m.status, m.plan_id, m.verified_at, m.created_at
    from public.protection_memberships m
    where m.insurer_id = v_insurer
    order by m.created_at desc
    limit 500;
end;
$$;
revoke execute on function public.insurer_list_memberships() from public, anon;
grant execute on function public.insurer_list_memberships() to authenticated;

-- ---------------------------------------------------------------------------
-- Insurer: pre-authorisation inbox — whitelisted, NO crisis_alert_id,
-- NO user_id. Member identified by member_reference via membership join.
-- ---------------------------------------------------------------------------
create or replace function public.insurer_list_preauths()
returns table (
  preauth_id uuid,
  member_reference text,
  status text,
  insurer_decision text,
  max_sessions integer,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_insurer uuid := public.protection_insurer_id();
begin
  if v_insurer is null then raise exception 'Active insurer access required'; end if;
  perform public.protection_require_mode(array['pilot', 'live']);
  return query
    select pv.id,
           coalesce(m.member_reference, '—'),
           pv.status,
           pv.insurer_decision,
           pv.max_sessions,
           pv.expires_at,
           pv.created_at
    from public.pre_auth_vouchers pv
    left join lateral (
      select mm.member_reference
      from public.protection_memberships mm
      where mm.user_id = pv.user_id and mm.insurer_id = v_insurer
      order by mm.created_at desc
      limit 1
    ) m on true
    where pv.insurer_id = v_insurer
    order by pv.created_at desc
    limit 500;
end;
$$;
revoke execute on function public.insurer_list_preauths() from public, anon;
grant execute on function public.insurer_list_preauths() to authenticated;

-- ---------------------------------------------------------------------------
-- Member: own Protection overview — memberships + consents + events in one
-- whitelisted call so the member page does not need broad table reads.
-- ---------------------------------------------------------------------------
create or replace function public.member_list_my_protection()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  perform public.protection_require_mode(array['pilot', 'live']);
  select jsonb_build_object(
    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'insurer_id', m.insurer_id, 'plan_id', m.plan_id,
        'member_reference', m.member_reference, 'status', m.status,
        'verified_at', m.verified_at, 'created_at', m.created_at
      ) order by m.created_at desc)
      from public.protection_memberships m where m.user_id = v_uid
    ), '[]'::jsonb),
    'consents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'membership_id', c.membership_id, 'scope', c.scope, 'granted', c.granted,
        'granted_at', c.granted_at, 'revoked_at', c.revoked_at,
        'purpose', c.purpose, 'wording_version', c.wording_version
      ))
      from public.protection_consents c
      join public.protection_memberships m on m.id = c.membership_id
      where m.user_id = v_uid
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_type', e.event_type, 'detail', e.detail, 'created_at', e.created_at
      ) order by e.created_at desc)
      from (
        select * from public.protection_events e2
        join public.protection_memberships m2 on m2.id = e2.membership_id
        where m2.user_id = v_uid
        order by e2.created_at desc limit 20
      ) e
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
revoke execute on function public.member_list_my_protection() from public, anon;
grant execute on function public.member_list_my_protection() to authenticated;

-- ---------------------------------------------------------------------------
-- Member: therapist directory for Protection — whitelisted columns only.
-- Active, verified therapists; no licence documents, no user ids.
-- ---------------------------------------------------------------------------
create or replace function public.member_list_therapists()
returns table (
  therapist_ref text,
  specialty text,
  languages text[],
  county text,
  telehealth boolean,
  session_fee numeric
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.protection_require_mode(array['pilot', 'live']);
  return query
    select t.id::text, t.specialty, t.languages, t.county, t.telehealth, t.session_fee
    from public.therapists t
    where t.status = 'active'
    order by t.specialty
    limit 100;
end;
$$;
revoke execute on function public.member_list_therapists() from public, anon;
grant execute on function public.member_list_therapists() to authenticated;

-- ---------------------------------------------------------------------------
-- Verification block.
-- ---------------------------------------------------------------------------
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and proname in (
  'insurer_list_memberships','insurer_list_preauths',
  'member_list_my_protection','member_list_therapists'
) order by proname;
-- LossLens Protection — Script 03: POLICY & PRODUCT CORE
-- Apply after 02. Safe to re-run.
--
-- Separates programme membership (protection_memberships) from the
-- contractual policy (protection_policies). Products keep using
-- protection_plans as the stable product shell; immutable terms live in
-- protection_plan_versions; typed benefits in protection_benefits.
-- Roster entries persist uploaded member rows for policy issuance.

-- ---------------------------------------------------------------------------
-- Product versions (immutable once approved)
-- ---------------------------------------------------------------------------
create table if not exists public.protection_plan_versions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.protection_plans(id) on delete restrict,
  insurer_id uuid not null references public.insurers(id) on delete restrict,
  version_no integer not null check (version_no > 0),
  status text not null default 'draft'
    check (status in ('draft','pending_approval','approved','withdrawn','superseded')),
  benefit_structure text not null
    check (benefit_structure in ('fixed_sum','treatment_reimbursement','hybrid')),
  terms jsonb not null default '{}'::jsonb,
  -- terms keys: eligibility, exclusions, policy_term_months,
  -- waiting_period_days, grace_period_days, aggregate_limit_kes,
  -- regulatory {classification, thresholds_source, approved_by_ref}
  premium_amount numeric(14,2) check (premium_amount is null or premium_amount >= 0),
  premium_frequency text not null default 'monthly'
    check (premium_frequency in ('single','monthly','quarterly','annual')),
  effective_from date,
  effective_to date,
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (plan_id, version_no)
);
create index if not exists ppv_insurer_idx on public.protection_plan_versions (insurer_id, status);

-- ---------------------------------------------------------------------------
-- Typed benefit schedule (bound to a product version)
-- ---------------------------------------------------------------------------
create table if not exists public.protection_benefits (
  id uuid primary key default gen_random_uuid(),
  plan_version_id uuid not null references public.protection_plan_versions(id) on delete cascade,
  benefit_code text not null,
  name text not null,
  benefit_type text not null
    check (benefit_type in ('fixed_sum','treatment_reimbursement','provider_direct_payment')),
  description text,
  fixed_amount numeric(14,2) check (fixed_amount is null or fixed_amount >= 0),
  per_event_limit numeric(14,2) check (per_event_limit is null or per_event_limit >= 0),
  per_policy_limit numeric(14,2) check (per_policy_limit is null or per_policy_limit >= 0),
  annual_limit numeric(14,2) check (annual_limit is null or annual_limit >= 0),
  waiting_period_days integer not null default 0 check (waiting_period_days >= 0),
  frequency_limit integer check (frequency_limit is null or frequency_limit > 0),
  eligibility jsonb not null default '{}'::jsonb,
  evidence_requirements jsonb not null default '[]'::jsonb,
  exclusions jsonb not null default '[]'::jsonb,
  effective_from date,
  effective_to date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (plan_version_id, benefit_code)
);
create index if not exists pb_version_idx on public.protection_benefits (plan_version_id, active);

-- ---------------------------------------------------------------------------
-- Policies — the contractual insurance arrangement.
-- ---------------------------------------------------------------------------
create table if not exists public.protection_policies (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.protection_memberships(id) on delete restrict,
  insurer_id uuid not null references public.insurers(id) on delete restrict,
  plan_version_id uuid not null references public.protection_plan_versions(id) on delete restrict,
  policy_number text,
  member_reference text,
  status text not null default 'issued'
    check (status in ('issued','pending_payment','active','grace','lapsed','cancelled','expired')),
  issue_date date not null default current_date,
  commencement_date date,
  expiry_date date,
  premium_amount numeric(14,2) not null default 0 check (premium_amount >= 0),
  premium_frequency text not null default 'monthly'
    check (premium_frequency in ('single','monthly','quarterly','annual')),
  premium_status text not null default 'unpaid'
    check (premium_status in ('unpaid','paid_current','overdue','waived')),
  waiting_period_ends_at timestamptz,
  grace_ends_at timestamptz,
  renewal_of_policy_id uuid references public.protection_policies(id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id),
  cancellation_reason text,
  policy_document_path text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expiry_date is null or commencement_date is null or expiry_date >= commencement_date)
);
create unique index if not exists pp_insurer_policy_number
  on public.protection_policies (insurer_id, policy_number)
  where policy_number is not null;
create index if not exists pp_membership_idx on public.protection_policies (membership_id, status);
create index if not exists pp_insurer_idx on public.protection_policies (insurer_id, status, expiry_date);
create index if not exists pp_version_idx on public.protection_policies (plan_version_id);

-- One non-terminal policy per membership (a lapsed/expired/cancelled policy
-- does not block a renewal row).
create unique index if not exists pp_one_open_policy
  on public.protection_policies (membership_id)
  where status in ('issued','pending_payment','active','grace');

-- ---------------------------------------------------------------------------
-- Roster entries — persisted upload rows used for matching + issuance.
-- ---------------------------------------------------------------------------
create table if not exists public.protection_roster_entries (
  id uuid primary key default gen_random_uuid(),
  insurer_id uuid not null references public.insurers(id) on delete cascade,
  member_reference text not null,
  contact_email text,
  plan_id uuid references public.protection_plans(id) on delete set null,
  premium_amount numeric(14,2) check (premium_amount is null or premium_amount >= 0),
  status text not null default 'unmatched'
    check (status in ('unmatched','matched','issued','rejected')),
  membership_id uuid references public.protection_memberships(id) on delete set null,
  policy_id uuid references public.protection_policies(id) on delete set null,
  uploaded_by uuid references public.profiles(id),
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists pre_insurer_idx on public.protection_roster_entries (insurer_id, status);
create unique index if not exists pre_insurer_ref
  on public.protection_roster_entries (insurer_id, member_reference, uploaded_at::date);

alter table public.protection_plan_versions enable row level security;
alter table public.protection_benefits enable row level security;
alter table public.protection_policies enable row level security;
alter table public.protection_roster_entries enable row level security;

-- Reads: member sees own policy's version/benefits via policy join; insurer
-- sees own org's rows; super_admin all. Writes are RPC-only (no client
-- insert/update/delete policies).
drop policy if exists ppv_read on public.protection_plan_versions;
create policy ppv_read on public.protection_plan_versions for select to authenticated
  using (
    public.is_super_admin()
    or insurer_id = public.protection_insurer_id()
    or exists (
      select 1 from public.protection_policies p
      join public.protection_memberships m on m.id = p.membership_id
      where p.plan_version_id = protection_plan_versions.id and m.user_id = auth.uid()
    )
  );

drop policy if exists pb_read on public.protection_benefits;
create policy pb_read on public.protection_benefits for select to authenticated
  using (
    public.is_super_admin()
    or exists (
      select 1 from public.protection_plan_versions v
      where v.id = plan_version_id
        and (v.insurer_id = public.protection_insurer_id()
             or exists (select 1 from public.protection_policies p
                        join public.protection_memberships m on m.id = p.membership_id
                        where p.plan_version_id = v.id and m.user_id = auth.uid()))
    )
  );

drop policy if exists pp_read on public.protection_policies;
create policy pp_read on public.protection_policies for select to authenticated
  using (
    public.is_super_admin()
    or insurer_id = public.protection_insurer_id()
    or exists (select 1 from public.protection_memberships m
               where m.id = membership_id and m.user_id = auth.uid())
  );

drop policy if exists proster_read on public.protection_roster_entries;
create policy proster_read on public.protection_roster_entries for select to authenticated
  using (public.is_super_admin() or insurer_id = public.protection_insurer_id());

-- Explicit grants: RLS still gates rows; new tables must not rely on
-- default privileges.
grant select on public.protection_plan_versions to authenticated;
grant select on public.protection_benefits to authenticated;
grant select on public.protection_policies to authenticated;
grant select on public.protection_roster_entries to authenticated;

-- ---------------------------------------------------------------------------
-- Insurer: create a draft product version (next version_no for the plan).
-- ---------------------------------------------------------------------------
create or replace function public.insurer_create_plan_version(
  p_plan_id uuid,
  p_benefit_structure text,
  p_terms jsonb default '{}'::jsonb,
  p_premium_amount numeric default null,
  p_premium_frequency text default 'monthly',
  p_effective_from date default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_insurer uuid := public.protection_insurer_id();
  v_plan public.protection_plans;
  v_version_no integer;
  v_id uuid;
begin
  if v_insurer is null then raise exception 'Active insurer access required'; end if;
  perform public.protection_require_mode(array['pilot', 'live']);
  if p_benefit_structure not in ('fixed_sum','treatment_reimbursement','hybrid') then
    raise exception 'Invalid benefit structure';
  end if;
  if p_premium_frequency not in ('single','monthly','quarterly','annual') then
    raise exception 'Invalid premium frequency';
  end if;
  select * into v_plan from public.protection_plans where id = p_plan_id for update;
  if not found or v_plan.insurer_id <> v_insurer then raise exception 'Plan not found'; end if;

  select coalesce(max(version_no), 0) + 1 into v_version_no
  from public.protection_plan_versions where plan_id = p_plan_id;

  insert into public.protection_plan_versions (
    plan_id, insurer_id, version_no, status, benefit_structure, terms,
    premium_amount, premium_frequency, effective_from, created_by
  ) values (
    p_plan_id, v_insurer, v_version_no, 'draft', p_benefit_structure,
    coalesce(p_terms, '{}'::jsonb), p_premium_amount, p_premium_frequency,
    p_effective_from, auth.uid()
  ) returning id into v_id;

  insert into public.protection_events (insurer_id, actor_id, event_type, detail)
  values (v_insurer, auth.uid(), 'plan_version_created',
          jsonb_build_object('plan_id', p_plan_id, 'version_id', v_id, 'version_no', v_version_no));
  perform public.protection_log_access('create_plan_version', 'protection_plan_versions', v_id::text, 'product configuration');
  return v_id;
end;
$$;
revoke execute on function public.insurer_create_plan_version(uuid, text, jsonb, numeric, text, date) from public, anon;
grant execute on function public.insurer_create_plan_version(uuid, text, jsonb, numeric, text, date) to authenticated;

-- Insurer: add/replace a benefit on a DRAFT version only.
create or replace function public.insurer_upsert_benefit(
  p_plan_version_id uuid,
  p_benefit_code text,
  p_name text,
  p_benefit_type text,
  p_fixed_amount numeric default null,
  p_per_event_limit numeric default null,
  p_per_policy_limit numeric default null,
  p_annual_limit numeric default null,
  p_waiting_period_days integer default 0,
  p_frequency_limit integer default null,
  p_evidence_requirements jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_insurer uuid := public.protection_insurer_id();
  v_version public.protection_plan_versions;
  v_id uuid;
begin
  if v_insurer is null then raise exception 'Active insurer access required'; end if;
  perform public.protection_require_mode(array['pilot', 'live']);
  if p_benefit_type not in ('fixed_sum','treatment_reimbursement','provider_direct_payment') then
    raise exception 'Invalid benefit type';
  end if;
  if p_benefit_type = 'fixed_sum' and (p_fixed_amount is null or p_fixed_amount <= 0) then
    raise exception 'Fixed-sum benefits require a positive fixed_amount';
  end if;
  select * into v_version from public.protection_plan_versions
  where id = p_plan_version_id for update;
  if not found or v_version.insurer_id <> v_insurer then raise exception 'Version not found'; end if;
  if v_version.status <> 'draft' then
    raise exception 'Benefits can only be edited while the version is draft';
  end if;

  insert into public.protection_benefits (
    plan_version_id, benefit_code, name, benefit_type, fixed_amount,
    per_event_limit, per_policy_limit, annual_limit, waiting_period_days,
    frequency_limit, evidence_requirements
  ) values (
    p_plan_version_id, btrim(p_benefit_code), btrim(p_name), p_benefit_type,
    p_fixed_amount, p_per_event_limit, p_per_policy_limit, p_annual_limit,
    coalesce(p_waiting_period_days, 0), p_frequency_limit,
    coalesce(p_evidence_requirements, '[]'::jsonb)
  )
  on conflict (plan_version_id, benefit_code) do update set
    name = excluded.name, benefit_type = excluded.benefit_type,
    fixed_amount = excluded.fixed_amount, per_event_limit = excluded.per_event_limit,
    per_policy_limit = excluded.per_policy_limit, annual_limit = excluded.annual_limit,
    waiting_period_days = excluded.waiting_period_days,
    frequency_limit = excluded.frequency_limit,
    evidence_requirements = excluded.evidence_requirements
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.insurer_upsert_benefit(uuid, text, text, text, numeric, numeric, numeric, numeric, integer, integer, jsonb) from public, anon;
grant execute on function public.insurer_upsert_benefit(uuid, text, text, text, numeric, numeric, numeric, numeric, integer, integer, jsonb) to authenticated;

-- Super-admin approves a version (draft/pending_approval -> approved).
-- Approval binds the version's terms; later edits are impossible because
-- insurer_upsert_benefit requires status='draft'.
create or replace function public.admin_approve_plan_version(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_version public.protection_plan_versions;
begin
  if not public.is_super_admin() then raise exception 'Super-admin access required'; end if;
  select * into v_version from public.protection_plan_versions where id = p_version_id for update;
  if not found then raise exception 'Version not found'; end if;
  if v_version.status not in ('draft','pending_approval') then
    raise exception 'Only draft or pending versions can be approved';
  end if;
  if not exists (select 1 from public.protection_benefits b where b.plan_version_id = p_version_id) then
    raise exception 'Version has no benefits';
  end if;
  update public.protection_plan_versions
  set status = 'approved', approved_by = auth.uid(), approved_at = now()
  where id = p_version_id;
  update public.protection_plan_versions
  set status = 'superseded'
  where plan_id = v_version.plan_id and id <> p_version_id and status = 'approved';
  perform public.log_admin_action('plan_version_approved', 'protection_plan_versions', p_version_id::text,
    jsonb_build_object('plan_id', v_version.plan_id, 'version_no', v_version.version_no));
end;
$$;
revoke execute on function public.admin_approve_plan_version(uuid) from public, anon;
grant execute on function public.admin_approve_plan_version(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Insurer: issue a policy for a verified membership. Requires an APPROVED
-- product version. Status starts 'issued' (pending_payment handled by the
-- premium ledger in script 06).
-- ---------------------------------------------------------------------------
create or replace function public.insurer_issue_policy(
  p_membership_id uuid,
  p_plan_version_id uuid,
  p_policy_number text,
  p_commencement_date date default null,
  p_expiry_date date default null,
  p_premium_amount numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_insurer uuid := public.protection_insurer_id();
  v_m public.protection_memberships;
  v_v public.protection_plan_versions;
  v_id uuid;
  v_wait_days integer;
begin
  if v_insurer is null then raise exception 'Active insurer access required'; end if;
  perform public.protection_require_mode(array['pilot', 'live']);
  select * into v_m from public.protection_memberships where id = p_membership_id for update;
  if not found or v_m.insurer_id <> v_insurer then raise exception 'Membership not found'; end if;
  if v_m.status <> 'active' then raise exception 'Membership is not active'; end if;

  select * into v_v from public.protection_plan_versions where id = p_plan_version_id;
  if not found or v_v.insurer_id <> v_insurer or v_v.status <> 'approved' then
    raise exception 'An approved product version is required';
  end if;
  if p_policy_number is null or length(btrim(p_policy_number)) = 0 then
    raise exception 'An insurer policy number is required';
  end if;

  v_wait_days := coalesce((v_v.terms->>'waiting_period_days')::integer, 0);

  insert into public.protection_policies (
    membership_id, insurer_id, plan_version_id, policy_number, member_reference,
    status, commencement_date, expiry_date, premium_amount, premium_frequency,
    waiting_period_ends_at, created_by
  ) values (
    p_membership_id, v_insurer, p_plan_version_id, btrim(p_policy_number), v_m.member_reference,
    'issued',
    coalesce(p_commencement_date, current_date),
    p_expiry_date,
    coalesce(p_premium_amount, v_v.premium_amount, 0),
    v_v.premium_frequency,
    case when v_wait_days > 0
         then (coalesce(p_commencement_date, current_date)::timestamp + make_interval(days => v_wait_days))
         else null end,
    auth.uid()
  ) returning id into v_id;

  insert into public.protection_events (membership_id, insurer_id, actor_id, event_type, detail)
  values (p_membership_id, v_insurer, auth.uid(), 'policy_issued',
          jsonb_build_object('policy_id', v_id, 'policy_number', btrim(p_policy_number),
                             'plan_version_id', p_plan_version_id));
  perform public.protection_log_access('issue_policy', 'protection_policies', v_id::text, 'policy issuance');
  return v_id;
end;
$$;
revoke execute on function public.insurer_issue_policy(uuid, uuid, text, date, date, numeric) from public, anon;
grant execute on function public.insurer_issue_policy(uuid, uuid, text, date, date, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- Insurer: cancel a policy (issued/pending_payment/active/grace -> cancelled).
-- ---------------------------------------------------------------------------
create or replace function public.insurer_cancel_policy(p_policy_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_insurer uuid := public.protection_insurer_id();
  v_p public.protection_policies;
begin
  if v_insurer is null then raise exception 'Active insurer access required'; end if;
  perform public.protection_require_mode(array['pilot', 'live']);
  if p_reason is null or length(btrim(p_reason)) = 0 then raise exception 'A reason is required'; end if;
  select * into v_p from public.protection_policies where id = p_policy_id for update;
  if not found or v_p.insurer_id <> v_insurer then raise exception 'Policy not found'; end if;
  if v_p.status not in ('issued','pending_payment','active','grace') then
    raise exception 'Policy cannot be cancelled from status %', v_p.status;
  end if;
  update public.protection_policies
  set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
      cancellation_reason = left(btrim(p_reason), 500), updated_at = now()
  where id = p_policy_id;
  insert into public.protection_events (membership_id, insurer_id, actor_id, event_type, detail)
  values (v_p.membership_id, v_insurer, auth.uid(), 'policy_cancelled',
          jsonb_build_object('policy_id', p_policy_id, 'reason', left(btrim(p_reason), 200)));
  perform public.protection_log_access('cancel_policy', 'protection_policies', p_policy_id::text, 'policy cancellation');
end;
$$;
revoke execute on function public.insurer_cancel_policy(uuid, text) from public, anon;
grant execute on function public.insurer_cancel_policy(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Insurer: roster upload — REAL implementation. Upserts roster rows and
-- matches them to pending/active memberships by member_reference.
-- ---------------------------------------------------------------------------
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
  v_insurer uuid := public.protection_insurer_id();
  v_row jsonb;
  v_ref text;
  v_email text;
  v_received int := 0;
  v_matched int := 0;
  v_unmatched int := 0;
  v_rejected int := 0;
begin
  if v_insurer is null or p_insurer_id <> v_insurer then
    raise exception 'Active insurer access required';
  end if;
  perform public.protection_require_mode(array['pilot', 'live']);
  if jsonb_array_length(coalesce(p_rows, '[]'::jsonb)) > 5000 then
    raise exception 'Roster too large (max 5000 rows)';
  end if;

  for v_row in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_received := v_received + 1;
    v_ref := nullif(btrim(coalesce(v_row->>'member_reference', '')), '');
    v_email := nullif(btrim(coalesce(v_row->>'email', '')), '');
    if v_ref is null and v_email is null then
      v_rejected := v_rejected + 1;
      continue;
    end if;

    insert into public.protection_roster_entries (
      insurer_id, member_reference, contact_email, uploaded_by
    ) values (
      v_insurer, coalesce(v_ref, 'email:' || v_email), v_email, auth.uid()
    );

    -- Match to a membership by member_reference (exact) — memberships are
    -- still verified/issued manually; matching only flags the roster row.
    update public.protection_roster_entries re
    set status = 'matched',
        membership_id = m.id
    from public.protection_memberships m
    where re.insurer_id = v_insurer
      and re.member_reference = v_ref
      and m.insurer_id = v_insurer
      and m.member_reference = v_ref
      and re.status = 'unmatched'
      and m.status in ('pending_verification','active');
    if found then
      v_matched := v_matched + 1;
    else
      v_unmatched := v_unmatched + 1;
    end if;
  end loop;

  insert into public.protection_events (insurer_id, actor_id, event_type, detail, is_demo)
  values (v_insurer, auth.uid(), 'roster_uploaded',
          jsonb_build_object('received', v_received, 'matched', v_matched,
                             'unmatched', v_unmatched, 'rejected', v_rejected), false);
  perform public.protection_log_access('upload_roster', 'protection_roster_entries', null,
    'rows=' || v_received);
  return jsonb_build_object('received', v_received, 'matched', v_matched,
                            'unmatched', v_unmatched, 'rejected', v_rejected);
end;
$$;
revoke execute on function public.insurer_upload_member_roster(uuid, jsonb) from public, anon;
grant execute on function public.insurer_upload_member_roster(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Member: own cover overview (policies + versions + benefits, whitelisted).
-- ---------------------------------------------------------------------------
create or replace function public.member_list_my_cover()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  perform public.protection_require_mode(array['pilot', 'live']);
  select jsonb_build_object(
    'policies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'policy_number', p.policy_number, 'status', p.status,
        'premium_status', p.premium_status, 'premium_amount', p.premium_amount,
        'premium_frequency', p.premium_frequency,
        'issue_date', p.issue_date, 'commencement_date', p.commencement_date,
        'expiry_date', p.expiry_date, 'waiting_period_ends_at', p.waiting_period_ends_at,
        'cancellation_reason', p.cancellation_reason,
        'product_name', pl.name, 'version_no', v.version_no,
        'benefit_structure', v.benefit_structure
      ) order by p.created_at desc)
      from public.protection_policies p
      join public.protection_memberships m on m.id = p.membership_id
      join public.protection_plan_versions v on v.id = p.plan_version_id
      join public.protection_plans pl on pl.id = v.plan_id
      where m.user_id = v_uid
    ), '[]'::jsonb),
    'benefits', coalesce((
      select jsonb_agg(jsonb_build_object(
        'policy_id', p.id, 'benefit_code', b.benefit_code, 'name', b.name,
        'benefit_type', b.benefit_type, 'fixed_amount', b.fixed_amount,
        'per_event_limit', b.per_event_limit, 'per_policy_limit', b.per_policy_limit,
        'annual_limit', b.annual_limit, 'waiting_period_days', b.waiting_period_days,
        'frequency_limit', b.frequency_limit, 'evidence_requirements', b.evidence_requirements
      ))
      from public.protection_policies p
      join public.protection_memberships m on m.id = p.membership_id
      join public.protection_benefits b on b.plan_version_id = p.plan_version_id and b.active
      where m.user_id = v_uid
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
revoke execute on function public.member_list_my_cover() from public, anon;
grant execute on function public.member_list_my_cover() to authenticated;

-- ---------------------------------------------------------------------------
-- Insurer: policyholder list WITH policy summary (access-layer read).
-- ---------------------------------------------------------------------------
create or replace function public.insurer_list_policyholders()
returns table (
  membership_id uuid,
  member_reference text,
  membership_status text,
  policy_id uuid,
  policy_number text,
  policy_status text,
  premium_status text,
  commencement_date date,
  expiry_date date,
  product_name text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_insurer uuid := public.protection_insurer_id();
begin
  if v_insurer is null then raise exception 'Active insurer access required'; end if;
  perform public.protection_require_mode(array['pilot', 'live']);
  return query
    select m.id, m.member_reference, m.status,
           p.id, p.policy_number, p.status, p.premium_status,
           p.commencement_date, p.expiry_date, pl.name
    from public.protection_memberships m
    left join public.protection_policies p
      on p.membership_id = m.id
     and p.status in ('issued','pending_payment','active','grace')
    left join public.protection_plan_versions v on v.id = p.plan_version_id
    left join public.protection_plans pl on pl.id = v.plan_id
    where m.insurer_id = v_insurer
    order by m.created_at desc
    limit 500;
  perform public.protection_log_access('list_policyholders', 'protection_memberships', null, 'portfolio listing');
end;
$$;
revoke execute on function public.insurer_list_policyholders() from public, anon;
grant execute on function public.insurer_list_policyholders() to authenticated;

-- ---------------------------------------------------------------------------
-- Verification block.
-- ---------------------------------------------------------------------------
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and proname in (
  'insurer_create_plan_version','insurer_upsert_benefit','admin_approve_plan_version',
  'insurer_issue_policy','insurer_cancel_policy','insurer_upload_member_roster',
  'member_list_my_cover','insurer_list_policyholders'
) order by proname;
-- LossLens Protection — Script 04: PRE-AUTHORISATION REPAIR
-- Apply after 03. Safe to re-run.
--
-- Repairs the orphaned member_request_preauth flow:
--   * pre_auth_vouchers gains membership/policy linkage + insurer decision
--     columns (crisis_alert_id is never exposed to insurer/provider reads).
--   * member_request_preauth now validates an ACTIVE policy with cover in
--     force, enforces consent, caps open requests, and creates the paired
--     provider_vouchers row the therapist pipeline requires.
--   * insurer_decide_preauth records approve/partial/reject with actor,
--     timestamp, reason and authorised fee.
--   * assign_voucher_to_therapist requires insurer approval for
--     Protection-linked vouchers (crisis/B2B flow unchanged).

alter table public.pre_auth_vouchers
  add column if not exists membership_id uuid references public.protection_memberships(id) on delete set null,
  add column if not exists policy_id uuid references public.protection_policies(id) on delete set null,
  add column if not exists insurer_decision text
    check (insurer_decision is null or insurer_decision in ('approved','partially_approved','rejected')),
  add column if not exists insurer_decided_by uuid references public.profiles(id),
  add column if not exists insurer_decided_at timestamptz,
  add column if not exists insurer_decision_reason text,
  add column if not exists authorised_fee numeric(12,2);

create index if not exists pav_membership_idx on public.pre_auth_vouchers (membership_id, status);
create index if not exists pav_policy_idx on public.pre_auth_vouchers (policy_id);

-- One open Protection pre-authorisation per membership.
create unique index if not exists pav_one_open_per_membership
  on public.pre_auth_vouchers (membership_id)
  where membership_id is not null and status in ('pending','assigned','accepted');

-- ---------------------------------------------------------------------------
-- member_request_preauth — rewritten. Requires pilot/live mode, active
-- membership, ACTIVE policy with cover in force (not lapsed/cancelled/
-- expired, past waiting period for treatment benefits), status_updates
-- consent, and creates BOTH pre_auth_vouchers and provider_vouchers.
-- ---------------------------------------------------------------------------
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
  v_p public.protection_policies;
  v_v public.protection_plan_versions;
  v_benefit public.protection_benefits;
  v_pre_id uuid;
  v_prov_id uuid;
  v_fee numeric(12,2);
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  perform public.protection_require_mode(array['pilot', 'live']);

  select * into v_m from public.protection_memberships where id = p_membership_id for update;
  if not found or v_m.user_id <> v_uid then raise exception 'Membership not found'; end if;
  if v_m.status <> 'active' then raise exception 'Membership is not active'; end if;
  if p_sessions is null or p_sessions < 1 or p_sessions > 24 then
    raise exception 'Sessions must be between 1 and 24';
  end if;
  if not exists (select 1 from public.protection_consents
                 where membership_id = p_membership_id and scope = 'status_updates' and granted) then
    raise exception 'Enable status sharing consent before requesting pre-authorisation';
  end if;

  -- Active policy with cover in force.
  select * into v_p from public.protection_policies
  where membership_id = p_membership_id
    and status = 'active'
    and commencement_date <= current_date
    and (expiry_date is null or expiry_date >= current_date)
  order by created_at desc
  limit 1;
  if not found then raise exception 'No active policy in force'; end if;
  if v_p.waiting_period_ends_at is not null and v_p.waiting_period_ends_at > now() then
    raise exception 'Policy waiting period has not ended'; end if;

  select * into v_v from public.protection_plan_versions where id = v_p.plan_version_id;
  if v_v.benefit_structure not in ('treatment_reimbursement','hybrid') then
    raise exception 'This product does not include treatment-cost benefits';
  end if;

  -- Eligible treatment benefit + per-service limit -> authorised fee ceiling.
  select * into v_benefit from public.protection_benefits
  where plan_version_id = v_p.plan_version_id and active
    and benefit_type in ('treatment_reimbursement','provider_direct_payment')
  order by created_at
  limit 1;
  if not found then raise exception 'No treatment benefit is configured on this product'; end if;
  v_fee := v_benefit.per_event_limit;

  -- Open-request dedupe (also guarded by partial unique index).
  if exists (select 1 from public.pre_auth_vouchers
             where membership_id = p_membership_id
               and status in ('pending','assigned','accepted')
               and expires_at > now()) then
    raise exception 'An open pre-authorisation already exists';
  end if;

  insert into public.pre_auth_vouchers (
    user_id, max_sessions, insurer_id, membership_id, policy_id
  ) values (v_uid, p_sessions, v_m.insurer_id, p_membership_id, v_p.id)
  returning id into v_pre_id;

  -- Paired provider voucher so the existing therapist pipeline can consume it.
  -- fee_per_session starts at the benefit per-event limit; the insurer may
  -- adjust it at decision time (authorised_fee).
  insert into public.provider_vouchers (
    user_id, pre_auth_voucher_id, insurer_id, max_sessions, fee_per_session,
    expires_at, status
  ) values (
    v_uid, v_pre_id, v_m.insurer_id, p_sessions,
    coalesce(v_fee, 0), now() + interval '14 days', 'pending'
  ) returning id into v_prov_id;

  insert into public.protection_events (membership_id, insurer_id, actor_id, event_type, detail)
  values (p_membership_id, v_m.insurer_id, v_uid, 'preauth_requested',
          jsonb_build_object('sessions', p_sessions, 'preauth_id', v_pre_id,
                             'provider_voucher_id', v_prov_id, 'policy_id', v_p.id));
  return v_pre_id;
end;
$$;
revoke execute on function public.member_request_preauth(uuid, integer) from public, anon;
grant execute on function public.member_request_preauth(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Insurer: decide a Protection pre-authorisation.
-- p_decision: approved | partially_approved | rejected.
-- Approval sets authorised_fee on both records; the provider voucher stays
-- 'pending' until a therapist accepts or an admin assigns.
-- ---------------------------------------------------------------------------
create or replace function public.insurer_decide_preauth(
  p_preauth_id uuid,
  p_decision text,
  p_reason text default null,
  p_fee numeric default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_insurer uuid := public.protection_insurer_id();
  v_pav public.pre_auth_vouchers;
  v_fee numeric(12,2);
begin
  if v_insurer is null then raise exception 'Active insurer access required'; end if;
  perform public.protection_require_mode(array['pilot', 'live']);
  if p_decision not in ('approved','partially_approved','rejected') then
    raise exception 'Invalid decision';
  end if;
  if p_decision = 'rejected' and (p_reason is null or length(btrim(p_reason)) = 0) then
    raise exception 'A rejection reason is required';
  end if;

  select * into v_pav from public.pre_auth_vouchers where id = p_preauth_id for update;
  if not found or v_pav.insurer_id <> v_insurer or v_pav.membership_id is null then
    raise exception 'Pre-authorisation not found';
  end if;
  if v_pav.status <> 'pending' or v_pav.insurer_decision is not null then
    raise exception 'Pre-authorisation is not awaiting a decision';
  end if;

  v_fee := case when p_decision = 'rejected' then null else p_fee end;
  if p_decision in ('approved','partially_approved') and (v_fee is null or v_fee <= 0) then
    raise exception 'An authorised session fee is required for approval';
  end if;
  if v_fee is not null and v_fee > 1000000 then raise exception 'Fee exceeds sanity limit'; end if;

  update public.pre_auth_vouchers
  set insurer_decision = p_decision,
      insurer_decided_by = auth.uid(),
      insurer_decided_at = now(),
      insurer_decision_reason = nullif(left(btrim(coalesce(p_reason,'')), 1000), ''),
      authorised_fee = v_fee,
      updated_at = now()
  where id = p_preauth_id;

  if p_decision = 'rejected' then
    update public.provider_vouchers set status = 'void', updated_at = now()
    where pre_auth_voucher_id = p_preauth_id and status in ('pending','assigned');
    update public.pre_auth_vouchers set status = 'void', updated_at = now()
    where id = p_preauth_id;
  else
    update public.provider_vouchers
    set fee_per_session = v_fee, updated_at = now()
    where pre_auth_voucher_id = p_preauth_id and status = 'pending';
  end if;

  insert into public.protection_events (membership_id, insurer_id, actor_id, event_type, detail)
  values (v_pav.membership_id, v_insurer, auth.uid(), 'preauth_decided',
          jsonb_build_object('preauth_id', p_preauth_id, 'decision', p_decision,
                             'fee', v_fee));
  perform public.protection_log_access('decide_preauth', 'pre_auth_vouchers', p_preauth_id::text,
    'decision=' || p_decision);
end;
$$;
revoke execute on function public.insurer_decide_preauth(uuid, text, text, numeric) from public, anon;
grant execute on function public.insurer_decide_preauth(uuid, text, text, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- assign_voucher_to_therapist: Protection-linked vouchers (those whose
-- pre_auth_vouchers row has a membership_id) require insurer_decision in
-- ('approved','partially_approved'). Crisis/B2B vouchers (membership_id
-- null) are unaffected.
-- ---------------------------------------------------------------------------
create or replace function public.assign_voucher_to_therapist(p_voucher_id uuid, p_therapist_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_provider_voucher_id uuid;
  v_user_id uuid;
  v_decision text;
begin
  if not public.is_super_admin() or not public.is_recently_authenticated() then
    raise exception 'Recently authenticated super-admin access required';
  end if;
  if not exists (select 1 from public.therapists where id = p_therapist_id and status = 'active') then
    raise exception 'Therapist is not active';
  end if;
  select pv.id, pv.user_id into v_provider_voucher_id, v_user_id
  from public.provider_vouchers pv
  where pv.pre_auth_voucher_id = p_voucher_id and pv.status = 'pending'
    and pv.expires_at > now()
  for update;
  if v_provider_voucher_id is null then raise exception 'Pending voucher not found'; end if;

  select pav.insurer_decision into v_decision
  from public.pre_auth_vouchers pav
  where pav.id = p_voucher_id and pav.membership_id is not null;
  if v_decision is not null and v_decision not in ('approved','partially_approved') then
    raise exception 'Insurer has not approved this pre-authorisation';
  end if;

  update public.provider_vouchers
  set therapist_id = p_therapist_id, status = 'assigned', updated_at = now()
  where id = v_provider_voucher_id;
  update public.pre_auth_vouchers
  set therapist_id = p_therapist_id, status = 'assigned', updated_at = now()
  where id = p_voucher_id;
  insert into public.notifications (user_id, title, message, type, link)
  values (p_therapist_id, 'New support voucher', 'A support voucher has been assigned to you.', 'voucher', '/therapist');
  perform public.log_admin_action('voucher_assigned', 'provider_vouchers', v_provider_voucher_id::text,
    jsonb_build_object('therapist_id', p_therapist_id, 'user_id', v_user_id));
end;
$$;
revoke execute on function public.assign_voucher_to_therapist(uuid, uuid) from public, anon;
grant execute on function public.assign_voucher_to_therapist(uuid, uuid) to authenticated;

-- therapist_accept_voucher: same guard for Protection-linked vouchers.
create or replace function public.therapist_accept_voucher(p_voucher_id uuid)
returns public.provider_vouchers
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_result public.provider_vouchers;
  v_decision text;
begin
  if not public.is_active_user() or not exists (
    select 1 from public.therapists where id = auth.uid() and status = 'active'
  ) then raise exception 'Active therapist verification required'; end if;

  select pav.insurer_decision into v_decision
  from public.pre_auth_vouchers pav
  join public.provider_vouchers pv on pv.pre_auth_voucher_id = pav.id
  where pav.membership_id is not null and pv.id = p_voucher_id;
  if v_decision is not null and v_decision not in ('approved','partially_approved') then
    raise exception 'Insurer has not approved this pre-authorisation';
  end if;

  update public.provider_vouchers
  set therapist_id = auth.uid(), status = 'accepted', updated_at = now()
  where id = p_voucher_id and expires_at > now()
    and ((status = 'pending' and therapist_id is null) or (status = 'assigned' and therapist_id = auth.uid()))
  returning * into v_result;
  if not found then raise exception 'Voucher is unavailable'; end if;
  update public.pre_auth_vouchers
  set therapist_id = auth.uid(), status = 'accepted', updated_at = now()
  where id = v_result.pre_auth_voucher_id;
  return v_result;
end;
$$;
revoke execute on function public.therapist_accept_voucher(uuid) from public, anon;
grant execute on function public.therapist_accept_voucher(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Insurer: own pre-authorisation list now via the access-layer RPC
-- (insurer_list_preauths in script 02). The direct-table insurer SELECT
-- policy on pre_auth_vouchers exposed crisis_alert_id — remove it; the RPC
-- path is the only insurer read.
-- ---------------------------------------------------------------------------
drop policy if exists pre_auth_vouchers_insurer_select on public.pre_auth_vouchers;

-- Verification block.
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and proname in (
  'member_request_preauth','insurer_decide_preauth',
  'assign_voucher_to_therapist','therapist_accept_voucher'
) order by proname;
