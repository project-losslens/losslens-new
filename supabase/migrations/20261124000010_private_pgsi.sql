-- Private PGSI assessments. Apply after 20261124000009_workflow_integrity.sql.
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