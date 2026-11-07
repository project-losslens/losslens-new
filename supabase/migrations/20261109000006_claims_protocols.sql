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
