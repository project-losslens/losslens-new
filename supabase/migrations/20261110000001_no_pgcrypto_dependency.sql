-- FN-01: remove pgcrypto (gen_random_bytes) dependency from SECURITY DEFINER
-- functions that pin search_path. pgcrypto may still be installed for other
-- uses, but these functions must not depend on it.
-- Owner check: select extnamespace::regnamespace from pg_extension where extname='pgcrypto';

create or replace function public.ensure_circle_identity()
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_hash text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select circle_user_hash into v_hash
  from public.profiles
  where id = v_uid;

  if v_hash is null then
    v_hash := replace(gen_random_uuid()::text, '-', '');
    update public.profiles
    set circle_user_hash = v_hash
    where id = v_uid
      and circle_user_hash is null;
    select circle_user_hash into v_hash
    from public.profiles
    where id = v_uid;
  end if;

  return v_hash;
end;
$$;

revoke execute on function public.ensure_circle_identity() from public, anon;
grant execute on function public.ensure_circle_identity() to authenticated;

create or replace function public.create_supporter_invitation(
  p_supporter_name text,
  p_supporter_email text default null,
  p_supporter_phone text default null,
  p_supporter_relation text default null,
  p_permissions jsonb default '["Streak status","Goal progress","General mood"]'::jsonb,
  p_anonymous_mode boolean default false,
  p_crisis_contact boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_count int;
  v_inv public.supporter_invitations;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_active_user() then
    raise exception 'Account is suspended';
  end if;
  if p_supporter_name is null or length(btrim(p_supporter_name)) = 0 then
    raise exception 'Supporter name is required';
  end if;

  select count(*) into v_count
  from public.supporter_invitations
  where user_id = v_uid and status in ('pending', 'active');
  if v_count >= 5 then
    raise exception 'Maximum 5 supporters allowed';
  end if;

  insert into public.supporter_invitations (
    user_id, supporter_name, supporter_email, supporter_phone, supporter_relation,
    permissions, anonymous_mode, crisis_contact, token, status, expires_at
  ) values (
    v_uid, btrim(p_supporter_name), nullif(btrim(coalesce(p_supporter_email,'')), ''),
    nullif(btrim(coalesce(p_supporter_phone,'')), ''), nullif(btrim(coalesce(p_supporter_relation,'')), ''),
    coalesce(p_permissions, '[]'::jsonb), coalesce(p_anonymous_mode, false),
    coalesce(p_crisis_contact, false),
    replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
    'pending', now() + interval '30 days'
  ) returning * into v_inv;

  return to_jsonb(v_inv);
end;
$$;

revoke execute on function public.create_supporter_invitation(text, text, text, text, jsonb, boolean, boolean) from public, anon;
grant execute on function public.create_supporter_invitation(text, text, text, text, jsonb, boolean, boolean) to authenticated;

notify pgrst, 'reload schema';
