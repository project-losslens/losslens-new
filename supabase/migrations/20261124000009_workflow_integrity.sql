-- Consolidated migration: absorbs 20261124000010_private_pgsi.sql (applied after this file's original content, in original order).

-- Apply after 20261112000008. Forward-only workflow repairs for existing projects.
begin;

alter table public.grant_applications add column if not exists reviewed_at timestamptz;
alter table public.grant_applications add column if not exists rejection_reason text;

-- A deleted/missing profile must never pass the active-account guard.
create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce((select p.status <> 'suspended' and not p.must_change_password
    from public.profiles p where p.id=auth.uid()),false);
$$;

-- Storage uses its own schema and did not inherit the public-table account guard.
drop policy if exists losslens_storage_active_account on storage.objects;
create policy losslens_storage_active_account on storage.objects as restrictive
  for all to authenticated
  using (bucket_id not in ('avatars','mirror-recordings','precious-pacts','therapist-documents','claim-evidence','event-images') or public.is_active_user())
  with check (bucket_id not in ('avatars','mirror-recordings','precious-pacts','therapist-documents','claim-evidence','event-images') or public.is_active_user());

-- Token renewal must not count as a fresh credential challenge.
create or replace function public.is_recently_authenticated()
returns boolean language sql stable set search_path = pg_catalog, auth as $$
  select exists (
    select 1 from jsonb_array_elements(
      case when jsonb_typeof(auth.jwt()->'amr') = 'array'
        then auth.jwt()->'amr' else '[]'::jsonb end
    ) a
    where a->>'method' in ('password','oauth','otp','totp','sso/saml','sso','recovery')
      and case when coalesce(a->>'timestamp','') ~ '^[0-9]{1,12}$'
        then (a->>'timestamp')::bigint between
          extract(epoch from now())::bigint - 900 and extract(epoch from now())::bigint + 30
        else false end
  );
$$;

create or replace function public.admin_set_user_status(p_user_id uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_target public.profiles;
begin
  if not public.is_super_admin() or not public.is_active_user() then
    raise exception 'Active super-admin access required';
  end if;
  if p_status is null or p_status not in ('active','suspended') then raise exception 'Invalid status'; end if;
  if p_user_id = auth.uid() then raise exception 'You cannot change your own account status'; end if;
  -- Serialize account lifecycle changes to preserve the last active super-admin.
  perform pg_advisory_xact_lock(hashtext('losslens:super-admin-lifecycle'));
  select * into v_target from public.profiles where id = p_user_id for update;
  if not found then raise exception 'Account not found'; end if;
  if v_target.role = 'super_admin' and p_status = 'suspended' then
    raise exception 'Change this super-admin role through the verified account editor before suspending it';
  end if;
  update public.profiles set status = p_status where id = p_user_id;
  if p_status = 'suspended' then perform public.admin_revoke_user_sessions(p_user_id); end if;
  insert into public.audit_logs(actor_id,action,target_table,target_id,metadata)
  values(auth.uid(),'admin_status_changed','profiles',p_user_id::text,
    jsonb_build_object('old_status',v_target.status,'new_status',p_status));
  return jsonb_build_object('id',p_user_id,'status',p_status);
end;
$$;
revoke all on function public.admin_set_user_status(uuid,text) from public, anon;
grant execute on function public.admin_set_user_status(uuid,text) to authenticated;

create or replace function public.member_company_summary()
returns jsonb language sql stable security definer set search_path = pg_catalog, public as $$
  select jsonb_build_object('company_name',c.company_name,'plan',c.plan)
  from public.b2b_clients c join public.profiles p on p.b2b_client_id = c.id
  where p.id = auth.uid() and public.is_active_user();
$$;
revoke all on function public.member_company_summary() from public, anon;
grant execute on function public.member_company_summary() to authenticated;

-- Retain the existing locked seat allocation, but reliably activate company access.
create or replace function public.redeem_company_code(p_code text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_uid uuid := auth.uid(); v_client public.b2b_clients; v_used integer;
begin
  if v_uid is null or not public.is_active_user() or public.current_user_role() <> 'user' then
    raise exception 'Active member access required';
  end if;
  if not coalesce((public.validate_company_code(p_code)->>'valid')::boolean,false)
     and not exists(select 1 from public.profiles p join public.b2b_clients c on c.id=p.b2b_client_id
       where p.id=v_uid and c.status='active' and upper(c.company_code)=upper(btrim(p_code))) then
    -- Return a failure instead of throwing so the validation attempt is committed.
    return jsonb_build_object('success',false,'error','Invalid company code, no seats remaining, or too many attempts');
  end if;
  select * into v_client from public.b2b_clients
    where upper(company_code) = upper(btrim(p_code)) and status = 'active' for update;
  if not found then raise exception 'Invalid company code'; end if;
  select count(*) into v_used from public.profiles where b2b_client_id=v_client.id and id<>v_uid;
  if v_client.max_users is not null and v_used >= v_client.max_users then raise exception 'No seats remaining'; end if;
  update public.profiles set b2b_client_id=v_client.id, plan_type='company',
    subscription_plan='company', subscription_status='active', subscription_expires_at=null where id=v_uid;
  insert into public.audit_logs(actor_id,action,target_table,target_id,metadata)
  values(v_uid,'redeem_company_code','b2b_clients',v_client.id::text,jsonb_build_object('company_id',v_client.id));
  return jsonb_build_object('success',true,'company_name',v_client.company_name);
end;
$$;

create or replace function public.username_available(p_username text)
returns boolean language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_name text := lower(btrim(coalesce(p_username,''))); v_actor text; v_attempts integer;
begin
  if v_name !~ '^[a-z0-9_]{3,30}$' or v_name in ('admin','support','losslens','oloo','system') then return false; end if;
  v_actor := 'username:' || coalesce(nullif(btrim(split_part(
    coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-forwarded-for',',',-1)),''),auth.uid()::text,'anonymous');
  perform pg_advisory_xact_lock(hashtext(v_actor));
  delete from public.company_code_validation_attempts where actor_key=v_actor and attempted_at < now()-interval '1 hour';
  select count(*) into v_attempts from public.company_code_validation_attempts where actor_key=v_actor;
  if v_attempts >= 120 then raise exception 'Too many username checks. Try again later'; end if;
  insert into public.company_code_validation_attempts(actor_key) values(v_actor);
  return not exists(select 1 from public.profiles where lower(username)=v_name);
end;
$$;
revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;

-- Both plans use a database-enforced quota. UPDATE policies also enforce it.
create or replace function public.storage_user_quota_ok()
returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce((select sum(coalesce((o.metadata->>'size')::bigint,0))
    from storage.objects o where (storage.foldername(o.name))[1]=auth.uid()::text),0)
    < coalesce((select case when p.subscription_status in ('active','trialing')
      and (p.subscription_expires_at is null or p.subscription_expires_at > now())
      and coalesce(p.subscription_plan,p.plan_type) in ('premium','company','protection_member')
      then 524288000 else 26214400 end from public.profiles p where p.id=auth.uid()),26214400);
$$;
-- INSERT's policy sees existing objects only. An AFTER trigger includes the new
-- size and serializes per-account writes, also protecting overwrite requests.
create or replace function public.enforce_storage_plan_quota()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_uid uuid := auth.uid(); v_used bigint; v_limit bigint;
begin
  if v_uid is null or auth.role()='service_role' or new.bucket_id not in
    ('avatars','mirror-recordings','precious-pacts','therapist-documents','claim-evidence') then return new; end if;
  perform pg_advisory_xact_lock(hashtext('storage:'||v_uid::text));
  select case when p.subscription_status in ('active','trialing')
    and (p.subscription_expires_at is null or p.subscription_expires_at>now())
    and coalesce(p.subscription_plan,p.plan_type) in ('premium','company','protection_member')
    then 524288000 else 26214400 end into v_limit from public.profiles p where p.id=v_uid;
  select coalesce(sum(coalesce((metadata->>'size')::bigint,0)),0) into v_used
    from storage.objects where (storage.foldername(name))[1]=v_uid::text;
  if v_used>coalesce(v_limit,26214400) then raise exception 'Storage plan quota exceeded'; end if;
  return new;
end;
$$;
revoke all on function public.enforce_storage_plan_quota() from public, anon, authenticated;
drop trigger if exists enforce_storage_plan_quota on storage.objects;
create trigger enforce_storage_plan_quota after insert or update on storage.objects
  for each row execute function public.enforce_storage_plan_quota();

-- Aggregate participation without exposing another member's RSVP or identity.
create or replace function public.event_attendance_counts()
returns table(event_id uuid, going bigint)
language sql stable security definer set search_path = pg_catalog, public as $$
  select e.id, count(r.user_id) filter (where r.attendance='going')
  from public.events e left join public.event_rsvps r on r.event_id=e.id
  where e.active and auth.uid() is not null and public.is_active_user()
  group by e.id;
$$;
revoke all on function public.event_attendance_counts() from public, anon;
grant execute on function public.event_attendance_counts() to authenticated;

commit;

-- ===== Absorbed: 20261124000010_private_pgsi.sql =====

-- Private PGSI assessments. Absorbed from 20261124000010_private_pgsi.sql; runs after the workflow-integrity section above.
begin;
create table public.pgsi_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  submission_id uuid not null,
  questionnaire_version text not null check (questionnaire_version='pgsi-9-en-2001-always-v1'),
  answers jsonb not null check (jsonb_typeof(answers)='array' and jsonb_array_length(answers)=9),
  raw_score integer not null check (raw_score between 0 and 27),
  band text generated always as (case when raw_score=0 then 'none' when raw_score<=2 then 'low' when raw_score<=7 then 'moderate' else 'high' end) stored,
  completed_at timestamptz not null default clock_timestamp(),
  unique(user_id,submission_id)
);
create index pgsi_assessments_owner_latest on public.pgsi_assessments(user_id,completed_at desc,id desc);
create table public.pgsi_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  oloo_enabled boolean not null default false
);
-- Kept separate from public profiles and legacy screening fields.
alter table public.pgsi_assessments enable row level security;
alter table public.pgsi_preferences enable row level security;
revoke all on public.pgsi_assessments, public.pgsi_preferences from public,anon,authenticated;
grant select on public.pgsi_assessments, public.pgsi_preferences to authenticated;
grant all on public.pgsi_assessments, public.pgsi_preferences to service_role;
create policy pgsi_owner_read on public.pgsi_assessments for select to authenticated
  using (user_id=auth.uid() and public.current_user_role()='user' and public.is_active_user());
create policy pgsi_preferences_owner_read on public.pgsi_preferences for select to authenticated
  using (user_id=auth.uid() and public.current_user_role()='user' and public.is_active_user());

create or replace function public.submit_pgsi(
  p_submission_id uuid, p_answers jsonb, p_version text,
  p_complete_onboarding boolean default false, p_goal text default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_uid uuid := auth.uid(); v_total integer := 0; v_answer jsonb; v_row public.pgsi_assessments;
begin
  if v_uid is null or public.current_user_role() is distinct from 'user' or not public.is_active_user() then
    raise exception 'Active member access required';
  end if;
  if p_submission_id is null or p_version is distinct from 'pgsi-9-en-2001-always-v1' then
    raise exception 'Valid submission ID and questionnaire version required';
  end if;
  if jsonb_typeof(p_answers) is distinct from 'array' then raise exception 'Answer all nine PGSI questions'; end if;
  if jsonb_array_length(p_answers)<>9 then raise exception 'Answer all nine PGSI questions'; end if;
  for v_answer in select value from jsonb_array_elements(p_answers) loop
    if jsonb_typeof(v_answer) is distinct from 'number' then raise exception 'Every answer must be an integer from 0 to 3'; end if;
    if (v_answer#>>'{}')::numeric not in (0,1,2,3) then raise exception 'Every answer must be an integer from 0 to 3'; end if;
    v_total := v_total + (v_answer#>>'{}')::numeric::integer;
  end loop;
  if p_goal is not null and p_goal not in ('Cut down','Abstinence','Stay on track','Just exploring') then raise exception 'Invalid recovery goal'; end if;
  perform pg_advisory_xact_lock(hashtext('pgsi:'||v_uid::text));
  select * into v_row from public.pgsi_assessments where user_id=v_uid and submission_id=p_submission_id;
  if found then
    if v_row.answers<>p_answers or v_row.questionnaire_version<>p_version then raise exception 'Submission ID already used for different answers'; end if;
  else
    insert into public.pgsi_assessments(user_id,submission_id,questionnaire_version,answers,raw_score)
    values(v_uid,p_submission_id,p_version,p_answers,v_total) returning * into v_row;
    if coalesce(p_complete_onboarding,false) then
      update public.profiles set onboarding_completed=true,onboarding_skipped=false,goal=coalesce(p_goal,goal) where id=v_uid;
    end if;
  end if;
  return (to_jsonb(v_row)-'answers'-'user_id'-'submission_id') || jsonb_build_object('next_due_at',v_row.completed_at+interval '168 hours');
end;
$$;
revoke all on function public.submit_pgsi(uuid,jsonb,text,boolean,text) from public,anon;
grant execute on function public.submit_pgsi(uuid,jsonb,text,boolean,text) to authenticated;

create or replace function public.pgsi_latest()
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_uid uuid:=auth.uid(); v_row public.pgsi_assessments; v_enabled boolean;
begin
  if v_uid is null or public.current_user_role() is distinct from 'user' or not public.is_active_user() then raise exception 'Active member access required'; end if;
  select * into v_row from public.pgsi_assessments where user_id=v_uid order by completed_at desc,id desc limit 1;
  select oloo_enabled into v_enabled from public.pgsi_preferences where user_id=v_uid;
  return jsonb_build_object(
    'latest',case when v_row.id is null then null else (to_jsonb(v_row)-'answers'-'user_id'-'submission_id') || jsonb_build_object('next_due_at',v_row.completed_at+interval '168 hours') end,
    'due',v_row.id is null or clock_timestamp()>=v_row.completed_at+interval '168 hours',
    'personalization_enabled',coalesce(v_enabled,false)
  );
end;
$$;
revoke all on function public.pgsi_latest() from public,anon;
grant execute on function public.pgsi_latest() to authenticated;

create or replace function public.pgsi_set_personalization(p_enabled boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_uid uuid:=auth.uid();
begin
  if v_uid is null or public.current_user_role() is distinct from 'user' or not public.is_active_user() then raise exception 'Active member access required'; end if;
  if p_enabled is null then raise exception 'Choose whether to allow personalization'; end if;
  insert into public.pgsi_preferences(user_id,oloo_enabled) values(v_uid,p_enabled)
    on conflict(user_id) do update set oloo_enabled=excluded.oloo_enabled;
  return jsonb_build_object('enabled',p_enabled);
end;
$$;
revoke all on function public.pgsi_set_personalization(boolean) from public,anon;
grant execute on function public.pgsi_set_personalization(boolean) to authenticated;

-- No raw score, answers, IDs, legacy screening fields, or insurance decisions.
-- Called with the authenticated member JWT for EVERY normal Oloo message.
create or replace function public.pgsi_oloo_context()
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_result jsonb;
begin
  if auth.uid() is null or public.current_user_role() is distinct from 'user' or not public.is_active_user() then return null; end if;
  if not exists(select 1 from public.pgsi_preferences where user_id=auth.uid() and oloo_enabled) then return null; end if;
  select jsonb_build_object('band',a.band,'completed_at',a.completed_at) into v_result
    from public.pgsi_assessments a where a.user_id=auth.uid() order by a.completed_at desc,a.id desc limit 1;
  return v_result;
end;
$$;
revoke all on function public.pgsi_oloo_context() from public,anon;
grant execute on function public.pgsi_oloo_context() to authenticated;
commit;