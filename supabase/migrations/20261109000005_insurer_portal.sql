-- Insurer workspace, adjudication, aggregate reporting, and invoice workflows.

create table if not exists public.insurers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete restrict,
  name text not null,
  license_number text,
  contact_email text,
  contact_phone text,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now()
);

create table if not exists public.insurer_partnerships (
  id uuid primary key default gen_random_uuid(),
  insurer_id uuid not null references public.insurers(id) on delete restrict,
  cohort_name text not null,
  b2b_client_id uuid references public.b2b_clients(id) on delete set null,
  contract_start date,
  contract_end date,
  per_member_fee numeric(12,2) not null default 0 check (per_member_fee >= 0),
  member_count integer not null default 0 check (member_count >= 0),
  status text not null default 'active' check (status in ('active', 'inactive', 'expired')),
  created_at timestamptz not null default now(),
  check (contract_end is null or contract_start is null or contract_end >= contract_start)
);

create table if not exists public.claim_submissions (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.provider_claims(id) on delete restrict,
  insurer_id uuid not null references public.insurers(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  insurer_status text not null default 'submitted'
    check (insurer_status in ('submitted', 'approved', 'paid', 'rejected', 'disputed')),
  insurer_notes text,
  insurer_reviewed_at timestamptz,
  insurer_reviewed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (claim_id, insurer_id)
);

create table if not exists public.bulk_invoices (
  id uuid primary key default gen_random_uuid(),
  insurer_id uuid not null references public.insurers(id) on delete restrict,
  invoice_period_start date not null,
  invoice_period_end date not null,
  total_claims integer not null default 0 check (total_claims >= 0),
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  status text not null default 'draft' check (status in ('draft', 'sent', 'paid', 'disputed')),
  sent_at timestamptz,
  paid_at timestamptz,
  mpesa_or_ach_ref text,
  created_at timestamptz not null default now(),
  check (invoice_period_end >= invoice_period_start)
);

create table if not exists public.bulk_invoice_claims (
  invoice_id uuid not null references public.bulk_invoices(id) on delete cascade,
  claim_id uuid not null references public.claim_submissions(id) on delete restrict,
  primary key (invoice_id, claim_id),
  unique (claim_id)
);

create unique index if not exists bulk_invoice_period_unique
  on public.bulk_invoices(insurer_id, invoice_period_start, invoice_period_end);
create unique index if not exists insurer_partnership_one_active_b2b
  on public.insurer_partnerships(b2b_client_id)
  where b2b_client_id is not null and status = 'active';
create index if not exists insurer_partnerships_insurer_idx
  on public.insurer_partnerships(insurer_id, status);
create index if not exists claim_submissions_insurer_status_idx
  on public.claim_submissions(insurer_id, insurer_status, submitted_at desc);
create index if not exists bulk_invoices_insurer_period_idx
  on public.bulk_invoices(insurer_id, invoice_period_end desc);

alter table public.insurers enable row level security;
alter table public.insurer_partnerships enable row level security;
alter table public.claim_submissions enable row level security;
alter table public.bulk_invoices enable row level security;
alter table public.bulk_invoice_claims enable row level security;

create or replace function public.is_active_insurer(p_insurer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.insurers i
    join public.profiles p on p.id = i.profile_id
    where i.id = p_insurer_id and i.profile_id = auth.uid()
      and i.status = 'active' and p.role = 'insurer' and p.status = 'active'
  );
$$;

drop policy if exists insurers_super_admin_all on public.insurers;
create policy insurers_super_admin_all on public.insurers for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists insurers_self_select on public.insurers;
create policy insurers_self_select on public.insurers for select to authenticated
  using (profile_id = auth.uid() and status = 'active' and public.is_active_user()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'insurer'));

drop policy if exists insurer_partnerships_super_admin_all on public.insurer_partnerships;
create policy insurer_partnerships_super_admin_all on public.insurer_partnerships for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists insurer_partnerships_self_select on public.insurer_partnerships;
create policy insurer_partnerships_self_select on public.insurer_partnerships for select to authenticated
  using (public.is_active_insurer(insurer_id) and public.is_active_user());

drop policy if exists claim_submissions_super_admin_all on public.claim_submissions;
create policy claim_submissions_super_admin_all on public.claim_submissions for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists claim_submissions_insurer_select on public.claim_submissions;
create policy claim_submissions_insurer_select on public.claim_submissions for select to authenticated
  using (public.is_active_insurer(insurer_id) and public.is_active_user());

drop policy if exists bulk_invoices_super_admin_all on public.bulk_invoices;
create policy bulk_invoices_super_admin_all on public.bulk_invoices for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists bulk_invoices_insurer_select on public.bulk_invoices;
create policy bulk_invoices_insurer_select on public.bulk_invoices for select to authenticated
  using (public.is_active_insurer(insurer_id) and public.is_active_user());

drop policy if exists bulk_invoice_claims_super_admin_all on public.bulk_invoice_claims;
create policy bulk_invoice_claims_super_admin_all on public.bulk_invoice_claims for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists bulk_invoice_claims_insurer_select on public.bulk_invoice_claims;
create policy bulk_invoice_claims_insurer_select on public.bulk_invoice_claims for select to authenticated
  using (exists (
    select 1 from public.bulk_invoices invoice
    where invoice.id = invoice_id and public.is_active_insurer(invoice.insurer_id)
  ) and public.is_active_user());

create or replace function public.insurer_list_claims()
returns table (
  claim_id uuid,
  session_date date,
  claim_amount numeric,
  claim_status text,
  insurer_status text,
  insurer_notes text,
  submitted_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_insurer_id uuid;
begin
  select i.id into v_insurer_id from public.insurers i
  where i.profile_id = auth.uid() and i.status = 'active';
  if v_insurer_id is null or not public.is_active_insurer(v_insurer_id) then
    raise exception 'Active insurer access required';
  end if;
  return query
    select c.id, c.session_date, c.claim_amount, c.status, s.insurer_status, s.insurer_notes, s.submitted_at
    from public.claim_submissions s
    join public.provider_claims c on c.id = s.claim_id
    where s.insurer_id = v_insurer_id
    order by s.submitted_at desc;
end;
$$;

create or replace function public.insurer_approve_claim(p_claim_id uuid, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_insurer_id uuid;
begin
  select id into v_insurer_id from public.insurers
  where profile_id = auth.uid() and status = 'active';
  if v_insurer_id is null or not public.is_active_insurer(v_insurer_id) then
    raise exception 'Active insurer access required';
  end if;
  update public.claim_submissions
  set insurer_status = 'approved', insurer_notes = nullif(left(btrim(coalesce(p_notes, '')), 2000), ''),
      insurer_reviewed_at = now(), insurer_reviewed_by = auth.uid()
  where claim_id = p_claim_id and insurer_id = v_insurer_id and insurer_status = 'submitted';
  if not found then raise exception 'Submitted claim not found'; end if;
  insert into public.audit_logs (actor_id, action, target_table, target_id, metadata)
  values (auth.uid(), 'insurer_claim_approved', 'claim_submissions', p_claim_id::text, '{}'::jsonb);
end;
$$;

create or replace function public.insurer_reject_claim(p_claim_id uuid, p_notes text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_insurer_id uuid;
begin
  select id into v_insurer_id from public.insurers
  where profile_id = auth.uid() and status = 'active';
  if v_insurer_id is null or not public.is_active_insurer(v_insurer_id) then
    raise exception 'Active insurer access required';
  end if;
  if p_notes is null or length(btrim(p_notes)) = 0 then raise exception 'A rejection reason is required'; end if;
  update public.claim_submissions
  set insurer_status = 'rejected', insurer_notes = left(btrim(p_notes), 2000),
      insurer_reviewed_at = now(), insurer_reviewed_by = auth.uid()
  where claim_id = p_claim_id and insurer_id = v_insurer_id and insurer_status = 'submitted';
  if not found then raise exception 'Submitted claim not found'; end if;
  insert into public.audit_logs (actor_id, action, target_table, target_id, metadata)
  values (auth.uid(), 'insurer_claim_rejected', 'claim_submissions', p_claim_id::text,
    jsonb_build_object('reason', left(btrim(p_notes), 2000)));
end;
$$;

create or replace function public.insurer_generate_bulk_invoice(
  p_insurer_id uuid, p_period_start date, p_period_end date
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_invoice_id uuid;
begin
  if not public.is_super_admin() then raise exception 'Only super admins can generate invoices'; end if;
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then
    raise exception 'Invalid invoice period';
  end if;
  select id into v_invoice_id from public.bulk_invoices
  where insurer_id = p_insurer_id and invoice_period_start = p_period_start and invoice_period_end = p_period_end
  for update;
  if v_invoice_id is null then
    insert into public.bulk_invoices (insurer_id, invoice_period_start, invoice_period_end)
    values (p_insurer_id, p_period_start, p_period_end)
    returning id into v_invoice_id;
  elsif (select status from public.bulk_invoices where id = v_invoice_id) <> 'draft' then
    raise exception 'This period already has a finalized invoice';
  end if;

  insert into public.bulk_invoice_claims (invoice_id, claim_id)
  select v_invoice_id, s.id
  from public.claim_submissions s
  join public.provider_claims c on c.id = s.claim_id
  where s.insurer_id = p_insurer_id
    and s.insurer_status = 'approved'
    and c.status = 'approved'
    and c.session_date between p_period_start and p_period_end
    and not exists (select 1 from public.bulk_invoice_claims bic where bic.claim_id = s.id)
  on conflict do nothing;

  update public.bulk_invoices i
  set total_claims = counts.claim_count, total_amount = counts.total_amount
  from (
    select count(*)::integer as claim_count, coalesce(sum(c.claim_amount), 0)::numeric(14,2) as total_amount
    from public.bulk_invoice_claims bic
    join public.claim_submissions s on s.id = bic.claim_id
    join public.provider_claims c on c.id = s.claim_id
    where bic.invoice_id = v_invoice_id
  ) counts
  where i.id = v_invoice_id;
  return v_invoice_id;
end;
$$;

create or replace function public.insurer_send_bulk_invoice(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_super_admin() then raise exception 'Only super admins can send invoices'; end if;
  update public.bulk_invoices set status = 'sent', sent_at = now()
  where id = p_invoice_id and status = 'draft' and total_claims > 0;
  if not found then raise exception 'Draft invoice not found or empty'; end if;
end;
$$;

create or replace function public.insurer_mark_invoice_paid(p_invoice_id uuid, p_ref text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_insurer_id uuid;
begin
  select id into v_insurer_id from public.insurers where profile_id = auth.uid() and status = 'active';
  if not public.is_super_admin() and (v_insurer_id is null or not public.is_active_insurer(v_insurer_id)) then
    raise exception 'Active insurer or super admin access required';
  end if;
  update public.bulk_invoices
  set status = 'paid', paid_at = now(), mpesa_or_ach_ref = nullif(left(btrim(coalesce(p_ref, '')), 200), '')
  where id = p_invoice_id and status = 'sent'
    and (public.is_super_admin() or insurer_id = v_insurer_id);
  if not found then raise exception 'Sent invoice not found'; end if;
end;
$$;

create or replace function public.insurer_export_invoice_csv(p_invoice_id uuid)
returns table (claim_id uuid, session_date date, amount numeric, claim_status text, insurer_status text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_insurer_id uuid;
begin
  select id into v_insurer_id from public.insurers where profile_id = auth.uid() and status = 'active';
  if not public.is_super_admin() and (v_insurer_id is null or not public.is_active_insurer(v_insurer_id)) then
    raise exception 'Active insurer or super admin access required';
  end if;
  if not exists (
    select 1 from public.bulk_invoices i where i.id = p_invoice_id
      and (public.is_super_admin() or i.insurer_id = v_insurer_id)
  ) then raise exception 'Invoice not found'; end if;
  return query
    select c.id, c.session_date, c.claim_amount, c.status, s.insurer_status
    from public.bulk_invoice_claims bic
    join public.claim_submissions s on s.id = bic.claim_id
    join public.provider_claims c on c.id = s.claim_id
    where bic.invoice_id = p_invoice_id
    order by c.session_date, c.id;
end;
$$;

create or replace view public.insurer_aggregate_stats as
with cohorts as (
  select
    i.id as insurer_id,
    count(distinct p.id)::integer as cohort_size,
    (count(distinct p.id) filter (where p.status = 'active'))::integer as active_members,
    jsonb_build_object(
      'free', (count(distinct p.id) filter (where coalesce(p.subscription_plan, 'free') = 'free' and coalesce(p.plan_type, 'individual') <> 'company')),
      'premium', (count(distinct p.id) filter (where p.subscription_plan = 'premium')),
      'company', (count(distinct p.id) filter (where p.plan_type = 'company'))
    ) as tier_mix,
    jsonb_build_object(
      'low', (count(distinct p.id) filter (where coalesce(p.risk_level, 'low') = 'low')),
      'medium', (count(distinct p.id) filter (where p.risk_level = 'medium')),
      'high', (count(distinct p.id) filter (where p.risk_level = 'high'))
    ) as aggregate_markov_state
  from public.insurers i
  join public.insurer_partnerships ip on ip.insurer_id = i.id and ip.status = 'active'
    and (ip.contract_start is null or ip.contract_start <= current_date)
    and (ip.contract_end is null or ip.contract_end >= current_date)
  join public.profiles p on p.b2b_client_id = ip.b2b_client_id
  where public.is_active_insurer(i.id)
  group by i.id
), claims as (
  select
    s.insurer_id,
    (count(*) filter (where s.submitted_at >= now() - interval '30 days'))::integer as claims_last_30d,
    (count(*) filter (where s.submitted_at >= now() - interval '90 days'))::integer as claims_last_90d,
    avg(c.claim_amount) as avg_claim_amount,
    sum(c.claim_amount) filter (where s.insurer_status = 'paid' and s.insurer_reviewed_at >= now() - interval '90 days') as total_paid_last_90d
  from public.claim_submissions s
  join public.provider_claims c on c.id = s.claim_id
  group by s.insurer_id
)
select
  cohorts.insurer_id,
  cohorts.cohort_size,
  cohorts.active_members,
  cohorts.tier_mix,
  cohorts.aggregate_markov_state,
  coalesce(claims.claims_last_30d, 0) as claims_last_30d,
  coalesce(claims.claims_last_90d, 0) as claims_last_90d,
  coalesce(claims.avg_claim_amount, 0) as avg_claim_amount,
  coalesce(claims.total_paid_last_90d, 0) as total_paid_last_90d
from cohorts
left join claims on claims.insurer_id = cohorts.insurer_id
where cohorts.cohort_size >= 10;

revoke all on function public.is_active_insurer(uuid) from public, anon;
revoke all on function public.insurer_list_claims() from public, anon;
revoke all on function public.insurer_approve_claim(uuid, text) from public, anon;
revoke all on function public.insurer_reject_claim(uuid, text) from public, anon;
revoke all on function public.insurer_generate_bulk_invoice(uuid, date, date) from public, anon;
revoke all on function public.insurer_send_bulk_invoice(uuid) from public, anon;
revoke all on function public.insurer_mark_invoice_paid(uuid, text) from public, anon;
revoke all on function public.insurer_export_invoice_csv(uuid) from public, anon;
grant execute on function public.is_active_insurer(uuid) to authenticated;
grant execute on function public.insurer_list_claims() to authenticated;
grant execute on function public.insurer_approve_claim(uuid, text) to authenticated;
grant execute on function public.insurer_reject_claim(uuid, text) to authenticated;
grant execute on function public.insurer_generate_bulk_invoice(uuid, date, date) to authenticated;
grant execute on function public.insurer_send_bulk_invoice(uuid) to authenticated;
grant execute on function public.insurer_mark_invoice_paid(uuid, text) to authenticated;
grant execute on function public.insurer_export_invoice_csv(uuid) to authenticated;
grant select on public.insurer_aggregate_stats to authenticated;

notify pgrst, 'reload schema';
