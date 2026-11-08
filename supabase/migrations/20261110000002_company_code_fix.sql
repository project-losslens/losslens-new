-- FN-03: company-code onboarding fixes.
-- redeem_company_code must not call log_admin_action (non-admin callers are
-- not admins); write the audit row directly instead.

create or replace function public.redeem_company_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_client public.b2b_clients;
  v_used int;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_active_user() then
    raise exception 'Account is suspended';
  end if;
  select * into v_client from public.b2b_clients
  where upper(company_code) = v_code and status = 'active' limit 1;
  if not found then
    raise exception 'Invalid or inactive company code';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_client.id::text));
  select count(*) into v_used from public.profiles where b2b_client_id = v_client.id;
  if v_client.max_users is not null and v_used >= v_client.max_users then
    raise exception 'No seats remaining for this company code';
  end if;

  update public.profiles
  set b2b_client_id = v_client.id,
      plan_type = 'company',
      subscription_plan = coalesce(subscription_plan, 'company'),
      subscription_status = coalesce(subscription_status, 'active')
  where id = v_uid;

  insert into public.audit_logs (actor_id, action, target_table, target_id, metadata)
  values (v_uid, 'redeem_company_code', 'b2b_clients', v_client.id::text,
    jsonb_build_object('code', v_code));

  return jsonb_build_object('success', true, 'company_name', v_client.company_name);
end;
$$;

revoke execute on function public.redeem_company_code(text) from public, anon;
grant execute on function public.redeem_company_code(text) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'upgrade_interest'
      and policyname = 'upgrade_interest_super_admin_select'
  ) then
    execute 'create policy upgrade_interest_super_admin_select on public.upgrade_interest for select using (public.is_super_admin())';
  end if;
end $$;

notify pgrst, 'reload schema';
