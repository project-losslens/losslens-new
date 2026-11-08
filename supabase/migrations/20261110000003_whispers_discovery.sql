-- FN-04: whispers discovery, reporting, and decline tracking.

create table if not exists public.whispers_declines (
  match_id uuid not null references public.whispers_matches(id) on delete cascade,
  user_hash text not null,
  primary key (match_id, user_hash)
);
alter table public.whispers_declines enable row level security;
revoke all on public.whispers_declines from anon, authenticated;

-- Open requests a caller may see: pending, unclaimed, not their own, not
-- previously declined by them. Hashes are never returned.
create or replace function public.whispers_list_open_requests()
returns table (id uuid, request_message text, created_at timestamptz)
language plpgsql
security definer
stable
set search_path = pg_catalog, public
as $$
declare
  v_hash text;
begin
  if not public.is_active_user() then
    raise exception 'Account is suspended';
  end if;
  v_hash := public.whispers_own_hash();
  if v_hash is null then
    return;
  end if;
  return query
  select m.id, m.request_message, m.created_at
  from public.whispers_matches m
  where m.status = 'pending'
    and m.user2_hash is null
    and m.user1_hash <> v_hash
    and not exists (
      select 1 from public.whispers_declines d
      where d.match_id = m.id and d.user_hash = v_hash
    )
  order by m.created_at desc
  limit 20;
end;
$$;

revoke execute on function public.whispers_list_open_requests() from public, anon;
grant execute on function public.whispers_list_open_requests() to authenticated;

create or replace function public.whispers_report(
  p_match_id uuid, p_reason text, p_message_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_hash text;
  v_row public.whispers_matches;
begin
  if not public.is_active_user() then
    raise exception 'Account is suspended';
  end if;
  v_hash := public.whispers_own_hash();
  if v_hash is null then
    raise exception 'Circle identity not initialized';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 or length(p_reason) > 500 then
    raise exception 'A report reason is required (max 500 characters)';
  end if;

  select * into v_row from public.whispers_matches
  where id = p_match_id
    and (user1_hash = v_hash or user2_hash = v_hash)
  for update;
  if not found then
    raise exception 'Not a participant';
  end if;

  insert into public.whispers_reports (match_id, reporter_hash, message_id, reason)
  values (p_match_id, v_hash, p_message_id, left(btrim(p_reason), 500));

  update public.whispers_matches
  set status = 'ended', ended_at = now()
  where id = p_match_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.whispers_report(uuid, text, uuid) from public, anon;
grant execute on function public.whispers_report(uuid, text, uuid) to authenticated;

-- SEC-11 + FN-04: only the invited participant (user2) may accept an open
-- request; user1 may only cancel. Accepts enforce the 3-active-chat limit;
-- declines are recorded per-caller in whispers_declines.
create or replace function public.whispers_respond(p_match_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_hash text;
  v_row public.whispers_matches;
  v_active int;
begin
  if not public.is_active_user() then
    raise exception 'Account is suspended';
  end if;
  v_hash := public.whispers_own_hash();
  if v_hash is null then
    raise exception 'Circle identity not initialized';
  end if;

  select * into v_row from public.whispers_matches
  where id = p_match_id and status = 'pending'
  for update;
  if not found then
    raise exception 'Pending match not found';
  end if;

  -- Owner cancelling their own still-open request.
  if v_row.user1_hash = v_hash and v_row.user2_hash is null then
    if p_accept then
      raise exception 'Cannot accept your own request';
    end if;
    update public.whispers_matches set status = 'cancelled'
    where id = p_match_id and status = 'pending' and user1_hash = v_hash
    returning * into v_row;
    return to_jsonb(v_row);
  end if;

  -- Open broadcast request: anyone except the requester may claim or decline.
  if v_row.user2_hash is null and v_row.user1_hash <> v_hash then
    if p_accept then
      select count(*) into v_active
      from public.whispers_matches
      where status = 'active' and (user1_hash = v_hash or user2_hash = v_hash);
      if v_active >= 3 then
        raise exception 'Maximum active chats reached';
      end if;
      update public.whispers_matches
      set user2_hash = v_hash, user2_role = 'flexible', status = 'active'
      where id = p_match_id and user2_hash is null and status = 'pending'
      returning * into v_row;
      if not found then
        raise exception 'This request was already taken';
      end if;
    else
      insert into public.whispers_declines (match_id, user_hash)
      values (p_match_id, v_hash)
      on conflict do nothing;
      update public.whispers_matches
      set status = 'rejected', rejected_at = now(), rejected_by = v_hash
      where id = p_match_id and user2_hash is null and status = 'pending'
      returning * into v_row;
    end if;
    return to_jsonb(v_row);
  end if;

  -- Direct (non-open) pending request: only the invited user2 responds.
  if v_row.user2_hash = v_hash then
    if p_accept then
      select count(*) into v_active
      from public.whispers_matches
      where status = 'active' and (user1_hash = v_hash or user2_hash = v_hash);
      if v_active >= 3 then
        raise exception 'Maximum active chats reached';
      end if;
    end if;
    update public.whispers_matches
    set status = case when p_accept then 'active' else 'rejected' end,
        rejected_at = case when p_accept then rejected_at else now() end,
        rejected_by = case when p_accept then rejected_by else v_hash end
    where id = p_match_id and status = 'pending' and user2_hash = v_hash
    returning * into v_row;
    if not found then
      raise exception 'Pending match changed before response';
    end if;
    return to_jsonb(v_row);
  end if;

  raise exception 'Not a participant or request is no longer open';
end;
$$;

revoke execute on function public.whispers_respond(uuid, boolean) from public, anon;
grant execute on function public.whispers_respond(uuid, boolean) to authenticated;

-- Messages may only be added to active matches.
drop policy if exists lossless_whispers_message_participant_insert on public.whispers_messages;
create policy lossless_whispers_message_participant_insert on public.whispers_messages
  for insert to authenticated
  with check (
    sender_hash = (select p.circle_user_hash from public.profiles p where p.id = auth.uid())
    and exists (
      select 1 from public.whispers_matches wm
      join public.profiles p on p.id = auth.uid()
      where wm.id = whispers_messages.match_id
        and wm.status = 'active'
        and (wm.user1_hash = p.circle_user_hash or wm.user2_hash = p.circle_user_hash)
    )
  );

notify pgrst, 'reload schema';
