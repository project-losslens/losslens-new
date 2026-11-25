-- Forward migration. Apply after consolidated 09 (including private PGSI).
-- No external charge, notification or disbursement is performed by this file.
begin;

-- Retain the existing lifecycle safeguards; repair its undefined identifier.
do $migration$
declare definition text;
begin
  select pg_get_functiondef('public.admin_set_role(uuid,text,text,uuid,boolean,uuid)'::regprocedure) into definition;
  definition=replace(definition,'''old_role'',''insurer'',''new_role'',''user'',''reason'',btrim(p_reason)', '''old_role'',''insurer'',''new_role'',''user'',''reason'',''Role changed from insurer to user during insurer contact reassignment''');
  execute replace(definition, 'v_new_role', 'p_new_role');
end;
$migration$;
revoke execute on function public.admin_set_role(uuid,text,text,uuid,boolean,uuid) from public, anon, authenticated, service_role;

create table public.account_role_requests (
  request_id uuid primary key, actor_id uuid references public.profiles(id) on delete set null,
  target_id uuid references public.profiles(id) on delete set null, payload jsonb not null,
  result jsonb not null, created_at timestamptz not null default now()
);
alter table public.account_role_requests enable row level security;
revoke all on public.account_role_requests from public, anon, authenticated;

create function public.service_change_account_role(
  p_actor_id uuid, p_target_id uuid, p_new_role text, p_expected_role text,
  p_request_id uuid, p_claims jsonb, p_insurer_id uuid default null,
  p_acknowledge_open_work boolean default false, p_reassign_to uuid default null
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare old_role text; prior public.account_role_requests; fingerprint jsonb; outcome jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Trusted account endpoint required'; end if;
  if p_claims->>'sub' is distinct from p_actor_id::text or p_request_id is null then raise exception 'Invalid actor'; end if;
  -- Serialize all role transitions, including the last-active-super-admin check.
  perform pg_advisory_xact_lock(hashtext('losslens:super-admin-lifecycle'));
  perform 1 from public.profiles where id=p_actor_id and role='super_admin' and status='active' and not must_change_password for update;
  if not found then raise exception 'Active super-admin access required'; end if;
  fingerprint=jsonb_build_object('role',p_new_role,'expected',p_expected_role,'insurer',p_insurer_id,'ack',p_acknowledge_open_work,'replacement',p_reassign_to);
  select * into prior from public.account_role_requests where request_id=p_request_id;
  if found then
    if prior.actor_id is distinct from p_actor_id or prior.target_id is distinct from p_target_id or prior.payload<>fingerprint then raise exception 'Request ID was already used for a different change'; end if;
    return prior.result;
  end if;
  if p_target_id=p_actor_id or p_new_role is null or p_new_role not in ('user','admin','super_admin','therapist','insurer') then raise exception 'Invalid target or role'; end if;
  select role into old_role from public.profiles where id=p_target_id for update;
  if not found then raise exception 'Account not found'; end if;
  if old_role is distinct from p_expected_role then raise exception 'The account role changed. Refresh the account before retrying'; end if;
  if old_role='therapist' and p_new_role<>'therapist' and (
    exists(select 1 from public.protection_assignments where therapist_id=p_target_id and status in ('assigned','accepted')) or
    exists(select 1 from public.protection_direct_payments where therapist_id=p_target_id and status<>'receipt_confirmed')
  ) then raise exception 'Reassign current Protection referrals and resolve direct-payment receipts before changing this therapist role'; end if;
  if old_role='super_admin' and p_new_role<>'super_admin' and (select status from public.profiles where id=p_target_id)='active' and (select count(*) from public.profiles where role='super_admin' and status='active')<=1 then raise exception 'The last active super-admin cannot be demoted'; end if;
  delete from public.admin_step_up_authorizations where actor_id=p_actor_id and target_id=p_target_id and action in ('demote-super-admin','promote-super-admin');
  if old_role='super_admin' and p_new_role<>'super_admin' then
    perform public.admin_authorize_user_update(p_actor_id,p_target_id,'demote-super-admin');
  elsif old_role<>'super_admin' and p_new_role='super_admin' then
    perform public.admin_authorize_user_update(p_actor_id,p_target_id,'promote-super-admin');
  end if;
  -- Only this service-only function may supply the verified actor context.
  perform set_config('request.jwt.claims',p_claims::text,true);
  perform set_config('request.jwt.claim.sub',p_actor_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('losslens.role_change_authorized','on',true);
  perform public.admin_set_role(p_target_id,p_new_role,format('Role changed from %s to %s',old_role,p_new_role),p_insurer_id,p_acknowledge_open_work,p_reassign_to);
  if (select role from public.profiles where id=p_target_id) is distinct from p_new_role then raise exception 'Role persistence failed'; end if;
  outcome=jsonb_build_object('id',p_target_id,'role',p_new_role,'previous_role',old_role);
  insert into public.account_role_requests values(p_request_id,p_actor_id,p_target_id,fingerprint,outcome,now());
  return outcome;
end; $$;
revoke all on function public.service_change_account_role(uuid,uuid,text,text,uuid,jsonb,uuid,boolean,uuid) from public, anon, authenticated;
grant execute on function public.service_change_account_role(uuid,uuid,text,text,uuid,jsonb,uuid,boolean,uuid) to service_role;

create function public.enforce_role_endpoint() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if new.role is distinct from old.role and current_setting('losslens.role_change_authorized',true) is distinct from 'on' then raise exception 'Use the password-verified account endpoint to change roles'; end if;
  return new;
end; $$;
revoke all on function public.enforce_role_endpoint() from public,anon,authenticated;
create trigger enforce_role_endpoint before update of role on public.profiles for each row execute function public.enforce_role_endpoint();

alter table public.insurers add column if not exists callback_routes text[] not null default '{}';
alter table public.insurers add column if not exists agent_contact_verified_at timestamptz;
create table public.protection_reminders (
  member_id uuid primary key references public.profiles(id) on delete cascade,
  dismissed_until timestamptz, disabled boolean not null default false
);
create table public.protection_enquiries (
  id uuid primary key default gen_random_uuid(), member_id uuid references public.profiles(id) on delete set null,
  insurer_id uuid not null references public.insurers(id), request_id uuid not null,
  route text not null check(route in ('medical_rider','individual','group')),
  member_name text, callback_phone text check(callback_phone ~ '^\+[1-9][0-9]{7,14}$'),
  recipient_name text not null, consent_at timestamptz not null, consent_version text not null default 'callback-v1',
  status text not null default 'requested' check(status in ('requested','contacted','awaiting_member_decision','issued','declined','withdrawn')),
  membership_id uuid references public.protection_memberships(id), policy_id uuid references public.protection_policies(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(member_id,request_id)
);
create unique index protection_one_open_enquiry on public.protection_enquiries(member_id,route) where status in ('requested','contacted','awaiting_member_decision');
create index protection_enquiry_queue on public.protection_enquiries(insurer_id,status,created_at);
create table public.protection_enquiry_events (
  id uuid primary key default gen_random_uuid(), enquiry_id uuid not null references public.protection_enquiries(id),
  sequence bigint generated always as identity,
  actor_id uuid references public.profiles(id) on delete set null, status text not null, created_at timestamptz not null default clock_timestamp()
);
create table public.insurer_therapist_network (
  insurer_id uuid not null references public.insurers(id), therapist_id uuid not null references public.therapists(id) on delete cascade,
  approved boolean not null default false, available boolean not null default false,
  capacity integer not null default 10 check(capacity between 1 and 1000),
  primary key(insurer_id,therapist_id)
);
create table public.protection_assignments (
  policy_id uuid primary key references public.protection_policies(id), insurer_id uuid not null references public.insurers(id),
  member_id uuid references public.profiles(id) on delete set null, therapist_id uuid references public.therapists(id) on delete set null,
  voucher_id uuid references public.provider_vouchers(id),
  status text not null check(status in ('awaiting_therapist','assigned','accepted','declined','ended')),
  treatment_consented_at timestamptz,
  declined_therapists uuid[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.provider_vouchers add column if not exists protection_policy_id uuid references public.protection_policies(id);
create unique index protection_one_live_voucher on public.provider_vouchers(protection_policy_id) where status in ('pending','assigned','accepted');

alter table public.protection_reminders enable row level security;
alter table public.protection_enquiries enable row level security;
alter table public.protection_enquiry_events enable row level security;
alter table public.insurer_therapist_network enable row level security;
alter table public.protection_assignments enable row level security;
revoke all on public.protection_reminders,public.protection_enquiries,public.protection_enquiry_events,public.insurer_therapist_network,public.protection_assignments from public,anon,authenticated;
grant select on public.protection_enquiries,public.protection_enquiry_events,public.insurer_therapist_network,public.protection_assignments to authenticated;
create policy enquiry_read on public.protection_enquiries for select to authenticated using(public.is_active_user() and (member_id=auth.uid() or insurer_id=public.protection_insurer_id() or public.is_super_admin()));
create policy enquiry_event_read on public.protection_enquiry_events for select to authenticated using(exists(select 1 from public.protection_enquiries e where e.id=enquiry_id));
create policy network_read on public.insurer_therapist_network for select to authenticated using(public.is_active_user() and (insurer_id=public.protection_insurer_id() or therapist_id=auth.uid() or public.is_super_admin()));
create policy assignment_read on public.protection_assignments for select to authenticated using(public.is_active_user() and (member_id=auth.uid() or therapist_id=auth.uid() or insurer_id=public.protection_insurer_id() or public.is_super_admin()));

create function public.member_callback_recipient(p_route text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
  if not public.is_active_user() or public.current_user_role()<>'user' then raise exception 'Active member required'; end if;
  if public.protection_mode() not in ('pilot','live') then return null; end if;
  select jsonb_build_object('id',i.id,'name',i.name) into result from public.insurers i
    join public.profiles p on p.id=i.profile_id and p.status='active' and p.role='insurer' and not p.must_change_password
    where i.status='active' and p_route=any(i.callback_routes)
    and exists(select 1 from public.insurer_partnerships ip where ip.insurer_id=i.id and ip.status='active' and (ip.contract_start is null or ip.contract_start<=current_date) and (ip.contract_end is null or ip.contract_end>=current_date))
    and exists(select 1 from public.protection_plan_versions v where v.insurer_id=i.id and v.status='approved' and (v.effective_from is null or v.effective_from<=current_date) and (v.effective_to is null or v.effective_to>=current_date))
    order by (select count(*) from public.protection_enquiries e where e.insurer_id=i.id and e.status in ('requested','contacted','awaiting_member_decision')),i.id limit 1;
  return result;
end; $$;

create function public.member_request_callback(p_request_id uuid,p_route text,p_insurer_id uuid,p_phone text,p_consent boolean,p_recipient_name text default null) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare chosen jsonb; enquiry public.protection_enquiries; v_phone text;
begin
  if not public.is_active_user() or public.current_user_role()<>'user' then raise exception 'Active member required'; end if;
  perform pg_advisory_xact_lock(hashtext('losslens:callback-allocation'));
  select * into enquiry from public.protection_enquiries where member_id=auth.uid() and (request_id=p_request_id or (route=p_route and status in ('requested','contacted','awaiting_member_decision'))) order by created_at limit 1;
  if found then return to_jsonb(enquiry); end if;
  if p_request_id is null or p_consent is distinct from true then raise exception 'Confirm consent to the named insurer'; end if;
  chosen=public.member_callback_recipient(p_route);
  if chosen is null then raise exception 'No eligible insurer is available. Recovery support remains available'; end if;
  if chosen->>'id' is distinct from p_insurer_id::text or chosen->>'name' is distinct from p_recipient_name then return jsonb_build_object('requires_confirmation',true,'recipient',chosen); end if;
  v_phone=regexp_replace(btrim(p_phone),'[[:space:]()-]','','g');
  if v_phone ~ '^0[17][0-9]{8}$' then v_phone='+254'||substr(v_phone,2); elsif v_phone ~ '^254[17][0-9]{8}$' then v_phone='+'||v_phone; end if;
  if v_phone is null or v_phone !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Confirm a valid callback phone number'; end if;
  insert into public.protection_enquiries(member_id,insurer_id,request_id,route,member_name,callback_phone,recipient_name,consent_at)
    select auth.uid(),p_insurer_id,p_request_id,p_route,coalesce(full_name,username),v_phone,chosen->>'name',now() from public.profiles where id=auth.uid() returning * into enquiry;
  insert into public.protection_enquiry_events(enquiry_id,actor_id,status) values(enquiry.id,auth.uid(),'requested');
  return to_jsonb(enquiry);
end; $$;

create function public.protection_update_enquiry(p_id uuid,p_status text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare enquiry public.protection_enquiries;
begin
  if not public.is_active_user() then raise exception 'Active account required'; end if;
  select * into enquiry from public.protection_enquiries where id=p_id for update;
  if not found then raise exception 'Enquiry not found'; end if;
  if enquiry.member_id=auth.uid() and public.current_user_role()='user' then
    if p_status<>'withdrawn' or enquiry.status not in ('requested','contacted','awaiting_member_decision','withdrawn') then raise exception 'Only pending enquiries may be withdrawn'; end if;
  elsif enquiry.insurer_id=public.protection_insurer_id() then
    if enquiry.status in ('issued','declined','withdrawn') or p_status not in ('contacted','awaiting_member_decision','declined') then raise exception 'Invalid enquiry transition'; end if;
    if p_status='contacted' and enquiry.status<>'requested' then raise exception 'Enquiry already progressed'; end if;
    if p_status='awaiting_member_decision' and enquiry.status<>'contacted' then raise exception 'Contact the member first'; end if;
  else raise exception 'Enquiry access denied'; end if;
  if enquiry.status=p_status then return to_jsonb(enquiry); end if;
  update public.protection_enquiries set status=p_status,updated_at=now() where id=p_id returning * into enquiry;
  insert into public.protection_enquiry_events(enquiry_id,actor_id,status) values(p_id,auth.uid(),p_status);
  return to_jsonb(enquiry);
end; $$;

create function public.member_protection_reminder(p_action text default 'state') returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare reminder public.protection_reminders; has_status boolean;
begin
  if not public.is_active_user() or public.current_user_role()<>'user' then raise exception 'Active member required'; end if;
  if p_action not in ('state','later','never') then raise exception 'Invalid reminder action'; end if;
  if p_action<>'state' then
    insert into public.protection_reminders(member_id,dismissed_until,disabled) values(auth.uid(),now()+interval '7 days',p_action='never')
      on conflict(member_id) do update set dismissed_until=excluded.dismissed_until,disabled=excluded.disabled;
  end if;
  select * into reminder from public.protection_reminders where member_id=auth.uid();
  has_status=exists(select 1 from public.protection_enquiries where member_id=auth.uid()) or exists(select 1 from public.protection_memberships m join public.protection_policies p on p.membership_id=m.id where m.user_id=auth.uid() and p.status in ('issued','pending_payment','active','grace'));
  return jsonb_build_object('has_status',has_status,'show',not has_status and not coalesce(reminder.disabled,false) and coalesce(reminder.dismissed_until,'-infinity'::timestamptz)<=now(),'dismissed_until',reminder.dismissed_until,'disabled',coalesce(reminder.disabled,false));
end; $$;

-- Network membership is approved by staff; availability may also be changed by its therapist.
create function public.protection_set_network(p_insurer uuid,p_therapist uuid,p_approved boolean,p_available boolean,p_capacity integer default 10) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if not public.is_active_user() or not coalesce(public.is_super_admin() or p_insurer=public.protection_insurer_id(),false) then raise exception 'Insurer or super-admin required'; end if;
  if not exists(select 1 from public.therapists t join public.profiles p on p.id=t.id where t.id=p_therapist and t.status='active' and p.status='active' and p.role='therapist') then raise exception 'Active verified therapist required'; end if;
  insert into public.insurer_therapist_network values(p_insurer,p_therapist,p_approved,p_available,p_capacity) on conflict(insurer_id,therapist_id) do update set approved=excluded.approved,available=excluded.available,capacity=excluded.capacity;
  insert into public.audit_logs(actor_id,action,target_table,target_id,metadata) values(auth.uid(),'therapist_network_updated','insurer_therapist_network',p_therapist::text,jsonb_build_object('insurer',p_insurer,'approved',p_approved,'available',p_available,'capacity',p_capacity));
end; $$;

create function public.protection_therapist_load(p_therapist uuid) returns bigint language sql stable security definer set search_path=pg_catalog,public as $$
  select count(*) from public.provider_vouchers v left join public.protection_policies p on p.id=v.protection_policy_id
  where v.therapist_id=p_therapist and v.status in ('assigned','accepted') and (
    v.protection_policy_id is null and v.expires_at>now() or
    p.status in ('active','grace') and (p.expiry_date is null or p.expiry_date>=current_date) and (v.status='accepted' or v.expires_at>now())
  );
$$;
revoke all on function public.protection_therapist_load(uuid) from public,anon,authenticated,service_role;

create function public.protection_assign_therapist(p_policy uuid,p_reason text default 'Automatic assignment',p_reassign boolean default false) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare policy public.protection_policies; member uuid; therapist uuid; voucher uuid; assignment public.protection_assignments; auto_replace boolean=false; previous_therapist uuid;
begin
  select * into policy from public.protection_policies where id=p_policy for update;
  select user_id into member from public.protection_memberships where id=policy.membership_id;
  if policy.id is null or not coalesce(auth.role()='service_role' or public.is_active_user() and (member=auth.uid() or policy.insurer_id=public.protection_insurer_id() or public.is_super_admin()),false) then raise exception 'Policy access denied'; end if;
  perform public.protection_require_mode(array['pilot','live']);
  if p_reassign is null then raise exception 'Explicit reassignment choice required'; end if;
  if not exists(select 1 from public.protection_memberships m join public.profiles p on p.id=m.user_id where m.id=policy.membership_id and m.status='active' and p.role='user' and p.status='active') then raise exception 'An active member and membership are required'; end if;
  if policy.status not in ('active','grace') or policy.commencement_date>current_date or policy.expiry_date<current_date then raise exception 'Cover must be effective before assignment'; end if;
  select * into assignment from public.protection_assignments where policy_id=p_policy;
  previous_therapist=assignment.therapist_id;
  if assignment.therapist_id is not null and assignment.status in ('assigned','accepted') and not p_reassign then
    if exists(select 1 from public.therapists t join public.profiles p on p.id=t.id join public.insurer_therapist_network n on n.therapist_id=t.id and n.insurer_id=policy.insurer_id join public.provider_vouchers v on v.id=assignment.voucher_id where t.id=assignment.therapist_id and t.status='active' and p.role='therapist' and p.status='active' and n.approved and (v.status='accepted' or v.status='assigned' and v.expires_at>now())) then return to_jsonb(assignment); end if;
    auto_replace=true; p_reassign=true; p_reason='Previous assignment no longer eligible; automatic network reassignment';
  end if;
  if p_reassign then
    if not auto_replace and (not coalesce(policy.insurer_id=public.protection_insurer_id() or public.is_super_admin(),false) or length(btrim(coalesce(p_reason,'')))<5 or length(coalesce(p_reason,''))>500) then raise exception 'Staff reassignment needs an audit reason'; end if;
    -- Preserve the former clinician's claims/payee and close only the old episode.
    -- The new clinician requires fresh treatment consent and a new episode.
    update public.protection_treatment_episodes set status='closed',updated_at=now() where policy_id=p_policy and therapist_id=assignment.therapist_id and status='open';
    update public.provider_vouchers set status='void',updated_at=now() where id=assignment.voucher_id;
  end if;
  if assignment.status='declined' then update public.provider_vouchers set status='void',updated_at=now() where id=assignment.voucher_id; end if;
  perform pg_advisory_xact_lock(hashtext('losslens:therapist-allocation'));
  select n.therapist_id into therapist from public.insurer_therapist_network n
    join public.therapists t on t.id=n.therapist_id and t.status='active'
    join public.profiles p on p.id=t.id and p.role='therapist' and p.status='active' and not p.must_change_password
    where n.insurer_id=policy.insurer_id and n.approved and n.available
      and not n.therapist_id=any(coalesce(assignment.declined_therapists,'{}'::uuid[]))
      and (assignment.status is distinct from 'declined' or n.therapist_id is distinct from assignment.therapist_id)
      and (not p_reassign or n.therapist_id is distinct from assignment.therapist_id)
      and public.protection_therapist_load(n.therapist_id)<n.capacity
    order by public.protection_therapist_load(n.therapist_id),n.therapist_id limit 1;
  if therapist is not null then
    insert into public.provider_vouchers(user_id,therapist_id,status,max_sessions,fee_per_session,expires_at,protection_policy_id)
      values(member,therapist,'assigned',1,0,least(coalesce(policy.expiry_date::timestamptz,now()+interval '14 days'),now()+interval '14 days'),p_policy) returning id into voucher;
  end if;
  insert into public.protection_assignments(policy_id,insurer_id,member_id,therapist_id,voucher_id,status) values(p_policy,policy.insurer_id,member,therapist,voucher,case when therapist is null then 'awaiting_therapist' else 'assigned' end)
    on conflict(policy_id) do update set therapist_id=excluded.therapist_id,voucher_id=excluded.voucher_id,status=excluded.status,treatment_consented_at=null,updated_at=now() returning * into assignment;
  insert into public.audit_logs(actor_id,action,target_table,target_id,metadata) values(auth.uid(),'protection_therapist_assignment','protection_assignments',p_policy::text,jsonb_build_object('therapist_id',therapist,'previous_therapist_id',previous_therapist,'reason',p_reason));
  insert into public.protection_enquiry_events(enquiry_id,actor_id,status) select id,auth.uid(),case when therapist is null then 'awaiting_therapist' else 'therapist_assigned' end from public.protection_enquiries where policy_id=p_policy;
  return to_jsonb(assignment);
end; $$;

-- Due policies activate on a staff/member refresh; no cron/service credential is exposed.
create function public.protection_refresh_activation() returns integer language plpgsql security definer set search_path=pg_catalog,public as $$
declare policy public.protection_policies; changed integer=0;
begin
  if not public.is_active_user() then raise exception 'Active account required'; end if;
  if public.protection_mode() not in ('pilot','live') then return 0; end if;
  for policy in select p.* from public.protection_policies p join public.protection_memberships m on m.id=p.membership_id where (m.user_id=auth.uid() or p.insurer_id=public.protection_insurer_id() or public.is_super_admin()) and m.status='active' and p.status in ('issued','pending_payment','active','grace') and p.commencement_date<=current_date and (p.expiry_date is null or p.expiry_date>=current_date) and p.premium_status in ('paid_current','waived') for update of p loop
    if policy.status not in ('active','grace') then
      update public.protection_policies set status='active',updated_at=now() where id=policy.id;
      insert into public.protection_events(membership_id,insurer_id,actor_id,event_type,detail) values(policy.membership_id,policy.insurer_id,auth.uid(),'policy_activated',jsonb_build_object('policy_id',policy.id));
      changed=changed+1;
    end if;
    perform public.protection_assign_therapist(policy.id);
  end loop;
  return changed;
end; $$;

create function public.protection_referral_respond(p_policy uuid,p_accept boolean) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare assignment public.protection_assignments;
begin
  select * into assignment from public.protection_assignments where policy_id=p_policy for update;
  if not public.is_active_user() or public.current_user_role()<>'therapist' or assignment.therapist_id is distinct from auth.uid() or assignment.status<>'assigned' then raise exception 'Assigned therapist required'; end if;
  update public.provider_vouchers set status=case when p_accept then 'accepted' else 'void' end,updated_at=now() where id=assignment.voucher_id;
  update public.protection_assignments set status=case when p_accept then 'accepted' else 'declined' end,updated_at=now() where policy_id=p_policy;
  insert into public.audit_logs(actor_id,action,target_table,target_id,metadata) values(auth.uid(),'protection_referral_response','protection_assignments',p_policy::text,jsonb_build_object('accepted',p_accept));
  insert into public.protection_enquiry_events(enquiry_id,actor_id,status) select id,auth.uid(),case when p_accept then 'therapist_accepted' else 'therapist_declined' end from public.protection_enquiries where policy_id=p_policy;
end; $$;

-- Every new RPC is explicitly granted; no default PUBLIC execute permissions.
do $grant$
declare fn regprocedure;
begin
  for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('member_callback_recipient','member_request_callback','protection_update_enquiry','member_protection_reminder','protection_set_network','protection_assign_therapist','protection_refresh_activation','protection_referral_respond') loop
    execute format('revoke all on function %s from public, anon',fn);
    execute format('grant execute on function %s to authenticated',fn);
  end loop;
end;
$grant$;

-- Issuance binds a consented callback to the existing policy/terms machinery.
create function public.insurer_issue_enquiry_policy(p_enquiry uuid,p_version uuid,p_reference text,p_start date,p_end date,p_premium numeric) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare enquiry public.protection_enquiries; membership uuid; policy uuid;
begin
  select * into enquiry from public.protection_enquiries where id=p_enquiry for update;
  if not public.is_active_user() or enquiry.insurer_id is distinct from public.protection_insurer_id() then raise exception 'Assigned insurer required'; end if;
  if enquiry.policy_id is not null then
    if not exists(select 1 from public.protection_policies where id=enquiry.policy_id and policy_number=p_reference and plan_version_id=p_version) then raise exception 'A different policy was already issued'; end if;
    return enquiry.policy_id;
  end if;
  if enquiry.status<>'awaiting_member_decision' then raise exception 'Contact the member and record their decision before issuing'; end if;
  if p_start is null or p_end is null or p_end<p_start or p_reference is null or length(btrim(p_reference))<1 then raise exception 'Policy reference and valid effective dates required'; end if;
  if not exists(select 1 from public.protection_plan_versions where id=p_version and insurer_id=enquiry.insurer_id and status='approved' and (effective_from is null or effective_from<=p_start) and (effective_to is null or effective_to>=p_start)) then raise exception 'Choose approved benefit terms valid on the policy start date'; end if;
  insert into public.protection_memberships(user_id,insurer_id,member_reference,status,verified_at,verified_by,cover_structure)
    values(enquiry.member_id,enquiry.insurer_id,p_reference,'active',now(),auth.uid(),enquiry.route)
    on conflict(user_id,insurer_id) do update set status='active',verified_at=now(),verified_by=auth.uid(),cover_structure=excluded.cover_structure returning id into membership;
  policy=public.insurer_issue_policy(membership,p_version,p_reference,p_start,p_end,p_premium);
  update public.protection_enquiries set membership_id=membership,policy_id=policy,status='issued',updated_at=now() where id=p_enquiry;
  insert into public.protection_enquiry_events(enquiry_id,actor_id,status) values(p_enquiry,auth.uid(),'issued');
  return policy;
end; $$;
revoke all on function public.insurer_issue_enquiry_policy(uuid,uuid,text,date,date,numeric) from public,anon;
grant execute on function public.insurer_issue_enquiry_policy(uuid,uuid,text,date,date,numeric) to authenticated;

create function public.protection_effective_date_guard() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if new.status in ('active','grace') and new.commencement_date>current_date then new.status='issued'; end if;
  return new;
end; $$;
revoke all on function public.protection_effective_date_guard() from public,anon,authenticated;
create trigger protection_effective_date_guard before insert or update on public.protection_policies for each row execute function public.protection_effective_date_guard();
update public.protection_policies set status='issued',updated_at=now() where status in ('active','grace') and commencement_date>current_date;
create function public.protection_activation_assignment() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if new.status in ('cancelled','expired','lapsed') then
    update public.provider_vouchers set status='void',updated_at=now() where protection_policy_id=new.id and status in ('assigned','accepted','pending');
    update public.protection_assignments set status='ended',treatment_consented_at=null,updated_at=now() where policy_id=new.id;
    update public.protection_treatment_episodes set status='closed',updated_at=now() where policy_id=new.id and status='open';
  elsif public.protection_mode() in ('pilot','live') and new.status in ('active','grace') and new.commencement_date<=current_date and (new.expiry_date is null or new.expiry_date>=current_date) and exists(select 1 from public.protection_memberships m join public.profiles p on p.id=m.user_id where m.id=new.membership_id and m.status='active' and p.role='user' and p.status='active') then
    if tg_op='INSERT' or old.status not in ('active','grace') then insert into public.protection_enquiry_events(enquiry_id,actor_id,status) select id,auth.uid(),'cover_active' from public.protection_enquiries where policy_id=new.id; end if;
    perform public.protection_assign_therapist(new.id);
  end if;
  return new;
end; $$;
revoke all on function public.protection_activation_assignment() from public,anon,authenticated;
create trigger protection_activation_assignment after insert or update of status on public.protection_policies for each row execute function public.protection_activation_assignment();

create table public.protection_direct_payments (
  id uuid primary key default gen_random_uuid(), claim_id uuid not null unique references public.protection_claims(id),
  insurer_id uuid not null references public.insurers(id),therapist_id uuid not null references public.therapists(id),
  amount numeric(14,2) not null check(amount>0),currency text not null default 'KES' check(currency='KES'),
  status text not null default 'pending' check(status in ('pending','processing','insurer_reported_paid','receipt_confirmed','issue_reported')),
  payment_date date, reference text, updated_at timestamptz not null default now()
);
create table public.protection_direct_payment_events (
  id uuid primary key default gen_random_uuid(),payment_id uuid not null references public.protection_direct_payments(id),
  sequence bigint generated always as identity,
  request_id uuid not null,actor_id uuid references public.profiles(id) on delete set null,
  status text not null,amount numeric(14,2) not null,currency text not null default 'KES',
  payment_date date,reference text,evidence_type text check(evidence_type in ('receipt','mpesa_message','written_confirmation')),
  evidence_text text,receipt_path text,created_at timestamptz not null default clock_timestamp(),
  unique(payment_id,request_id)
);
alter table public.protection_direct_payments enable row level security;
alter table public.protection_direct_payment_events enable row level security;
revoke all on public.protection_direct_payments,public.protection_direct_payment_events from public,anon,authenticated;
grant select on public.protection_direct_payments,public.protection_direct_payment_events to authenticated;
create policy direct_payment_read on public.protection_direct_payments for select to authenticated using(public.is_active_user() and (insurer_id=public.protection_insurer_id() or (therapist_id=auth.uid() and public.current_user_role()='therapist') or public.is_super_admin()));
create policy direct_payment_event_read on public.protection_direct_payment_events for select to authenticated using(exists(select 1 from public.protection_direct_payments p where p.id=payment_id));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('protection-payment-receipts','protection-payment-receipts',false,10485760,array['application/pdf','image/png','image/jpeg'])
  on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;
create function public.protection_receipt_access(p_path text,p_write boolean default false) returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select public.is_active_user() and (
   exists(select 1 from public.protection_claims c where c.id::text=split_part(p_path,'/',2) and c.insurer_id::text=split_part(p_path,'/',1) and c.insurer_id=public.protection_insurer_id() and (not p_write or c.status in ('approved','partially_approved'))) or
   (not p_write and exists(select 1 from public.protection_direct_payment_events e join public.protection_direct_payments p on p.id=e.payment_id where e.receipt_path=p_path and (p.therapist_id=auth.uid() and public.current_user_role()='therapist' or public.is_super_admin())))
 ) and cardinality(string_to_array(p_path,'/'))=3 and split_part(p_path,'/',3) ~* '^[a-z0-9][a-z0-9._-]{0,199}\.(pdf|png|jpg|jpeg)$';
$$;
revoke all on function public.protection_receipt_access(text,boolean) from public,anon;
grant execute on function public.protection_receipt_access(text,boolean) to authenticated;
create policy protection_payment_receipt_insert on storage.objects for insert to authenticated with check(bucket_id='protection-payment-receipts' and public.protection_receipt_access(name,true));
create policy protection_payment_receipt_read on storage.objects for select to authenticated using(bucket_id='protection-payment-receipts' and public.protection_receipt_access(name,false));
create policy protection_payment_receipt_tenant on storage.objects as restrictive for all to authenticated using(bucket_id<>'protection-payment-receipts' or public.protection_receipt_access(name,false)) with check(bucket_id<>'protection-payment-receipts' or public.protection_receipt_access(name,true));
create policy protection_payment_receipt_no_update on storage.objects as restrictive for update to authenticated using(bucket_id<>'protection-payment-receipts');
create policy protection_payment_receipt_no_delete on storage.objects as restrictive for delete to authenticated using(bucket_id<>'protection-payment-receipts');
-- Immutable evidence: no authenticated UPDATE or DELETE policy is provided.

create function public.protection_payment_update(p_claim uuid,p_request uuid,p_status text,p_expected_status text,p_amount numeric default null,p_date date default null,p_reference text default null,p_evidence_type text default null,p_evidence_text text default null,p_receipt_path text default null) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare claim public.protection_claims; payment public.protection_direct_payments; prior public.protection_direct_payment_events; therapist uuid; insurer boolean; value numeric;
begin
  if not public.is_active_user() or p_request is null then raise exception 'Active account and request ID required'; end if;
  if length(coalesce(p_reference,''))>200 or length(coalesce(p_evidence_text,''))>4000 then raise exception 'Payment reference or evidence is too long'; end if;
  select * into claim from public.protection_claims where id=p_claim for update;
  therapist=coalesce(claim.provider_id,(select therapist_id from public.provider_claims where id=claim.provider_claim_id));
  insurer=claim.insurer_id=public.protection_insurer_id();
  if claim.id is null or therapist is null or not coalesce(insurer or (therapist=auth.uid() and public.current_user_role()='therapist'),false) then raise exception 'Claim payment access denied'; end if;
  if claim.status not in ('approved','partially_approved','paid') or coalesce(claim.approved_amount,0)<=0 then raise exception 'Only approved treatment claims may be paid'; end if;
  value=coalesce(p_amount,claim.approved_amount);
  if value<=0 or value>claim.approved_amount or value<>round(value,2) then raise exception 'Amount must be within the approved claim amount, to two decimal places'; end if;
  insert into public.protection_direct_payments(claim_id,insurer_id,therapist_id,amount) values(p_claim,claim.insurer_id,therapist,value) on conflict(claim_id) do nothing;
  select * into payment from public.protection_direct_payments where claim_id=p_claim for update;
  if payment.therapist_id<>therapist or payment.insurer_id<>claim.insurer_id then raise exception 'The payment payee changed; staff must review the recorded payment before further changes'; end if;
  select * into prior from public.protection_direct_payment_events where payment_id=payment.id and request_id=p_request;
  if found then
    if prior.actor_id is distinct from auth.uid() or prior.status<>p_status or prior.reference is distinct from p_reference or prior.evidence_text is distinct from p_evidence_text or prior.receipt_path is distinct from p_receipt_path or prior.evidence_type is distinct from p_evidence_type or prior.payment_date is distinct from p_date or (p_amount is not null and prior.amount<>p_amount) then raise exception 'Request ID reused for a different update'; end if;
    return to_jsonb(payment);
  end if;
  if payment.status is distinct from p_expected_status then raise exception 'Payment changed. Refresh before recording another update'; end if;
  if insurer then
    if p_status not in ('processing','insurer_reported_paid') or payment.status='receipt_confirmed' then raise exception 'Confirmed receipts cannot be overwritten'; end if;
    if p_status='insurer_reported_paid' then
      if p_date is null or p_date>current_date or p_evidence_type is null or p_evidence_type not in ('receipt','mpesa_message','written_confirmation') then raise exception 'Payment date and one evidence option required'; end if;
      if p_evidence_type='receipt' then
        if p_receipt_path is null or split_part(p_receipt_path,'/',2)<>p_claim::text or not public.protection_receipt_access(p_receipt_path,true) or not exists(select 1 from storage.objects where bucket_id='protection-payment-receipts' and name=p_receipt_path) then raise exception 'Upload a private receipt for this claim'; end if;
      elsif p_evidence_text is null or length(btrim(p_evidence_text))<5 or length(p_evidence_text)>4000 then raise exception 'Enter a redacted message or written confirmation'; end if;
    end if;
  else
    if p_date is not null or p_reference is not null or p_receipt_path is not null or p_evidence_type is not null then raise exception 'Only the insurer may edit its payment details'; end if;
    if p_status not in ('receipt_confirmed','issue_reported') or payment.status not in ('insurer_reported_paid','receipt_confirmed','issue_reported') then raise exception 'Wait for the insurer payment report'; end if;
    if p_status='issue_reported' and length(btrim(coalesce(p_evidence_text,'')))<5 then raise exception 'Describe the payment discrepancy'; end if;
    value=payment.amount;
  end if;
  update public.protection_direct_payments set status=p_status,amount=value,payment_date=coalesce(p_date,payment_date),reference=coalesce(p_reference,reference),updated_at=now() where id=payment.id returning * into payment;
  insert into public.protection_direct_payment_events(payment_id,request_id,actor_id,status,amount,payment_date,reference,evidence_type,evidence_text,receipt_path)
    values(payment.id,p_request,auth.uid(),p_status,value,p_date,p_reference,p_evidence_type,p_evidence_text,p_receipt_path);
  if p_status='receipt_confirmed' and payment.amount=claim.approved_amount then
    update public.protection_claims set status='paid',settlement_status='settled',settled_at=now(),settlement_ref=payment.reference,updated_at=now() where id=p_claim;
  end if;
  if p_status='issue_reported' then
    update public.protection_claims set status=case when approved_amount<claimed_amount then 'partially_approved' else 'approved' end,settlement_status='reversed',updated_at=now() where id=p_claim and status='paid';
  end if;
  insert into public.audit_logs(actor_id,action,target_table,target_id,metadata) values(auth.uid(),'direct_payment_'||p_status,'protection_direct_payments',payment.id::text,jsonb_build_object('amount',value,'currency','KES','payer',claim.insurer_id,'payee',therapist,'request_id',p_request));
  return to_jsonb(payment);
end; $$;
revoke all on function public.protection_payment_update(uuid,uuid,text,text,numeric,date,text,text,text,text) from public,anon;
grant execute on function public.protection_payment_update(uuid,uuid,text,text,numeric,date,text,text,text,text) to authenticated;

create function public.protection_payment_queue() returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
  if not public.is_active_user() then raise exception 'Active account required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('claim_id',c.id,'insurer_id',c.insurer_id,'insurer',i.name,'therapist_id',coalesce(c.provider_id,pc.therapist_id),'therapist',p.full_name,'approved_amount',c.approved_amount,'amount',coalesce(d.amount,c.approved_amount),'currency','KES','status',coalesce(d.status,'pending'),'payment_date',d.payment_date,'reference',d.reference,'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.sequence) from public.protection_direct_payment_events e where e.payment_id=d.id),'[]'::jsonb)) order by c.created_at desc),'[]'::jsonb) into result
    from public.protection_claims c join public.insurers i on i.id=c.insurer_id left join public.provider_claims pc on pc.id=c.provider_claim_id join public.profiles p on p.id=coalesce(c.provider_id,pc.therapist_id) left join public.protection_direct_payments d on d.claim_id=c.id
    where c.status in ('approved','partially_approved','paid') and c.approved_amount>0 and (c.insurer_id=public.protection_insurer_id() or coalesce(c.provider_id,pc.therapist_id)=auth.uid() and public.current_user_role()='therapist' or public.is_super_admin());
  return result;
end; $$;
revoke all on function public.protection_payment_queue() from public,anon;
grant execute on function public.protection_payment_queue() to authenticated;

-- Disable the former platform-disbursement and reimbursement entry points.
-- Historical ledgers remain queryable. Platform subscription payments are unrelated.
revoke all on function public.pay_therapist_float(uuid,text),public.admin_mark_claim_paid(uuid,text),public.admin_adjust_claims_float(text,numeric,text),public.insurer_generate_bulk_invoice(uuid,date,date),public.insurer_send_bulk_invoice(uuid),public.insurer_mark_invoice_paid(uuid,text),public.insurer_reimburse_bulk(uuid,uuid,text),public.admin_confirm_invoice_payment(uuid,text),public.insurer_mark_claim_settled(uuid,text) from public,anon,authenticated,service_role;
revoke insert,update,delete on public.claims_float,public.claims_float_transactions,public.bulk_invoices,public.provider_payouts from authenticated,anon;

create function public.member_protection_journey() returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare enquiries jsonb; assignments jsonb;
begin
  if not public.is_active_user() or public.current_user_role()<>'user' then raise exception 'Active member required'; end if;
  select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('agent_phone',case when i.agent_contact_verified_at is not null and i.contact_phone ~ '^\+[1-9][0-9]{7,14}$' then i.contact_phone end,'agent_email',case when i.agent_contact_verified_at is not null then i.contact_email end,'events',(select coalesce(jsonb_agg(jsonb_build_object('status',v.status,'created_at',v.created_at) order by v.sequence),'[]'::jsonb) from public.protection_enquiry_events v where v.enquiry_id=e.id)) order by e.created_at desc),'[]'::jsonb) into enquiries from public.protection_enquiries e join public.insurers i on i.id=e.insurer_id where e.member_id=auth.uid();
  select coalesce(jsonb_agg(jsonb_build_object('policy_id',p.id,'policy_number',p.policy_number,'status',case when p.commencement_date>current_date then 'scheduled' else p.status end,'commencement_date',p.commencement_date,'expiry_date',p.expiry_date,'assignment_status',a.status,'therapist',pr.full_name,'therapist_id',a.therapist_id,'referral_status',a.status,'insurer',i.name)),'[]'::jsonb) into assignments from public.protection_policies p join public.protection_memberships m on m.id=p.membership_id join public.insurers i on i.id=p.insurer_id left join public.protection_assignments a on a.policy_id=p.id left join public.profiles pr on pr.id=a.therapist_id where m.user_id=auth.uid();
  return jsonb_build_object('enquiries',enquiries,'policies',assignments,'mode',public.protection_mode());
end; $$;
revoke all on function public.member_protection_journey() from public,anon;
grant execute on function public.member_protection_journey() to authenticated;

create function public.protection_configure_callback(p_insurer uuid,p_routes text[],p_contact_phone text,p_contact_email text,p_verified boolean) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if not public.is_super_admin() or not public.is_active_user() then raise exception 'Active super-admin required'; end if;
  if p_routes is null or not p_routes <@ array['medical_rider','individual','group'] or (p_verified and (coalesce(p_contact_phone,'') !~ '^\+[1-9][0-9]{7,14}$' or coalesce(p_contact_email,'') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')) then raise exception 'Valid routes and verified E.164 phone/email required'; end if;
  update public.insurers set callback_routes=p_routes,contact_phone=p_contact_phone,contact_email=p_contact_email,agent_contact_verified_at=case when p_verified then now() end where id=p_insurer;
  if not found then raise exception 'Insurer not found'; end if;
  insert into public.audit_logs(actor_id,action,target_table,target_id,metadata) values(auth.uid(),'callback_configuration','insurers',p_insurer::text,jsonb_build_object('routes',p_routes,'contact_verified',p_verified));
end; $$;
revoke all on function public.protection_configure_callback(uuid,text[],text,text,boolean) from public,anon;
grant execute on function public.protection_configure_callback(uuid,text[],text,text,boolean) to authenticated;

create function public.admin_subscription_transactions() returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
  if not public.is_active_user() or not public.is_super_admin() then raise exception 'Active super-admin required'; end if;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]'::jsonb) into result from (
    select id,user_id,provider,provider_ref,amount,currency,plan,status,created_at,updated_at,
      (provider='mpesa' and status='success' and raw->>'verifiedByProviderQuery'='true') as provider_verified,
      raw->>'providerResultCode' as provider_result_code
    from public.payments order by created_at desc limit 200
  ) t;
  return result;
end; $$;
revoke all on function public.admin_subscription_transactions() from public,anon;
grant execute on function public.admin_subscription_transactions() to authenticated;

create function public.member_accept_assigned_treatment(p_policy uuid) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if not public.is_active_user() or public.current_user_role()<>'user' then raise exception 'Active member required'; end if;
  update public.protection_assignments set treatment_consented_at=coalesce(treatment_consented_at,now()) where policy_id=p_policy and member_id=auth.uid() and status='accepted';
  if not found then raise exception 'Wait for your assigned therapist to accept the referral'; end if;
  insert into public.audit_logs(actor_id,action,target_table,target_id,metadata) values(auth.uid(),'treatment_consent','protection_assignments',p_policy::text,jsonb_build_object('scope','start assigned treatment; no diary, chat or PGSI sharing'));
end; $$;
revoke all on function public.member_accept_assigned_treatment(uuid) from public,anon;
grant execute on function public.member_accept_assigned_treatment(uuid) to authenticated;
-- Reuse the established clinical episode and claim checks; do not bypass them.
do $migration$
declare definition text;
begin
  select pg_get_functiondef('public.member_start_episode(uuid,uuid,text)'::regprocedure) into definition;
  definition=replace(definition,E'\r\n',E'\n');
  if strpos(definition,E'\nbegin\n')=0 then raise exception 'Unrecognised treatment episode definition'; end if;
  execute replace(definition,E'\nbegin\n',E'\nbegin\n  if not exists(select 1 from public.protection_assignments where policy_id=p_policy_id and member_id=auth.uid() and therapist_id=p_therapist_id and status=\'accepted\' and treatment_consented_at is not null) then raise exception \'An accepted network referral and treatment consent are required\'; end if;\n');
end;
$migration$;

create function public.protection_voucher_response_sync() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if new.protection_policy_id is not null and new.status is distinct from old.status then
    update public.protection_assignments set declined_therapists=case when new.status in ('void','expired','pending') and therapist_id is not null and not therapist_id=any(declined_therapists) then array_append(declined_therapists,therapist_id) else declined_therapists end,status=case when new.status='accepted' then 'accepted' when new.status in ('void','expired','pending') then 'declined' else status end,updated_at=now() where voucher_id=new.id;
  end if;
  return new;
end; $$;
revoke all on function public.protection_voucher_response_sync() from public,anon,authenticated;
create trigger protection_voucher_response_sync after update of status on public.provider_vouchers for each row execute function public.protection_voucher_response_sync();

-- Treatment-milestone claims retain all existing eligibility/limit checks and
-- now bind their immutable policy version and actual verifying clinician payee.
do $migration$
declare definition text;
begin
  select pg_get_functiondef('public.member_submit_milestone_claim(uuid)'::regprocedure) into definition;
  definition=replace(definition,'(membership_id, policy_id, insurer_id, benefit_id, milestone_id, claim_type,','(membership_id, policy_id, insurer_id, benefit_id, milestone_id, plan_version_id, provider_id, claim_type,');
  definition=replace(definition,'values (v_ms.membership_id, v_pol.id, v_pol.insurer_id, v_b.id, v_ms.id,','values (v_ms.membership_id, v_pol.id, v_pol.insurer_id, v_b.id, v_ms.id, v_pol.plan_version_id, v_ms.verified_by,');
  if strpos(definition,'v_ms.id, v_pol.plan_version_id, v_ms.verified_by,')=0 then raise exception 'Unrecognised milestone claim definition'; end if;
  execute definition;
end;
$migration$;

-- Apply the same date/approved-terms contract to the retained legacy issuance UI.
do $migration$
declare definition text;
begin
  select pg_get_functiondef('public.insurer_issue_policy(uuid,uuid,text,date,date,numeric)'::regprocedure) into definition;
  definition=replace(definition,E'\r\n',E'\n');
  if strpos(definition,E'\nbegin\n')=0 then raise exception 'Unrecognised policy issuance definition'; end if;
  execute replace(definition,E'\nbegin\n',E'\nbegin\n  if p_commencement_date is null or p_expiry_date is null or p_expiry_date<p_commencement_date then raise exception \'Record the policy effective start and end dates\'; end if;\n  if not exists(select 1 from public.protection_plan_versions where id=p_plan_version_id and status=\'approved\' and (effective_from is null or effective_from<=p_commencement_date) and (effective_to is null or effective_to>=p_commencement_date)) then raise exception \'Approved terms must be valid on the policy start date\'; end if;\n');
end;
$migration$;

create function public.protection_network_candidates() returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
  if not public.is_active_user() or not(public.is_super_admin() or public.protection_insurer_id() is not null) then raise exception 'Insurer or super-admin required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'full_name',p.full_name,'specialty',t.specialty) order by p.full_name,t.id),'[]'::jsonb) into result from public.therapists t join public.profiles p on p.id=t.id where t.status='active' and p.status='active' and p.role='therapist' and not p.must_change_password;
  return result;
end; $$;
revoke all on function public.protection_network_candidates() from public,anon;
grant execute on function public.protection_network_candidates() to authenticated;

-- Whitelist portal metadata instead of relying on broad insurer-table grants or
-- product-version RLS subqueries into the RPC-only policy tables.
create function public.protection_portal_setup() returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare companies jsonb; versions jsonb;
begin
  if not public.is_active_user() or not(public.is_super_admin() or public.protection_insurer_id() is not null) then raise exception 'Active insurer or super-admin required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'name',i.name) order by i.name),'[]'::jsonb) into companies from public.insurers i where i.status='active' and (i.id=public.protection_insurer_id() or public.is_super_admin());
  select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'plan_id',v.plan_id,'insurer_id',v.insurer_id,'version_no',v.version_no,'status',v.status,'premium_amount',v.premium_amount,'premium_frequency',v.premium_frequency) order by v.insurer_id,v.version_no),'[]'::jsonb) into versions from public.protection_plan_versions v where v.status='approved' and (v.insurer_id=public.protection_insurer_id() or public.is_super_admin());
  return jsonb_build_object('insurers',companies,'versions',versions);
end; $$;
revoke all on function public.protection_portal_setup() from public,anon;
grant execute on function public.protection_portal_setup() to authenticated;

-- Reuse the already scheduled /api/cron/protection-lifecycle service sweep.
-- This retries waiting network assignments as well as activating due cover.
do $migration$
declare definition text;
begin
  select pg_get_functiondef('public.protection_lifecycle_sweep()'::regprocedure) into definition;
  definition=replace(definition,E'\r\n',E'\n');
  definition=replace(definition,'if auth.role() <> ''service_role'' and not public.is_super_admin() then','if auth.role() is distinct from ''service_role'' and not(public.is_super_admin() and public.is_active_user()) then');
  definition=replace(definition,'perform public.protection_refresh_policy_payment(v_policy.id);',E'perform public.protection_refresh_policy_payment(v_policy.id);\n    if public.protection_mode() in (\'pilot\',\'live\') and exists(select 1 from public.protection_policies where id=v_policy.id and status in (\'active\',\'grace\') and commencement_date<=current_date and (expiry_date is null or expiry_date>=current_date) and exists(select 1 from public.protection_memberships m join public.profiles pr on pr.id=m.user_id where m.id=membership_id and m.status=\'active\' and pr.role=\'user\' and pr.status=\'active\')) then perform public.protection_assign_therapist(v_policy.id); end if;');
  if strpos(definition,'perform public.protection_assign_therapist(v_policy.id)')=0 then raise exception 'Unrecognised lifecycle sweep definition'; end if;
  execute definition;
end;
$migration$;

-- Match the existing account-deletion anonymisation contract. New callback
-- contact data must not survive a deleted member or block ordinary deletion.
create function public.protection_anonymize_account() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  insert into public.protection_enquiry_events(enquiry_id,actor_id,status) select id,null,'account_removed' from public.protection_enquiries where member_id=old.id;
  update public.protection_enquiries set member_name=null,callback_phone=null,status=case when status in ('requested','contacted','awaiting_member_decision') then 'withdrawn' else status end,updated_at=now() where member_id=old.id;
  update public.provider_vouchers set status='void',updated_at=now() where id in (select voucher_id from public.protection_assignments where member_id=old.id or therapist_id=old.id) and status in ('pending','assigned','accepted');
  update public.protection_assignments set status=case when member_id=old.id then 'ended' else 'awaiting_therapist' end,treatment_consented_at=null,updated_at=now() where member_id=old.id or therapist_id=old.id;
  return old;
end; $$;
revoke all on function public.protection_anonymize_account() from public,anon,authenticated,service_role;
create trigger protection_anonymize_account before delete on public.profiles for each row execute function public.protection_anonymize_account();

notify pgrst, 'reload schema';
commit;
