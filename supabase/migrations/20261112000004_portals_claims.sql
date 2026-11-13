-- 04_portals_claims.sql — LossLens consolidated portals/claims (part 4/8)
-- Consolidated from: 20261110000004_portals_claims.sql
-- Depends on 01-03.

-- ============================================================================
-- 20261110000004_portals_claims.sql — LossLens therapist/insurer/claims (consolidated)
-- ============================================================================
-- Final state: therapists, insurers, partnerships, provider_vouchers,
-- pre_auth_vouchers, provider_claims, provider_payouts, claim_submissions,
-- bulk invoices, claims float ledger, their RLS/grants, views and RPCs.
-- Newest function versions are appended last so they win over earlier drafts.
-- Ends with a guarded legacy weak-hash remap (no-op on fresh databases).
-- Idempotent: safe to apply twice. Depends on files 01-03.
-- ============================================================================
-- Therapist portal schema and workflows. Idempotent; apply after security hardening.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('user', 'admin', 'super_admin', 'therapist', 'insurer'));

create table if not exists public.therapists (
  id uuid primary key references public.profiles(id) on delete cascade,
  license_number text,
  specialty text,
  languages text[] not null default '{}',
  bio text,
  license_document_path text,
  status text not null default 'pending' check (status in ('pending', 'active', 'suspended')),
  verified_at timestamptz,
  verified_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.therapists add column if not exists license_document_path text;

create table if not exists public.provider_vouchers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  therapist_id uuid references public.therapists(id) on delete set null,
  crisis_alert_id uuid references public.crisis_alerts(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'assigned', 'accepted', 'completed', 'expired', 'void')),
  max_sessions integer not null default 1 check (max_sessions > 0),
  fee_per_session numeric(12,2) not null default 0 check (fee_per_session >= 0),
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.provider_claims (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references public.provider_vouchers(id) on delete restrict,
  therapist_id uuid not null references public.therapists(id) on delete restrict,
  session_date date not null default current_date,
  clinical_notes text not null,
  icd_code text,
  claim_amount numeric(12,2) not null check (claim_amount >= 0),
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'paid', 'rejected', 'disputed')),
  paid_at timestamptz,
  insurer_reimbursed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.provider_payouts (
  id uuid primary key default gen_random_uuid(),
  therapist_id uuid not null references public.therapists(id) on delete restrict,
  claim_id uuid not null unique references public.provider_claims(id) on delete restrict,
  amount numeric(12,2) not null check (amount >= 0),
  mpesa_ref text,
  paid_at timestamptz not null default now()
);

create index if not exists provider_vouchers_user_idx on public.provider_vouchers(user_id, created_at desc);
create index if not exists provider_vouchers_therapist_idx on public.provider_vouchers(therapist_id, status);
create index if not exists provider_claims_therapist_idx on public.provider_claims(therapist_id, created_at desc);
create index if not exists provider_claims_voucher_idx on public.provider_claims(voucher_id);
create index if not exists provider_payouts_therapist_idx on public.provider_payouts(therapist_id, paid_at desc);

alter table public.therapists enable row level security;
alter table public.provider_vouchers enable row level security;
alter table public.provider_claims enable row level security;
alter table public.provider_payouts enable row level security;

drop policy if exists therapist_self_select on public.therapists;
create policy therapist_self_select on public.therapists for select to authenticated
  using (id = auth.uid() and public.is_active_user());
drop policy if exists therapist_self_update on public.therapists;
create policy therapist_self_update on public.therapists for update to authenticated
  using (id = auth.uid() and public.is_active_user())
  with check (id = auth.uid() and public.is_active_user());
drop policy if exists active_therapists_public_select on public.therapists;
create policy active_therapists_public_select on public.therapists for select to authenticated
  using (status = 'active' and public.is_active_user());
drop policy if exists therapist_super_admin_all on public.therapists;
create policy therapist_super_admin_all on public.therapists for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
revoke update on public.therapists from authenticated;
grant update (license_number, specialty, languages, bio, license_document_path) on public.therapists to authenticated;

insert into storage.buckets (id, name, public)
values ('therapist-documents', 'therapist-documents', false)
on conflict (id) do update set public = false;
drop policy if exists therapist_documents_read on storage.objects;
create policy therapist_documents_read on storage.objects for select to authenticated
  using (bucket_id = 'therapist-documents'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_super_admin()));
drop policy if exists therapist_documents_insert on storage.objects;
create policy therapist_documents_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'therapist-documents'
    and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists therapist_documents_update on storage.objects;
create policy therapist_documents_update on storage.objects for update to authenticated
  using (bucket_id = 'therapist-documents'
    and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'therapist-documents'
    and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists provider_vouchers_owner_select on public.provider_vouchers;
create policy provider_vouchers_owner_select on public.provider_vouchers for select to authenticated
  using ((user_id = auth.uid() or therapist_id = auth.uid()) and public.is_active_user());
drop policy if exists provider_vouchers_super_admin_all on public.provider_vouchers;
create policy provider_vouchers_super_admin_all on public.provider_vouchers for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists provider_claims_therapist_select on public.provider_claims;
create policy provider_claims_therapist_select on public.provider_claims for select to authenticated
  using (therapist_id = auth.uid() and public.is_active_user());
drop policy if exists provider_claims_super_admin_all on public.provider_claims;
create policy provider_claims_super_admin_all on public.provider_claims for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists provider_payouts_therapist_select on public.provider_payouts;
create policy provider_payouts_therapist_select on public.provider_payouts for select to authenticated
  using (therapist_id = auth.uid() and public.is_active_user());
drop policy if exists provider_payouts_super_admin_all on public.provider_payouts;
create policy provider_payouts_super_admin_all on public.provider_payouts for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

create or replace function public.admin_promote_therapist(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only super admins can promote therapists';
  end if;
  update public.profiles set role = 'therapist' where id = p_user_id;
  if not found then raise exception 'User not found'; end if;
  insert into public.therapists (id) values (p_user_id) on conflict (id) do nothing;
  perform public.log_admin_action('therapist_promoted', 'therapists', p_user_id::text, '{}'::jsonb);
  return p_user_id;
end;
$$;

create or replace function public.admin_set_therapist_status(p_therapist_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_super_admin() then raise exception 'Only super admins can verify therapists'; end if;
  if p_status not in ('pending', 'active', 'suspended') then raise exception 'Invalid therapist status'; end if;
  update public.therapists
  set status = p_status,
      verified_at = case when p_status = 'active' then now() else null end,
      verified_by = case when p_status = 'active' then auth.uid() else null end
  where id = p_therapist_id;
  if not found then raise exception 'Therapist not found'; end if;
  perform public.log_admin_action('therapist_status_changed', 'therapists', p_therapist_id::text,
    jsonb_build_object('status', p_status));
end;
$$;

create or replace function public.therapist_accept_voucher(p_voucher_id uuid)
returns public.provider_vouchers
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_result public.provider_vouchers;
begin
  if not public.is_active_user() or not exists (
    select 1 from public.therapists where id = auth.uid() and status = 'active'
  ) then raise exception 'Active therapist verification required'; end if;
  update public.provider_vouchers
  set therapist_id = auth.uid(), status = 'accepted', updated_at = now()
  where id = p_voucher_id and expires_at > now()
    and (status = 'pending' or (status = 'assigned' and therapist_id = auth.uid()))
  returning * into v_result;
  if not found then raise exception 'Voucher is unavailable'; end if;
  return v_result;
end;
$$;

create or replace function public.therapist_submit_claim(
  p_voucher_id uuid, p_notes text, p_icd text, p_amount numeric
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_voucher public.provider_vouchers;
  v_claim_id uuid;
  v_count integer;
begin
  if not public.is_active_user() or not exists (
    select 1 from public.therapists where id = auth.uid() and status = 'active'
  ) then raise exception 'Active therapist verification required'; end if;
  select * into v_voucher from public.provider_vouchers
  where id = p_voucher_id and therapist_id = auth.uid() and status = 'accepted'
  for update;
  if not found then raise exception 'Accepted voucher not found'; end if;
  if p_notes is null or length(btrim(p_notes)) = 0 or length(p_notes) > 4000 then
    raise exception 'Clinical notes are required (max 4000 characters)';
  end if;
  if p_amount is null or p_amount < 0 or p_amount > v_voucher.fee_per_session then
    raise exception 'Claim amount exceeds the authorized fee';
  end if;
  select count(*) into v_count from public.provider_claims
  where voucher_id = p_voucher_id and status <> 'rejected';
  if v_count >= v_voucher.max_sessions then raise exception 'Voucher sessions are exhausted'; end if;
  insert into public.provider_claims (voucher_id, therapist_id, clinical_notes, icd_code, claim_amount)
  values (p_voucher_id, auth.uid(), btrim(p_notes), nullif(btrim(coalesce(p_icd, '')), ''), p_amount)
  returning id into v_claim_id;
  return v_claim_id;
end;
$$;

create or replace function public.admin_assign_voucher(p_voucher_id uuid, p_therapist_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_super_admin() then raise exception 'Only super admins can assign vouchers'; end if;
  if not exists (select 1 from public.therapists where id = p_therapist_id and status = 'active') then
    raise exception 'Therapist is not active';
  end if;
  update public.provider_vouchers
  set therapist_id = p_therapist_id, status = 'assigned', updated_at = now()
  where id = p_voucher_id and status = 'pending' and expires_at > now();
  if not found then raise exception 'Pending voucher not found'; end if;
  perform public.log_admin_action('voucher_assigned', 'provider_vouchers', p_voucher_id::text,
    jsonb_build_object('therapist_id', p_therapist_id));
end;
$$;

create or replace function public.admin_approve_claim(p_claim_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_super_admin() then raise exception 'Only super admins can approve claims'; end if;
  update public.provider_claims set status = 'approved'
  where id = p_claim_id and status = 'submitted';
  if not found then raise exception 'Submitted claim not found'; end if;
  perform public.log_admin_action('claim_approved', 'provider_claims', p_claim_id::text, '{}'::jsonb);
end;
$$;

create or replace function public.admin_mark_claim_paid(p_claim_id uuid, p_mpesa_ref text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_claim public.provider_claims;
begin
  if not public.is_super_admin() then raise exception 'Only super admins can pay claims'; end if;
  select * into v_claim from public.provider_claims where id = p_claim_id and status = 'approved' for update;
  if not found then raise exception 'Approved claim not found'; end if;
  update public.provider_claims set status = 'paid', paid_at = now() where id = p_claim_id;
  insert into public.provider_payouts (therapist_id, claim_id, amount, mpesa_ref)
  values (v_claim.therapist_id, v_claim.id, v_claim.claim_amount, nullif(btrim(coalesce(p_mpesa_ref, '')), ''))
  on conflict (claim_id) do nothing;
  perform public.log_admin_action('claim_paid', 'provider_claims', p_claim_id::text, '{}'::jsonb);
end;
$$;

revoke execute on function public.admin_promote_therapist(uuid) from public, anon;
revoke execute on function public.admin_set_therapist_status(uuid, text) from public, anon;
revoke execute on function public.therapist_accept_voucher(uuid) from public, anon;
revoke execute on function public.therapist_submit_claim(uuid, text, text, numeric) from public, anon;
revoke execute on function public.admin_assign_voucher(uuid, uuid) from public, anon;
revoke execute on function public.admin_approve_claim(uuid) from public, anon;
revoke execute on function public.admin_mark_claim_paid(uuid, text) from public, anon;
grant execute on function public.admin_promote_therapist(uuid) to authenticated;
grant execute on function public.admin_set_therapist_status(uuid, text) to authenticated;
grant execute on function public.therapist_accept_voucher(uuid) to authenticated;
grant execute on function public.therapist_submit_claim(uuid, text, text, numeric) to authenticated;
grant execute on function public.admin_assign_voucher(uuid, uuid) to authenticated;
grant execute on function public.admin_approve_claim(uuid) to authenticated;
grant execute on function public.admin_mark_claim_paid(uuid, text) to authenticated;

notify pgrst, 'reload schema';

-- >>> insurer portal (tables, RLS, grants, insurer RPCs, aggregate view)
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

-- >>> claims protocols (float, ledger, vouchers, claims, reimburse)
-- Pre-authorization and settlement ledger for therapist claims.

create table if not exists public.claims_float (
  id smallint primary key default 1 check (id = 1),
  balance numeric(14,2) not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now(),
  note text
);

create table if not exists public.claims_float_transactions (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('inflow', 'outflow')),
  amount numeric(14,2) not null check (amount > 0),
  claim_id uuid references public.provider_claims(id) on delete set null,
  therapist_id uuid references public.therapists(id) on delete set null,
  insurer_id uuid references public.insurers(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.pre_auth_vouchers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  crisis_alert_id uuid references public.crisis_alerts(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'assigned', 'accepted', 'completed', 'expired', 'void')),
  expires_at timestamptz not null default (now() + interval '14 days'),
  therapist_id uuid references public.therapists(id) on delete set null,
  insurer_id uuid references public.insurers(id) on delete set null,
  max_sessions integer not null default 1 check (max_sessions > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.provider_vouchers
  add column if not exists pre_auth_voucher_id uuid references public.pre_auth_vouchers(id) on delete set null;
alter table public.provider_vouchers
  add column if not exists insurer_id uuid references public.insurers(id) on delete set null;
create unique index if not exists provider_vouchers_pre_auth_unique
  on public.provider_vouchers(pre_auth_voucher_id) where pre_auth_voucher_id is not null;
create unique index if not exists pre_auth_voucher_crisis_unique
  on public.pre_auth_vouchers(crisis_alert_id) where crisis_alert_id is not null;
create index if not exists claims_float_transactions_created_idx
  on public.claims_float_transactions(created_at desc);
create index if not exists pre_auth_vouchers_user_created_idx
  on public.pre_auth_vouchers(user_id, created_at desc);

insert into public.claims_float (id, balance, note)
values (1, 0, 'Initial claims float balance')
on conflict (id) do nothing;

alter table public.claims_float enable row level security;
alter table public.claims_float_transactions enable row level security;
alter table public.pre_auth_vouchers enable row level security;

drop policy if exists claims_float_super_admin_all on public.claims_float;
create policy claims_float_super_admin_all on public.claims_float for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists claims_float_transactions_super_admin_all on public.claims_float_transactions;
create policy claims_float_transactions_super_admin_all on public.claims_float_transactions for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists pre_auth_vouchers_super_admin_all on public.pre_auth_vouchers;
create policy pre_auth_vouchers_super_admin_all on public.pre_auth_vouchers for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists pre_auth_vouchers_owner_select on public.pre_auth_vouchers;
create policy pre_auth_vouchers_owner_select on public.pre_auth_vouchers for select to authenticated
  using (user_id = auth.uid() and public.is_active_user());
drop policy if exists pre_auth_vouchers_therapist_select on public.pre_auth_vouchers;
create policy pre_auth_vouchers_therapist_select on public.pre_auth_vouchers for select to authenticated
  using (therapist_id = auth.uid() and public.is_active_user());

create or replace function public.pre_authorize_voucher(
  p_user_id uuid, p_crisis_alert_id uuid, p_max_sessions integer
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
  v_provider_voucher_id uuid;
  v_insurer_id uuid;
  v_b2b_client_id uuid;
begin
  if auth.role() <> 'service_role' and auth.uid() is distinct from p_user_id then
    raise exception 'Only the user or a trusted service can authorize this voucher';
  end if;
  if p_max_sessions is null or p_max_sessions < 1 or p_max_sessions > 10 then
    raise exception 'Invalid authorized session count';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id and status = 'active') then
    raise exception 'Active user not found';
  end if;
  if p_crisis_alert_id is not null and not exists (
    select 1 from public.crisis_alerts where id = p_crisis_alert_id and user_id = p_user_id
  ) then raise exception 'Crisis alert does not belong to this user'; end if;

  select b2b_client_id into v_b2b_client_id from public.profiles where id = p_user_id;
  if v_b2b_client_id is not null then
    select ip.insurer_id into v_insurer_id
    from public.insurer_partnerships ip
    join public.insurers i on i.id = ip.insurer_id and i.status = 'active'
    where ip.b2b_client_id = v_b2b_client_id and ip.status = 'active'
      and (ip.contract_start is null or ip.contract_start <= current_date)
      and (ip.contract_end is null or ip.contract_end >= current_date)
    order by ip.created_at
    limit 1;
  end if;

  insert into public.pre_auth_vouchers (user_id, crisis_alert_id, max_sessions, insurer_id)
  values (p_user_id, p_crisis_alert_id, p_max_sessions, v_insurer_id)
  on conflict (crisis_alert_id) where crisis_alert_id is not null do nothing
  returning id into v_id;
  if v_id is null and p_crisis_alert_id is not null then
    select id into v_id from public.pre_auth_vouchers where crisis_alert_id = p_crisis_alert_id;
  end if;
  if v_id is null then raise exception 'Voucher authorization failed'; end if;

  insert into public.provider_vouchers (
    user_id, crisis_alert_id, pre_auth_voucher_id, insurer_id, max_sessions, expires_at, fee_per_session, status
  )
  select user_id, crisis_alert_id, id, insurer_id, max_sessions, expires_at, 0, status
  from public.pre_auth_vouchers where id = v_id
  on conflict (pre_auth_voucher_id) where pre_auth_voucher_id is not null do nothing
  returning id into v_provider_voucher_id;
  if v_provider_voucher_id is null then
    select id into v_provider_voucher_id from public.provider_vouchers where pre_auth_voucher_id = v_id;
  end if;
  if v_provider_voucher_id is null then raise exception 'Provider voucher creation failed'; end if;
  return v_id;
end;
$$;

create or replace function public.record_crisis_event(
  p_user_id uuid, p_context text, p_keywords text[], p_source text, p_max_sessions integer default 1
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_alert_id uuid;
begin
  if auth.role() <> 'service_role' and auth.uid() is distinct from p_user_id then
    raise exception 'Only the user or a trusted service can record this crisis event';
  end if;
  if p_source is null or p_source not in ('chat', 'diary') then raise exception 'Invalid crisis source'; end if;
  if p_context is null or length(btrim(p_context)) = 0 then raise exception 'Crisis context is required'; end if;
  if coalesce(array_length(p_keywords, 1), 0) = 0 then raise exception 'At least one crisis keyword is required'; end if;
  perform pg_advisory_xact_lock(hashtext(p_user_id::text), hashtext(p_source));
  select id into v_alert_id from public.crisis_alerts
  where user_id = p_user_id and source = p_source and resolved = false
    and created_at >= now() - interval '24 hours'
  order by created_at desc
  limit 1
  for update;
  if v_alert_id is null then
    insert into public.crisis_alerts (
      user_id, keywords, message_context, severity, source, keyword, message
    )
    values (
      p_user_id, p_keywords, left(p_context, 500), 'high', p_source,
      left(p_keywords[1], 120), left(p_context, 500)
    )
    returning id into v_alert_id;
  end if;
  perform public.pre_authorize_voucher(p_user_id, v_alert_id, p_max_sessions);
  return v_alert_id;
end;
$$;

create or replace function public.therapist_accept_voucher(p_voucher_id uuid)
returns public.provider_vouchers
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_result public.provider_vouchers;
begin
  if not public.is_active_user() or not exists (
    select 1 from public.therapists where id = auth.uid() and status = 'active'
  ) then raise exception 'Active therapist verification required'; end if;
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

create or replace function public.assign_voucher_to_therapist(p_voucher_id uuid, p_therapist_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_provider_voucher_id uuid;
  v_user_id uuid;
begin
  if not public.is_super_admin() then raise exception 'Only super admins can assign vouchers'; end if;
  if not exists (select 1 from public.therapists where id = p_therapist_id and status = 'active') then
    raise exception 'Therapist is not active';
  end if;
  select pv.id, pv.user_id into v_provider_voucher_id, v_user_id
  from public.provider_vouchers pv
  where pv.pre_auth_voucher_id = p_voucher_id and pv.status = 'pending'
    and pv.expires_at > now()
  for update;
  if v_provider_voucher_id is null then raise exception 'Pending voucher not found'; end if;
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

create or replace function public.admin_assign_voucher_with_fee(
  p_voucher_id uuid, p_therapist_id uuid, p_fee_per_session numeric
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_provider_voucher_id uuid;
begin
  if p_fee_per_session is null or p_fee_per_session <= 0 then raise exception 'A positive session fee is required'; end if;
  select id into v_provider_voucher_id from public.provider_vouchers
  where pre_auth_voucher_id = p_voucher_id and status = 'pending' and expires_at > now();
  if v_provider_voucher_id is null then raise exception 'Pending voucher not found'; end if;
  update public.provider_vouchers set fee_per_session = p_fee_per_session where id = v_provider_voucher_id;
  perform public.assign_voucher_to_therapist(p_voucher_id, p_therapist_id);
end;
$$;

create or replace function public.void_voucher(p_voucher_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_provider_voucher_id uuid;
begin
  if not public.is_super_admin() then raise exception 'Only super admins can void vouchers'; end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then raise exception 'A reason is required'; end if;
  select id into v_provider_voucher_id from public.provider_vouchers
  where pre_auth_voucher_id = p_voucher_id and status in ('pending', 'assigned')
  for update;
  if v_provider_voucher_id is null then raise exception 'Only unclaimed vouchers can be voided'; end if;
  update public.provider_vouchers set status = 'void', updated_at = now() where id = v_provider_voucher_id;
  update public.pre_auth_vouchers set status = 'void', updated_at = now() where id = p_voucher_id;
  perform public.log_admin_action('voucher_voided', 'provider_vouchers', v_provider_voucher_id::text,
    jsonb_build_object('reason', left(btrim(p_reason), 500)));
end;
$$;

create or replace function public.therapist_complete_session(
  p_voucher_id uuid, p_notes text, p_icd text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_voucher public.provider_vouchers;
  v_claim_id uuid;
  v_claim_count integer;
begin
  if not public.is_active_user() or not exists (
    select 1 from public.therapists where id = auth.uid() and status = 'active'
  ) then raise exception 'Active therapist verification required'; end if;
  select * into v_voucher from public.provider_vouchers
  where pre_auth_voucher_id = p_voucher_id and therapist_id = auth.uid()
    and status = 'accepted' and expires_at > now()
  for update;
  if not found then raise exception 'Accepted voucher not found'; end if;
  if p_notes is null or length(btrim(p_notes)) = 0 or length(p_notes) > 4000 then
    raise exception 'Clinical notes are required (max 4000 characters)';
  end if;
  if v_voucher.fee_per_session <= 0 then raise exception 'Voucher has no approved session fee'; end if;
  select count(*) into v_claim_count from public.provider_claims
  where voucher_id = v_voucher.id and status <> 'rejected';
  if v_claim_count >= v_voucher.max_sessions then raise exception 'Voucher sessions are exhausted'; end if;
  insert into public.provider_claims (voucher_id, therapist_id, clinical_notes, icd_code, claim_amount)
  values (v_voucher.id, auth.uid(), btrim(p_notes), nullif(left(btrim(coalesce(p_icd, '')), 20), ''), v_voucher.fee_per_session)
  returning id into v_claim_id;
  if v_voucher.insurer_id is not null then
    insert into public.claim_submissions (claim_id, insurer_id)
    values (v_claim_id, v_voucher.insurer_id)
    on conflict (claim_id, insurer_id) do nothing;
  end if;
  if v_claim_count + 1 >= v_voucher.max_sessions then
    update public.provider_vouchers set status = 'completed', updated_at = now() where id = v_voucher.id;
    update public.pre_auth_vouchers set status = 'completed', updated_at = now()
    where id = v_voucher.pre_auth_voucher_id;
  end if;
  return v_claim_id;
end;
$$;

create or replace function public.therapist_submit_claim(
  p_voucher_id uuid, p_notes text, p_icd text, p_amount numeric
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_pre_auth_voucher_id uuid;
  v_fee numeric;
begin
  select pre_auth_voucher_id, fee_per_session into v_pre_auth_voucher_id, v_fee
  from public.provider_vouchers
  where id = p_voucher_id and therapist_id = auth.uid() and status = 'accepted';
  if not found then
    select pre_auth_voucher_id, fee_per_session into v_pre_auth_voucher_id, v_fee
    from public.provider_vouchers
    where pre_auth_voucher_id = p_voucher_id and therapist_id = auth.uid() and status = 'accepted';
  end if;
  if v_pre_auth_voucher_id is null then raise exception 'Accepted voucher not found'; end if;
  if p_amount is distinct from v_fee then raise exception 'Claim amount must match the authorized session fee'; end if;
  return public.therapist_complete_session(v_pre_auth_voucher_id, p_notes, p_icd);
end;
$$;

create or replace function public.pay_therapist_float(p_voucher_id uuid, p_mpesa_ref text)
returns numeric
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_claim public.provider_claims;
  v_float public.claims_float;
  v_provider_voucher_id uuid;
  v_total numeric(14,2) := 0;
  v_count integer := 0;
begin
  if not public.is_super_admin() then raise exception 'Only super admins can pay therapist claims'; end if;
  select id into v_provider_voucher_id from public.provider_vouchers where id = p_voucher_id;
  if v_provider_voucher_id is null then
    select id into v_provider_voucher_id from public.provider_vouchers where pre_auth_voucher_id = p_voucher_id;
  end if;
  if v_provider_voucher_id is null then raise exception 'Voucher not found'; end if;
  select * into v_float from public.claims_float where id = 1 for update;
  if not found then raise exception 'Claims float account is not initialized'; end if;
  for v_claim in
    select c.* from public.provider_claims c
    join public.provider_vouchers v on v.id = c.voucher_id
    where v.id = v_provider_voucher_id and c.status = 'approved'
      and not exists (select 1 from public.provider_payouts pp where pp.claim_id = c.id)
    order by c.created_at
    for update of c
  loop
    if v_float.balance - v_total < v_claim.claim_amount then
      raise exception 'Insufficient claims float balance';
    end if;
    insert into public.provider_payouts (therapist_id, claim_id, amount, mpesa_ref)
    values (v_claim.therapist_id, v_claim.id, v_claim.claim_amount, nullif(left(btrim(coalesce(p_mpesa_ref, '')), 200), ''));
    update public.provider_claims set status = 'paid', paid_at = now() where id = v_claim.id;
    insert into public.claims_float_transactions (type, amount, claim_id, therapist_id, note)
    values ('outflow', v_claim.claim_amount, v_claim.id, v_claim.therapist_id, 'Therapist claim paid from float');
    v_total := v_total + v_claim.claim_amount;
    v_count := v_count + 1;
  end loop;
  if v_count = 0 then raise exception 'No approved unpaid claims found for voucher'; end if;
  update public.claims_float
  set balance = balance - v_total, updated_at = now(), note = 'Therapist claim payout'
  where id = 1;
  perform public.log_admin_action('therapist_float_payout', 'provider_vouchers', p_voucher_id::text,
    jsonb_build_object('amount', v_total, 'claims_paid', v_count));
  return v_total;
end;
$$;

create or replace function public.insurer_reimburse_bulk(
  p_insurer_id uuid, p_invoice_id uuid, p_ref text
)
returns numeric
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_invoice public.bulk_invoices;
  v_insurer_user_id uuid;
begin
  select profile_id into v_insurer_user_id from public.insurers
  where id = p_insurer_id and status = 'active';
  if not public.is_super_admin() and (v_insurer_user_id is null
      or v_insurer_user_id <> auth.uid() or not public.is_active_insurer(p_insurer_id)) then
    raise exception 'Insurer or super admin access required';
  end if;
  select * into v_invoice from public.bulk_invoices
  where id = p_invoice_id and insurer_id = p_insurer_id and status = 'sent'
  for update;
  if not found then raise exception 'Sent invoice not found'; end if;
  update public.claims_float set balance = balance + v_invoice.total_amount,
    updated_at = now(), note = 'Insurer bulk reimbursement'
  where id = 1;
  if not found then raise exception 'Claims float account is not initialized'; end if;
  insert into public.claims_float_transactions (type, amount, insurer_id, note)
  values ('inflow', v_invoice.total_amount, p_insurer_id, 'Bulk invoice reimbursement ' || p_invoice_id::text);
  update public.bulk_invoices set status = 'paid', paid_at = now(),
    mpesa_or_ach_ref = nullif(left(btrim(coalesce(p_ref, '')), 200), '')
  where id = p_invoice_id;
  update public.claim_submissions s
  set insurer_status = 'paid', insurer_reviewed_at = now(), insurer_reviewed_by = auth.uid()
  from public.bulk_invoice_claims bic
  where bic.invoice_id = p_invoice_id and bic.claim_id = s.id;
  update public.provider_claims c
  set insurer_reimbursed_at = now()
  from public.bulk_invoice_claims bic
  join public.claim_submissions s on s.id = bic.claim_id
  where bic.invoice_id = p_invoice_id and c.id = s.claim_id;
  insert into public.audit_logs (actor_id, action, target_table, target_id, metadata)
  values (auth.uid(), 'insurer_bulk_reimbursement', 'bulk_invoices', p_invoice_id::text,
    jsonb_build_object('insurer_id', p_insurer_id, 'amount', v_invoice.total_amount, 'reference', left(coalesce(p_ref, ''), 200)));
  return v_invoice.total_amount;
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
  select id into v_insurer_id from public.insurers
  where profile_id = auth.uid() and status = 'active';
  if v_insurer_id is null or not public.is_active_insurer(v_insurer_id) then
    raise exception 'Active insurer access required';
  end if;
  perform public.insurer_reimburse_bulk(v_insurer_id, p_invoice_id, p_ref);
end;
$$;

create or replace function public.admin_mark_claim_paid(p_claim_id uuid, p_mpesa_ref text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_voucher_id uuid;
begin
  if not public.is_super_admin() then raise exception 'Only super admins can pay therapist claims'; end if;
  select voucher_id into v_voucher_id from public.provider_claims
  where id = p_claim_id and status = 'approved';
  if v_voucher_id is null then raise exception 'Approved claim not found'; end if;
  perform public.pay_therapist_float(v_voucher_id, p_mpesa_ref);
end;
$$;

create or replace function public.admin_adjust_claims_float(
  p_type text, p_amount numeric, p_note text
)
returns numeric
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_balance numeric(14,2);
begin
  if not public.is_super_admin() then raise exception 'Only super admins can adjust claims float'; end if;
  if p_type not in ('inflow', 'outflow') or p_amount is null or p_amount <= 0 then
    raise exception 'A valid transaction type and positive amount are required';
  end if;
  select balance into v_balance from public.claims_float where id = 1 for update;
  if not found then raise exception 'Claims float account is not initialized'; end if;
  if p_type = 'outflow' and v_balance < p_amount then raise exception 'Insufficient claims float balance'; end if;
  update public.claims_float
  set balance = balance + case when p_type = 'inflow' then p_amount else -p_amount end,
      updated_at = now(), note = left(coalesce(p_note, ''), 500)
  where id = 1
  returning balance into v_balance;
  insert into public.claims_float_transactions (type, amount, note)
  values (p_type, p_amount, left(coalesce(p_note, ''), 500));
  perform public.log_admin_action('claims_float_adjusted', 'claims_float', '1',
    jsonb_build_object('type', p_type, 'amount', p_amount));
  return v_balance;
end;
$$;

revoke all on function public.pre_authorize_voucher(uuid, uuid, integer) from public, anon;
revoke all on function public.record_crisis_event(uuid, text, text[], text, integer) from public, anon;
revoke all on function public.assign_voucher_to_therapist(uuid, uuid) from public, anon;
revoke all on function public.admin_assign_voucher_with_fee(uuid, uuid, numeric) from public, anon;
revoke all on function public.void_voucher(uuid, text) from public, anon;
revoke all on function public.therapist_complete_session(uuid, text, text) from public, anon;
revoke all on function public.therapist_submit_claim(uuid, text, text, numeric) from public, anon;
revoke all on function public.pay_therapist_float(uuid, text) from public, anon;
revoke all on function public.insurer_reimburse_bulk(uuid, uuid, text) from public, anon;
revoke all on function public.insurer_mark_invoice_paid(uuid, text) from public, anon;
revoke all on function public.admin_mark_claim_paid(uuid, text) from public, anon;
revoke all on function public.admin_adjust_claims_float(text, numeric, text) from public, anon;
grant execute on function public.pre_authorize_voucher(uuid, uuid, integer) to authenticated, service_role;
grant execute on function public.record_crisis_event(uuid, text, text[], text, integer) to authenticated, service_role;
grant execute on function public.therapist_accept_voucher(uuid) to authenticated;
grant execute on function public.assign_voucher_to_therapist(uuid, uuid) to authenticated;
grant execute on function public.admin_assign_voucher_with_fee(uuid, uuid, numeric) to authenticated;
grant execute on function public.void_voucher(uuid, text) to authenticated;
grant execute on function public.therapist_complete_session(uuid, text, text) to authenticated;
grant execute on function public.therapist_submit_claim(uuid, text, text, numeric) to authenticated;
grant execute on function public.pay_therapist_float(uuid, text) to authenticated;
grant execute on function public.insurer_reimburse_bulk(uuid, uuid, text) to authenticated;
grant execute on function public.insurer_mark_invoice_paid(uuid, text) to authenticated;
grant execute on function public.admin_mark_claim_paid(uuid, text) to authenticated;
grant execute on function public.admin_adjust_claims_float(text, numeric, text) to authenticated;

notify pgrst, 'reload schema';

-- >>> overrides: newest invoice scope (was 20261110000009)
-- FN-10: bulk invoices must include insurer-approved claims that the platform
-- has already paid the therapist for (status 'paid'), in addition to 'approved'.
-- Money model is unchanged: insurer payment still flows through
-- insurer_reimburse_bulk / admin_confirm_invoice_payment only.

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
    and c.status in ('approved', 'paid')
    and c.insurer_reimbursed_at is null
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

revoke execute on function public.insurer_generate_bulk_invoice(uuid, date, date) from public, anon;
grant execute on function public.insurer_generate_bulk_invoice(uuid, date, date) to authenticated;

notify pgrst, 'reload schema';

-- >>> overrides: payment-report flow + confirmed-payment float credit (was 20261110000010)
alter table public.bulk_invoices add column if not exists payment_reference text;
alter table public.bulk_invoices add column if not exists payment_reported_at timestamptz;
alter table public.bulk_invoices drop constraint if exists bulk_invoices_status_check;
alter table public.bulk_invoices add constraint bulk_invoices_status_check
  check (status in ('draft', 'sent', 'payment_reported', 'paid', 'disputed'));

revoke execute on function public.insurer_reimburse_bulk(uuid, uuid, text)
  from authenticated, anon, public;
grant execute on function public.insurer_reimburse_bulk(uuid, uuid, text) to service_role;

create or replace function public.insurer_mark_invoice_paid(p_invoice_id uuid, p_ref text)
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
  if p_ref is null or length(btrim(p_ref)) = 0 then
    raise exception 'Payment reference is required';
  end if;
  update public.bulk_invoices
  set status = 'payment_reported',
      payment_reference = left(btrim(p_ref), 200),
      payment_reported_at = now()
  where id = p_invoice_id and insurer_id = v_insurer_id and status = 'sent';
  if not found then raise exception 'Sent invoice not found'; end if;
end;
$$;

create or replace function public.admin_confirm_invoice_payment(p_invoice_id uuid, p_reference text)
returns numeric
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_invoice public.bulk_invoices;
  v_balance numeric(14,2);
begin
  if not public.is_super_admin() or not public.is_recently_authenticated() then
    raise exception 'Recently authenticated super-admin access required';
  end if;
  if p_reference is null or length(btrim(p_reference)) = 0 then
    raise exception 'Payment reference is required';
  end if;
  select * into v_invoice from public.bulk_invoices
  where id = p_invoice_id and status = 'payment_reported'
  for update;
  if not found then raise exception 'Reported invoice not found'; end if;
  select balance into v_balance from public.claims_float where id = 1 for update;
  if not found then raise exception 'Claims float account is not initialized'; end if;

  update public.claims_float
  set balance = balance + v_invoice.total_amount,
      updated_at = now(), note = 'Confirmed insurer bulk reimbursement'
  where id = 1;
  insert into public.claims_float_transactions (type, amount, insurer_id, note)
  values ('inflow', v_invoice.total_amount, v_invoice.insurer_id,
    'Confirmed bulk invoice ' || p_invoice_id::text);
  update public.bulk_invoices
  set status = 'paid', paid_at = now(),
      payment_reference = left(btrim(p_reference), 200),
      mpesa_or_ach_ref = left(btrim(p_reference), 200)
  where id = p_invoice_id;
  update public.claim_submissions s
  set insurer_status = 'paid', insurer_reviewed_at = now(), insurer_reviewed_by = auth.uid()
  from public.bulk_invoice_claims bic
  where bic.invoice_id = p_invoice_id and bic.claim_id = s.id;
  update public.provider_claims c
  set insurer_reimbursed_at = now()
  from public.bulk_invoice_claims bic
  join public.claim_submissions s on s.id = bic.claim_id
  where bic.invoice_id = p_invoice_id and c.id = s.claim_id;
  perform public.log_admin_action('insurer_bulk_reimbursement_confirmed', 'bulk_invoices',
    p_invoice_id::text,
    jsonb_build_object('amount', v_invoice.total_amount, 'reference', left(btrim(p_reference), 200)));
  return v_invoice.total_amount;
end;
$$;
revoke execute on function public.admin_confirm_invoice_payment(uuid, text)
  from authenticated, anon, public;
grant execute on function public.admin_confirm_invoice_payment(uuid, text) to authenticated;

-- >>> overrides: public therapist view + banded insurer aggregate (was 20261110000010)

alter table public.profiles add column if not exists ai_data_consent_at timestamptz;

create or replace view public.therapists_public as
select id, specialty, languages, bio, status
from public.therapists
where status = 'active';
revoke all on public.therapists from authenticated;
grant select on public.therapists_public to authenticated;
-- Re-grant the minimum self-service surface: RLS (therapist_self_select /
-- therapist_self_update / therapist_super_admin_all) still limits rows and the
create or replace view public.insurer_aggregate_stats as
with cohorts as (
  select i.id as insurer_id,
    count(distinct p.id)::integer as cohort_size,
    (count(distinct p.id) filter (where p.status = 'active'))::integer as active_members,
    jsonb_build_object(
      'free', count(distinct p.id) filter (
        where coalesce(p.subscription_plan, 'free') = 'free' and coalesce(p.plan_type, 'individual') <> 'company'
      ),
      'premium', count(distinct p.id) filter (where p.subscription_plan = 'premium'),
      'company', count(distinct p.id) filter (where p.plan_type = 'company')
    ) as tier_mix
  from public.insurers i
  join public.insurer_partnerships ip on ip.insurer_id = i.id and ip.status = 'active'
    and (ip.contract_start is null or ip.contract_start <= current_date)
    and (ip.contract_end is null or ip.contract_end >= current_date)
  join public.profiles p on p.b2b_client_id = ip.b2b_client_id
  where public.is_active_insurer(i.id)
  group by i.id
), risk_bands as (
  select i.id as insurer_id,
    lpad((least(greatest(coalesce(p.daily_risk_score, 0), 0), 90) / 10 * 10)::text, 2, '0')
      || '-' ||
    lpad((least(greatest(coalesce(p.daily_risk_score, 0), 0), 90) / 10 * 10 + 10)::text, 2, '0') as band,
    count(distinct p.id)::integer as members
  from public.insurers i
  join public.insurer_partnerships ip on ip.insurer_id = i.id and ip.status = 'active'
    and (ip.contract_start is null or ip.contract_start <= current_date)
    and (ip.contract_end is null or ip.contract_end >= current_date)
  join public.profiles p on p.b2b_client_id = ip.b2b_client_id
  where public.is_active_insurer(i.id)
  group by i.id, 2
), risk_summary as (
  select insurer_id, jsonb_object_agg(band, members) as risk_bands
  from risk_bands group by insurer_id
), claims as (
  select s.insurer_id,
    (count(*) filter (where s.submitted_at >= now() - interval '30 days'))::integer as claims_last_30d,
    (count(*) filter (where s.submitted_at >= now() - interval '90 days'))::integer as claims_last_90d,
    avg(c.claim_amount) as avg_claim_amount,
    sum(c.claim_amount) filter (
      where s.insurer_status = 'paid' and s.insurer_reviewed_at >= now() - interval '90 days'
    ) as total_paid_last_90d
  from public.claim_submissions s
  join public.provider_claims c on c.id = s.claim_id
  group by s.insurer_id
)
select c.insurer_id, c.cohort_size, c.active_members, c.tier_mix,
  coalesce(r.risk_bands, '{}'::jsonb) as aggregate_markov_state,
  coalesce(cl.claims_last_30d, 0) as claims_last_30d,
  coalesce(cl.claims_last_90d, 0) as claims_last_90d,
  coalesce(cl.avg_claim_amount, 0) as avg_claim_amount,
  coalesce(cl.total_paid_last_90d, 0) as total_paid_last_90d
from cohorts c
left join risk_summary r on r.insurer_id = c.insurer_id
left join claims cl on cl.insurer_id = c.insurer_id
where c.cohort_size >= 25;
revoke all on public.insurer_aggregate_stats from anon;
grant select on public.insurer_aggregate_stats to authenticated;

-- >>> overrides: elevated-access guards on all admin/portal RPCs (was 20261110000011)
create or replace function public.is_recently_authenticated()
returns boolean
language sql
stable
set search_path = pg_catalog, auth
as $$
  select case
    when coalesce(auth.jwt()->>'iat', '') ~ '^[0-9]{1,12}$'
      then (auth.jwt()->>'iat')::bigint >= extract(epoch from now())::bigint - 900
    else false
  end;
$$;
revoke all on function public.is_recently_authenticated() from public, anon;
grant execute on function public.is_recently_authenticated() to authenticated;

create or replace function public.log_admin_action(
  p_action text,
  p_target_table text default null,
  p_target_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() or not public.is_recently_authenticated() then
    raise exception 'Recently authenticated administrator access required';
  end if;
  insert into public.audit_logs (actor_id, action, target_table, target_id, metadata)
  values (auth.uid(), left(p_action, 120), left(p_target_table, 120),
    left(p_target_id, 120), coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.log_admin_action(text, text, text, jsonb) from public, anon;
grant execute on function public.log_admin_action(text, text, text, jsonb) to authenticated;

create or replace function public.admin_get_user_contact(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_email text;
  v_phone text;
begin
  if not public.is_super_admin() or not public.is_recently_authenticated() then
    raise exception 'Recently authenticated super-admin access required';
  end if;
  select u.email into v_email from auth.users u where u.id = p_user_id;
  select p.phone into v_phone from public.profiles p where p.id = p_user_id;
  perform public.log_admin_action('view_user_contact', 'profiles', p_user_id::text,
    jsonb_build_object('target_user_id', p_user_id));
  return jsonb_build_object('email', v_email, 'phone', v_phone);
end;
$$;

create or replace function public.admin_promote_therapist(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_super_admin() or not public.is_recently_authenticated() then
    raise exception 'Recently authenticated super-admin access required';
  end if;
  update public.profiles set role = 'therapist' where id = p_user_id;
  if not found then raise exception 'User not found'; end if;
  insert into public.therapists (id) values (p_user_id) on conflict (id) do nothing;
  perform public.log_admin_action('therapist_promoted', 'therapists', p_user_id::text, '{}'::jsonb);
  return p_user_id;
end;
$$;

create or replace function public.admin_set_therapist_status(p_therapist_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_super_admin() or not public.is_recently_authenticated() then
    raise exception 'Recently authenticated super-admin access required';
  end if;
  if p_status not in ('pending', 'active', 'suspended') then raise exception 'Invalid therapist status'; end if;
  update public.therapists
  set status = p_status,
      verified_at = case when p_status = 'active' then now() else null end,
      verified_by = case when p_status = 'active' then auth.uid() else null end
  where id = p_therapist_id;
  if not found then raise exception 'Therapist not found'; end if;
  perform public.log_admin_action('therapist_status_changed', 'therapists', p_therapist_id::text,
    jsonb_build_object('status', p_status));
end;
$$;

create or replace function public.admin_list_therapists()
returns table (
  id uuid,
  license_number text,
  specialty text,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_super_admin() or not public.is_recently_authenticated() then
    raise exception 'Recently authenticated super-admin access required';
  end if;
  return query
  select t.id, t.license_number, t.specialty, t.status, t.created_at
  from public.therapists t
  order by t.created_at desc;
end;
$$;

create or replace function public.therapist_get_self_profile()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile jsonb;
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'Active sign-in required';
  end if;
  select to_jsonb(t) into v_profile from public.therapists t where t.id = auth.uid();
  return v_profile;
end;
$$;

create or replace function public.admin_approve_claim(p_claim_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_super_admin() or not public.is_recently_authenticated() then
    raise exception 'Recently authenticated super-admin access required';
  end if;
  update public.provider_claims set status = 'approved'
  where id = p_claim_id and status = 'submitted';
  if not found then raise exception 'Submitted claim not found'; end if;
  perform public.log_admin_action('claim_approved', 'provider_claims', p_claim_id::text, '{}'::jsonb);
end;
$$;

create or replace function public.assign_voucher_to_therapist(p_voucher_id uuid, p_therapist_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_provider_voucher_id uuid;
  v_user_id uuid;
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

create or replace function public.admin_assign_voucher_with_fee(
  p_voucher_id uuid, p_therapist_id uuid, p_fee_per_session numeric
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_provider_voucher_id uuid;
begin
  if not public.is_super_admin() or not public.is_recently_authenticated() then
    raise exception 'Recently authenticated super-admin access required';
  end if;
  if p_fee_per_session is null or p_fee_per_session <= 0 then raise exception 'A positive session fee is required'; end if;
  select id into v_provider_voucher_id from public.provider_vouchers
  where pre_auth_voucher_id = p_voucher_id and status = 'pending' and expires_at > now()
  for update;
  if v_provider_voucher_id is null then raise exception 'Pending voucher not found'; end if;
  update public.provider_vouchers set fee_per_session = p_fee_per_session where id = v_provider_voucher_id;
  perform public.assign_voucher_to_therapist(p_voucher_id, p_therapist_id);
end;
$$;

create or replace function public.void_voucher(p_voucher_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_provider_voucher_id uuid;
begin
  if not public.is_super_admin() or not public.is_recently_authenticated() then
    raise exception 'Recently authenticated super-admin access required';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then raise exception 'A reason is required'; end if;
  select id into v_provider_voucher_id from public.provider_vouchers
  where pre_auth_voucher_id = p_voucher_id and status in ('pending', 'assigned')
  for update;
  if v_provider_voucher_id is null then raise exception 'Only unclaimed vouchers can be voided'; end if;
  update public.provider_vouchers set status = 'void', updated_at = now() where id = v_provider_voucher_id;
  update public.pre_auth_vouchers set status = 'void', updated_at = now() where id = p_voucher_id;
  perform public.log_admin_action('voucher_voided', 'provider_vouchers', v_provider_voucher_id::text,
    jsonb_build_object('reason', left(btrim(p_reason), 500)));
end;
$$;

create or replace function public.pay_therapist_float(p_voucher_id uuid, p_mpesa_ref text)
returns numeric
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_claim public.provider_claims;
  v_float public.claims_float;
  v_provider_voucher_id uuid;
  v_total numeric(14,2) := 0;
  v_count integer := 0;
begin
  if not public.is_super_admin() or not public.is_recently_authenticated() then
    raise exception 'Recently authenticated super-admin access required';
  end if;
  select id into v_provider_voucher_id from public.provider_vouchers where id = p_voucher_id;
  if v_provider_voucher_id is null then
    select id into v_provider_voucher_id from public.provider_vouchers where pre_auth_voucher_id = p_voucher_id;
  end if;
  if v_provider_voucher_id is null then raise exception 'Voucher not found'; end if;
  select * into v_float from public.claims_float where id = 1 for update;
  if not found then raise exception 'Claims float account is not initialized'; end if;
  for v_claim in
    select c.* from public.provider_claims c
    where c.voucher_id = v_provider_voucher_id and c.status = 'approved'
      and not exists (select 1 from public.provider_payouts pp where pp.claim_id = c.id)
    order by c.created_at
    for update of c
  loop
    if v_float.balance - v_total < v_claim.claim_amount then
      raise exception 'Insufficient claims float balance';
    end if;
    insert into public.provider_payouts (therapist_id, claim_id, amount, mpesa_ref)
    values (v_claim.therapist_id, v_claim.id, v_claim.claim_amount,
      nullif(left(btrim(coalesce(p_mpesa_ref, '')), 200), ''));
    update public.provider_claims set status = 'paid', paid_at = now() where id = v_claim.id;
    insert into public.claims_float_transactions (type, amount, claim_id, therapist_id, note)
    values ('outflow', v_claim.claim_amount, v_claim.id, v_claim.therapist_id, 'Therapist claim paid from float');
    v_total := v_total + v_claim.claim_amount;
    v_count := v_count + 1;
  end loop;
  if v_count = 0 then raise exception 'No approved unpaid claims found for voucher'; end if;
  update public.claims_float
  set balance = balance - v_total, updated_at = now(), note = 'Therapist claim payout'
  where id = 1;
  perform public.log_admin_action('therapist_float_payout', 'provider_vouchers', p_voucher_id::text,
    jsonb_build_object('amount', v_total, 'claims_paid', v_count));
  return v_total;
end;
$$;

create or replace function public.admin_mark_claim_paid(p_claim_id uuid, p_mpesa_ref text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_voucher_id uuid;
begin
  if not public.is_super_admin() or not public.is_recently_authenticated() then
    raise exception 'Recently authenticated super-admin access required';
  end if;
  select voucher_id into v_voucher_id from public.provider_claims
  where id = p_claim_id and status = 'approved';
  if v_voucher_id is null then raise exception 'Approved claim not found'; end if;
  perform public.pay_therapist_float(v_voucher_id, p_mpesa_ref);
end;
$$;

create or replace function public.admin_adjust_claims_float(
  p_type text, p_amount numeric, p_note text
)
returns numeric
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_balance numeric(14,2);
begin
  if not public.is_super_admin() or not public.is_recently_authenticated() then
    raise exception 'Recently authenticated super-admin access required';
  end if;
  if p_type not in ('inflow', 'outflow') or p_amount is null or p_amount <= 0 then
    raise exception 'A valid transaction type and positive amount are required';
  end if;
  select balance into v_balance from public.claims_float where id = 1 for update;
  if not found then raise exception 'Claims float account is not initialized'; end if;
  if p_type = 'outflow' and v_balance < p_amount then raise exception 'Insufficient claims float balance'; end if;
  update public.claims_float
  set balance = balance + case when p_type = 'inflow' then p_amount else -p_amount end,
      updated_at = now(), note = left(coalesce(p_note, ''), 500)
  where id = 1 returning balance into v_balance;
  insert into public.claims_float_transactions (type, amount, note)
  values (p_type, p_amount, left(coalesce(p_note, ''), 500));
  perform public.log_admin_action('claims_float_adjusted', 'claims_float', '1',
    jsonb_build_object('type', p_type, 'amount', p_amount));
  return v_balance;
end;
$$;

revoke execute on function public.admin_get_user_contact(uuid) from public, anon;
revoke execute on function public.admin_promote_therapist(uuid) from public, anon;
revoke execute on function public.admin_set_therapist_status(uuid, text) from public, anon;
revoke execute on function public.admin_list_therapists() from public, anon;
revoke execute on function public.therapist_get_self_profile() from public, anon;
revoke execute on function public.admin_approve_claim(uuid) from public, anon;
revoke execute on function public.assign_voucher_to_therapist(uuid, uuid) from public, anon;
revoke execute on function public.admin_assign_voucher_with_fee(uuid, uuid, numeric) from public, anon;
revoke execute on function public.void_voucher(uuid, text) from public, anon;
revoke execute on function public.pay_therapist_float(uuid, text) from public, anon;
revoke execute on function public.admin_mark_claim_paid(uuid, text) from public, anon;
revoke execute on function public.admin_adjust_claims_float(text, numeric, text) from public, anon;

grant execute on function public.admin_get_user_contact(uuid) to authenticated;
grant execute on function public.admin_promote_therapist(uuid) to authenticated;
grant execute on function public.admin_set_therapist_status(uuid, text) to authenticated;
grant execute on function public.admin_list_therapists() to authenticated;
grant execute on function public.therapist_get_self_profile() to authenticated;
grant execute on function public.admin_approve_claim(uuid) to authenticated;
grant execute on function public.assign_voucher_to_therapist(uuid, uuid) to authenticated;
grant execute on function public.admin_assign_voucher_with_fee(uuid, uuid, numeric) to authenticated;
grant execute on function public.void_voucher(uuid, text) to authenticated;
grant execute on function public.pay_therapist_float(uuid, text) to authenticated;
grant execute on function public.admin_mark_claim_paid(uuid, text) to authenticated;
grant execute on function public.admin_adjust_claims_float(text, numeric, text) to authenticated;

notify pgrst, 'reload schema';

-- >>> re-assert final service-role crisis voucher writers (from file 03)
create or replace function public.pre_authorize_voucher(
  p_user_id uuid, p_crisis_alert_id uuid, p_max_sessions integer
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
  v_provider_voucher_id uuid;
  v_insurer_id uuid;
  v_b2b_client_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Trusted service access required';
  end if;
  if p_max_sessions is null or p_max_sessions < 1 or p_max_sessions > 10 then
    raise exception 'Invalid authorized session count';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id and status = 'active') then
    raise exception 'Active user not found';
  end if;
  if p_crisis_alert_id is not null and not exists (
    select 1 from public.crisis_alerts where id = p_crisis_alert_id and user_id = p_user_id
  ) then
    raise exception 'Crisis alert does not belong to this user';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text));
  if exists (
    select 1 from public.pre_auth_vouchers
    where user_id = p_user_id
      and status in ('pending', 'assigned', 'accepted')
      and expires_at > now()
  ) then
    raise exception 'An open voucher already exists for this user.';
  end if;

  select b2b_client_id into v_b2b_client_id
  from public.profiles where id = p_user_id;
  if v_b2b_client_id is not null then
    select ip.insurer_id into v_insurer_id
    from public.insurer_partnerships ip
    join public.insurers i on i.id = ip.insurer_id and i.status = 'active'
    where ip.b2b_client_id = v_b2b_client_id and ip.status = 'active'
      and (ip.contract_start is null or ip.contract_start <= current_date)
      and (ip.contract_end is null or ip.contract_end >= current_date)
    order by ip.created_at
    limit 1;
  end if;

  insert into public.pre_auth_vouchers (user_id, crisis_alert_id, max_sessions, insurer_id)
  values (p_user_id, p_crisis_alert_id, p_max_sessions, v_insurer_id)
  on conflict (crisis_alert_id) where crisis_alert_id is not null do nothing
  returning id into v_id;
  if v_id is null and p_crisis_alert_id is not null then
    select id into v_id from public.pre_auth_vouchers where crisis_alert_id = p_crisis_alert_id;
  end if;
  if v_id is null then raise exception 'Voucher authorization failed'; end if;

  insert into public.provider_vouchers (
    user_id, crisis_alert_id, pre_auth_voucher_id, insurer_id,
    max_sessions, expires_at, fee_per_session, status
  )
  select user_id, crisis_alert_id, id, insurer_id, max_sessions, expires_at, 0, status
  from public.pre_auth_vouchers where id = v_id
  on conflict (pre_auth_voucher_id) where pre_auth_voucher_id is not null do nothing
  returning id into v_provider_voucher_id;
  if v_provider_voucher_id is null then
    select id into v_provider_voucher_id
    from public.provider_vouchers where pre_auth_voucher_id = v_id;
  end if;
  if v_provider_voucher_id is null then raise exception 'Provider voucher creation failed'; end if;
  return v_id;
end;
$$;
revoke execute on function public.pre_authorize_voucher(uuid, uuid, integer)
  from authenticated, anon, public;
grant execute on function public.pre_authorize_voucher(uuid, uuid, integer) to service_role;
create or replace function public.record_crisis_event(
  p_user_id uuid, p_context text, p_keywords text[], p_source text, p_max_sessions integer default 1
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_alert_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Trusted service access required';
  end if;
  if p_source is null or p_source not in ('chat', 'diary') then
    raise exception 'Invalid crisis source';
  end if;
  if p_context is null or length(btrim(p_context)) = 0 then
    raise exception 'Crisis context is required';
  end if;
  if coalesce(array_length(p_keywords, 1), 0) = 0 then
    raise exception 'At least one crisis keyword is required';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text), hashtext(p_source));
  select id into v_alert_id from public.crisis_alerts
  where user_id = p_user_id and source = p_source and resolved = false
    and created_at >= now() - interval '24 hours'
  order by created_at desc
  limit 1
  for update;
  if v_alert_id is null then
    insert into public.crisis_alerts (
      user_id, keywords, message_context, severity, source, keyword, message
    )
    values (
      p_user_id, p_keywords, left(p_context, 500), 'high', p_source,
      left(p_keywords[1], 120), left(p_context, 500)
    )
    returning id into v_alert_id;
  end if;

  begin
    perform public.pre_authorize_voucher(p_user_id, v_alert_id, p_max_sessions);
  exception when others then
    if sqlerrm <> 'An open voucher already exists for this user.' then raise; end if;
  end;
  return v_alert_id;
end;
$$;
revoke execute on function public.record_crisis_event(uuid, text, text[], text, integer)
  from authenticated, anon, public;
grant execute on function public.record_crisis_event(uuid, text, text[], text, integer) to service_role;

-- Drop legacy signatures superseded by the RPC rewrites.
drop function if exists public.admin_assign_voucher(uuid, uuid);
drop function if exists public.supporter_invitation_lookup(text);

-- ---------------------------------------------------------------------------
-- Guarded legacy weak-hash remap: only runs if user_% style hashes exist.
-- No-op on a fresh database.
-- ---------------------------------------------------------------------------
do $$
declare
  v_weak int;
begin
  select count(*) into v_weak
  from public.profiles
  where circle_user_hash is not null and circle_user_hash like 'user\_%';
  if v_weak = 0 then
    return;
  end if;

  -- Remap each weak hash to a fresh uuid-hex, updating every dependent table.
  create temporary table if not exists _hash_remap (
    old_hash text primary key,
    new_hash text not null
  ) on commit drop;
  delete from _hash_remap;

  insert into _hash_remap (old_hash, new_hash)
  select circle_user_hash, replace(gen_random_uuid()::text, '-', '')
  from public.profiles
  where circle_user_hash is not null and circle_user_hash like 'user\_%';

  update public.profiles p
  set circle_user_hash = r.new_hash
  from _hash_remap r where p.circle_user_hash = r.old_hash;

  update public.circle_room_members m set user_hash = r.new_hash
  from _hash_remap r where m.user_hash = r.old_hash;
  update public.circle_messages m set user_hash = r.new_hash
  from _hash_remap r where m.user_hash = r.old_hash;
  update public.circle_message_authors a
  set user_id = null -- authors rows reference profiles.id, not hash; scrub instead
  where false;
  update public.whispers_matches w set user1_hash = r.new_hash
  from _hash_remap r where w.user1_hash = r.old_hash;
  update public.whispers_matches w set user2_hash = r.new_hash
  from _hash_remap r where w.user2_hash = r.old_hash;
  update public.whispers_messages m set sender_hash = r.new_hash
  from _hash_remap r where m.sender_hash = r.old_hash;
  update public.whispers_reports r2 set reporter_hash = r.new_hash
  from _hash_remap r where r2.reporter_hash = r.old_hash;
  update public.whispers_declines d set user_hash = r.new_hash
  from _hash_remap r where d.user_hash = r.old_hash;
  update public.circle_message_reactions c set user_hash = r.new_hash
  from _hash_remap r where c.user_hash = r.old_hash;
end $$;

-- SEC-08 final state: no broad public read on therapists; self-service only.
drop policy if exists active_therapists_public_select on public.therapists;
grant select on public.therapists to authenticated;
grant update (license_number, specialty, languages, bio, license_document_path)
  on public.therapists to authenticated;
revoke all on public.therapists_public from anon;
grant select on public.therapists_public to authenticated;

notify pgrst, 'reload schema';
