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
-- A provider claim may fund at most ONE non-terminal Protection claim,
-- regardless of benefit code or event date. Cancelled/rejected rows release it.
create unique index if not exists pcl_provider_claim_guard
  on public.protection_claims (provider_claim_id)
  where provider_claim_id is not null and status not in ('cancelled','rejected');

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
               where m.id = membership_id and m.user_id = (select auth.uid()))
  );
drop policy if exists pce_read on public.protection_claim_events;
create policy pce_read on public.protection_claim_events for select to authenticated
  using (
    public.is_super_admin()
    or exists (select 1 from public.protection_claims c
               where c.id = claim_id and c.insurer_id = public.protection_insurer_id())
    or exists (select 1 from public.protection_claims c
               join public.protection_memberships m on m.id = c.membership_id
               where c.id = claim_id and m.user_id = (select auth.uid()))
  );
drop policy if exists pcev_read on public.protection_claim_evidence;
create policy pcev_read on public.protection_claim_evidence for select to authenticated
  using (
    public.is_super_admin()
    or exists (select 1 from public.protection_claims c
               where c.id = claim_id and c.insurer_id = public.protection_insurer_id())
    or exists (select 1 from public.protection_claims c
               join public.protection_memberships m on m.id = c.membership_id
               where c.id = claim_id and m.user_id = (select auth.uid()))
  );

revoke select on public.protection_claims from authenticated;
revoke select on public.protection_claim_events from authenticated;
revoke select on public.protection_claim_evidence from authenticated;

-- Private evidence bucket.
insert into storage.buckets (id, name, public)
values ('claim-evidence', 'claim-evidence', false)
on conflict (id) do update set public = false;

create or replace function public.protection_member_claim_evidence_read(p_path text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select (select auth.uid()) is not null
    and cardinality(string_to_array(p_path, '/')) = 3
    and split_part(p_path, '/', 1) = (select auth.uid())::text
    and split_part(p_path, '/', 2) <> ''
    and split_part(p_path, '/', 3) not in ('', '.', '..')
    and exists (
      select 1
      from public.protection_claims c
      join public.protection_memberships m on m.id = c.membership_id
      join public.protection_claim_evidence e on e.claim_id = c.id
      where c.id::text = split_part(p_path, '/', 2)
        and m.user_id = (select auth.uid())
        and e.storage_path = p_path
    );
$$;

create or replace function public.protection_member_claim_evidence_write(p_path text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select (select auth.uid()) is not null
    and cardinality(string_to_array(p_path, '/')) = 3
    and split_part(p_path, '/', 1) = (select auth.uid())::text
    and split_part(p_path, '/', 2) <> ''
    and split_part(p_path, '/', 3) not in ('', '.', '..')
    and exists (
      select 1
      from public.protection_claims c
      join public.protection_memberships m on m.id = c.membership_id
      where c.id::text = split_part(p_path, '/', 2)
        and m.user_id = (select auth.uid())
        and c.created_by = (select auth.uid())
        and c.status in ('submitted','under_review','info_requested')
    );
$$;

create or replace function public.protection_insurer_claim_evidence_read(p_path text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select (select auth.uid()) is not null
    and public.protection_is_active_insurer()
    and cardinality(string_to_array(p_path, '/')) = 3
    and split_part(p_path, '/', 3) not in ('', '.', '..')
    and exists (
      select 1
      from public.protection_claim_evidence e
      join public.protection_claims c on c.id = e.claim_id
      join public.protection_memberships m on m.id = c.membership_id
      where e.storage_path = p_path
        and split_part(p_path, '/', 1) = m.user_id::text
        and split_part(p_path, '/', 2) = c.id::text
        and c.insurer_id = public.protection_insurer_id()
    );
$$;

revoke execute on function public.protection_member_claim_evidence_read(text) from public, anon;
revoke execute on function public.protection_member_claim_evidence_write(text) from public, anon;
revoke execute on function public.protection_insurer_claim_evidence_read(text) from public, anon;
grant execute on function public.protection_member_claim_evidence_read(text) to authenticated;
grant execute on function public.protection_member_claim_evidence_write(text) to authenticated;
grant execute on function public.protection_insurer_claim_evidence_read(text) to authenticated;

drop policy if exists claim_evidence_owner_rw on storage.objects;
drop policy if exists claim_evidence_owner_read on storage.objects;
create policy claim_evidence_owner_read on storage.objects for select to authenticated
  using (
    bucket_id = 'claim-evidence'
    and public.protection_member_claim_evidence_read(name)
  );
drop policy if exists claim_evidence_owner_write on storage.objects;
create policy claim_evidence_owner_write on storage.objects for all to authenticated
  using (
    bucket_id = 'claim-evidence'
    and public.protection_member_claim_evidence_write(name)
  )
  with check (
    bucket_id = 'claim-evidence'
    and public.protection_member_claim_evidence_write(name)
  );
drop policy if exists claim_evidence_insurer_read on storage.objects;
create policy claim_evidence_insurer_read on storage.objects for select to authenticated
  using (
    bucket_id = 'claim-evidence'
    and public.protection_insurer_claim_evidence_read(name)
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
  if (select auth.uid()) is null then
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
      where m.id = v_claim.membership_id and m.user_id = (select auth.uid())
    ) then
      raise exception 'Member cannot append events to another member''s claim';
    end if;
    if p_event_type not in ('submitted','cancelled') then
      raise exception 'Members may only append member-originated claim events';
    end if;
  elsif v_actor_role in ('insurer', 'super_admin') then
    if not public.is_super_admin() then
      -- Insurer actors MUST resolve to an active insurer org; a missing or
      -- suspended mapping can never satisfy the boundary check.
      declare v_actor_insurer uuid := public.protection_insurer_id();
      begin
        if v_actor_insurer is null then
          raise exception 'Active insurer mapping required';
        end if;
        if v_claim.insurer_id <> v_actor_insurer then
          raise exception 'Insurer cannot append events to another insurer''s claim';
        end if;
      end;
    end if;
    if p_event_type not in ('adjudicated','settled') and not public.is_super_admin() then
      raise exception 'Insurers may only append approved insurer decision events';
    end if;
  end if;

  insert into public.protection_claim_events (claim_id, actor_id, actor_role, event_type, detail)
  values (
    p_claim_id,
    (select auth.uid()),
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
    and c.status not in ('cancelled','rejected','draft')
    and p_years_back >= 0
    and c.event_date is not null
    and c.event_date >= (
      date_trunc('year', current_date) - make_interval(years => p_years_back)
    )::date
    and c.event_date < (
      date_trunc('year', current_date) - make_interval(years => p_years_back)
      + interval '1 year'
    )::date;
$$;
revoke execute on function public.protection_benefit_used(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.protection_benefit_used(uuid, uuid, integer) to service_role;

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
  v_uid uuid := (select auth.uid());
  v_m public.protection_memberships;
  v_p public.protection_policies;
  v_v public.protection_plan_versions;
  v_b public.protection_benefits;
  v_claim_id uuid;
  v_amount numeric(14,2);
  v_used numeric;
  v_used_year numeric;
  v_claims_ytd integer;
  v_event_date date := coalesce(p_event_date, current_date);
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
  if v_m.status <> 'active' then raise exception 'Membership is not active'; end if;

  select * into v_p from public.protection_policies where id = p_policy_id for update;
  if v_p.status <> 'active'
     or v_p.commencement_date is null
     or v_event_date > current_date
     or v_event_date < v_p.commencement_date
     or (v_p.expiry_date is not null and v_event_date > v_p.expiry_date) then
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
  where plan_version_id = v_p.plan_version_id and benefit_code = p_benefit_code
    and active and is_active
    and (effective_from is null or effective_from <= v_event_date)
    and (effective_to is null or effective_to >= v_event_date);
  if not found then raise exception 'Benefit not found on this product'; end if;
  if v_b.benefit_type <> p_claim_type and not (v_b.benefit_type = 'provider_direct_payment' and p_claim_type = 'treatment_reimbursement') then
    raise exception 'Benefit type does not match claim type';
  end if;

  -- Waiting period: benefit-level days measured from commencement.
  if v_b.waiting_period_days > 0
     and v_p.commencement_date + v_b.waiting_period_days > v_event_date then
    raise exception 'Benefit waiting period has not ended';
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
    if exists (select 1 from public.protection_claims c2
               where c2.provider_claim_id = p_provider_claim_id
                 and c2.status not in ('cancelled','rejected')) then
      raise exception 'This provider claim is already linked to an active Protection claim';
    end if;
    if v_b.per_event_limit is not null and v_amount > v_b.per_event_limit then
      v_amount := v_b.per_event_limit;
    end if;
  end if;
  if v_b.per_event_limit is not null and v_amount > v_b.per_event_limit then
    v_amount := v_b.per_event_limit;
  end if;
  if v_amount <= 0 then raise exception 'Benefit amount must be positive'; end if;

  -- Per-event and aggregate limit checks.
  select coalesce(sum(coalesce(c.approved_amount, c.claimed_amount)), 0) into v_used
  from public.protection_claims c
  where c.policy_id = p_policy_id and c.benefit_id = v_b.id
    and c.status not in ('cancelled','rejected','draft');
  if v_b.per_policy_limit is not null and v_used + v_amount > v_b.per_policy_limit then
    raise exception 'Policy benefit limit would be exceeded';
  end if;
  if v_b.annual_limit is not null then
    v_used_year := public.protection_benefit_used(
      p_policy_id, v_b.id, extract(year from current_date)::integer - extract(year from v_event_date)::integer
    );
    if v_used_year + v_amount > v_b.annual_limit then
      raise exception 'Annual benefit limit would be exceeded';
    end if;
  end if;
  if v_b.frequency_limit is not null then
    select count(*) into v_claims_ytd
    from public.protection_claims c
    where c.policy_id = p_policy_id and c.benefit_id = v_b.id
      and c.status not in ('cancelled','rejected','draft')
      and extract(year from c.event_date) = extract(year from v_event_date);
    if v_claims_ytd >= v_b.frequency_limit then
      raise exception 'Benefit claim frequency limit reached';
    end if;
  end if;
  if v_v.terms->>'aggregate_limit_kes' is not null then
    select coalesce(sum(coalesce(c.approved_amount, c.claimed_amount)), 0) into v_used
    from public.protection_claims c
    where c.policy_id = p_policy_id and c.status not in ('cancelled','rejected','draft');
    if v_used + v_amount > (v_v.terms->>'aggregate_limit_kes')::numeric then
      raise exception 'Policy aggregate limit would be exceeded';
    end if;
  end if;

  insert into public.protection_claims (
    policy_id, membership_id, insurer_id, benefit_id, plan_version_id,
    claim_type, status, event_description, event_date, provider_claim_id,
    claimed_amount, created_by
  ) values (
    p_policy_id, v_m.id, v_p.insurer_id, v_b.id, v_p.plan_version_id,
    p_claim_type, 'submitted', btrim(p_event_description),
    v_event_date, p_provider_claim_id,
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
  v_uid uuid := (select auth.uid());
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
    'event_date', c.event_date,
    'service_date', c.service_date,
    'settlement_status', c.settlement_status, 'created_at', c.created_at,
    'policy_number', p.policy_number, 'member_reference', m.member_reference,
    'benefit_code', b.benefit_code, 'benefit_name', b.name,
    'evidence', coalesce((
      select jsonb_agg(jsonb_build_object(
        'evidence_type', e.evidence_type,
        'has_document', e.storage_path is not null, 'created_at', e.created_at
      ))
      from public.protection_claim_evidence e where e.claim_id = c.id
    ), '[]'::jsonb),
    'milestone', (
      select jsonb_build_object(
        'type', ms.milestone_type,
        'ordinal', ms.ordinal,
        'service_date', ms.service_date,
        'verified_at', ms.verified_at
      )
      from public.protection_milestones ms
      where ms.id = c.milestone_id and ms.status = 'verified'
    ),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_type', ev.event_type, 'created_at', ev.created_at
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
  v_p public.protection_policies;
  v_v public.protection_plan_versions;
  v_b public.protection_benefits;
  v_new_status text;
  v_amount numeric(14,2);
  v_used numeric;
  v_used_year numeric;
  v_claims_year integer;
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
  select * into v_p from public.protection_policies
  where id = v_c.policy_id for update;
  if not found or v_p.insurer_id <> v_insurer then raise exception 'Policy not found'; end if;

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
    if v_c.event_date is null or v_p.commencement_date is null
       or v_c.event_date > current_date
       or v_c.event_date < v_p.commencement_date
       or (v_p.expiry_date is not null and v_c.event_date > v_p.expiry_date) then
      raise exception 'Claim event date is outside the policy coverage period';
    end if;
    select * into v_v from public.protection_plan_versions where id = v_p.plan_version_id;
    if not found then raise exception 'Policy product version not found'; end if;
    -- Re-check aggregate limits against remaining headroom.
    if v_c.benefit_id is not null then
      select * into v_b from public.protection_benefits
      where id = v_c.benefit_id and plan_version_id = v_p.plan_version_id;
      if not found then raise exception 'Claim benefit is not on the insured product version'; end if;
      if v_b.per_event_limit is not null and v_amount > v_b.per_event_limit then
        raise exception 'Approval would exceed the per-event benefit limit';
      end if;
      if v_b.per_policy_limit is not null then
        select coalesce(sum(approved_amount),0) into v_used
        from public.protection_claims
        where policy_id = v_c.policy_id and benefit_id = v_c.benefit_id
          and id <> v_c.id and status in ('approved','partially_approved','paid');
        if v_used + v_amount > v_b.per_policy_limit then
          raise exception 'Approval would exceed the per-policy benefit limit';
        end if;
      end if;
      if v_b.annual_limit is not null then
        select coalesce(sum(approved_amount),0) into v_used_year
        from public.protection_claims
        where policy_id = v_c.policy_id and benefit_id = v_c.benefit_id
          and id <> v_c.id and status in ('approved','partially_approved','paid')
          and extract(year from event_date) = extract(year from v_c.event_date);
        if v_used_year + v_amount > v_b.annual_limit then
          raise exception 'Approval would exceed the annual benefit limit';
        end if;
      end if;
      if v_b.frequency_limit is not null then
        select count(*) into v_claims_year
        from public.protection_claims
        where policy_id = v_c.policy_id and benefit_id = v_c.benefit_id
          and id <> v_c.id and status in ('approved','partially_approved','paid')
          and extract(year from event_date) = extract(year from v_c.event_date);
        if v_claims_year >= v_b.frequency_limit then
          raise exception 'Approval would exceed the benefit frequency limit';
        end if;
      end if;
    end if;
    if v_v.terms->>'aggregate_limit_kes' is not null then
      select coalesce(sum(approved_amount),0) into v_used
      from public.protection_claims
      where policy_id = v_c.policy_id and id <> v_c.id
        and status in ('approved','partially_approved','paid');
      if v_used + v_amount > (v_v.terms->>'aggregate_limit_kes')::numeric then
        raise exception 'Approval would exceed the policy aggregate limit';
      end if;
    end if;
  end if;

  update public.protection_claims
  set status = v_new_status,
      approved_amount = v_amount,
      decision_by = (select auth.uid()),
      decided_at = now(),
      decision_reason = nullif(left(btrim(coalesce(p_reason,'')), 2000), ''),
      updated_at = now()
  where id = p_claim_id;

  perform public.protection_claim_event(p_claim_id, 'adjudicated',
    jsonb_build_object('decision', p_decision, 'approved_amount', v_amount));
  insert into public.protection_events (membership_id, insurer_id, actor_id, event_type, detail)
  values (v_c.membership_id, v_insurer, (select auth.uid()), 'claim_adjudicated',
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
  v_uid uuid := (select auth.uid());
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
               where p.id = policy_id and m.user_id = (select auth.uid()))
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
  if v_p.commencement_date is null or p_period_start < v_p.commencement_date
     or (v_p.expiry_date is not null and p_period_end > v_p.expiry_date) then
    raise exception 'Premium period must fall within the policy coverage dates';
  end if;
  if v_p.status in ('cancelled','expired','lapsed') then
    raise exception 'Policy is not in a premium-collectable state';
  end if;
  if exists (
    select 1 from public.protection_premium_records r
    where r.policy_id = p_policy_id
      and r.period_start <= p_period_end
      and r.period_end >= p_period_start
      and (r.period_start <> p_period_start or r.period_end <> p_period_end)
  ) then
    raise exception 'Premium period overlaps an existing policy ledger period';
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
    case when v_status = 'confirmed' then (select auth.uid()) else null end,
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
    p_policy_id, (select auth.uid())
  ) returning id into v_id;

  insert into public.protection_events (membership_id, insurer_id, actor_id, event_type, detail)
  values (v_old.membership_id, v_insurer, (select auth.uid()), 'policy_renewed',
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
  v_uid uuid := (select auth.uid());
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
         greatest(p.commencement_date, m.month_start) as eff_start,
         least(coalesce(p.expiry_date + 1, current_date + 1),
               (m.month_start + interval '1 month')::date) as eff_end
  from public.protection_policies p
  join months m
    on p.commencement_date < (m.month_start + interval '1 month')::date
   and coalesce(p.expiry_date + 1, current_date + 1) > m.month_start
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
         date_trunc('month', r.period_start)::date as month
  from public.protection_premium_records r
),
written as (
  select insurer_id, month,
         sum(amount_due) as written_premium,
         sum(amount_received) as received_premium,
         count(*) filter (where status = 'confirmed') as confirmed_records
  from rec
  group by insurer_id, month
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
select coalesce(w.insurer_id, e.insurer_id) as insurer_id,
       coalesce(w.month, e.month) as month,
       coalesce(w.written_premium, 0) as written_premium,
       coalesce(w.received_premium, 0) as received_premium,
       coalesce(w.confirmed_records, 0) as confirmed_records,
       coalesce(e.earned_premium, 0) as earned_premium
from written w
full outer join earned e on e.insurer_id = w.insurer_id and e.month = w.month;

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
revoke all on public.protection_policy_monthly_exposure from authenticated;
revoke all on public.protection_premium_monthly from authenticated;
revoke all on public.protection_claims_monthly from authenticated;

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
  v_member_count integer;
  v_result jsonb;
begin
  if v_insurer is null then raise exception 'Active insurer access required'; end if;
  perform public.protection_require_mode(array['pilot','live']);

  select count(distinct m.user_id), count(*) into v_member_count, v_policy_count
  from public.protection_policies p
  join public.protection_memberships m on m.id = p.membership_id
  where p.insurer_id = v_insurer
    and p.status in ('issued','pending_payment','active','grace');

  if v_member_count < 25 then
    return jsonb_build_object(
      'suppressed', true,
      'reason', 'Cohort below privacy minimum (25 distinct members)'
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
      where pm.insurer_id = v_insurer
        and pm.month >= date_trunc('month', current_date - interval '12 months')
        and pm.earned_premium is not null
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
  v_version record;
  v_membership_insurer uuid;
begin
  if tg_op = 'UPDATE' and (
    new.plan_version_id is distinct from old.plan_version_id
    or new.insurer_id is distinct from old.insurer_id
    or new.membership_id is distinct from old.membership_id
  ) then
    raise exception 'An issued policy cannot change its member, insurer or product version';
  end if;
  if tg_op = 'INSERT'
     or new.plan_version_id is distinct from old.plan_version_id
     or new.insurer_id is distinct from old.insurer_id
     or new.membership_id is distinct from old.membership_id then
    select status, insurer_id into v_version
    from public.protection_plan_versions where id = new.plan_version_id;
    if v_version.status is distinct from 'approved' then
      raise exception 'Policies require an approved product version';
    end if;
    if v_version.insurer_id is distinct from new.insurer_id then
      raise exception 'Policy insurer must match its approved product version';
    end if;
    select insurer_id into v_membership_insurer
    from public.protection_memberships where id = new.membership_id;
    if v_membership_insurer is distinct from new.insurer_id then
      raise exception 'Policy insurer must match its membership insurer';
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
  if tg_op = 'DELETE' and old.status <> 'draft' then
    raise exception 'Submitted product versions cannot be deleted';
  end if;
  if tg_op = 'UPDATE' then
    if old.status in ('withdrawn','superseded') then
      raise exception 'Terminal product versions cannot be changed';
    end if;
    if old.status = 'draft' and new.status not in ('draft','pending_approval','withdrawn') then
      raise exception 'Invalid product version transition % -> %', old.status, new.status;
    end if;
    if old.status = 'pending_approval' and new.status not in ('pending_approval','approved','withdrawn') then
      raise exception 'Invalid product version transition % -> %', old.status, new.status;
    end if;
    if old.status = 'approved' and new.status not in ('approved','superseded') then
      raise exception 'Invalid product version transition % -> %', old.status, new.status;
    end if;
    if old.status in ('approved','superseded') and (
       new.benefit_structure is distinct from old.benefit_structure
       or new.terms is distinct from old.terms
       or new.premium_amount is distinct from old.premium_amount
       or new.premium_frequency is distinct from old.premium_frequency
       or new.plan_id is distinct from old.plan_id
       or new.insurer_id is distinct from old.insurer_id
       or new.id is distinct from old.id
       or new.version_no is distinct from old.version_no
       or new.effective_from is distinct from old.effective_from
       or new.effective_to is distinct from old.effective_to
       or new.approved_by is distinct from old.approved_by
       or new.approved_at is distinct from old.approved_at
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at) then
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
  v_old_status text;
  v_new_status text;
begin
  if tg_op in ('UPDATE','DELETE') then
    select status into v_old_status from public.protection_plan_versions
    where id = old.plan_version_id;
    if v_old_status is distinct from 'draft' then
      raise exception 'Benefits are immutable once the product version leaves draft';
    end if;
  end if;
  if tg_op in ('INSERT','UPDATE') then
    select status into v_new_status from public.protection_plan_versions
    where id = new.plan_version_id;
    if v_new_status is distinct from 'draft' then
      raise exception 'Benefits may only be added to draft product versions';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists protection_benefit_immutable on public.protection_benefits;
create trigger protection_benefit_immutable
  before insert or update or delete on public.protection_benefits
  for each row execute function public.protection_benefit_immutable();

create or replace function public.admin_approve_plan_version(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_version public.protection_plan_versions;
  v_plan_id uuid;
begin
  if not public.is_super_admin() then raise exception 'Super-admin access required'; end if;
  select plan_id into v_plan_id
  from public.protection_plan_versions
  where id = p_version_id;
  if not found then raise exception 'Version not found'; end if;

  perform 1 from public.protection_plans where id = v_plan_id for update;
  select * into v_version
  from public.protection_plan_versions
  where id = p_version_id for update;
  if v_version.status <> 'pending_approval' then
    raise exception 'Only submitted versions can be approved';
  end if;
  if not exists (
    select 1 from public.protection_benefits b
    where b.plan_version_id = p_version_id and b.active and b.is_active
  ) then
    raise exception 'Version has no active benefits';
  end if;

  update public.protection_plan_versions
  set status = 'superseded'
  where plan_id = v_plan_id and id <> p_version_id and status = 'approved';
  update public.protection_plan_versions
  set status = 'approved', approved_by = (select auth.uid()), approved_at = now()
  where id = p_version_id;
  perform public.log_admin_action('plan_version_approved', 'protection_plan_versions',
    p_version_id::text,
    jsonb_build_object('plan_id', v_plan_id, 'version_no', v_version.version_no));
end;
$$;
revoke execute on function public.admin_approve_plan_version(uuid) from public, anon;
grant execute on function public.admin_approve_plan_version(uuid) to authenticated;

create or replace function public.member_list_my_cover()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_result jsonb;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  perform public.protection_require_mode(array['pilot','live']);
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
        'frequency_limit', b.frequency_limit, 'evidence_requirements', b.evidence_requirements,
        'milestone_type', b.milestone_type, 'milestone_ordinal', b.milestone_ordinal,
        'effective_from', b.effective_from, 'effective_to', b.effective_to
      ))
      from public.protection_policies p
      join public.protection_memberships m on m.id = p.membership_id
      join public.protection_benefits b
        on b.plan_version_id = p.plan_version_id and b.active and b.is_active
      where m.user_id = v_uid
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
revoke execute on function public.member_list_my_cover() from public, anon;
grant execute on function public.member_list_my_cover() to authenticated;

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
    and p.proname not in (
      -- Internal helpers: never client-executable (revoked again below).
      'protection_claim_event', 'protection_benefit_used', 'protection_log_access',
      'protection_refresh_policy_payment', 'protection_mode',
      'protection_require_mode', 'protection_is_active_insurer',
      'protection_insurer_eligible_for_enrolment', 'protection_lifecycle_sweep'
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

-- Negative regression checks — consolidated into ONE result set so the SQL
-- editor shows every check at once. Every count must be 0 on a hardened DB.
select * from (
  select 'member_forged_insurer_events' as check_name, count(*)::bigint as offending_rows
  from public.protection_claim_events e
  join public.protection_claims c on c.id = e.claim_id
  join public.protection_memberships m on m.id = c.membership_id
  where e.actor_role = 'user' and e.event_type in ('adjudicated', 'settled')
  union all
  select 'member_cross_policy_claim_events', count(*)::bigint
  from public.protection_claim_events e
  join public.protection_claims c on c.id = e.claim_id
  join public.protection_memberships m on m.id = c.membership_id
  where e.actor_role = 'user' and e.actor_id <> m.user_id
  union all
  select 'invalid_insurer_enrolments', count(*)::bigint
  from public.protection_memberships m
  join public.insurers i on i.id = m.insurer_id
  where m.status in ('pending_verification', 'active') and i.status <> 'active'
  union all
  select 'client_writable_protection_claim_events', count(*)::bigint
  from pg_policies
  where schemaname = 'public' and tablename = 'protection_claim_events'
    and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
) regression_checks
order by check_name;

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
revoke execute on function public.protection_benefit_used(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.protection_benefit_used(uuid, uuid, integer)
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

-- ---------------------------------------------------------------------------
-- CLAIM EVIDENCE WORKFLOW (post-audit remediation)
-- Members attach evidence only to their OWN claims in evidence-accepting
-- statuses. Storage paths must live under the member's uid folder so the
-- storage.objects owner policy and this check agree. Insurer reads remain
-- via insurer_get_claim (metadata only) + claim-evidence storage policy.
-- ---------------------------------------------------------------------------
create or replace function public.member_add_claim_evidence(
  p_claim_id uuid,
  p_evidence_type text,
  p_storage_path text default null,
  p_structured jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_c public.protection_claims;
  v_id uuid;
  v_path_parts text[];
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  perform public.protection_require_mode(array['pilot','live']);
  if p_structured is not null and jsonb_typeof(p_structured) <> 'object' then
    raise exception 'Structured evidence must be an object';
  end if;
  if p_structured is not null and p_structured <> '{}'::jsonb then
    raise exception 'Structured claim evidence is not supported; attach a document instead';
  end if;
  if p_storage_path is null and (p_structured is null or p_structured = '{}'::jsonb) then
    raise exception 'A document is required';
  end if;

  select c.* into v_c from public.protection_claims c
  join public.protection_memberships m on m.id = c.membership_id
  where c.id = p_claim_id and m.user_id = v_uid;
  if not found then raise exception 'Claim not found'; end if;
  if v_c.status not in ('submitted','under_review','info_requested') then
    raise exception 'Evidence can only be added while the claim is open';
  end if;
  if v_c.created_by is distinct from v_uid then
    raise exception 'Only the claimant can add evidence';
  end if;

  if p_storage_path is not null then
    v_path_parts := string_to_array(p_storage_path, '/');
    if cardinality(v_path_parts) <> 3
       or v_path_parts[1] <> v_uid::text
       or v_path_parts[2] <> p_claim_id::text
       or btrim(v_path_parts[3]) = ''
       or btrim(v_path_parts[3]) in ('.','..') then
      raise exception 'Evidence path must be <your user ID>/<claim ID>/<filename>';
    end if;
    if length(p_storage_path) > 500 then raise exception 'Invalid evidence path'; end if;
    if not exists (
      select 1 from storage.buckets
      where id = 'claim-evidence' and public = false
    ) then
      raise exception 'Claim evidence bucket is not configured as private';
    end if;
    if not exists (
      select 1 from storage.objects
      where bucket_id = 'claim-evidence' and name = p_storage_path
    ) then
      raise exception 'Uploaded evidence file was not found in the private claim-evidence bucket';
    end if;
  end if;

  insert into public.protection_claim_evidence (
    claim_id, evidence_type, storage_path, structured, provided_by
  ) values (
    p_claim_id, left(btrim(coalesce(p_evidence_type,'document')), 60),
    p_storage_path, coalesce(p_structured,'{}'::jsonb), v_uid
  ) returning id into v_id;

  perform public.protection_claim_event(p_claim_id, 'submitted',
    jsonb_build_object('evidence_added', true, 'evidence_type', p_evidence_type));
  return v_id;
end;
$$;
revoke execute on function public.member_add_claim_evidence(uuid, text, text, jsonb) from public, anon;
grant execute on function public.member_add_claim_evidence(uuid, text, text, jsonb) to authenticated;

-- Insurer evidence access: returns storage paths ONLY for claims owned by
-- the caller's insurer org, audited via protection_log_access. Frontend
-- converts paths to short-lived signed URLs via the Storage API.
create or replace function public.insurer_get_claim_evidence(p_claim_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_insurer uuid := public.protection_insurer_id();
  v_claim_user uuid;
  v_result jsonb;
begin
  if v_insurer is null then raise exception 'Active insurer access required'; end if;
  perform public.protection_require_mode(array['pilot','live']);
  select m.user_id into v_claim_user
  from public.protection_claims c
  join public.protection_memberships m on m.id = c.membership_id
  where c.id = p_claim_id and c.insurer_id = v_insurer;
  if not found then raise exception 'Claim not found'; end if;
  if not exists (
    select 1 from storage.buckets
    where id = 'claim-evidence' and public = false
  ) then
    raise exception 'Claim evidence bucket is not configured as private';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id, 'evidence_type', e.evidence_type,
    'storage_path', e.storage_path,
    'created_at', e.created_at
  ) order by e.created_at), '[]'::jsonb) into v_result
  from public.protection_claim_evidence e
  join public.protection_claims c on c.id = e.claim_id
  join public.protection_memberships m on m.id = c.membership_id
  where e.claim_id = p_claim_id
    and c.insurer_id = v_insurer
    and (
      e.storage_path is null
      or (
        cardinality(string_to_array(e.storage_path, '/')) = 3
        and split_part(e.storage_path, '/', 1) = v_claim_user::text
        and split_part(e.storage_path, '/', 2) = c.id::text
        and btrim(split_part(e.storage_path, '/', 3)) <> ''
        and btrim(split_part(e.storage_path, '/', 3)) not in ('.','..')
        and exists (
          select 1 from storage.objects o
          where o.bucket_id = 'claim-evidence' and o.name = e.storage_path
        )
      )
    );
  perform public.protection_log_access('get_claim_evidence', 'protection_claim_evidence', p_claim_id::text, 'claims adjudication');
  return v_result;
end;
$$;
revoke execute on function public.insurer_get_claim_evidence(uuid) from public, anon;
grant execute on function public.insurer_get_claim_evidence(uuid) to authenticated;

-- Member evidence removal: own claim, open status only. Metadata is removed
-- first; the client then deletes the still-private object. If Storage deletion
-- fails, the orphan has no evidence metadata and cannot be read by the insurer.
create or replace function public.member_remove_claim_evidence(p_evidence_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_claim_id uuid;
  v_status text;
  v_claim_user uuid;
  v_path text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select e.claim_id, c.status, m.user_id, e.storage_path
    into v_claim_id, v_status, v_claim_user, v_path
  from public.protection_claim_evidence e
  join public.protection_claims c on c.id = e.claim_id
  join public.protection_memberships m on m.id = c.membership_id
  where e.id = p_evidence_id and m.user_id = v_uid and e.provided_by = v_uid;
  if not found then raise exception 'Evidence not found'; end if;
  if v_status not in ('submitted','under_review','info_requested') then
    raise exception 'Evidence can only be removed while the claim is open';
  end if;
  if v_claim_user is distinct from v_uid then raise exception 'Claim not found'; end if;
  if v_path is not null and (
    cardinality(string_to_array(v_path, '/')) <> 3
    or split_part(v_path, '/', 1) <> v_uid::text
    or split_part(v_path, '/', 2) <> v_claim_id::text
    or btrim(split_part(v_path, '/', 3)) = ''
    or btrim(split_part(v_path, '/', 3)) in ('.','..')
  ) then
    raise exception 'Evidence path does not belong to this claim';
  end if;
  if v_path is not null and not exists (
    select 1 from storage.buckets where id = 'claim-evidence' and public = false
  ) then
    raise exception 'Claim evidence bucket is not configured as private';
  end if;
  delete from public.protection_claim_evidence where id = p_evidence_id;
end;
$$;
revoke execute on function public.member_remove_claim_evidence(uuid) from public, anon;
grant execute on function public.member_remove_claim_evidence(uuid) to authenticated;

-- Return storage_path to the owning member so the UI can sign/delete it.
create or replace function public.member_list_claim_evidence(p_claim_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not exists (
    select 1 from public.protection_claims c
    join public.protection_memberships m on m.id = c.membership_id
    where c.id = p_claim_id and m.user_id = v_uid
  ) then raise exception 'Claim not found'; end if;
  if exists (
    select 1 from public.protection_claim_evidence
    where claim_id = p_claim_id and storage_path is not null
  ) and not exists (
    select 1 from storage.buckets
    where id = 'claim-evidence' and public = false
  ) then
    raise exception 'Claim evidence bucket is not configured as private';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id, 'evidence_type', e.evidence_type, 'storage_path', e.storage_path,
      'has_document', e.storage_path is not null
        and cardinality(string_to_array(e.storage_path, '/')) = 3
        and split_part(e.storage_path, '/', 1) = v_uid::text
        and split_part(e.storage_path, '/', 2) = p_claim_id::text
        and btrim(split_part(e.storage_path, '/', 3)) <> ''
        and btrim(split_part(e.storage_path, '/', 3)) not in ('.','..'),
      'created_at', e.created_at
    ) order by e.created_at)
    from public.protection_claim_evidence e
    where e.claim_id = p_claim_id
      and (
        e.storage_path is null
        or (
          cardinality(string_to_array(e.storage_path, '/')) = 3
          and split_part(e.storage_path, '/', 1) = v_uid::text
          and split_part(e.storage_path, '/', 2) = p_claim_id::text
          and btrim(split_part(e.storage_path, '/', 3)) <> ''
          and btrim(split_part(e.storage_path, '/', 3)) not in ('.','..')
        )
      )
  ), '[]'::jsonb);
end;
$$;
revoke execute on function public.member_list_claim_evidence(uuid) from public, anon;
grant execute on function public.member_list_claim_evidence(uuid) to authenticated;

-- ===========================================================================
-- V2: MILESTONE BENEFITS, TREATMENT EPISODES, MILESTONE VERIFICATION,
--     MILESTONE CLAIMS, ACTUARIAL WORKBENCH
-- ===========================================================================

-- Benefit schedule gains milestone configuration (immutable once version
-- approved — existing triggers cover row immutability).
alter table public.protection_benefits
  add column if not exists milestone_type text,
  add column if not exists milestone_ordinal integer,
  add column if not exists effective_from date,
  add column if not exists effective_to date,
  add column if not exists is_active boolean not null default true;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pb_milestone_type_chk') then
    alter table public.protection_benefits add constraint pb_milestone_type_chk
      check (milestone_type is null or milestone_type in ('entry','course','reengagement','other'));
  end if;
end $$;
create index if not exists pb_milestone_idx on public.protection_benefits
  (plan_version_id, milestone_type, milestone_ordinal) where is_active;

create table if not exists public.protection_treatment_episodes (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.protection_memberships(id) on delete cascade,
  policy_id uuid not null references public.protection_policies(id) on delete cascade,
  insurer_id uuid not null references public.insurers(id) on delete cascade,
  therapist_id uuid references public.therapists(id) on delete set null,
  treatment_plan_ref text,
  status text not null default 'open' check (status in ('open','interrupted','completed','closed')),
  started_at date not null default current_date,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pte_membership_idx on public.protection_treatment_episodes (membership_id);
create index if not exists pte_therapist_idx on public.protection_treatment_episodes (therapist_id, status);
create index if not exists pte_insurer_idx on public.protection_treatment_episodes (insurer_id);
alter table public.protection_treatment_episodes enable row level security;
drop policy if exists pte_member_read on public.protection_treatment_episodes;
create policy pte_member_read on public.protection_treatment_episodes for select to authenticated
  using (exists (select 1 from public.protection_memberships m
    where m.id = membership_id and m.user_id = (select auth.uid())));
drop policy if exists pte_therapist_read on public.protection_treatment_episodes;
create policy pte_therapist_read on public.protection_treatment_episodes for select to authenticated
  using (
    therapist_id = (select auth.uid())
    and public.is_active_user()
    and public.current_user_role() = 'therapist'
    and exists (select 1 from public.therapists t
                where t.id = (select auth.uid()) and t.status = 'active')
  );
drop policy if exists pte_insurer_read on public.protection_treatment_episodes;
create policy pte_insurer_read on public.protection_treatment_episodes for select to authenticated
  using (public.is_active_insurer(insurer_id));
drop policy if exists pte_admin_all on public.protection_treatment_episodes;
create policy pte_admin_all on public.protection_treatment_episodes for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
revoke insert, update, delete on public.protection_treatment_episodes from authenticated;
grant select on public.protection_treatment_episodes to authenticated;

create table if not exists public.protection_milestones (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.protection_treatment_episodes(id) on delete cascade,
  membership_id uuid not null references public.protection_memberships(id) on delete cascade,
  policy_id uuid not null references public.protection_policies(id) on delete cascade,
  insurer_id uuid not null references public.insurers(id) on delete cascade,
  milestone_type text not null check (milestone_type in ('entry','course','reengagement')),
  ordinal integer not null default 1 check (ordinal between 1 and 52),
  status text not null default 'verified' check (status in ('verified','disputed','void')),
  service_date date not null,
  verified_by uuid not null references public.therapists(id),
  verified_at timestamptz not null default now(),
  evidence jsonb not null default '{}'::jsonb,
  claim_id uuid references public.protection_claims(id) on delete set null,
  created_at timestamptz not null default now()
);
-- One verification per episode+type+ordinal (re-verification = new episode).
create unique index if not exists pm_episode_milestone_uq
  on public.protection_milestones (episode_id, milestone_type, ordinal);
create index if not exists pm_membership_idx on public.protection_milestones (membership_id, created_at desc);
create index if not exists pm_policy_idx on public.protection_milestones (policy_id, status);
create index if not exists pm_insurer_idx on public.protection_milestones (insurer_id, created_at desc);
alter table public.protection_milestones enable row level security;
drop policy if exists pm_member_read on public.protection_milestones;
create policy pm_member_read on public.protection_milestones for select to authenticated
  using (exists (select 1 from public.protection_memberships m
    where m.id = membership_id and m.user_id = (select auth.uid())));
drop policy if exists pm_therapist_read on public.protection_milestones;
create policy pm_therapist_read on public.protection_milestones for select to authenticated
  using (
    verified_by = (select auth.uid())
    and public.is_active_user()
    and public.current_user_role() = 'therapist'
    and exists (select 1 from public.therapists t
                where t.id = (select auth.uid()) and t.status = 'active')
  );
drop policy if exists pm_insurer_read on public.protection_milestones;
create policy pm_insurer_read on public.protection_milestones for select to authenticated
  using (public.is_active_insurer(insurer_id));
drop policy if exists pm_admin_all on public.protection_milestones;
create policy pm_admin_all on public.protection_milestones for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
revoke insert, update, delete on public.protection_milestones from authenticated;
grant select on public.protection_milestones to authenticated;
revoke select on public.protection_treatment_episodes from authenticated;
revoke select on public.protection_milestones from authenticated;

alter table public.protection_claims
  add column if not exists milestone_id uuid references public.protection_milestones(id) on delete set null;
create unique index if not exists pcl_milestone_guard
  on public.protection_claims (milestone_id)
  where milestone_id is not null and status not in ('cancelled','rejected');

-- Actuarial modelling workbench runs (super-admin only; aggregate/synthetic
-- data only — never member-level clinical or behavioural data).
create table if not exists public.protection_actuarial_runs (
  id uuid primary key default gen_random_uuid(),
  model_version text not null,
  scenario_label text,
  methodology text,
  params jsonb not null default '{}'::jsonb,
  dataset jsonb,
  outputs jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.protection_actuarial_runs enable row level security;
drop policy if exists par_admin_all on public.protection_actuarial_runs;
create policy par_admin_all on public.protection_actuarial_runs for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
revoke all on public.protection_actuarial_runs from anon, authenticated;
grant select, insert on public.protection_actuarial_runs to authenticated;

-- ---------------------------------------------------------------------------
-- Member: start a treatment episode against an active policy + therapist.
-- ---------------------------------------------------------------------------
create or replace function public.member_start_episode(
  p_policy_id uuid, p_therapist_id uuid, p_plan_ref text default null
)
returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_uid uuid := (select auth.uid());
  v_pol public.protection_policies;
  v_membership_status text;
  v_ins uuid;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  perform public.protection_require_mode(array['pilot','live']);
  select p.* into v_pol from public.protection_policies p
  join public.protection_memberships m on m.id = p.membership_id
  where p.id = p_policy_id and m.user_id = v_uid;
  if not found then raise exception 'Policy not found'; end if;
  if v_pol.status not in ('active','grace')
     or v_pol.commencement_date is null
     or v_pol.commencement_date > current_date
     or (v_pol.expiry_date is not null and v_pol.expiry_date < current_date)
     or (v_pol.status = 'grace' and (v_pol.grace_ends_at is null or v_pol.grace_ends_at < now())) then
    raise exception 'Policy is not in force';
  end if;
  select status into v_membership_status from public.protection_memberships
  where id = v_pol.membership_id;
  if v_membership_status <> 'active' then raise exception 'Membership is not active'; end if;
  if p_plan_ref is not null and length(btrim(p_plan_ref)) > 80 then
    raise exception 'Treatment plan reference is too long';
  end if;
  select insurer_id into v_ins from public.protection_policies where id = p_policy_id;
  if not exists (
    select 1 from public.therapists t
    join public.profiles p on p.id = t.id
    where t.id = p_therapist_id and t.status = 'active'
      and p.role = 'therapist' and p.status = 'active'
  ) then
    raise exception 'Therapist is not active';
  end if;
  insert into public.protection_treatment_episodes
    (membership_id, policy_id, insurer_id, therapist_id, treatment_plan_ref, created_by)
  values (v_pol.membership_id, p_policy_id, v_ins, p_therapist_id, nullif(btrim(p_plan_ref),''), v_uid)
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.member_start_episode(uuid,uuid,text) from public, anon;
grant execute on function public.member_start_episode(uuid,uuid,text) to authenticated;

create or replace function public.member_list_my_milestones()
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_uid uuid := (select auth.uid()); begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  return jsonb_build_object(
    'episodes', coalesce((select jsonb_agg(jsonb_build_object(
        'id', e.id, 'status', e.status, 'started_at', e.started_at,
        'plan_ref', e.treatment_plan_ref, 'therapist_id', e.therapist_id,
        'specialty', t.specialty) order by e.created_at desc)
      from public.protection_treatment_episodes e
      left join public.therapists t on t.id = e.therapist_id
      join public.protection_memberships m on m.id = e.membership_id
      where m.user_id = v_uid), '[]'::jsonb),
    'milestones', coalesce((select jsonb_agg(jsonb_build_object(
        'id', ms.id, 'episode_id', ms.episode_id, 'milestone_type', ms.milestone_type,
        'ordinal', ms.ordinal, 'service_date', ms.service_date, 'status', ms.status,
        'claim_id', ms.claim_id, 'created_at', ms.created_at) order by ms.created_at desc)
      from public.protection_milestones ms
      join public.protection_memberships m on m.id = ms.membership_id
      where m.user_id = v_uid), '[]'::jsonb)
  );
end $$;
revoke execute on function public.member_list_my_milestones() from public, anon;
grant execute on function public.member_list_my_milestones() to authenticated;

create or replace function public.therapist_list_assigned_episodes()
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_uid uuid := (select auth.uid()); begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not public.is_active_user()
     or public.current_user_role() is distinct from 'therapist'
     or not exists (select 1 from public.therapists t where t.id = v_uid and t.status = 'active') then
    raise exception 'Active therapist verification required';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', e.id, 'status', e.status, 'started_at', e.started_at,
      'plan_ref', e.treatment_plan_ref, 'member_reference', m.member_reference,
      'policy_number', p.policy_number,
      'milestones', coalesce((select jsonb_agg(jsonb_build_object(
          'id', ms.id, 'milestone_type', ms.milestone_type, 'ordinal', ms.ordinal,
          'service_date', ms.service_date, 'status', ms.status) order by ms.ordinal)
        from public.protection_milestones ms where ms.episode_id = e.id), '[]'::jsonb)
    ) order by e.created_at desc)
    from public.protection_treatment_episodes e
    join public.protection_memberships m on m.id = e.membership_id
    join public.protection_policies p on p.id = e.policy_id
    where e.therapist_id = v_uid), '[]'::jsonb);
end $$;
revoke execute on function public.therapist_list_assigned_episodes() from public, anon;
grant execute on function public.therapist_list_assigned_episodes() to authenticated;

create or replace function public.therapist_verify_milestone(
  p_episode_id uuid, p_milestone_type text, p_ordinal integer default 1,
  p_service_date date default current_date, p_evidence jsonb default '{}'::jsonb
)
returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_uid uuid := (select auth.uid());
  v_ep public.protection_treatment_episodes;
  v_pol public.protection_policies;
  v_service_date date := coalesce(p_service_date, current_date);
  v_id uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not public.is_active_user()
     or public.current_user_role() is distinct from 'therapist'
     or not exists (select 1 from public.therapists t where t.id = v_uid and t.status = 'active') then
    raise exception 'Active therapist verification required';
  end if;
  perform public.protection_require_mode(array['pilot','live']);
  if p_milestone_type not in ('entry','course','reengagement') then
    raise exception 'Invalid milestone type';
  end if;
  if p_evidence is not null and p_evidence <> '{}'::jsonb then
    raise exception 'Free-text milestone evidence is not accepted';
  end if;
  if coalesce(p_ordinal, 1) < 1 or coalesce(p_ordinal, 1) > 52
     or (p_milestone_type in ('entry','reengagement') and coalesce(p_ordinal, 1) <> 1) then
    raise exception 'Milestone ordinal is invalid';
  end if;
  select * into v_ep from public.protection_treatment_episodes
  where id = p_episode_id and therapist_id = v_uid for update;
  if not found then raise exception 'Episode not found or not assigned to you'; end if;
  if v_ep.status not in ('open','interrupted') then raise exception 'Episode is not verifiable'; end if;
  if v_service_date > current_date or v_service_date < v_ep.started_at then
    raise exception 'Service date must be between episode start and today';
  end if;
  select * into v_pol from public.protection_policies where id = v_ep.policy_id;
  if not found or v_pol.commencement_date is null
     or v_service_date < v_pol.commencement_date
     or (v_pol.expiry_date is not null and v_service_date > v_pol.expiry_date) then
    raise exception 'Service date is outside the policy coverage period';
  end if;
  if p_milestone_type = 'reengagement' and not exists (
    select 1 from public.protection_treatment_episodes prev
    where prev.membership_id = v_ep.membership_id and prev.id <> v_ep.id
      and prev.status in ('completed','interrupted','closed')
  ) then raise exception 'Re-engagement requires a prior treatment episode'; end if;
  if exists (select 1 from public.protection_milestones ms
             where ms.episode_id = p_episode_id and ms.milestone_type = p_milestone_type
               and ms.ordinal = coalesce(p_ordinal,1)) then
    raise exception 'Milestone already verified for this episode';
  end if;
  insert into public.protection_milestones
    (episode_id, membership_id, policy_id, insurer_id, milestone_type, ordinal,
     service_date, verified_by, evidence)
  values (p_episode_id, v_ep.membership_id, v_ep.policy_id, v_ep.insurer_id,
          p_milestone_type, coalesce(p_ordinal,1), coalesce(p_service_date, current_date),
          v_uid, jsonb_build_object('attestation', 'therapist_verified'))
  returning id into v_id;
  insert into public.protection_events (membership_id, insurer_id, actor_id, event_type, detail)
  values (v_ep.membership_id, v_ep.insurer_id, v_uid, 'treatment_milestone_verified',
          jsonb_build_object('milestone_id', v_id, 'milestone_type', p_milestone_type,
                             'service_date', v_service_date));
  return v_id;
end $$;
revoke execute on function public.therapist_verify_milestone(uuid,text,integer,date,jsonb) from public, anon;
grant execute on function public.therapist_verify_milestone(uuid,text,integer,date,jsonb) to authenticated;

create or replace function public.member_submit_milestone_claim(p_milestone_id uuid)
returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_uid uuid := (select auth.uid());
  v_ms public.protection_milestones;
  v_pol public.protection_policies;
  v_ver record;
  v_b public.protection_benefits;
  v_amount numeric;
  v_used numeric;
  v_used_year numeric;
  v_claim_id uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  perform public.protection_require_mode(array['pilot','live']);
  select ms.* into v_ms from public.protection_milestones ms
  join public.protection_memberships m on m.id = ms.membership_id
  where ms.id = p_milestone_id and m.user_id = v_uid
  for update of ms;
  if not found then raise exception 'Milestone not found'; end if;
  if v_ms.status <> 'verified' then raise exception 'Milestone is not verified'; end if;
  if v_ms.claim_id is not null then raise exception 'Milestone already has a claim'; end if;
  if not exists (select 1 from public.protection_memberships m
                 where m.id = v_ms.membership_id and m.status = 'active') then
    raise exception 'Membership is not active';
  end if;
  select p.* into v_pol from public.protection_policies p
  where p.id = v_ms.policy_id for update;
  if not found or v_pol.status not in ('active','grace')
     or v_pol.commencement_date is null
     or (v_pol.status = 'grace' and (v_pol.grace_ends_at is null or v_pol.grace_ends_at < now()))
     or v_pol.membership_id <> v_ms.membership_id
     or v_pol.insurer_id <> v_ms.insurer_id
     or v_ms.service_date > current_date
     or v_ms.service_date < v_pol.commencement_date
     or (v_pol.expiry_date is not null and v_ms.service_date > v_pol.expiry_date)
     or (v_pol.status = 'grace' and v_pol.grace_ends_at < now()) then
    raise exception 'Policy is not in force for this milestone';
  end if;
  select pv.id as version_id, pv.benefit_structure, pv.terms into v_ver
  from public.protection_policies p
  join public.protection_plan_versions pv on pv.id = p.plan_version_id
  where p.id = v_ms.policy_id;
  select * into v_b from public.protection_benefits b
  where b.plan_version_id = v_ver.version_id
    and b.milestone_type = v_ms.milestone_type
    and (b.milestone_ordinal is null or b.milestone_ordinal = v_ms.ordinal)
    and b.active and b.is_active
    and (b.effective_from is null or b.effective_from <= v_ms.service_date)
    and (b.effective_to is null or b.effective_to >= v_ms.service_date)
  order by b.milestone_ordinal nulls last limit 1;
  if not found then raise exception 'No benefit covers this milestone'; end if;
  if v_ver.benefit_structure not in ('fixed_sum','hybrid')
     or v_b.benefit_type <> 'fixed_sum' then
    raise exception 'Milestone benefits must be fixed-sum benefits on a covered product';
  end if;
  declare v_wait int := greatest(
    coalesce((v_ver.terms->>'waiting_period_days')::int, 0),
    coalesce(v_b.waiting_period_days, 0)); begin
    if v_ms.service_date < v_pol.commencement_date + v_wait then
      raise exception 'Waiting period has not elapsed for this milestone';
    end if;
  end;
  v_amount := coalesce(v_b.fixed_amount, 0);
  if v_amount <= 0 then raise exception 'Benefit has no fixed amount configured'; end if;
  if v_b.per_event_limit is not null and v_amount > v_b.per_event_limit then
    v_amount := v_b.per_event_limit;
  end if;
  if v_amount <= 0 then raise exception 'Benefit amount must be positive'; end if;
  select coalesce(sum(coalesce(c.approved_amount, c.claimed_amount)), 0) into v_used
  from public.protection_claims c
  where c.policy_id = v_pol.id and c.benefit_id = v_b.id
    and c.status not in ('cancelled','rejected','draft');
  if v_b.per_policy_limit is not null and v_used + v_amount > v_b.per_policy_limit then
    raise exception 'Per-policy benefit limit would be exceeded';
  end if;
  if v_b.annual_limit is not null then
    select coalesce(sum(coalesce(c.approved_amount, c.claimed_amount)), 0) into v_used_year
    from public.protection_claims c
    where c.policy_id = v_pol.id and c.benefit_id = v_b.id
      and c.status not in ('cancelled','rejected','draft')
      and extract(year from c.event_date) = extract(year from v_ms.service_date);
    if v_used_year + v_amount > v_b.annual_limit then
      raise exception 'Annual benefit limit would be exceeded';
    end if;
  end if;
  if v_b.frequency_limit is not null and
     (select count(*) from public.protection_claims c
      where c.policy_id = v_pol.id and c.benefit_id = v_b.id
        and c.status not in ('cancelled','rejected')
        and extract(year from c.event_date) = extract(year from v_ms.service_date)) >= v_b.frequency_limit then
    raise exception 'Benefit frequency limit reached';
  end if;
  if v_ver.terms->>'aggregate_limit_kes' is not null then
    declare v_agg numeric; begin
      select coalesce(sum(coalesce(c.approved_amount, c.claimed_amount)),0) into v_agg
      from public.protection_claims c where c.policy_id = v_pol.id
        and c.status not in ('cancelled','rejected');
      if v_agg + v_amount > (v_ver.terms->>'aggregate_limit_kes')::numeric then
        raise exception 'Policy aggregate limit would be exceeded';
      end if;
    end;
  end if;
  insert into public.protection_claims
    (membership_id, policy_id, insurer_id, benefit_id, milestone_id, claim_type,
     status, event_description, event_date, claimed_amount, created_by)
  values (v_ms.membership_id, v_pol.id, v_pol.insurer_id, v_b.id, v_ms.id,
          'fixed_sum', 'submitted',
          'Treatment milestone: ' || v_ms.milestone_type || ' #' || v_ms.ordinal,
          v_ms.service_date, v_amount, v_uid)
  returning id into v_claim_id;
  update public.protection_milestones set claim_id = v_claim_id where id = v_ms.id;
  perform public.protection_claim_event(v_claim_id, 'submitted',
    jsonb_build_object('milestone_id', v_ms.id, 'milestone_type', v_ms.milestone_type,
                       'service_date', v_ms.service_date));
  insert into public.protection_events (membership_id, insurer_id, actor_id, event_type, detail)
  values (v_ms.membership_id, v_ms.insurer_id, v_uid, 'milestone_claim_submitted',
          jsonb_build_object('claim_id', v_claim_id, 'milestone_id', v_ms.id));
  return v_claim_id;
end $$;
revoke execute on function public.member_submit_milestone_claim(uuid) from public, anon;
grant execute on function public.member_submit_milestone_claim(uuid) to authenticated;

create or replace function public.insurer_get_claim_milestone(p_claim_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_ins uuid := public.protection_insurer_id(); v_result jsonb;
begin
  if v_ins is null then raise exception 'Active insurer access required'; end if;
  select jsonb_build_object(
    'milestone_type', ms.milestone_type, 'ordinal', ms.ordinal,
    'service_date', ms.service_date, 'status', ms.status,
    'verified_at', ms.verified_at
  ) into v_result
  from public.protection_claims c
  join public.protection_milestones ms on ms.id = c.milestone_id
  where c.id = p_claim_id and c.insurer_id = v_ins;
  if v_result is null then raise exception 'Milestone not found'; end if;
  perform public.protection_log_access('get_claim_milestone','protection_milestones',p_claim_id::text,'claims adjudication');
  return v_result;
end $$;
revoke execute on function public.insurer_get_claim_milestone(uuid) from public, anon;
grant execute on function public.insurer_get_claim_milestone(uuid) to authenticated;

create or replace function public.admin_save_actuarial_run(
  p_model_version text, p_scenario_label text, p_methodology text,
  p_params jsonb, p_dataset jsonb, p_outputs jsonb
)
returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_id uuid;
begin
  if not public.is_super_admin() then raise exception 'Super-admin only'; end if;
  if p_model_version is null or btrim(p_model_version) = '' then raise exception 'Model version required'; end if;
  insert into public.protection_actuarial_runs
    (model_version, scenario_label, methodology, params, dataset, outputs, created_by)
  values (left(btrim(p_model_version),40), left(coalesce(p_scenario_label,''),80),
          left(coalesce(p_methodology,''),2000), coalesce(p_params,'{}'::jsonb),
          p_dataset, coalesce(p_outputs,'{}'::jsonb), (select auth.uid()))
  returning id into v_id;
  perform public.log_admin_action('actuarial_run_saved','protection_actuarial_runs',v_id::text,
    jsonb_build_object('model_version', p_model_version, 'scenario', p_scenario_label));
  return v_id;
end $$;
revoke execute on function public.admin_save_actuarial_run(text,text,text,jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.admin_save_actuarial_run(text,text,text,jsonb,jsonb,jsonb) to authenticated;

create or replace function public.admin_list_actuarial_runs()
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if not public.is_super_admin() then raise exception 'Super-admin only'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', r.id, 'model_version', r.model_version, 'scenario_label', r.scenario_label,
      'methodology', r.methodology, 'params', r.params, 'dataset', r.dataset, 'outputs', r.outputs,
      'created_at', r.created_at) order by r.created_at desc)
    from (select * from public.protection_actuarial_runs order by created_at desc limit 50) r), '[]'::jsonb);
end $$;
revoke execute on function public.admin_list_actuarial_runs() from public, anon;
grant execute on function public.admin_list_actuarial_runs() to authenticated;

-- Drop the superseded 11-argument overload defined in script 07; only the
-- 15-argument version below is current.
drop function if exists public.insurer_upsert_benefit(uuid, text, text, text, numeric, numeric, numeric, numeric, integer, integer, jsonb);

create or replace function public.insurer_upsert_benefit(
  p_plan_version_id uuid, p_benefit_code text, p_name text, p_benefit_type text,
  p_fixed_amount numeric, p_per_event_limit numeric, p_per_policy_limit numeric,
  p_annual_limit numeric, p_waiting_period_days integer, p_frequency_limit integer,
  p_evidence_requirements jsonb,
  p_milestone_type text default null, p_milestone_ordinal integer default null,
  p_effective_from date default null, p_effective_to date default null,
  p_is_active boolean default true
) returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_ins uuid := public.protection_insurer_id(); v_ver record; v_id uuid;
begin
  if v_ins is null then raise exception 'Active insurer access required'; end if;
  perform public.protection_require_mode(array['pilot','live']);
  select pv.* into v_ver from public.protection_plan_versions pv
  where pv.id = p_plan_version_id and pv.insurer_id = v_ins;
  if not found then raise exception 'Product version not found'; end if;
  if v_ver.status <> 'draft' then raise exception 'Only draft versions can be edited'; end if;
  if p_milestone_type is not null and p_milestone_type not in ('entry','course','reengagement','other') then
    raise exception 'Invalid milestone type';
  end if;
  if p_milestone_ordinal is not null
     and (p_milestone_ordinal < 1 or p_milestone_ordinal > 52
          or (p_milestone_type in ('entry','reengagement') and p_milestone_ordinal <> 1)) then
    raise exception 'Milestone ordinal is invalid';
  end if;
  if p_effective_from is not null and p_effective_to is not null
     and p_effective_to < p_effective_from then
    raise exception 'Benefit end date must not precede its start date';
  end if;
  insert into public.protection_benefits
    (plan_version_id, benefit_code, name, benefit_type, fixed_amount,
     per_event_limit, per_policy_limit, annual_limit, waiting_period_days,
     frequency_limit, evidence_requirements, milestone_type, milestone_ordinal,
     effective_from, effective_to, active, is_active)
  values (p_plan_version_id, upper(btrim(p_benefit_code)), btrim(p_name), p_benefit_type,
          p_fixed_amount, p_per_event_limit, p_per_policy_limit, p_annual_limit,
          coalesce(p_waiting_period_days,0), p_frequency_limit,
          coalesce(p_evidence_requirements,'[]'::jsonb), p_milestone_type,
          p_milestone_ordinal, p_effective_from, p_effective_to,
          coalesce(p_is_active,true), coalesce(p_is_active,true))
  on conflict (plan_version_id, benefit_code) do update set
    name = excluded.name, benefit_type = excluded.benefit_type,
    fixed_amount = excluded.fixed_amount, per_event_limit = excluded.per_event_limit,
    per_policy_limit = excluded.per_policy_limit, annual_limit = excluded.annual_limit,
    waiting_period_days = excluded.waiting_period_days,
    frequency_limit = excluded.frequency_limit,
    evidence_requirements = excluded.evidence_requirements,
    milestone_type = excluded.milestone_type, milestone_ordinal = excluded.milestone_ordinal,
    effective_from = excluded.effective_from, effective_to = excluded.effective_to,
    active = excluded.active,
    is_active = excluded.is_active
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.insurer_upsert_benefit(uuid,text,text,text,numeric,numeric,numeric,numeric,integer,integer,jsonb,text,integer,date,date,boolean) from public, anon;
grant execute on function public.insurer_upsert_benefit(uuid,text,text,text,numeric,numeric,numeric,numeric,integer,integer,jsonb,text,integer,date,date,boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- V2 product lifecycle transitions (draft -> pending_approval -> approved;
-- withdrawn/superseded terminal-ish states). Approved content stays immutable.
-- ---------------------------------------------------------------------------
create or replace function public.insurer_submit_plan_version(p_version_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_ins uuid := public.protection_insurer_id(); v_ver record; begin
  if v_ins is null then raise exception 'Active insurer access required'; end if;
  perform public.protection_require_mode(array['pilot','live']);
  select * into v_ver from public.protection_plan_versions
  where id = p_version_id and insurer_id = v_ins for update;
  if not found then raise exception 'Version not found'; end if;
  if v_ver.status <> 'draft' then raise exception 'Only draft versions can be submitted'; end if;
  if not exists (select 1 from public.protection_benefits b
                 where b.plan_version_id = p_version_id and b.active and b.is_active) then
    raise exception 'Version must have at least one active benefit';
  end if;
  update public.protection_plan_versions set status = 'pending_approval' where id = p_version_id;
end $$;
revoke execute on function public.insurer_submit_plan_version(uuid) from public, anon;
grant execute on function public.insurer_submit_plan_version(uuid) to authenticated;

create or replace function public.insurer_withdraw_plan_version(p_version_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_ins uuid := public.protection_insurer_id(); v_ver record; begin
  if v_ins is null then raise exception 'Active insurer access required'; end if;
  perform public.protection_require_mode(array['pilot','live']);
  select * into v_ver from public.protection_plan_versions
  where id = p_version_id and insurer_id = v_ins for update;
  if not found then raise exception 'Version not found'; end if;
  if v_ver.status not in ('draft','pending_approval') then
    raise exception 'Only draft or submitted versions can be withdrawn';
  end if;
  update public.protection_plan_versions set status = 'withdrawn' where id = p_version_id;
end $$;
revoke execute on function public.insurer_withdraw_plan_version(uuid) from public, anon;
grant execute on function public.insurer_withdraw_plan_version(uuid) to authenticated;

create or replace function public.admin_reject_plan_version(p_version_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_ver record; begin
  if not public.is_super_admin() then raise exception 'Super-admin only'; end if;
  select * into v_ver from public.protection_plan_versions where id = p_version_id for update;
  if not found then raise exception 'Version not found'; end if;
  if v_ver.status <> 'pending_approval' then
    raise exception 'Only submitted versions can be rejected';
  end if;
  update public.protection_plan_versions set status = 'withdrawn' where id = p_version_id;
  perform public.log_admin_action('plan_version_rejected','protection_plan_versions',p_version_id::text,
    jsonb_build_object('version_no', v_ver.version_no, 'reason', p_reason));
end $$;
revoke execute on function public.admin_reject_plan_version(uuid,text) from public, anon;
grant execute on function public.admin_reject_plan_version(uuid,text) to authenticated;

-- CBT module completion is recorded server-side. The current authored modules
-- contain three lessons each; update this allowlist with the content if that
-- curriculum changes.
create table if not exists public.cbt_module_sessions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  module_id text not null check (module_id in ('1','2','3','4','5','6','7','8')),
  started_at timestamptz not null default now(),
  viewed_lessons integer[] not null default '{}',
  primary key (user_id, module_id),
  check (viewed_lessons <@ array[0,1,2])
);
alter table public.cbt_module_sessions enable row level security;
drop policy if exists cbt_module_sessions_owner_read on public.cbt_module_sessions;
create policy cbt_module_sessions_owner_read on public.cbt_module_sessions
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.cbt_module_sessions from anon, authenticated;
grant select on public.cbt_module_sessions to authenticated;

-- Prevent client-side fabrication of completion rows; the SECURITY DEFINER
-- completion function below is the only authenticated write path.
revoke all on public.cbt_progress from anon, authenticated;
grant select on public.cbt_progress to authenticated;

create or replace function public.member_record_cbt_lesson(
  p_module_id text,
  p_lesson_index integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_session public.cbt_module_sessions;
begin
  if v_uid is null or not public.is_active_user()
     or public.current_user_role() is distinct from 'user' then
    raise exception 'Active member access required';
  end if;
  if p_module_id is null or p_module_id not in ('1','2','3','4','5','6','7','8')
     or p_lesson_index is null or p_lesson_index < 0 or p_lesson_index > 2 then
    raise exception 'Invalid CBT module or lesson';
  end if;
  insert into public.cbt_module_sessions (user_id, module_id)
  values (v_uid, p_module_id)
  on conflict (user_id, module_id) do nothing;
  select * into v_session
  from public.cbt_module_sessions
  where user_id = v_uid and module_id = p_module_id
  for update;
  if exists (
    select 1 from public.cbt_progress
    where user_id = v_uid and module_id = p_module_id and completed
  ) then
    raise exception 'Module is already complete';
  end if;
  if not (p_lesson_index = any(v_session.viewed_lessons)) then
    update public.cbt_module_sessions
    set viewed_lessons = array_append(viewed_lessons, p_lesson_index)
    where user_id = v_uid and module_id = p_module_id
    returning * into v_session;
  end if;

  return jsonb_build_object(
    'started_at', v_session.started_at,
    'viewed_lessons', v_session.viewed_lessons
  );
end;
$$;
revoke execute on function public.member_record_cbt_lesson(text,integer) from public, anon;
grant execute on function public.member_record_cbt_lesson(text,integer) to authenticated;

create or replace function public.member_complete_cbt_module(p_module_id text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_session public.cbt_module_sessions;
begin
  if v_uid is null or not public.is_active_user()
     or public.current_user_role() is distinct from 'user' then
    raise exception 'Active member access required';
  end if;
  if p_module_id is null or p_module_id not in ('1','2','3','4','5','6','7','8') then
    raise exception 'Invalid CBT module';
  end if;
  if exists (
    select 1 from public.cbt_progress
    where user_id = v_uid and module_id = p_module_id and completed
  ) then
    return jsonb_build_object('status', 'already_complete');
  end if;

  select * into v_session
  from public.cbt_module_sessions
  where user_id = v_uid and module_id = p_module_id
  for update;
  if not found then
    raise exception 'Start this module and view every lesson before completing it';
  end if;
  if exists (
    select 1 from public.cbt_progress
    where user_id = v_uid and module_id = p_module_id and completed
  ) then
    return jsonb_build_object('status', 'already_complete');
  end if;
  if not (v_session.viewed_lessons @> array[0,1,2]) then
    raise exception 'View every lesson before completing this module';
  end if;
  if v_session.started_at > now() - interval '20 minutes' then
    raise exception 'The minimum 20-minute learning period has not elapsed';
  end if;

  insert into public.cbt_progress (
    user_id, module_id, completed, completed_at
  ) values (
    v_uid, p_module_id, true, now()
  )
  on conflict (user_id, module_id) do update
    set completed = true, completed_at = excluded.completed_at;

  return jsonb_build_object('status', 'completed');
end;
$$;
revoke execute on function public.member_complete_cbt_module(text) from public, anon;
grant execute on function public.member_complete_cbt_module(text) to authenticated;

-- Support tickets are private to the submitting account and support staff.
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject text not null check (length(btrim(subject)) between 3 and 160),
  category text not null check (category in ('account', 'technical', 'billing', 'protection', 'other')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists support_tickets_user_updated_idx
  on public.support_tickets(user_id, updated_at desc);
create index if not exists support_tickets_status_updated_idx
  on public.support_tickets(status, updated_at desc);

create table if not exists public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists support_ticket_messages_ticket_created_idx
  on public.support_ticket_messages(ticket_id, created_at);

alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;
revoke all on public.support_tickets, public.support_ticket_messages from anon, authenticated;

create or replace function public.support_submit_ticket(
  p_subject text,
  p_category text,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_ticket_id uuid;
begin
  if v_uid is null or not public.is_active_user()
     or public.current_user_role() is null then
    raise exception 'Active account required';
  end if;
  if p_subject is null or length(btrim(p_subject)) not between 3 and 160
     or p_category is null or p_category not in ('account','technical','billing','protection','other')
     or p_body is null or length(btrim(p_body)) not between 1 and 4000 then
    raise exception 'Enter a valid subject, category, and message';
  end if;

  insert into public.support_tickets (user_id, subject, category)
  values (v_uid, btrim(p_subject), p_category)
  returning id into v_ticket_id;
  insert into public.support_ticket_messages (ticket_id, sender_id, body)
  values (v_ticket_id, v_uid, btrim(p_body));
  return v_ticket_id;
end;
$$;
revoke execute on function public.support_submit_ticket(text,text,text) from public, anon;
grant execute on function public.support_submit_ticket(text,text,text) to authenticated;

create or replace function public.support_list_tickets()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_is_staff boolean := public.is_admin();
  v_result jsonb;
begin
  if v_uid is null or not public.is_active_user()
     or public.current_user_role() is null then
    raise exception 'Active account required';
  end if;
  select coalesce(jsonb_agg(ticket_data order by updated_at desc), '[]'::jsonb)
  into v_result
  from (
    select t.updated_at,
      jsonb_build_object(
        'id', t.id,
        'user_id', t.user_id,
        'subject', t.subject,
        'category', t.category,
        'status', t.status,
        'created_at', t.created_at,
        'updated_at', t.updated_at,
        'messages', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', m.id, 'sender_id', m.sender_id, 'body', m.body, 'created_at', m.created_at
          ) order by m.created_at)
          from public.support_ticket_messages m where m.ticket_id = t.id
        ), '[]'::jsonb)
      ) as ticket_data
    from public.support_tickets t
    where v_is_staff or t.user_id = v_uid
    order by t.updated_at desc
    limit 100
  ) tickets;
  return v_result;
end;
$$;
revoke execute on function public.support_list_tickets() from public, anon;
grant execute on function public.support_list_tickets() to authenticated;

create or replace function public.support_add_message(p_ticket_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_ticket public.support_tickets;
  v_is_staff boolean := public.is_admin();
begin
  if v_uid is null or not public.is_active_user()
     or public.current_user_role() is null then
    raise exception 'Active account required';
  end if;
  if p_ticket_id is null or p_body is null
     or length(btrim(p_body)) not between 1 and 4000 then
    raise exception 'Enter a valid ticket message';
  end if;
  select * into v_ticket from public.support_tickets
  where id = p_ticket_id and (v_is_staff or user_id = v_uid)
  for update;
  if not found then raise exception 'Ticket not found'; end if;
  if v_ticket.status = 'closed' then raise exception 'This ticket is closed'; end if;

  insert into public.support_ticket_messages (ticket_id, sender_id, body)
  values (p_ticket_id, v_uid, btrim(p_body));
  update public.support_tickets
  set status = case when v_is_staff then 'in_progress' else status end,
      updated_at = now()
  where id = p_ticket_id;
end;
$$;
revoke execute on function public.support_add_message(uuid,text) from public, anon;
grant execute on function public.support_add_message(uuid,text) to authenticated;

create or replace function public.support_set_ticket_status(p_ticket_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if (select auth.uid()) is null or not public.is_active_user() or not public.is_admin() then
    raise exception 'Administrator access required';
  end if;
  if p_ticket_id is null or p_status is null or p_status not in ('open','in_progress','closed') then
    raise exception 'Invalid ticket status';
  end if;
  update public.support_tickets
  set status = p_status,
      updated_at = now(),
      closed_at = case when p_status = 'closed' then now() else null end
  where id = p_ticket_id;
  if not found then raise exception 'Ticket not found'; end if;
end;
$$;
revoke execute on function public.support_set_ticket_status(uuid,text) from public, anon;
grant execute on function public.support_set_ticket_status(uuid,text) to authenticated;

-- ===========================================================================
-- FINAL HARDENING BLOCK (idempotent; safe to re-run)
-- ===========================================================================
-- Internal helpers must never be executable by end users. Revoke explicitly.
revoke execute on function public.protection_refresh_policy_payment(uuid) from public, anon, authenticated;
revoke execute on function public.protection_mode() from public, anon, authenticated;
revoke execute on function public.protection_require_mode(text[]) from public, anon, authenticated;
revoke execute on function public.protection_is_active_insurer() from public, anon, authenticated;
revoke execute on function public.protection_insurer_eligible_for_enrolment(uuid) from public, anon, authenticated;
revoke execute on function public.protection_benefit_used(uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function public.protection_claim_event(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.protection_log_access(text, text, text, text) from public, anon, authenticated;
-- audit_logs is append-only for clients: block TRUNCATE entirely.
revoke truncate on public.audit_logs from public, anon, authenticated;
-- Future functions must not default to PUBLIC/anon execute.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon;
alter default privileges for role postgres in schema public
  grant execute on functions to authenticated;

-- ===========================================================================
-- ACCOUNT-DELETION RECONCILIATION
-- Financial and insurance-administration rows must survive member deletion
-- with identity stripped, never cascade away. Every FK from the tables below
-- to public.profiles is re-created as ON DELETE SET NULL (single-column FKs
-- only; staff references verified_by/created_by/cancelled_by/decision_by get
-- the same rule). Member-owned user_id columns are made nullable so the row
-- can be retained with identity removed. Idempotent: constraint names are
-- preserved and re-created only when the delete rule differs.
-- ===========================================================================
do $$
declare
  c record;
  v_col text;
  v_deltext text;
begin
  for c in
    select con.conname,
           n.nspname || '.' || cl.relname as tbl,
           con.conrelid,
           con.conkey[1] as attnum,
           con.confdeltype
    from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid
    join pg_namespace n on n.oid = cl.relnamespace
    where con.contype = 'f'
      and con.confrelid = 'public.profiles'::regclass
      and n.nspname = 'public'
      and cl.relname in (
        'payments',
        'protection_memberships',
        'provider_vouchers',
        'provider_claims',
        'protection_policies',
        'protection_claims',
        'protection_claim_events',
        'protection_claim_evidence',
        'protection_milestones',
        'protection_treatment_episodes',
        'protection_premium_records',
        'protection_roster_entries',
        'pre_auth_vouchers',
        'claim_submissions',
        'bulk_invoices'
      )
  loop
    if c.confdeltype <> 'n' then  -- 'n' = ON DELETE SET NULL
      select a.attname into v_col
      from pg_attribute a
      where a.attrelid = c.conrelid and a.attnum = c.attnum;
      execute format('alter table %s drop constraint %I', c.tbl, c.conname);
      execute format('alter table %s alter column %I drop not null', c.tbl, v_col);
      execute format(
        'alter table %s add constraint %I foreign key (%I) references public.profiles(id) on delete set null',
        c.tbl, c.conname, v_col
      );
    end if;
  end loop;
end $$;

-- Documented deletion rule (applied by supabase/functions/delete-account):
--   * member PII tables (diary, chat, mirror, pacts, rsvps, notifications,
--     supporter data, circle/whispers rows) are deleted outright;
--   * financial/insurance rows above are retained with user_id (and staff
--     references) set to NULL — payments, memberships, policies, claims,
--     premium ledger and claim evidence survive for insurer/admin records;
--   * protection_memberships.status is set to 'ended' before anonymisation;
--   * storage objects are removed per bucket before the auth user is deleted;
--   * actor_id on audit_logs is already ON DELETE SET NULL (see script 02) —
--     audit rows are pseudonymised, not deleted, and TRUNCATE is revoked.

-- ===========================================================================
-- ANON LOCKDOWN (explicit allowlist)
-- Revoke EXECUTE on EVERY public function from PUBLIC and anon, then restore
-- service_role (edge functions/RPC internals) and re-grant only the six
-- functions anon callers legitimately need. Authenticated keeps its existing
-- per-function grants; internal helpers stay revoked.
-- ===========================================================================
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

-- Explicit anon allowlist (supporter portal + company-code validation).
grant execute on function public.supporter_lookup(text) to anon;
grant execute on function public.supporter_respond(text, boolean) to anon;
grant execute on function public.supporter_get_summary(text) to anon;
grant execute on function public.supporter_post_message(text, text) to anon;
grant execute on function public.supporter_list_messages(text) to anon;
grant execute on function public.validate_company_code(text) to anon;
