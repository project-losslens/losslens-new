begin;

create index account_activity_last_seen_idx on public.account_activity (last_seen_at desc);
create index circle_room_members_last_seen_idx on public.circle_room_members (last_seen desc);

create function public.circle_recent_presence(p_room text default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  member_hash text;
  presence jsonb;
begin
  if auth.uid() is null or not coalesce(public.is_active_user(), false) then
    raise exception 'Active account required';
  end if;

  if p_room is not null then
    if p_room not in ('check_in', 'urge_support', 'victory') then raise exception 'Invalid Circle room'; end if;
    select circle_user_hash into member_hash from public.profiles where id = auth.uid();
    if member_hash is null then raise exception 'Circle identity required'; end if;
    insert into public.circle_room_members as member (room, user_hash, last_seen)
    values (p_room, member_hash, now())
    on conflict (room, user_hash) do update set last_seen = excluded.last_seen
    where member.last_seen <= now() - interval '45 seconds' or member.last_seen > now();
  end if;

  with recent as (
    select room, user_hash from public.circle_room_members
    where last_seen between now() - interval '5 minutes' and now()
      and room in ('check_in', 'urge_support', 'victory')
  ), counts as (
    select room, count(*) as total from recent group by room
  )
  select jsonb_build_object(
    'total', (select count(distinct user_hash) from recent),
    'rooms', coalesce((select jsonb_object_agg(room, total) from counts), '{}'::jsonb)
  ) into presence;
  return presence;
end;
$$;

create function public.admin_recent_account_presence()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not coalesce(public.is_active_user() and public.is_admin(), false) then
    raise exception 'Administrator access required';
  end if;

  return (
    select jsonb_build_object(
      'recent', count(*) filter (where activity.last_seen_at >= now() - interval '6 minutes'),
      'today', count(*) filter (where activity.last_seen_at >= (date_trunc('day', now() at time zone 'Africa/Nairobi') at time zone 'Africa/Nairobi')),
      'week', count(*) filter (where activity.last_seen_at >= now() - interval '7 days'),
      'month', count(*)
    )
    from public.account_activity as activity
    join public.profiles as profile on profile.id = activity.user_id
    where activity.last_seen_at >= now() - interval '30 days'
      and profile.status <> 'suspended' and not profile.must_change_password
  );
end;
$$;

revoke all on function public.circle_recent_presence(text) from public, anon, authenticated;
revoke all on function public.admin_recent_account_presence() from public, anon, authenticated;
grant execute on function public.circle_recent_presence(text) to authenticated;
grant execute on function public.admin_recent_account_presence() to authenticated;

commit;
