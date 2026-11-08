-- FN-05: circle reactions, presence counts, notifications, expiry purge.

create table if not exists public.circle_message_reactions (
  message_id uuid not null references public.circle_messages(id) on delete cascade,
  user_hash text not null,
  reaction text not null check (reaction in ('support','love','fire','heart','star')),
  primary key (message_id, user_hash, reaction)
);
alter table public.circle_message_reactions enable row level security;
revoke all on public.circle_message_reactions from anon;
grant select on public.circle_message_reactions to authenticated;
drop policy if exists circle_reactions_member_select on public.circle_message_reactions;
create policy circle_reactions_member_select on public.circle_message_reactions
  for select to authenticated using (true);

create or replace function public.circle_toggle_reaction(p_message_id uuid, p_reaction text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_hash text;
  v_count int;
begin
  if not public.is_active_user() then raise exception 'Account is suspended'; end if;
  v_hash := public.whispers_own_hash();
  if v_hash is null then raise exception 'Circle identity not initialized'; end if;
  if p_reaction not in ('support','love','fire','heart','star') then
    raise exception 'Invalid reaction';
  end if;
  if not exists (
    select 1 from public.circle_messages cm
    join public.circle_room_members m on m.room = cm.room and m.user_hash = v_hash
    where cm.id = p_message_id
      and (cm.expires_at is null or cm.expires_at > now())
  ) then
    raise exception 'Message not found';
  end if;

  delete from public.circle_message_reactions
  where message_id = p_message_id and user_hash = v_hash and reaction = p_reaction;
  if found then
    get diagnostics v_count = row_count;
  end if;
  if v_count = 0 then
    insert into public.circle_message_reactions (message_id, user_hash, reaction)
    values (p_message_id, v_hash, p_reaction);
  end if;
  select count(*) into v_count from public.circle_message_reactions
  where message_id = p_message_id and reaction = p_reaction;
  return jsonb_build_object('reaction', p_reaction, 'active', v_count > 0, 'count', v_count);
end;
$$;
revoke execute on function public.circle_toggle_reaction(uuid, text) from public, anon;
grant execute on function public.circle_toggle_reaction(uuid, text) to authenticated;

create or replace function public.circle_room_counts()
returns table (room text, online_count integer)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select room, count(*)::integer
  from public.circle_room_members
  where last_seen > now() - interval '5 minutes'
  group by room;
$$;
revoke execute on function public.circle_room_counts() from public, anon;
grant execute on function public.circle_room_counts() to authenticated;

create or replace function public.circle_notify(
  p_target_hash text, p_kind text, p_message_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_caller uuid := auth.uid();
  v_caller_hash text;
  v_target uuid;
  v_recent int;
begin
  if v_caller is null or not public.is_active_user() then return; end if;
  v_caller_hash := public.whispers_own_hash();
  if v_caller_hash is null or v_caller_hash = p_target_hash then return; end if;
  if p_kind not in ('mention', 'reply') then return; end if;

  select id into v_target from public.profiles where circle_user_hash = p_target_hash;
  if v_target is null then return; end if;

  select count(*) into v_recent from public.notifications
  where user_id = v_target and created_at > now() - interval '1 hour';
  if v_recent >= 20 then return; end if;

  insert into public.notifications (user_id, title, message, type, link)
  values (
    v_target,
    case when p_kind = 'mention' then 'You were mentioned in the Circle'
         else 'Someone replied to your Circle message' end,
    'Open the Circle to view it.',
    'circle',
    '/circle'
  );
end;
$$;
revoke execute on function public.circle_notify(text, text, uuid) from public, anon;
grant execute on function public.circle_notify(text, text, uuid) to authenticated;

-- Member SELECT policies must ignore expired messages.
drop policy if exists lossless_circle_messages_member_select on public.circle_messages;
create policy lossless_circle_messages_member_select on public.circle_messages
  for select to authenticated
  using (
    (expires_at is null or expires_at > now())
    and exists (
      select 1 from public.circle_room_members m
      join public.profiles p on p.id = auth.uid()
      where m.room = circle_messages.room and m.user_hash = p.circle_user_hash
    )
  );
drop policy if exists lossless_circle_messages_owner_select_v2 on public.circle_messages;
create policy lossless_circle_messages_owner_select_v2 on public.circle_messages
  for select to authenticated
  using (
    (expires_at is null or expires_at > now())
    and (
      user_hash = (select p.circle_user_hash from public.profiles p where p.id = auth.uid())
      or exists (
        select 1 from public.circle_room_members m
        join public.profiles p on p.id = auth.uid()
        where m.room = circle_messages.room and m.user_hash = p.circle_user_hash
      )
    )
  );

create or replace function public.circle_purge_expired()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count int;
begin
  delete from public.circle_messages where expires_at is not null and expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function public.circle_purge_expired() from public, anon, authenticated;

-- Owner: schedule via pg_cron, e.g.
-- select cron.schedule('circle-purge-expired', '*/15 * * * *',
--   'select public.circle_purge_expired()');

notify pgrst, 'reload schema';
