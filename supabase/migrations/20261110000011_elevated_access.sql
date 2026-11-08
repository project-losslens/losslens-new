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
