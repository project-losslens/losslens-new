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
