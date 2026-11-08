-- Second security hardening pass. Apply manually after the existing migrations.

revoke execute on function public.record_crisis_event(uuid, text, text[], text, integer)
  from authenticated, anon, public;
revoke execute on function public.pre_authorize_voucher(uuid, uuid, integer)
  from authenticated, anon, public;
drop policy if exists lossless_crisis_user_insert on public.crisis_alerts;

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

create table if not exists public.account_deletion_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  step text not null,
  status text not null,
  error text,
  created_at timestamptz not null default now()
);
alter table public.account_deletion_log enable row level security;
drop policy if exists account_deletion_log_service_only on public.account_deletion_log;
create policy account_deletion_log_service_only on public.account_deletion_log
  for all to authenticated, anon using (false) with check (false);
revoke all on public.account_deletion_log from anon, authenticated;
grant all on public.account_deletion_log to service_role;

insert into public.circle_message_authors (message_id, user_id)
select id, user_id from public.circle_messages where user_id is not null
on conflict (message_id) do nothing;
update public.circle_messages
set user_id = null, mentioned_user_id = null
where user_id is not null or mentioned_user_id is not null;

create or replace function public.circle_messages_scrub_identity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  new.user_id := null;
  new.mentioned_user_id := null;
  return new;
end;
$$;
drop trigger if exists circle_messages_scrub on public.circle_messages;
create trigger circle_messages_scrub before insert on public.circle_messages
for each row execute function public.circle_messages_scrub_identity();

create or replace function public.circle_messages_record_author()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is not null then
    insert into public.circle_message_authors(message_id, user_id)
    values (new.id, auth.uid())
    on conflict (message_id) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists record_circle_message_author on public.circle_messages;
drop trigger if exists circle_messages_author on public.circle_messages;
create trigger circle_messages_author after insert on public.circle_messages
for each row execute function public.circle_messages_record_author();
revoke execute on function public.circle_messages_scrub_identity() from public, anon, authenticated;
revoke execute on function public.circle_messages_record_author() from public, anon, authenticated;

drop policy if exists lossless_circle_messages_owner_update_v2 on public.circle_messages;
drop policy if exists lossless_circle_messages_owner_update on public.circle_messages;
create policy lossless_circle_messages_owner_update on public.circle_messages
for update to authenticated
using (user_hash = (select circle_user_hash from public.profiles where id = auth.uid()))
with check (user_hash = (select circle_user_hash from public.profiles where id = auth.uid()));

alter table public.profiles add column if not exists ai_data_consent_at timestamptz;

create or replace view public.therapists_public as
select id, specialty, languages, bio, status
from public.therapists
where status = 'active';
revoke all on public.therapists from authenticated;
grant select on public.therapists_public to authenticated;
-- Re-grant the minimum self-service surface: RLS (therapist_self_select /
-- therapist_self_update / therapist_super_admin_all) still limits rows and the
-- column-level UPDATE grant keeps license fields therapist-editable only.
grant select on public.therapists to authenticated;
grant update (license_number, specialty, languages, bio, license_document_path)
  on public.therapists to authenticated;

alter table public.therapists drop constraint if exists therapists_status_check;
alter table public.therapists add constraint therapists_status_check
  check (status in ('pending', 'active', 'suspended', 'deleted'));
alter table public.therapists drop constraint if exists therapists_id_fkey;
alter table public.provider_claims alter column therapist_id drop not null;
alter table public.provider_vouchers alter column user_id drop not null;
alter table public.insurers alter column profile_id drop not null;
alter table public.crisis_alerts alter column user_id drop not null;

create or replace function public.therapists_reset_review_on_identity_change()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.status <> 'deleted'
     and (new.license_number is distinct from old.license_number
     or new.license_document_path is distinct from old.license_document_path) then
    new.status := 'pending';
    new.verified_at := null;
    new.verified_by := null;
  end if;
  return new;
end;
$$;
drop trigger if exists therapists_reset_review_on_identity_change on public.therapists;
create trigger therapists_reset_review_on_identity_change
before update on public.therapists
for each row execute function public.therapists_reset_review_on_identity_change();

update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['application/pdf']::text[]
where id = 'therapist-documents';

create table if not exists public.company_code_validation_attempts (
  actor_key text not null,
  attempted_at timestamptz not null default now()
);
alter table public.company_code_validation_attempts
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists ip_hash text;
create index if not exists company_code_validation_attempts_actor_time_idx
  on public.company_code_validation_attempts(actor_key, attempted_at desc);
alter table public.company_code_validation_attempts enable row level security;
revoke all on public.company_code_validation_attempts from anon, authenticated;

create or replace function public.validate_company_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_client public.b2b_clients;
  v_used integer := 0;
  v_remaining integer;
  v_actor text;
  v_attempts integer;
  v_ip text;
  v_valid boolean := false;
begin
  begin
    v_ip := current_setting('request.headers', true)::jsonb->>'x-forwarded-for';
  exception when others then
    v_ip := null;
  end;
  v_actor := coalesce(nullif(split_part(v_ip, ',', 1), ''), auth.uid()::text, 'anonymous');
  perform pg_advisory_xact_lock(hashtext(v_actor));
  delete from public.company_code_validation_attempts
  where actor_key = v_actor and attempted_at < now() - interval '1 hour';
  insert into public.company_code_validation_attempts(actor_key) values (v_actor);
  select count(*) into v_attempts from public.company_code_validation_attempts
  where actor_key = v_actor and attempted_at >= now() - interval '1 hour';

  select * into v_client from public.b2b_clients
  where upper(company_code) = v_code and status = 'active'
  limit 1;
  select count(*) into v_used from public.profiles where b2b_client_id = v_client.id;
  v_remaining := case when v_client.max_users is null then null
    else greatest(v_client.max_users - v_used, 0) end;
  v_valid := v_client.id is not null
    and (v_client.max_users is null or v_remaining > 0);

  perform pg_sleep(0.15);
  if v_attempts > 20 then v_valid := false; end if;
  return jsonb_build_object(
    'valid', v_valid,
    'company_name', case when v_valid then v_client.company_name else null end,
    'seats_remaining', case when v_valid then v_remaining else null end
  );
end;
$$;
revoke execute on function public.validate_company_code(text) from public;
grant execute on function public.validate_company_code(text) to anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_username text;
  v_company_code text;
  v_client_id uuid;
  v_max_users integer;
  v_used integer;
begin
  v_username := nullif(btrim(coalesce(new.raw_user_meta_data->>'username', '')), '');
  if v_username is not null and exists (
    select 1 from public.profiles where username = v_username
  ) then
    v_username := null;
  end if;

  v_company_code := nullif(btrim(coalesce(new.raw_user_meta_data->>'company_code', '')), '');
  if v_company_code is not null then
    select id, max_users into v_client_id, v_max_users
    from public.b2b_clients
    where upper(company_code) = upper(v_company_code) and status = 'active'
    limit 1 for update;
    if v_client_id is not null and v_max_users is not null then
      select count(*) into v_used from public.profiles where b2b_client_id = v_client_id;
      if v_used >= v_max_users then raise exception 'No seats remaining for this company code'; end if;
    end if;
  end if;

  insert into public.profiles (
    id, full_name, username, email, phone, role, status,
    plan_type, b2b_client_id, subscription_plan, subscription_status
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    v_username,
    new.email,
    new.raw_user_meta_data->>'phone',
    'user',
    'active',
    case when v_client_id is not null then 'company' else null end,
    v_client_id,
    case when v_client_id is not null then 'company' else null end,
    case when v_client_id is not null then 'active' else null end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.supporter_owner_manage(
  p_invitation_id uuid, p_action text, p_value jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_inv public.supporter_invitations;
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'Active sign-in required';
  end if;
  select * into v_inv from public.supporter_invitations
  where id = p_invitation_id and user_id = auth.uid()
  for update;
  if not found then raise exception 'Invitation not found'; end if;

  if p_action = 'remove' then
    delete from public.supporter_invitations where id = v_inv.id;
    return jsonb_build_object('removed', true);
  elsif p_action = 'pause' then
    if v_inv.status <> 'active' then raise exception 'Only active invitations can be paused'; end if;
    update public.supporter_invitations set status = 'paused' where id = v_inv.id returning * into v_inv;
  elsif p_action = 'resume' then
    if v_inv.status <> 'paused' then raise exception 'Only paused invitations can be resumed'; end if;
    update public.supporter_invitations set status = 'active' where id = v_inv.id returning * into v_inv;
  elsif p_action = 'toggle_crisis' then
    update public.supporter_invitations
    set crisis_contact = coalesce((p_value ->> 'crisis_contact')::boolean, false)
    where id = v_inv.id returning * into v_inv;
  elsif p_action = 'renew' then
    update public.supporter_invitations
    set token = encode(gen_random_bytes(32), 'hex'),
        expires_at = now() + interval '7 days',
        status = 'pending', responded_at = null
    where id = v_inv.id returning * into v_inv;
  else
    raise exception 'Unsupported invitation action';
  end if;
  return to_jsonb(v_inv);
end;
$$;

create or replace function public.supporter_lookup(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_inv public.supporter_invitations;
  v_name text;
begin
  select * into v_inv from public.supporter_invitations
  where token = p_token and status in ('pending', 'active')
    and (expires_at is null or expires_at > now())
  limit 1;
  if not found then return null; end if;
  select full_name into v_name from public.profiles where id = v_inv.user_id;
  return jsonb_build_object(
    'id', v_inv.id,
    'supporter_name', v_inv.supporter_name,
    'supporter_relation', v_inv.supporter_relation,
    'permissions', v_inv.permissions,
    'anonymous_mode', v_inv.anonymous_mode,
    'crisis_contact', v_inv.crisis_contact,
    'status', v_inv.status,
    'responded_at', v_inv.responded_at,
    'expires_at', v_inv.expires_at,
    'created_at', v_inv.created_at,
    'user_name', case when v_inv.anonymous_mode then null else v_name end
  );
end;
$$;

create or replace function public.whispers_respond(p_match_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_hash text;
  v_row public.whispers_matches;
begin
  if not public.is_active_user() then raise exception 'Account is suspended'; end if;
  v_hash := public.whispers_own_hash();
  if v_hash is null then raise exception 'Circle identity not initialized'; end if;

  select * into v_row from public.whispers_matches
  where id = p_match_id and status = 'pending'
    and (user1_hash = v_hash or user2_hash = v_hash)
  for update;
  if not found then raise exception 'Pending match not found or caller is not a participant'; end if;

  if v_row.user1_hash = v_hash then
    if p_accept or v_row.user2_hash is not null then
      raise exception 'Only the invited participant can respond to this request';
    end if;
    update public.whispers_matches set status = 'cancelled'
    where id = p_match_id and status = 'pending' and user1_hash = v_hash
    returning * into v_row;
  elsif v_row.user2_hash = v_hash then
    update public.whispers_matches
    set status = case when p_accept then 'active' else 'rejected' end,
        rejected_at = case when p_accept then rejected_at else now() end,
        rejected_by = case when p_accept then rejected_by else v_hash end
    where id = p_match_id and status = 'pending'
      and user2_hash = v_hash
    returning * into v_row;
  end if;
  if not found then raise exception 'Pending match changed before response'; end if;
  return to_jsonb(v_row);
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
  if not public.is_super_admin() then raise exception 'Only super admins can assign vouchers'; end if;
  if p_fee_per_session is null or p_fee_per_session <= 0 then
    raise exception 'A positive session fee is required';
  end if;
  select id into v_provider_voucher_id from public.provider_vouchers
  where pre_auth_voucher_id = p_voucher_id and status = 'pending' and expires_at > now()
  for update;
  if v_provider_voucher_id is null then raise exception 'Pending voucher not found'; end if;
  update public.provider_vouchers
  set fee_per_session = p_fee_per_session where id = v_provider_voucher_id;
  perform public.assign_voucher_to_therapist(p_voucher_id, p_therapist_id);
end;
$$;
drop function if exists public.admin_assign_voucher(uuid, uuid);
drop function if exists public.supporter_invitation_lookup(text);

-- SEC-12: remove remaining over-exposed policies (idempotent; covers both the
-- legacy and lossless policy names).
drop policy if exists "avatars public select" on storage.objects;
drop policy if exists "avatar owner read" on storage.objects;
drop policy if exists broadcasts_anon_select on public.broadcasts;
drop policy if exists "lossless_profiles_admin_update" on public.profiles;

drop policy if exists "avatar owner read" on storage.objects;
update storage.buckets set public = false where id = 'avatars';
drop policy if exists "avatar owner select" on storage.objects;
create policy "avatar owner select" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists lossless_broadcasts_public_select on public.broadcasts;
drop policy if exists losslens_broadcasts_authenticated_select on public.broadcasts;
create policy losslens_broadcasts_authenticated_select on public.broadcasts
  for select to authenticated using (sent_at is not null and sent_at <= now());
drop policy if exists lossless_event_discussions_insert on public.event_discussions;
create policy lossless_event_discussions_insert on public.event_discussions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and is_admin_reply = false
    and exists (select 1 from public.events e where e.id = event_id and e.active = true)
  );
drop policy if exists lossless_event_discussions_select on public.event_discussions;
create policy lossless_event_discussions_select on public.event_discussions
  for select to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.active = true));
drop policy if exists lossless_event_discussions_admin_insert on public.event_discussions;
create policy lossless_event_discussions_admin_insert on public.event_discussions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and is_admin()
    and is_admin_reply = true
    and exists (select 1 from public.events e where e.id = event_id and e.active = true)
  );
drop policy if exists lossless_profiles_admin_update on public.profiles;

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

notify pgrst, 'reload schema';
