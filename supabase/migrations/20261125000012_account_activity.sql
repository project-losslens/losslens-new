begin;

create table public.account_activity (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  last_seen_at timestamptz not null,
  last_sign_out_requested_at timestamptz
);

alter table public.account_activity enable row level security;
revoke all on public.account_activity from public, anon, authenticated;

create function public.record_account_activity(p_signing_out boolean default false)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_active_user() then return; end if;

  insert into public.account_activity as activity (user_id, last_seen_at, last_sign_out_requested_at)
  values (auth.uid(), now(), case when p_signing_out then now() end)
  on conflict (user_id) do update
    set last_seen_at = excluded.last_seen_at,
        last_sign_out_requested_at = coalesce(excluded.last_sign_out_requested_at, activity.last_sign_out_requested_at)
    where p_signing_out or activity.last_seen_at < now() - interval '4 minutes';
end;
$$;

create function public.super_admin_account_activity(p_user_id uuid)
returns table(last_sign_in_at timestamptz, last_seen_at timestamptz, last_sign_out_requested_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not coalesce(public.is_active_user() and public.is_super_admin(), false) then
    raise exception 'Super-admin access required' using errcode = '42501';
  end if;

  return query
    select member.last_sign_in_at, activity.last_seen_at, activity.last_sign_out_requested_at
    from auth.users as member
    join public.profiles as profile on profile.id = member.id
    left join public.account_activity as activity on activity.user_id = member.id
    where member.id = p_user_id;
end;
$$;

revoke all on function public.record_account_activity(boolean) from public, anon, authenticated;
revoke all on function public.super_admin_account_activity(uuid) from public, anon, authenticated;
grant execute on function public.record_account_activity(boolean) to authenticated;
grant execute on function public.super_admin_account_activity(uuid) to authenticated;

commit;
