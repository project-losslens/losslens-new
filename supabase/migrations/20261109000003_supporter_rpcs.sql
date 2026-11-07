-- Authenticated-owner RPCs for the family portal. Public supporters use the
-- token RPCs introduced by 20261108000001_security_hardening.sql.

create or replace function public.supporter_owner_list_invitations()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'Active sign-in required';
  end if;
  select coalesce(jsonb_agg(to_jsonb(i) order by i.created_at desc), '[]'::jsonb)
  into v_result
  from public.supporter_invitations i
  where i.user_id = auth.uid();
  return v_result;
end;
$$;

create or replace function public.supporter_owner_manage(
  p_invitation_id uuid,
  p_action text,
  p_value jsonb default '{}'::jsonb
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
    set expires_at = now() + interval '7 days', status = 'pending', responded_at = null
    where id = v_inv.id returning * into v_inv;
  else
    raise exception 'Unsupported invitation action';
  end if;
  return to_jsonb(v_inv);
end;
$$;

create or replace function public.supporter_owner_list_messages(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_messages jsonb;
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'Active sign-in required';
  end if;
  if not exists (
    select 1 from public.supporter_invitations
    where id = p_invitation_id and user_id = auth.uid() and status = 'active'
  ) then raise exception 'Active invitation not found'; end if;
  select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at), '[]'::jsonb)
  into v_messages
  from public.supporter_messages m where m.invitation_id = p_invitation_id;
  return v_messages;
end;
$$;

create or replace function public.supporter_owner_post_message(p_invitation_id uuid, p_content text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_message public.supporter_messages;
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'Active sign-in required';
  end if;
  if not exists (
    select 1 from public.supporter_invitations
    where id = p_invitation_id and user_id = auth.uid() and status = 'active'
  ) then raise exception 'Active invitation not found'; end if;
  if p_content is null or length(btrim(p_content)) = 0 or length(p_content) > 500 then
    raise exception 'Message must be 1-500 characters';
  end if;
  insert into public.supporter_messages (invitation_id, sender, content)
  values (p_invitation_id, 'user', btrim(p_content))
  returning * into v_message;
  return to_jsonb(v_message);
end;
$$;

create or replace function public.supporter_owner_feedback(p_invitation_id uuid, p_felt_supported boolean)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'Active sign-in required';
  end if;
  if not exists (
    select 1 from public.supporter_invitations
    where id = p_invitation_id and user_id = auth.uid()
  ) then raise exception 'Invitation not found'; end if;
  insert into public.supporter_feedback (user_id, invitation_id, felt_supported)
  values (auth.uid(), p_invitation_id, p_felt_supported)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.supporter_owner_list_invitations() from public, anon;
revoke execute on function public.supporter_owner_manage(uuid, text, jsonb) from public, anon;
revoke execute on function public.supporter_owner_list_messages(uuid) from public, anon;
revoke execute on function public.supporter_owner_post_message(uuid, text) from public, anon;
revoke execute on function public.supporter_owner_feedback(uuid, boolean) from public, anon;
grant execute on function public.supporter_owner_list_invitations() to authenticated;
grant execute on function public.supporter_owner_manage(uuid, text, jsonb) to authenticated;
grant execute on function public.supporter_owner_list_messages(uuid) to authenticated;
grant execute on function public.supporter_owner_post_message(uuid, text) to authenticated;
grant execute on function public.supporter_owner_feedback(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
