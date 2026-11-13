-- 08_protection_operations.sql — LossLens Protection claims/premiums/actuarial/audit (part 8/8)
-- Consolidated from: 20261112000005_protection_claims.sql +
--   20261112000006_protection_premiums.sql +
--   20261112000007_protection_actuarial.sql +
--   20261112000008_protection_audit_validation.sql
-- Depends on 01-07. Apply LAST.

-- LossLens Protection — Script 05: CLAIMS & BENEFITS
-- Apply after 04. Safe to re-run.
--
-- Member-facing Protection claims supporting fixed_sum and
-- treatment_reimbursement benefit types. Separate from the existing
-- provider_claims session pipeline (which remains for therapist session
-- settlement); treatment claims may LINK to a provider_claims row.
-- All decisions are insurer-side via RPC; history preserved in
-- protection_claim_events. Clinical free-text is never required or
-- returned — evidence is structured.

-- ---------------------------------------------------------------------------
-- Claims
-- ---------------------------------------------------------------------------
create table if not exists public.protection_claims (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.protection_policies(id) on delete restrict,
  membership_id uuid not null references public.protection_memberships(id) on delete restrict,
  insurer_id uuid not null references public.insurers(id) on delete restrict,
  benefit_id uuid references public.protection_benefits(id) on delete set null,
  plan_version_id uuid not null references public.protection_plan_versions(id) on delete restrict,
  claim_type text not null check (claim_type in ('fixed_sum','treatment_reimbursement')),
  status text not null default 'submitted'
    check (status in ('draft','submitted','under_review','info_requested',
                      'approved','partially_approved','rejected','disputed',
                      'paid','cancelled')),
  event_description text not null,           -- non-clinical description of the insured event/service
  event_date date,
  service_date date,
  provider_id uuid references public.therapists(id) on delete set null,
  provider_claim_id uuid references public.provider_claims(id) on delete set null,
  claimed_amount numeric(14,2) not null check (claimed_amount >= 0),
  approved_amount numeric(14,2) check (approved_amount is null or approved_amount >= 0),
  decision_by uuid references public.profiles(id),
  decided_at timestamptz,
  decision_reason text,
  settlement_status text not null default 'none'
    check (settlement_status in ('none','pending','settled','reversed')),
  settled_at timestamptz,
  settlement_ref text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pcl_policy_idx on public.protection_claims (policy_id, status);
create index if not exists pcl_insurer_idx on public.protection_claims (insurer_id, status, created_at desc);
create index if not exists pcl_membership_idx on public.protection_claims (membership_id, created_at desc);
-- Duplicate prevention: one claim per policy+benefit+event date+type.
create unique index if not exists pcl_duplicate_guard
  on public.protection_claims (policy_id, benefit_id, claim_type, event_date)
  where status not in ('cancelled','rejected');

create table if not exists public.protection_claim_events (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.protection_claims(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role text,
  event_type text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists pce_claim_idx on public.protection_claim_events (claim_id, created_at);

create table if not exists public.protection_claim_evidence (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.protection_claims(id) on delete cascade,
  evidence_type text not null,
  storage_path text,
  structured jsonb not null default '{}'::jsonb,
  provided_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists pcev_claim_idx on public.protection_claim_evidence (claim_id);

alter table public.protection_claims enable row level security;
alter table public.protection_claim_events enable row level security;
alter table public.protection_claim_evidence enable row level security;

-- Members read own claims/events/evidence via membership join; insurer reads
-- own org's claims (whitelisted by RPC for detail); super_admin all.
drop policy if exists pcl_read on public.protection_claims;
create policy pcl_read on public.protection_claims for select to authenticated
  using (
    public.is_super_admin()
    or insurer_id = public.protection_insurer_id()
    or exists (select 1 from public.protection_memberships m
               where m.id = membership_id and m.user_id = auth.uid())
  );
drop policy if exists pce_read on public.protection_claim_events;
create policy pce_read on public.protection_claim_events for select to authenticated
  using (
    public.is_super_admin()
    or exists (select 1 from public.protection_claims c
               where c.id = claim_id and c.insurer_id = public.protection_insurer_id())
    or exists (select 1 from public.protection_claims c
               join public.protection_memberships m on m.id = c.membership_id
               where c.id = claim_id and m.user_id = auth.uid())
  );
drop policy if exists pcev_read on public.protection_claim_evidence;
create policy pcev_read on public.protection_claim_evidence for select to authenticated
  using (
    public.is_super_admin()
    or exists (select 1 from public.protection_claims c
               where c.id = claim_id and c.insurer_id = public.protection_insurer_id())
    or exists (select 1 from public.protection_claims c
               join public.protection_memberships m on m.id = c.membership_id
               where c.id = claim_id and m.user_id = auth.uid())
  );

grant select on public.protection_claims to authenticated;
grant select on public.protection_claim_events to authenticated;
grant select on public.protection_claim_evidence to authenticated;

-- Private evidence bucket.
insert into storage.buckets (id, name, public)
values ('claim-evidence', 'claim-evidence', false)
on conflict (id) do update set public = false;

drop policy if exists claim_evidence_owner_rw on storage.objects;
create policy claim_evidence_owner_rw on storage.objects for all to authenticated
  using (
    bucket_id = 'claim-evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'claim-evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
drop policy if exists claim_evidence_insurer_read on storage.objects;
create policy claim_evidence_insurer_read on storage.objects for select to authenticated
  using (
    bucket_id = 'claim-evidence'
    and public.protection_is_active_insurer()
    and exists (
      select 1 from public.protection_claim_evidence e
      join public.protection_claims c on c.id = e.claim_id
      where e.storage_path = name
        and c.insurer_id = public.protection_insurer_id()
    )
  );
drop policy if exists claim_evidence_admin_read on storage.objects;
create policy claim_evidence_admin_read on storage.objects for select to authenticated
  using (bucket_id = 'claim-evidence' and public.is_super_admin());

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------
create or replace function public.protection_claim_event(
  p_claim_id uuid, p_event_type text, p_detail jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_claim public.protection_claims;
  v_actor_role text;
  v_allowed_event text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_actor_role := lower(coalesce(public.current_user_role(), 'unknown'));
  if v_actor_role not in ('user', 'insurer', 'super_admin') then
    raise exception 'Claim events are restricted to authenticated user and insurer actors';
  end if;

  select * into v_claim from public.protection_claims where id = p_claim_id for update;
  if not found then
    raise exception 'Claim not found';
  end if;

  if p_event_type not in ('submitted','adjudicated','settled','cancelled') then
    raise exception 'Unsupported claim event type';
  end if;

  if v_actor_role = 'user' then
    if not exists (
      select 1 from public.protection_memberships m
      where m.id = v_claim.membership_id and m.user_id = auth.uid()
    ) then
      raise exception 'Member cannot append events to another member''s claim';
    end if;
    if p_event_type not in ('submitted','cancelled') then
      raise exception 'Members may only append member-originated claim events';
    end if;
  elsif v_actor_role in ('insurer', 'super_admin') then
    if v_claim.insurer_id <> coalesce(public.protection_insurer_id(), v_claim.insurer_id) and not public.is_super_admin() then
      raise exception 'Insurer cannot append events to another insurer''s claim';
    end if;
    if p_event_type not in ('adjudicated','settled') and not public.is_super_admin() then
      raise exception 'Insurers may only append approved insurer decision events';
    end if;
  end if;

  insert into public.protection_claim_events (claim_id, actor_id, actor_role, event_type, detail)
  values (
    p_claim_id,
    auth.uid(),
    v_actor_role,
    p_event_type,
    coalesce(p_detail, '{}'::jsonb)
  );
end;
$$;
revoke execute on function public.protection_claim_event(uuid, text, jsonb) from public, anon;
grant execute on function public.protection_claim_event(uuid, text, jsonb) to authenticated;

-- Sum of approved/paid amounts already consumed against a policy+benefit.
create or replace function public.protection_benefit_used(
  p_policy_id uuid, p_benefit_id uuid, p_years_back integer default 0
)
returns numeric
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(sum(c.approved_amount), 0)
  from public.protection_claims c
  where c.policy_id = p_policy_id
    and c.benefit_id = p_benefit_id
    and c.status in ('approved','partially_approved','paid')
    and c.created_at >= (date_trunc('year', now()) - make_interval(years => p_years_back))::date;
$$;
revoke execute on function public.protection_benefit_used(uuid, uuid, integer) from public, anon;
grant execute on function public.protection_benefit_used(uuid, uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- member_submit_claim — validates policy, benefit, waiting period,
-- frequency, per-event/per-policy/annual limits, duplicate guard.
-- Fixed-sum amount is computed server-side from the benefit — never from
-- client input or provider fees.
-- ---------------------------------------------------------------------------
create or replace function public.member_submit_claim(
  p_policy_id uuid,
  p_benefit_code text,
  p_claim_type text,
  p_event_description text,
  p_event_date date default null,
  p_provider_claim_id uuid default null
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
  v_b public.protection_benefits;
  v_claim_id uuid;
  v_amount numeric(14,2);
  v_used numeric;
  v_claims_ytd integer;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  perform public.protection_require_mode(array['pilot','live']);
  if p_claim_type not in ('fixed_sum','treatment_reimbursement') then
    raise exception 'Invalid claim type';
  end if;
  if p_event_description is null or length(btrim(p_event_description)) = 0
     or length(p_event_description) > 1000 then
    raise exception 'A brief non-clinical event description is required';
  end if;

  select m.* into v_m from public.protection_memberships m
  join public.protection_policies p on p.membership_id = m.id
  where p.id = p_policy_id and m.user_id = v_uid;
  if not found then raise exception 'Policy not found'; end if;

  select * into v_p from public.protection_policies where id = p_policy_id for update;
  if v_p.status <> 'active'
     or v_p.commencement_date > current_date
     or (v_p.expiry_date is not null and v_p.expiry_date < current_date) then
    raise exception 'Policy is not in force';
  end if;

  select * into v_v from public.protection_plan_versions where id = v_p.plan_version_id;
  if p_claim_type = 'fixed_sum' and v_v.benefit_structure = 'treatment_reimbursement' then
    raise exception 'This product does not include fixed-sum benefits';
  end if;
  if p_claim_type = 'treatment_reimbursement' and v_v.benefit_structure = 'fixed_sum' then
    raise exception 'This product does not include treatment-cost benefits';
  end if;

  select * into v_b from public.protection_benefits
  where plan_version_id = v_p.plan_version_id and benefit_code = p_benefit_code and active;
  if not found then raise exception 'Benefit not found on this product'; end if;
  if v_b.benefit_type <> p_claim_type and not (v_b.benefit_type = 'provider_direct_payment' and p_claim_type = 'treatment_reimbursement') then
    raise exception 'Benefit type does not match claim type';
  end if;

  -- Waiting period: benefit-level days measured from commencement.
  if v_b.waiting_period_days > 0
     and v_p.commencement_date + v_b.waiting_period_days > current_date then
    raise exception 'Benefit waiting period has not ended';
  end if;

  -- Frequency limit (claims per policy year).
  if v_b.frequency_limit is not null then
    select count(*) into v_claims_ytd from public.protection_claims
    where policy_id = p_policy_id and benefit_id = v_b.id
      and status not in ('cancelled','rejected','draft')
      and created_at >= date_trunc('year', now());
    if v_claims_ytd >= v_b.frequency_limit then
      raise exception 'Benefit claim frequency limit reached';
    end if;
  end if;

  -- Amount: fixed_sum uses contractual fixed_amount; treatment uses the
  -- linked provider claim amount capped at per_event_limit.
  if p_claim_type = 'fixed_sum' then
    v_amount := v_b.fixed_amount;
    if v_amount is null or v_amount <= 0 then raise exception 'Benefit has no fixed amount'; end if;
  else
    if p_provider_claim_id is null then
      raise exception 'A delivered provider claim reference is required';
    end if;
    select coalesce(pc.claim_amount, 0) into v_amount
    from public.provider_claims pc
    join public.provider_vouchers pv on pv.id = pc.voucher_id
    join public.pre_auth_vouchers pav on pav.id = pv.pre_auth_voucher_id
    where pc.id = p_provider_claim_id
      and pav.policy_id = p_policy_id
      and pc.status in ('submitted','approved');
    if v_amount is null then raise exception 'Provider claim not found for this policy'; end if;
    if v_b.per_event_limit is not null and v_amount > v_b.per_event_limit then
      v_amount := v_b.per_event_limit;
    end if;
  end if;

  -- Per-event and aggregate limit checks.
  v_used := public.protection_benefit_used(p_policy_id, v_b.id, 0);
  if v_b.per_policy_limit is not null and v_used + v_amount > v_b.per_policy_limit then
    raise exception 'Policy benefit limit would be exceeded';
  end if;
  if v_b.annual_limit is not null then
    declare v_used_year numeric;
    begin
      select coalesce(sum(approved_amount),0) into v_used_year
      from public.protection_claims
      where policy_id = p_policy_id and benefit_id = v_b.id
        and status in ('approved','partially_approved','paid')
        and created_at >= date_trunc('year', now());
      if v_used_year + v_amount > v_b.annual_limit then
        raise exception 'Annual benefit limit would be exceeded';
      end if;
    end;
  end if;

  insert into public.protection_claims (
    policy_id, membership_id, insurer_id, benefit_id, plan_version_id,
    claim_type, status, event_description, event_date, provider_claim_id,
    claimed_amount, created_by
  ) values (
    p_policy_id, v_m.id, v_p.insurer_id, v_b.id, v_p.plan_version_id,
    p_claim_type, 'submitted', btrim(p_event_description),
    coalesce(p_event_date, current_date), p_provider_claim_id,
    v_amount, v_uid
  ) returning id into v_claim_id;

  perform public.protection_claim_event(v_claim_id, 'submitted',
    jsonb_build_object('claim_type', p_claim_type, 'claimed_amount', v_amount));
  insert into public.protection_events (membership_id, insurer_id, actor_id, event_type, detail)
  values (v_m.id, v_p.insurer_id, v_uid, 'claim_submitted',
          jsonb_build_object('claim_id', v_claim_id, 'claim_type', p_claim_type));
  return v_claim_id;
end;
$$;
revoke execute on function public.member_submit_claim(uuid, text, text, text, date, uuid) from public, anon;
grant execute on function public.member_submit_claim(uuid, text, text, text, date, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- member_list_my_claims — whitelisted own-claim view.
-- ---------------------------------------------------------------------------
create or replace function public.member_list_my_claims()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'policy_id', c.policy_id, 'claim_type', c.claim_type,
      'status', c.status, 'claimed_amount', c.claimed_amount,
      'approved_amount', c.approved_amount, 'event_description', c.event_description,
      'event_date', c.event_date, 'decision_reason', c.decision_reason,
      'settlement_status', c.settlement_status, 'created_at', c.created_at
    ) order by c.created_at desc)
    from public.protection_claims c
    join public.protection_memberships m on m.id = c.membership_id
    where m.user_id = v_uid
  ), '[]'::jsonb);
end;
$$;
revoke execute on function public.member_list_my_claims() from public, anon;
grant execute on function public.member_list_my_claims() to authenticated;

-- ---------------------------------------------------------------------------
-- insurer_list_protection_claims — whitelisted queue (no clinical fields).
-- ---------------------------------------------------------------------------
create or replace function public.insurer_list_protection_claims()
returns table (
  claim_id uuid,
  policy_number text,
  member_reference text,
  claim_type text,
  status text,
  claimed_amount numeric,
  approved_amount numeric,
  event_date date,
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
  perform public.protection_require_mode(array['pilot','live']);
  return query
    select c.id, p.policy_number, m.member_reference, c.claim_type, c.status,
           c.claimed_amount, c.approved_amount, c.event_date, c.created_at
    from public.protection_claims c
    join public.protection_policies p on p.id = c.policy_id
    join public.protection_memberships m on m.id = c.membership_id
    where c.insurer_id = v_insurer
    order by c.created_at desc
    limit 500;
end;
$$;
revoke execute on function public.insurer_list_protection_claims() from public, anon;
grant execute on function public.insurer_list_protection_claims() to authenticated;

-- insurer_get_claim — detail + structured evidence only. Audited.
create or replace function public.insurer_get_claim(p_claim_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_insurer uuid := public.protection_insurer_id();
  v_result jsonb;
begin
  if v_insurer is null then raise exception 'Active insurer access required'; end if;
  perform public.protection_require_mode(array['pilot','live']);
  select jsonb_build_object(
    'id', c.id, 'claim_type', c.claim_type, 'status', c.status,
    'claimed_amount', c.claimed_amount, 'approved_amount', c.approved_amount,
    'event_description', c.event_description, 'event_date', c.event_date,
    'service_date', c.service_date, 'decision_reason', c.decision_reason,
    'settlement_status', c.settlement_status, 'created_at', c.created_at,
    'policy_number', p.policy_number, 'member_reference', m.member_reference,
    'benefit_code', b.benefit_code, 'benefit_name', b.name,
    'evidence', coalesce((
      select jsonb_agg(jsonb_build_object(
        'evidence_type', e.evidence_type, 'structured', e.structured,
        'has_document', e.storage_path is not null, 'created_at', e.created_at
      ))
      from public.protection_claim_evidence e where e.claim_id = c.id
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_type', ev.event_type, 'detail', ev.detail, 'created_at', ev.created_at
      ) order by ev.created_at)
      from public.protection_claim_events ev where ev.claim_id = c.id
    ), '[]'::jsonb)
  ) into v_result
  from public.protection_claims c
  join public.protection_policies p on p.id = c.policy_id
  join public.protection_memberships m on m.id = c.membership_id
  left join public.protection_benefits b on b.id = c.benefit_id
  where c.id = p_claim_id and c.insurer_id = v_insurer;
  if v_result is null then raise exception 'Claim not found'; end if;
  perform public.protection_log_access('get_claim', 'protection_claims', p_claim_id::text, 'claims adjudication');
  return v_result;
end;
$$;
revoke execute on function public.insurer_get_claim(uuid) from public, anon;
grant execute on function public.insurer_get_claim(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- insurer_adjudicate_claim — approve / partially_approve / reject /
-- request_info. Enforces remaining limits server-side; records history.
-- ---------------------------------------------------------------------------
create or replace function public.insurer_adjudicate_claim(
  p_claim_id uuid,
  p_decision text,
  p_approved_amount numeric default null,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_insurer uuid := public.protection_insurer_id();
  v_c public.protection_claims;
  v_b public.protection_benefits;
  v_new_status text;
  v_amount numeric(14,2);
begin
  if v_insurer is null then raise exception 'Active insurer access required'; end if;
  perform public.protection_require_mode(array['pilot','live']);
  if p_decision not in ('approved','partially_approved','rejected','request_info') then
    raise exception 'Invalid decision';
  end if;

  select * into v_c from public.protection_claims where id = p_claim_id for update;
  if not found or v_c.insurer_id <> v_insurer then raise exception 'Claim not found'; end if;
  if v_c.status not in ('submitted','under_review','info_requested') then
    raise exception 'Claim is not awaiting a decision';
  end if;

  v_new_status := case p_decision
    when 'approved' then 'approved'
    when 'partially_approved' then 'partially_approved'
    when 'rejected' then 'rejected'
    else 'info_requested' end;

  v_amount := null;
  if p_decision in ('approved','partially_approved') then
    v_amount := coalesce(p_approved_amount, v_c.claimed_amount);
    if v_amount <= 0 or v_amount > v_c.claimed_amount then
      raise exception 'Approved amount must be positive and not exceed the claimed amount';
    end if;
    -- Re-check aggregate limits against remaining headroom.
    if v_c.benefit_id is not null then
      select * into v_b from public.protection_benefits where id = v_c.benefit_id;
      if v_b.per_policy_limit is not null then
        declare v_used numeric;
        begin
          select coalesce(sum(approved_amount),0) into v_used
          from public.protection_claims
          where policy_id = v_c.policy_id and benefit_id = v_c.benefit_id
            and id <> v_c.id and status in ('approved','partially_approved','paid');
          if v_used + v_amount > v_b.per_policy_limit then
            raise exception 'Approval would exceed the per-policy benefit limit';
          end if;
        end;
      end if;
      if v_b.annual_limit is not null then
        declare v_used_year numeric;
        begin
          select coalesce(sum(approved_amount),0) into v_used_year
          from public.protection_claims
          where policy_id = v_c.policy_id and benefit_id = v_c.benefit_id
            and id <> v_c.id and status in ('approved','partially_approved','paid')
            and created_at >= date_trunc('year', now());
          if v_used_year + v_amount > v_b.annual_limit then
            raise exception 'Approval would exceed the annual benefit limit';
          end if;
        end;
      end if;
    end if;
  end if;

  update public.protection_claims
  set status = v_new_status,
      approved_amount = v_amount,
      decision_by = auth.uid(),
      decided_at = now(),
      decision_reason = nullif(left(btrim(coalesce(p_reason,'')), 2000), ''),
      updated_at = now()
  where id = p_claim_id;

  perform public.protection_claim_event(p_claim_id, 'adjudicated',
    jsonb_build_object('decision', p_decision, 'approved_amount', v_amount));
  insert into public.protection_events (membership_id, insurer_id, actor_id, event_type, detail)
  values (v_c.membership_id, v_insurer, auth.uid(), 'claim_adjudicated',
          jsonb_build_object('claim_id', p_claim_id, 'decision', p_decision));
  perform public.protection_log_access('adjudicate_claim', 'protection_claims', p_claim_id::text,
    'decision=' || p_decision);
end;
$$;
revoke execute on function public.insurer_adjudicate_claim(uuid, text, numeric, text) from public, anon;
grant execute on function public.insurer_adjudicate_claim(uuid, text, numeric, text) to authenticated;

-- insurer_mark_claim_settled — settlement is insurer-confirmed remittance.
create or replace function public.insurer_mark_claim_settled(
  p_claim_id uuid, p_settlement_ref text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_insurer uuid := public.protection_insurer_id();
  v_c public.protection_claims;
begin
  if v_insurer is null then raise exception 'Active insurer access required'; end if;
  perform public.protection_require_mode(array['pilot','live']);
  select * into v_c from public.protection_claims where id = p_claim_id for update;
  if not found or v_c.insurer_id <> v_insurer then raise exception 'Claim not found'; end if;
  if v_c.status not in ('approved','partially_approved') then
    raise exception 'Only approved claims can be settled';
  end if;
  update public.protection_claims
  set status = 'paid', settlement_status = 'settled', settled_at = now(),
      settlement_ref = nullif(left(btrim(coalesce(p_settlement_ref,'')), 200), ''),
      updated_at = now()
  where id = p_claim_id;
  perform public.protection_claim_event(p_claim_id, 'settled',
    jsonb_build_object('ref', p_settlement_ref));
  perform public.protection_log_access('settle_claim', 'protection_claims', p_claim_id::text, 'claim settlement');
end;
$$;
revoke execute on function public.insurer_mark_claim_settled(uuid, text) from public, anon;
grant execute on function public.insurer_mark_claim_settled(uuid, text) to authenticated;

-- member_cancel_claim — member may cancel own draft/submitted claim.
create or replace function public.member_cancel_claim(p_claim_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  update public.protection_claims c
  set status = 'cancelled', updated_at = now()
  from public.protection_memberships m
  where c.id = p_claim_id and c.membership_id = m.id and m.user_id = v_uid
    and c.status in ('draft','submitted','info_requested');
  if not found then raise exception 'Claim not found or cannot be cancelled'; end if;
  perform public.protection_claim_event(p_claim_id, 'cancelled', '{}'::jsonb);
end;
$$;
revoke execute on function public.member_cancel_claim(uuid) from public, anon;
grant execute on function public.member_cancel_claim(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Verification block.
-- ---------------------------------------------------------------------------
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and proname in (
  'member_submit_claim','member_list_my_claims','insurer_list_protection_claims',
  'insurer_get_claim','insurer_adjudicate_claim','insurer_mark_claim_settled',
  'member_cancel_claim','protection_claim_event','protection_benefit_used'
) order by proname;
-- LossLens Protection — Script 06: PREMIUM LEDGER & POLICY LIFECYCLE
-- Apply after 05. Safe to re-run.
--
-- Insurance premiums are NOT LossLens subscription payments. The insurer
-- confirms receipt; LossLens records it. Ledger is idempotent per
-- (policy, period). Policy lifecycle transitions are recorded with reason.

create table if not exists public.protection_premium_records (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.protection_policies(id) on delete cascade,
  insurer_id uuid not null references public.insurers(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  amount_due numeric(14,2) not null check (amount_due >= 0),
  amount_received numeric(14,2) not null default 0 check (amount_received >= 0),
  currency text not null default 'KES',
  status text not null default 'invoiced'
    check (status in ('invoiced','confirmed','overdue','reversed','waived')),
  payment_ref text,
  channel text,
  confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz,
  recorded_source text not null default 'insurer'
    check (recorded_source in ('insurer','admin','import')),
  reconciliation_status text not null default 'unreconciled'
    check (reconciliation_status in ('unreconciled','reconciled','disputed')),
  reversed_at timestamptz,
  reversed_by uuid references public.profiles(id),
  reversal_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start)
);
create unique index if not exists ppr_policy_period
  on public.protection_premium_records (policy_id, period_start, period_end);
create index if not exists ppr_insurer_idx on public.protection_premium_records (insurer_id, status, period_end);
create index if not exists ppr_policy_idx on public.protection_premium_records (policy_id, period_start);

alter table public.protection_premium_records enable row level security;
drop policy if exists ppr_read on public.protection_premium_records;
create policy ppr_read on public.protection_premium_records for select to authenticated
  using (
    public.is_super_admin()
    or insurer_id = public.protection_insurer_id()
    or exists (select 1 from public.protection_policies p
               join public.protection_memberships m on m.id = p.membership_id
               where p.id = policy_id and m.user_id = auth.uid())
  );
grant select on public.protection_premium_records to authenticated;

-- ---------------------------------------------------------------------------
-- insurer_record_premium — insurer-confirmed receipt. Idempotent on
-- (policy, period): re-recording updates the same row, never duplicates.
-- amount_received must equal amount_due for 'confirmed' unless partial is
-- explicitly allowed by product terms (kept simple: full confirmation only;
-- partial receipts recorded as 'invoiced' with amount_received set).
-- ---------------------------------------------------------------------------
create or replace function public.insurer_record_premium(
  p_policy_id uuid,
  p_period_start date,
  p_period_end date,
  p_amount_due numeric,
  p_amount_received numeric,
  p_payment_ref text default null,
  p_channel text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_insurer uuid := public.protection_insurer_id();
  v_p public.protection_policies;
  v_id uuid;
  v_status text;
begin
  if v_insurer is null then raise exception 'Active insurer access required'; end if;
  perform public.protection_require_mode(array['pilot','live']);
  if p_period_end < p_period_start then raise exception 'Invalid period'; end if;
  if p_amount_due is null or p_amount_due < 0 then raise exception 'Invalid amount due'; end if;
  if p_amount_received is null or p_amount_received < 0 then raise exception 'Invalid amount received'; end if;
  if p_amount_received > p_amount_due then raise exception 'Received exceeds amount due'; end if;

  select * into v_p from public.protection_policies where id = p_policy_id for update;
  if not found or v_p.insurer_id <> v_insurer then raise exception 'Policy not found'; end if;
  if v_p.status in ('cancelled','expired','lapsed') then
    raise exception 'Policy is not in a premium-collectable state';
  end if;

  v_status := case
    when p_amount_received >= p_amount_due and p_amount_due > 0 then 'confirmed'
    when p_amount_received > 0 then 'invoiced'
    else 'invoiced' end;

  insert into public.protection_premium_records (
    policy_id, insurer_id, period_start, period_end, amount_due,
    amount_received, status, payment_ref, channel, confirmed_by, confirmed_at,
    recorded_source
  ) values (
    p_policy_id, v_insurer, p_period_start, p_period_end, p_amount_due,
    p_amount_received, v_status,
    nullif(left(btrim(coalesce(p_payment_ref,'')), 200), ''),
    nullif(left(btrim(coalesce(p_channel,'')), 60), ''),
    case when v_status = 'confirmed' then auth.uid() else null end,
    case when v_status = 'confirmed' then now() else null end,
    'insurer'
  )
  on conflict (policy_id, period_start, period_end) do update set
    amount_due = excluded.amount_due,
    amount_received = excluded.amount_received,
    status = excluded.status,
    payment_ref = excluded.payment_ref,
    channel = excluded.channel,
    confirmed_by = excluded.confirmed_by,
    confirmed_at = excluded.confirmed_at,
    updated_at = now()
  returning id into v_id;

  perform public.protection_refresh_policy_payment(p_policy_id);
  perform public.protection_log_access('record_premium', 'protection_premium_records', v_id::text,
    'period=' || p_period_start || '/' || p_period_end);
  return v_id;
end;
$$;
revoke execute on function public.insurer_record_premium(uuid, date, date, numeric, numeric, text, text) from public, anon;
grant execute on function public.insurer_record_premium(uuid, date, date, numeric, numeric, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Recompute a policy's premium_status + lifecycle status from its ledger.
-- Rules (configurable per product via terms.grace_period_days):
--   * any confirmed record covering today -> premium_status 'paid_current'
--   * issued + first premium confirmed -> status 'active' (if commencement <= today)
--   * unpaid current period -> 'pending_payment' while within grace, then
--     premium_status 'overdue'; active policies move to 'grace' then 'lapsed'
--   * expiry_date passed -> 'expired'
-- ---------------------------------------------------------------------------
create or replace function public.protection_refresh_policy_payment(p_policy_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_p public.protection_policies;
  v_v public.protection_plan_versions;
  v_grace_days integer;
  v_current_paid boolean;
  v_any_overdue boolean;
  v_first_confirmed boolean;
begin
  select * into v_p from public.protection_policies where id = p_policy_id for update;
  if not found then return; end if;
  select * into v_v from public.protection_plan_versions where id = v_p.plan_version_id;
  v_grace_days := coalesce((v_v.terms->>'grace_period_days')::integer, 30);

  select exists (
    select 1 from public.protection_premium_records r
    where r.policy_id = p_policy_id and r.status = 'confirmed'
      and r.period_start <= current_date and r.period_end >= current_date
  ) into v_current_paid;

  select exists (
    select 1 from public.protection_premium_records r
    where r.policy_id = p_policy_id
      and r.period_end < current_date and r.status in ('invoiced','overdue')
  ) into v_any_overdue;

  select exists (
    select 1 from public.protection_premium_records r
    where r.policy_id = p_policy_id and r.status = 'confirmed'
  ) into v_first_confirmed;

  -- premium_status
  if v_p.premium_status = 'waived' then
    null; -- waived is terminal for premium_status
  elsif v_current_paid then
    update public.protection_policies set premium_status = 'paid_current', updated_at = now()
    where id = p_policy_id and premium_status <> 'paid_current';
  elsif v_any_overdue then
    update public.protection_policies set premium_status = 'overdue', updated_at = now()
    where id = p_policy_id and premium_status <> 'overdue';
  else
    update public.protection_policies set premium_status = 'unpaid', updated_at = now()
    where id = p_policy_id and premium_status = 'overdue';
  end if;

  -- lifecycle status (never moves cancelled/expired/lapsed backwards)
  if v_p.status in ('cancelled','expired','lapsed') then return; end if;

  if v_p.expiry_date is not null and v_p.expiry_date < current_date then
    update public.protection_policies set status = 'expired', updated_at = now() where id = p_policy_id;
    insert into public.protection_events (membership_id, insurer_id, actor_id, event_type, detail)
    values (v_p.membership_id, v_p.insurer_id, null, 'policy_expired',
            jsonb_build_object('policy_id', p_policy_id));
    return;
  end if;

  if v_p.status = 'issued' and v_first_confirmed
     and coalesce(v_p.commencement_date, current_date) <= current_date then
    update public.protection_policies set status = 'active', updated_at = now() where id = p_policy_id;
    insert into public.protection_events (membership_id, insurer_id, actor_id, event_type, detail)
    values (v_p.membership_id, v_p.insurer_id, null, 'policy_activated',
            jsonb_build_object('policy_id', p_policy_id));
    return;
  end if;

  if v_p.status = 'active' then
    if v_any_overdue then
      if v_p.grace_ends_at is null then
        update public.protection_policies
        set status = 'grace',
            grace_ends_at = now() + make_interval(days => v_grace_days),
            updated_at = now()
        where id = p_policy_id;
        insert into public.protection_events (membership_id, insurer_id, actor_id, event_type, detail)
        values (v_p.membership_id, v_p.insurer_id, null, 'policy_grace',
                jsonb_build_object('policy_id', p_policy_id, 'grace_days', v_grace_days));
      elsif v_p.grace_ends_at < now() then
        update public.protection_policies set status = 'lapsed', updated_at = now() where id = p_policy_id;
        insert into public.protection_events (membership_id, insurer_id, actor_id, event_type, detail)
        values (v_p.membership_id, v_p.insurer_id, null, 'policy_lapsed',
                jsonb_build_object('policy_id', p_policy_id));
      end if;
    elsif v_current_paid and v_p.status = 'grace' then
      update public.protection_policies set status = 'active', grace_ends_at = null, updated_at = now()
      where id = p_policy_id;
      insert into public.protection_events (membership_id, insurer_id, actor_id, event_type, detail)
      values (v_p.membership_id, v_p.insurer_id, null, 'policy_reinstated',
              jsonb_build_object('policy_id', p_policy_id));
    end if;
  end if;
end;
$$;
revoke execute on function public.protection_refresh_policy_payment(uuid) from public, anon;
grant execute on function public.protection_refresh_policy_payment(uuid) to authenticated;

-- Batch lifecycle sweep — callable by service role / cron endpoint.
create or replace function public.protection_lifecycle_sweep()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer := 0;
  v_policy record;
begin
  if auth.role() <> 'service_role' and not public.is_super_admin() then
    raise exception 'Service role or super-admin required';
  end if;
  for v_policy in
    select id from public.protection_policies
    where status in ('issued','pending_payment','active','grace')
  loop
    perform public.protection_refresh_policy_payment(v_policy.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.protection_lifecycle_sweep() from public, anon;
grant execute on function public.protection_lifecycle_sweep() to authenticated;
grant execute on function public.protection_lifecycle_sweep() to service_role;

-- ---------------------------------------------------------------------------
-- insurer_renew_policy — creates a NEW policy row linked via
-- renewal_of_policy_id using a (new or same) approved version.
-- ---------------------------------------------------------------------------
create or replace function public.insurer_renew_policy(
  p_policy_id uuid,
  p_plan_version_id uuid,
  p_policy_number text,
  p_commencement_date date,
  p_expiry_date date,
  p_premium_amount numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_insurer uuid := public.protection_insurer_id();
  v_old public.protection_policies;
  v_v public.protection_plan_versions;
  v_id uuid;
  v_wait_days integer;
begin
  if v_insurer is null then raise exception 'Active insurer access required'; end if;
  perform public.protection_require_mode(array['pilot','live']);
  select * into v_old from public.protection_policies where id = p_policy_id for update;
  if not found or v_old.insurer_id <> v_insurer then raise exception 'Policy not found'; end if;
  if v_old.status not in ('active','grace','expired') then
    raise exception 'Only active, grace or expired policies can be renewed';
  end if;
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
    waiting_period_ends_at, renewal_of_policy_id, created_by
  ) values (
    v_old.membership_id, v_insurer, p_plan_version_id, btrim(p_policy_number), v_old.member_reference,
    'issued', p_commencement_date, p_expiry_date,
    coalesce(p_premium_amount, v_v.premium_amount, 0), v_v.premium_frequency,
    case when v_wait_days > 0
         then (p_commencement_date::timestamp + make_interval(days => v_wait_days))
         else null end,
    p_policy_id, auth.uid()
  ) returning id into v_id;

  insert into public.protection_events (membership_id, insurer_id, actor_id, event_type, detail)
  values (v_old.membership_id, v_insurer, auth.uid(), 'policy_renewed',
          jsonb_build_object('old_policy_id', p_policy_id, 'new_policy_id', v_id));
  perform public.protection_log_access('renew_policy', 'protection_policies', v_id::text, 'policy renewal');
  return v_id;
end;
$$;
revoke execute on function public.insurer_renew_policy(uuid, uuid, text, date, date, numeric) from public, anon;
grant execute on function public.insurer_renew_policy(uuid, uuid, text, date, date, numeric) to authenticated;

-- member_leave_protection: also cancel in-force policies (insurer notified
-- via events). Replaces the script-01 version.
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
  update public.protection_policies
  set status = 'cancelled', cancelled_at = now(), cancelled_by = v_uid,
      cancellation_reason = 'member_left_protection', updated_at = now()
  where membership_id = p_membership_id
    and status in ('issued','pending_payment','active','grace');
  insert into public.protection_events (membership_id, insurer_id, actor_id, event_type, detail)
  values (p_membership_id, v_m.insurer_id, v_uid, 'membership_ended', '{}'::jsonb);
end;
$$;
revoke execute on function public.member_leave_protection(uuid) from public, anon;
grant execute on function public.member_leave_protection(uuid) to authenticated;

-- Verification block.
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and proname in (
  'insurer_record_premium','protection_refresh_policy_payment',
  'protection_lifecycle_sweep','insurer_renew_policy','member_leave_protection'
) order by proname;
-- LossLens Protection — Script 07: ACTUARIAL REPORTING
-- Apply after 06. Safe to re-run.
--
-- Exposure, premium and claims experience computed from POLICY dates and
-- the premium/claims ledgers — never from profile status or B2B cohorts.
-- Earned premium uses straight-line daily earning. Ratios return NULL
-- (unavailable) rather than fabricated values. Small cohorts (<25
-- policyholders) are suppressed for insurer-facing output.

-- Member-months exposure per insurer per month.
create or replace view public.protection_policy_monthly_exposure as
with months as (
  select generate_series(date_trunc('month', current_date - interval '24 months'),
                         date_trunc('month', current_date), interval '1 month')::date as month_start
),
policy_days as (
  select p.insurer_id,
         date_trunc('month', greatest(p.commencement_date, m.month_start))::date as eff_start,
         least(coalesce(p.expiry_date, current_date + 1),
               (m.month_start + interval '1 month')::date) as eff_end
  from public.protection_policies p
  join months m
    on p.commencement_date < (m.month_start + interval '1 month')::date
   and coalesce(p.expiry_date, current_date + 1) > m.month_start
  where p.status in ('active','grace') or p.status = 'expired'
)
select insurer_id,
       date_trunc('month', eff_start)::date as month,
       sum(greatest(eff_end - eff_start, 0))::numeric / 30.44 as member_months
from policy_days
where eff_end > eff_start
group by insurer_id, 2;

-- Written / received / earned premium per insurer per month.
-- Earned = amount_due * covered_days_in_month / period_days (straight-line).
create or replace view public.protection_premium_monthly as
with rec as (
  select r.insurer_id, r.policy_id, r.period_start, r.period_end,
         r.amount_due, r.amount_received, r.status,
         date_trunc('month', r.period_start)::date as wmonth
  from public.protection_premium_records r
),
earned as (
  select rec.insurer_id,
         date_trunc('month', d.m)::date as month,
         sum(rec.amount_due *
             greatest(least(rec.period_end, (d.m + interval '1 month')::date - 1)
                      - greatest(rec.period_start, d.m) + 1, 0)::numeric
             / greatest(rec.period_end - rec.period_start + 1, 1)) as earned_premium
  from rec
  cross join lateral generate_series(
    date_trunc('month', rec.period_start),
    least(date_trunc('month', rec.period_end), date_trunc('month', current_date)),
    interval '1 month') d(m)
  where rec.status in ('confirmed','invoiced','overdue')
  group by rec.insurer_id, 2
)
select rec.insurer_id, rec.wmonth as written_month,
       sum(rec.amount_due) as written_premium,
       sum(rec.amount_received) as received_premium,
       count(*) filter (where rec.status = 'confirmed') as confirmed_records
from rec
group by rec.insurer_id, rec.wmonth
union all
select e.insurer_id, e.month, null, null, null
from earned e;

-- Claims experience per insurer per month: counts, incurred (approved at
-- decision), paid (settled). Incurred != paid.
create or replace view public.protection_claims_monthly as
select c.insurer_id,
       date_trunc('month', c.created_at)::date as month,
       count(*) as claims_count,
       count(*) filter (where c.claim_type = 'fixed_sum') as fixed_sum_count,
       count(*) filter (where c.claim_type = 'treatment_reimbursement') as treatment_count,
       coalesce(sum(c.claimed_amount),0) as claimed_total,
       coalesce(sum(c.approved_amount) filter (
         where c.status in ('approved','partially_approved','paid')),0) as incurred_total,
       coalesce(sum(c.approved_amount) filter (where c.status = 'paid'),0) as paid_total
from public.protection_claims c
group by c.insurer_id, 2;

revoke all on public.protection_policy_monthly_exposure from anon;
revoke all on public.protection_premium_monthly from anon;
revoke all on public.protection_claims_monthly from anon;
grant select on public.protection_policy_monthly_exposure to authenticated;
grant select on public.protection_premium_monthly to authenticated;
grant select on public.protection_claims_monthly to authenticated;

-- ---------------------------------------------------------------------------
-- insurer_actuarial_report — whitelisted portfolio aggregates + correct
-- ratios. Returns NULL ratios when earned premium is unavailable/zero.
-- Small cohorts (<25 policies) get counts suppressed to a flag only.
-- ---------------------------------------------------------------------------
create or replace function public.insurer_actuarial_report()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_insurer uuid := public.protection_insurer_id();
  v_policy_count integer;
  v_result jsonb;
begin
  if v_insurer is null then raise exception 'Active insurer access required'; end if;
  perform public.protection_require_mode(array['pilot','live']);

  select count(*) into v_policy_count
  from public.protection_policies p
  where p.insurer_id = v_insurer
    and p.status in ('issued','pending_payment','active','grace');

  if v_policy_count < 25 then
    return jsonb_build_object(
      'suppressed', true,
      'reason', 'Cohort below privacy minimum (25 policies)',
      'open_policies', v_policy_count
    );
  end if;

  with exposure as (
    select coalesce(sum(member_months),0) as mm
    from public.protection_policy_monthly_exposure e
    where e.insurer_id = v_insurer
      and e.month >= date_trunc('month', current_date - interval '12 months')
  ),
  prem as (
    select coalesce(sum(earned_premium),0) as earned
    from (
      select distinct on (month) month, earned_premium
      from public.protection_premium_monthly pm
      where pm.insurer_id = v_insurer and pm.earned_premium is not null
      order by month
    ) x
  ),
  claims as (
    select coalesce(sum(incurred_total),0) as incurred,
           coalesce(sum(paid_total),0) as paid,
           coalesce(sum(claims_count),0) as n
    from public.protection_claims_monthly cm
    where cm.insurer_id = v_insurer
      and cm.month >= date_trunc('month', current_date - interval '12 months')
  )
  select jsonb_build_object(
    'suppressed', false,
    'open_policies', v_policy_count,
    'member_months_12m', (select mm from exposure),
    'earned_premium_12m', (select earned from prem),
    'incurred_claims_12m', (select incurred from claims),
    'paid_claims_12m', (select paid from claims),
    'claims_count_12m', (select n from claims),
    'loss_ratio', case when (select earned from prem) > 0
                        then round((select incurred from claims) / (select earned from prem) * 100, 2)
                        else null end,
    'note', 'Loss ratio = incurred claims / earned premium. Null means earned premium unavailable.'
  ) into v_result;

  perform public.protection_log_access('actuarial_report', 'protection_policies', null, 'portfolio reporting');
  return v_result;
end;
$$;
revoke execute on function public.insurer_actuarial_report() from public, anon;
grant execute on function public.insurer_actuarial_report() to authenticated;

-- Super-admin variant (no cohort suppression; still audited).
create or replace function public.admin_actuarial_report(p_insurer_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb;
begin
  if not public.is_super_admin() then raise exception 'Super-admin access required'; end if;
  perform public.protection_require_mode(array['pilot','live']);
  with exposure as (
    select coalesce(sum(member_months),0) as mm
    from public.protection_policy_monthly_exposure e
    where (p_insurer_id is null or e.insurer_id = p_insurer_id)
  ),
  prem as (
    select coalesce(sum(earned_premium),0) as earned
    from public.protection_premium_monthly pm
    where (p_insurer_id is null or pm.insurer_id = p_insurer_id)
      and pm.earned_premium is not null
  ),
  claims as (
    select coalesce(sum(incurred_total),0) as incurred,
           coalesce(sum(paid_total),0) as paid,
           coalesce(sum(claims_count),0) as n
    from public.protection_claims_monthly cm
    where (p_insurer_id is null or cm.insurer_id = p_insurer_id)
  ),
  pol as (
    select count(*) filter (where status in ('issued','pending_payment','active','grace')) as open,
           count(*) as total
    from public.protection_policies p
    where (p_insurer_id is null or p.insurer_id = p_insurer_id)
  )
  select jsonb_build_object(
    'open_policies', (select open from pol),
    'total_policies', (select total from pol),
    'member_months', (select mm from exposure),
    'earned_premium', (select earned from prem),
    'incurred_claims', (select incurred from claims),
    'paid_claims', (select paid from claims),
    'claims_count', (select n from claims),
    'loss_ratio', case when (select earned from prem) > 0
                        then round((select incurred from claims) / (select earned from prem) * 100, 2)
                        else null end
  ) into v_result;
  perform public.log_admin_action('actuarial_report', 'protection_policies', p_insurer_id::text, '{}'::jsonb);
  return v_result;
end;
$$;
revoke execute on function public.admin_actuarial_report(uuid) from public, anon;
grant execute on function public.admin_actuarial_report(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Redefine insurer_aggregate_stats: cohort now comes from PROTECTION
-- policies/memberships, behavioural risk bands removed entirely.
-- ---------------------------------------------------------------------------
create or replace view public.insurer_aggregate_stats as
with cohorts as (
  select p.insurer_id,
         count(distinct m.user_id)::integer as cohort_size,
         count(distinct p.id) filter (
           where p.status in ('active','grace')
             and p.commencement_date <= current_date
             and (p.expiry_date is null or p.expiry_date >= current_date)
         )::integer as active_members
  from public.protection_policies p
  join public.protection_memberships m on m.id = p.membership_id
  where public.is_active_insurer(p.insurer_id)
  group by p.insurer_id
),
claims as (
  select c.insurer_id,
         count(*) filter (where c.created_at >= now() - interval '30 days')::integer as claims_last_30d,
         count(*) filter (where c.created_at >= now() - interval '90 days')::integer as claims_last_90d,
         avg(c.claimed_amount) as avg_claim_amount,
         sum(c.approved_amount) filter (where c.status = 'paid'
           and c.decided_at >= now() - interval '90 days') as total_paid_last_90d
  from public.protection_claims c
  group by c.insurer_id
)
select c.insurer_id, c.cohort_size, c.active_members,
       '{}'::jsonb as tier_mix,
       coalesce(cl.claims_last_30d, 0) as claims_last_30d,
       coalesce(cl.claims_last_90d, 0) as claims_last_90d,
       coalesce(cl.avg_claim_amount, 0) as avg_claim_amount,
       coalesce(cl.total_paid_last_90d, 0) as total_paid_last_90d
from cohorts c
left join claims cl on cl.insurer_id = c.insurer_id
where c.cohort_size >= 25;
revoke all on public.insurer_aggregate_stats from anon;
grant select on public.insurer_aggregate_stats to authenticated;

-- Verification block.
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and proname in ('insurer_actuarial_report','admin_actuarial_report')
order by proname;
select viewname from pg_views where schemaname='public'
  and viewname in ('protection_policy_monthly_exposure','protection_premium_monthly','protection_claims_monthly')
order by viewname;
-- LossLens Protection — Script 08: AUDIT, VALIDATION & SAFEGUARDS
-- Apply LAST, after 07. Safe to re-run.
--
-- Final grants sweep, integrity constraints, and verification queries.
-- No new business logic — consolidates remaining controls.

-- ---------------------------------------------------------------------------
-- Integrity: policies must reference an approved version at issue time is
-- enforced in RPCs; add a DB-level guard so direct service writes can't
-- attach a policy to a non-approved version.
-- ---------------------------------------------------------------------------
create or replace function public.protection_policy_version_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_status text;
begin
  if tg_op = 'INSERT' or new.plan_version_id is distinct from old.plan_version_id then
    select status into v_status from public.protection_plan_versions
    where id = new.plan_version_id;
    if v_status is distinct from 'approved' then
      raise exception 'Policies require an approved product version';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists protection_policy_version_guard on public.protection_policies;
create trigger protection_policy_version_guard
  before insert or update on public.protection_policies
  for each row execute function public.protection_policy_version_guard();

-- Policy status transition guard (defence in depth alongside RPC checks).
create or replace function public.protection_policy_status_guard()
returns trigger
language plpgsql
as $$
begin
  if old.status is distinct from new.status then
    if old.status in ('cancelled','expired','lapsed') and new.status <> old.status then
      raise exception 'Terminal policy status % cannot change', old.status;
    end if;
    if old.status = 'issued' and new.status not in ('pending_payment','active','cancelled','expired','lapsed') then
      raise exception 'Invalid policy transition % -> %', old.status, new.status;
    end if;
    if old.status = 'pending_payment' and new.status not in ('active','cancelled','expired','lapsed') then
      raise exception 'Invalid policy transition % -> %', old.status, new.status;
    end if;
    if old.status = 'active' and new.status not in ('grace','lapsed','cancelled','expired') then
      raise exception 'Invalid policy transition % -> %', old.status, new.status;
    end if;
    if old.status = 'grace' and new.status not in ('active','lapsed','cancelled','expired') then
      raise exception 'Invalid policy transition % -> %', old.status, new.status;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists protection_policy_status_guard on public.protection_policies;
create trigger protection_policy_status_guard
  before update on public.protection_policies
  for each row execute function public.protection_policy_status_guard();

-- Approved versions are immutable: block UPDATE/DELETE once approved.
create or replace function public.protection_version_immutable()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' and old.status = 'approved' then
    raise exception 'Approved product versions cannot be deleted';
  end if;
  if tg_op = 'UPDATE' and old.status = 'approved' then
    if new.benefit_structure is distinct from old.benefit_structure
       or new.terms is distinct from old.terms
       or new.premium_amount is distinct from old.premium_amount
       or new.premium_frequency is distinct from old.premium_frequency
       or new.plan_id is distinct from old.plan_id then
      raise exception 'Approved product versions are immutable';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists protection_version_immutable on public.protection_plan_versions;
create trigger protection_version_immutable
  before update or delete on public.protection_plan_versions
  for each row execute function public.protection_version_immutable();

-- Benefits on non-draft versions are immutable.
create or replace function public.protection_benefit_immutable()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_status text;
begin
  select status into v_status from public.protection_plan_versions
  where id = coalesce(new.plan_version_id, old.plan_version_id);
  if v_status is distinct from 'draft' then
    raise exception 'Benefits are immutable once the product version leaves draft';
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists protection_benefit_immutable on public.protection_benefits;
create trigger protection_benefit_immutable
  before insert or update or delete on public.protection_benefits
  for each row execute function public.protection_benefit_immutable();

-- ---------------------------------------------------------------------------
-- Grants sweep: every new Protection RPC must be executable by
-- authenticated only (role checks inside). Revoke from anon/public.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and (
      p.proname like 'protection\_%' or p.proname like 'insurer\_%'
      or p.proname like 'member\_%' or p.proname = 'admin_approve_plan_version'
      or p.proname = 'admin_actuarial_report'
    )
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

-- New tables: explicit grants only (no write grants to authenticated).
revoke insert, update, delete on public.protection_policies from authenticated;
revoke insert, update, delete on public.protection_plan_versions from authenticated;
revoke insert, update, delete on public.protection_benefits from authenticated;
revoke insert, update, delete on public.protection_roster_entries from authenticated;
revoke insert, update, delete on public.protection_claims from authenticated;
revoke insert, update, delete on public.protection_claim_events from authenticated;
revoke insert, update, delete on public.protection_claim_evidence from authenticated;
revoke insert, update, delete on public.protection_premium_records from authenticated;

-- Negative regression checks (run against a scratch database; they should return
-- zero rows if the hardening is in place).
-- A member must not append insurer-only events to another member's claim.
select count(*) as member_forged_insurer_events
from public.protection_claim_events e
join public.protection_claims c on c.id = e.claim_id
join public.protection_memberships m on m.id = c.membership_id
where e.actor_role = 'user'
  and e.event_type in ('adjudicated', 'settled');
-- Expect: 0.

-- A member must not use a foreign insurer or claim on another person's policy.
select count(*) as member_cross_policy_claim_events
from public.protection_claim_events e
join public.protection_claims c on c.id = e.claim_id
join public.protection_memberships m on m.id = c.membership_id
where e.actor_role = 'user'
  and e.actor_id <> m.user_id;
-- Expect: 0.

-- An invalid insurer selection must be rejected before a membership row is created.
select count(*) as invalid_insurer_enrolments
from public.protection_memberships m
join public.insurers i on i.id = m.insurer_id
where m.status in ('pending_verification', 'active')
  and i.status <> 'active';
-- Expect: 0.

-- protection_claim_events: members may append via member flows? All writes
-- go through definer RPCs — revoke direct writes already covered above.

-- ---------------------------------------------------------------------------
-- Indexes for reporting paths.
-- ---------------------------------------------------------------------------
create index if not exists ppr_confirmed_idx on public.protection_premium_records (insurer_id, status, period_start);
create index if not exists pcl_decided_idx on public.protection_claims (insurer_id, decided_at) where approved_amount is not null;
create index if not exists pp_active_idx on public.protection_policies (insurer_id, status, commencement_date, expiry_date);

-- ---------------------------------------------------------------------------
-- VERIFICATION QUERIES — run as administrator after applying all 8 scripts.
-- ---------------------------------------------------------------------------
-- 1. All Protection objects exist.
select 'tables' as kind, tablename as name from pg_tables
where schemaname='public' and tablename like 'protection\_%'
union all
select 'views', viewname from pg_views
where schemaname='public' and (viewname like 'protection\_%' or viewname='insurer_aggregate_stats')
union all
select 'functions', proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and (proname like 'protection\_%' or proname like 'insurer\_%'
  or proname like 'member\_%' or proname='admin_approve_plan_version'
  or proname='admin_actuarial_report')
order by 1, 2;

-- 2. RLS enabled on every Protection table.
select relname, relrowsecurity from pg_class
where relnamespace='public'::regnamespace and relname like 'protection\_%'
order by relname;

-- 3. protection_memberships has NO client write policies (RPC-only writes).
select policyname, cmd from pg_policies
where schemaname='public' and tablename='protection_memberships';

-- 4. protection_mode readable.
select public.protection_mode() as mode;

-- 5. Negative checks (run as a non-super-admin member where possible):
--    update protection_memberships set status='active' -> should affect 0 rows / error
--    select * from protection_policies where insurer_id <> own -> 0 rows
--    select crisis_alert_id from pre_auth_vouchers -> column still exists but
--      insurer-facing RPCs never return it; insurer SELECT policy was dropped.

-- ===========================================================================
-- SECURITY HARDENING ADDENDUM (post-audit remediation)
-- Later definitions override earlier ones in this file.
-- ===========================================================================

-- A. protection_claim_event: internal-only. All legitimate writers are
--    SECURITY DEFINER RPCs (member_submit_claim, insurer_adjudicate_claim,
--    insurer_mark_claim_settled, member_cancel_claim) which execute it as
--    the function owner. Direct client calls are revoked so members cannot
--    forge insurer decisions or append events to other members' claims.
revoke execute on function public.protection_claim_event(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.protection_claim_event(uuid, text, jsonb)
  to service_role;

-- D. protection_log_access: internal-only. Prevents ordinary users from
--    fabricating access-audit rows for arbitrary resources. All legitimate
--    callers are definer RPCs.
revoke execute on function public.protection_log_access(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.protection_log_access(text, text, text, text)
  to service_role;

-- H. claim-evidence bucket: enforce size + MIME limits at the bucket level.
update storage.buckets
set file_size_limit = 10485760,               -- 10 MB
    allowed_mime_types = array[
      'application/pdf','image/jpeg','image/png','image/webp'
    ]
where id = 'claim-evidence';

-- B/F. Consent & mode policy notes (enforced in function bodies above):
--   * insurer_list_memberships / insurer_list_preauths /
--     insurer_list_policyholders / insurer_list_protection_claims are
--     ESSENTIAL insurance administration (lawful basis: contract/legitimate
--     interest) — they expose only whitelisted servicing fields and are NOT
--     gated on optional consent scopes.
--   * Optional scopes (session_summaries, billing_contact) currently gate
--     nothing beyond what is already withheld; status_updates gates
--     member_request_preauth. Revocation is immediate via member_set_consent.
--   * member_leave_protection and member_cancel_claim intentionally do NOT
--     require pilot/live mode — data-rights operations must always work.
--   * protection_mode is enforced inside every transactional Protection RPC
--     via protection_require_mode (enrolment, verify, roster, plan versions,
--     issue/cancel/renew policy, record premium, preauth request/decide,
--     claim submit/adjudicate/settle, actuarial reports).

-- E. Broad-grant note: file 02 keeps `grant select on all tables ... to
--    authenticated` as the application baseline — RLS is the row boundary.
--    Write grants are an explicit table list; every protection_% table has
--    write privileges revoked from authenticated (RPC-only writes) and only
--    SELECT granted where a read policy exists.

-- ---------------------------------------------------------------------------
-- FINAL VERIFICATION (run as administrator after all 8 scripts)
-- ---------------------------------------------------------------------------
select 'scripts_applied_check' as check_name,
       count(*) filter (where proname like 'protection\_%' or proname like 'insurer\_%' or proname like 'member\_%') as protection_functions
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public';

select count(*) as sql_files_note; -- informational only
