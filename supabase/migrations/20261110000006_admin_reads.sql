-- FN-07: admin read helpers — dashboard stats RPC, admin SELECT policies on
-- catalogues, audited crisis contact reveal, audit_logs actor FK.

create or replace function public.admin_dashboard_stats()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_nairobi date := (now() at time zone 'Africa/Nairobi')::date;
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;

  with top_triggers as (
    select t.trigger, count(*)::int as uses
    from public.diary_entries d,
         lateral jsonb_array_elements_text(coalesce(d.triggers, '[]'::jsonb)) t(trigger)
    where d.created_at >= now() - interval '30 days'
    group by t.trigger
    order by uses desc
    limit 5
  )
  select jsonb_build_object(
    'total_users', (select count(*) from public.profiles),
    'active_today', (select count(*) from public.profiles
      where (last_active at time zone 'Africa/Nairobi')::date = v_nairobi),
    'high_risk_count', (select count(*) from public.profiles where risk_level = 'high'),
    'active_events', (select count(*) from public.events where active = true),
    'active_resources', (select count(*) from public.resources where active = true),
    'cbt_completions_today', (select count(*) from public.cbt_progress
      where completed = true and (completed_at at time zone 'Africa/Nairobi')::date = v_nairobi),
    'diary_entries_today', (select count(*) from public.diary_entries where date = v_nairobi),
    'circle_messages_today', (select count(*) from public.circle_messages
      where (created_at at time zone 'Africa/Nairobi')::date = v_nairobi),
    'active_supporters', (select count(*) from public.supporter_invitations where status = 'active'),
    'top_5_triggers_30d', coalesce((select jsonb_object_agg(trigger, uses) from top_triggers), '{}'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;
revoke execute on function public.admin_dashboard_stats() from public, anon;
grant execute on function public.admin_dashboard_stats() to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['resources','events','groups'] loop
    execute format('drop policy if exists admin_select_any_%I on public.%I', t, t);
    execute format(
      'create policy admin_select_any_%I on public.%I for select to authenticated using (public.is_admin())',
      t, t);
  end loop;
end $$;

create or replace function public.crisis_get_contact(p_alert_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_alert public.crisis_alerts;
  v_email text;
  v_phone text;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;
  select * into v_alert from public.crisis_alerts where id = p_alert_id;
  if not found then
    raise exception 'Alert not found';
  end if;
  if v_alert.user_id is not null then
    select u.email into v_email from auth.users u where u.id = v_alert.user_id;
    select p.phone into v_phone from public.profiles p where p.id = v_alert.user_id;
  end if;
  perform public.log_admin_action('crisis_view_contact', 'crisis_alerts', p_alert_id::text,
    jsonb_build_object('alert_user_id', v_alert.user_id));
  return jsonb_build_object('email', v_email, 'phone', v_phone);
end;
$$;
revoke execute on function public.crisis_get_contact(uuid) from public, anon;
grant execute on function public.crisis_get_contact(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'audit_logs_actor_id_fkey'
      and conrelid = 'public.audit_logs'::regclass
  ) then
    alter table public.audit_logs
      add constraint audit_logs_actor_id_fkey
      foreign key (actor_id) references public.profiles(id) on delete set null
      not valid;
    alter table public.audit_logs validate constraint audit_logs_actor_id_fkey;
  end if;
end $$;

notify pgrst, 'reload schema';
