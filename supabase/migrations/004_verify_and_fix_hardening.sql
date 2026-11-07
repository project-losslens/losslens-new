alter table public.audit_logs disable trigger prevent_direct_audit_writes;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'audit_logs'
      and column_name = 'user_id'
  ) then
    update public.audit_logs
    set actor_id = user_id
    where actor_id is null and user_id is not null;
  end if;
end
$$;

alter table public.audit_logs enable trigger prevent_direct_audit_writes;

drop policy if exists losslens_profiles_super_admin_select on public.profiles;
create policy losslens_profiles_super_admin_select on public.profiles
  for select to authenticated using (public.is_super_admin());
