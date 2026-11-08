-- ============================================================================
-- 20261110000003_rpc_functions.sql — LossLens RPCs (consolidated, user domain)
-- ============================================================================
-- All security-definer RPCs for circle, whispers, supporters, company codes,
-- progress, crisis, broadcasts and admin user actions. Final bodies only.
-- Every function: set search_path, revoke from public/anon, explicit grants.
-- Depends on 20261110000001_core_schema.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Circle identity + helpers
-- ---------------------------------------------------------------------------
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

create or replace function public.whispers_own_hash()
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select p.circle_user_hash from public.profiles p where p.id = auth.uid();
$$;
revoke execute on function public.whispers_own_hash() from public, anon, authenticated;

create or replace function public.circle_toggle_reaction(p_message_id uuid, p_reaction text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_hash text;
  v_count int := 0;
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
  get diagnostics v_count = row_count;
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

-- ---------------------------------------------------------------------------
-- Whispers
-- ---------------------------------------------------------------------------
create or replace function public.whispers_request(p_peer_hash text default null, p_message text default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_hash text;
  v_peer text := nullif(btrim(coalesce(p_peer_hash, '')), '');
  v_msg text := nullif(btrim(coalesce(p_message, '')), '');
  v_pending int;
  v_active int;
  v_row public.whispers_matches;
begin
  if not public.is_active_user() then
    raise exception 'Account is suspended';
  end if;
  v_hash := public.whispers_own_hash();
  if v_hash is null then
    raise exception 'Circle identity not initialized';
  end if;
  if v_peer is not null and v_peer = v_hash then
    raise exception 'Cannot whisper yourself';
  end if;
  if v_msg is not null and length(v_msg) > 140 then
    v_msg := left(v_msg, 140);
  end if;

  select count(*) into v_pending
  from public.whispers_matches
  where status = 'pending' and user1_hash = v_hash;
  if v_pending >= 3 then
    raise exception 'Too many pending requests';
  end if;

  select count(*) into v_active
  from public.whispers_matches
  where status = 'active' and (user1_hash = v_hash or user2_hash = v_hash);
  if v_active >= 3 then
    raise exception 'Maximum active chats reached';
  end if;

  insert into public.whispers_matches
    (user1_hash, user1_role, user2_hash, user2_role, status, request_message, request_type)
  values
    (v_hash, 'flexible',
     case when v_peer is not null then v_peer end,
     case when v_peer is not null then 'flexible' end,
     'pending', v_msg, 'request')
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;
revoke execute on function public.whispers_request(text, text) from public, anon;
grant execute on function public.whispers_request(text, text) to authenticated;

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

create or replace function public.whispers_rate(p_match_id uuid, p_rating integer, p_feedback text default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_hash text;
  v_row public.whispers_matches;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be between 1 and 5';
  end if;
  if not public.is_active_user() then
    raise exception 'Account is suspended';
  end if;
  v_hash := public.whispers_own_hash();

  select * into v_row from public.whispers_matches where id = p_match_id for update;
  if not found then
    raise exception 'Match not found';
  end if;
  if v_row.user1_hash is distinct from v_hash and v_row.user2_hash is distinct from v_hash then
    raise exception 'Not a participant';
  end if;

  if v_row.user1_hash = v_hash then
    update public.whispers_matches
    set user1_rating = p_rating,
        user1_feedback = left(coalesce(p_feedback, user1_feedback), 500),
        status = 'ended', ended_at = now()
    where id = p_match_id
    returning * into v_row;
  else
    update public.whispers_matches
    set user2_rating = p_rating,
        user2_feedback = left(coalesce(p_feedback, user2_feedback), 500),
        status = 'ended', ended_at = now()
    where id = p_match_id
    returning * into v_row;
  end if;
  return to_jsonb(v_row);
end;
$$;
revoke execute on function public.whispers_rate(uuid, integer, text) from public, anon;
grant execute on function public.whispers_rate(uuid, integer, text) to authenticated;

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

-- ---------------------------------------------------------------------------
-- Supporter / family portal (token RPCs callable by anon supporters)
-- ---------------------------------------------------------------------------
create or replace function public.supporter_lookup(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_inv public.supporter_invitations;
  v_name text;
begin
  select * into v_inv from public.supporter_invitations
  where token = p_token limit 1;
  if not found then
    return null;
  end if;

  select full_name into v_name from public.profiles where id = v_inv.user_id;

  return jsonb_build_object(
    'id', v_inv.id,
    'supporter_name', v_inv.supporter_name,
    'supporter_relation', v_inv.supporter_relation,
    'permissions', v_inv.permissions,
    'anonymous_mode', v_inv.anonymous_mode,
    'crisis_contact', v_inv.crisis_contact,
    'status', case
      when v_inv.expires_at is not null and v_inv.expires_at <= now() then 'expired'
      else v_inv.status end,
    'responded_at', v_inv.responded_at,
    'expires_at', v_inv.expires_at,
    'created_at', v_inv.created_at,
    'user_name', case when v_inv.anonymous_mode then null else v_name end
  );
end;
$$;
revoke execute on function public.supporter_lookup(text) from public;
grant execute on function public.supporter_lookup(text) to anon, authenticated;

create or replace function public.supporter_respond(p_token text, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_inv public.supporter_invitations;
begin
  select * into v_inv from public.supporter_invitations
  where token = p_token for update;
  if not found then
    raise exception 'Invalid invitation';
  end if;
  if v_inv.expires_at is not null and v_inv.expires_at <= now() then
    raise exception 'Invitation expired';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'Invitation already responded';
  end if;

  update public.supporter_invitations
  set status = case when p_accept then 'active' else 'declined' end,
      responded_at = now()
  where id = v_inv.id
  returning * into v_inv;

  return jsonb_build_object('status', v_inv.status, 'responded_at', v_inv.responded_at);
end;
$$;
revoke execute on function public.supporter_respond(text, boolean) from public;
grant execute on function public.supporter_respond(text, boolean) to anon, authenticated;

create or replace function public.supporter_get_summary(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_inv public.supporter_invitations;
  v_perms jsonb;
  v_profile public.profiles;
  v_moods jsonb;
  v_cbt int;
begin
  select * into v_inv from public.supporter_invitations
  where token = p_token;
  if not found or v_inv.status <> 'active'
     or (v_inv.expires_at is not null and v_inv.expires_at <= now()) then
    raise exception 'Invitation is not active';
  end if;

  v_perms := coalesce(v_inv.permissions, '[]'::jsonb);
  select * into v_profile from public.profiles where id = v_inv.user_id;
  if not found then
    raise exception 'User not found';
  end if;

  if v_perms ? 'Diary summary' or v_perms ? 'General mood' then
    select coalesce(jsonb_agg(jsonb_build_object('date', d.date, 'mood', d.mood, 'gambled', d.gambled)
                              order by d.date desc), '[]'::jsonb)
    into v_moods
    from (
      select date, mood, gambled from public.diary_entries
      where user_id = v_inv.user_id
      order by date desc limit 7
    ) d;
  else
    v_moods := '[]'::jsonb;
  end if;

  if v_perms ? 'Module progress' then
    select count(*) into v_cbt from public.cbt_progress
    where user_id = v_inv.user_id and completed = true;
  else
    v_cbt := null;
  end if;

  return jsonb_build_object(
    'streak_days', case when v_perms ? 'Streak status' then v_profile.streak_days end,
    'money_saved', case when v_perms ? 'Streak status' then v_profile.money_saved end,
    'goal', case when v_perms ? 'Goal progress' then v_profile.goal end,
    'risk_level', case when v_perms ? 'Risk level' then v_profile.risk_level end,
    'recent_moods', v_moods,
    'cbt_completed', v_cbt,
    'full_name', case when v_inv.anonymous_mode then null else v_profile.full_name end
  );
end;
$$;
revoke execute on function public.supporter_get_summary(text) from public;
grant execute on function public.supporter_get_summary(text) to anon, authenticated;

create or replace function public.supporter_post_message(p_token text, p_content text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_inv public.supporter_invitations;
  v_msg public.supporter_messages;
begin
  select * into v_inv from public.supporter_invitations
  where token = p_token;
  if not found or v_inv.status <> 'active'
     or (v_inv.expires_at is not null and v_inv.expires_at <= now()) then
    raise exception 'Invitation is not active';
  end if;
  if p_content is null or length(btrim(p_content)) = 0 or length(p_content) > 500 then
    raise exception 'Message must be 1-500 characters';
  end if;

  insert into public.supporter_messages (invitation_id, sender, content)
  values (v_inv.id, 'supporter', btrim(p_content))
  returning * into v_msg;
  return to_jsonb(v_msg);
end;
$$;
revoke execute on function public.supporter_post_message(text, text) from public;
grant execute on function public.supporter_post_message(text, text) to anon, authenticated;

create or replace function public.supporter_list_messages(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_inv public.supporter_invitations;
  v_msgs jsonb;
begin
  select * into v_inv from public.supporter_invitations
  where token = p_token;
  if not found or v_inv.status <> 'active'
     or (v_inv.expires_at is not null and v_inv.expires_at <= now()) then
    raise exception 'Invitation is not active';
  end if;

  select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at), '[]'::jsonb)
  into v_msgs
  from public.supporter_messages m
  where m.invitation_id = v_inv.id;
  return v_msgs;
end;
$$;
revoke execute on function public.supporter_list_messages(text) from public;
grant execute on function public.supporter_list_messages(text) to anon, authenticated;

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
    -- Rotate the token on renew so an old link cannot be reused.
    update public.supporter_invitations
    set expires_at = now() + interval '7 days', status = 'pending', responded_at = null,
        token = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
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

-- ---------------------------------------------------------------------------
-- Company codes
-- ---------------------------------------------------------------------------
create or replace function public.validate_company_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_client public.b2b_clients;
  v_used integer := 0;
  v_remaining integer;
  v_actor text;
  v_attempts integer;
  v_ip text;
  v_valid boolean := false;
begin
  begin
    v_ip := current_setting('request.headers', true)::jsonb->>'x-forwarded-for';
  exception when others then
    v_ip := null;
  end;
  v_actor := coalesce(nullif(split_part(v_ip, ',', 1), ''), auth.uid()::text, 'anonymous');
  perform pg_advisory_xact_lock(hashtext(v_actor));
  delete from public.company_code_validation_attempts
  where actor_key = v_actor and attempted_at < now() - interval '1 hour';
  insert into public.company_code_validation_attempts(actor_key) values (v_actor);
  select count(*) into v_attempts from public.company_code_validation_attempts
  where actor_key = v_actor and attempted_at >= now() - interval '1 hour';

  select * into v_client from public.b2b_clients
  where upper(company_code) = v_code and status = 'active'
  limit 1;
  select count(*) into v_used from public.profiles where b2b_client_id = v_client.id;
  v_remaining := case when v_client.max_users is null then null
    else greatest(v_client.max_users - v_used, 0) end;
  v_valid := v_client.id is not null
    and (v_client.max_users is null or v_remaining > 0);

  perform pg_sleep(0.15);
  if v_attempts > 20 then v_valid := false; end if;
  return jsonb_build_object(
    'valid', v_valid,
    'company_name', case when v_valid then v_client.company_name else null end,
    'seats_remaining', case when v_valid then v_remaining else null end
  );
end;
$$;
revoke execute on function public.validate_company_code(text) from public;
grant execute on function public.validate_company_code(text) to anon, authenticated;

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

-- ---------------------------------------------------------------------------
-- Progress (idempotent, Nairobi-anchored)
-- ---------------------------------------------------------------------------
create or replace function public.recompute_progress()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Africa/Nairobi')::date;
  v_profile public.profiles;
  v_streak int := 0;
  v_cur date;
  v_freeze_used boolean;
  v_freeze_reset date;
  v_freeze_activated boolean := false;
  v_freeze_bridged date;
  v_clean_since date;
  v_money_saved numeric;
  v_diary_count int;
  v_clean_count int;
  v_cbt_count int;
  v_trigger_count int;
  v_badges jsonb;
  v_new_badges jsonb := '[]'::jsonb;
  v_badge_row record;
  v_earned text[];
  v_day_count int;
  v_day_clean boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if not found then
    raise exception 'Profile not found';
  end if;

  v_freeze_used := coalesce(v_profile.streak_freeze_used, false);
  v_freeze_reset := v_profile.streak_freeze_reset_date;
  v_freeze_bridged := v_profile.streak_freeze_bridged_date;
  if v_freeze_used and v_freeze_reset is not null and v_freeze_reset <= v_today then
    v_freeze_used := false;
    v_freeze_reset := null;
    v_freeze_bridged := null;
  end if;

  if exists (select 1 from public.diary_entries where user_id = v_uid and date = v_today) then
    v_cur := v_today;
  elsif exists (select 1 from public.diary_entries where user_id = v_uid and date = v_today - 1) then
    v_cur := v_today - 1;
  else
    v_cur := null;
  end if;

  while v_cur is not null loop
    select count(*), bool_or(not d.gambled)
    into v_day_count, v_day_clean
    from public.diary_entries d
    where d.user_id = v_uid and d.date = v_cur;

    if v_day_count = 0 then
      exit;
    elsif v_day_clean then
      v_streak := v_streak + 1;
      v_cur := v_cur - 1;
    else
      if not v_freeze_used or v_freeze_bridged = v_cur then
        if not v_freeze_used then
          v_freeze_used := true;
          v_freeze_reset := v_today + 30;
          v_freeze_activated := true;
        end if;
        v_freeze_bridged := v_cur;
        v_cur := v_cur - 1;
      else
        exit;
      end if;
    end if;
  end loop;

  v_clean_since := case when v_streak > 0 then v_cur + 1 else null end;

  select coalesce(sum(d.money_spent), 0) into v_money_saved
  from public.diary_entries d
  where d.user_id = v_uid and d.gambled = false;

  select count(*), count(*) filter (where not d.gambled)
    into v_diary_count, v_clean_count
  from public.diary_entries d where d.user_id = v_uid;

  select count(*) into v_cbt_count
  from public.cbt_progress c where c.user_id = v_uid and c.completed = true;

  select count(distinct t) into v_trigger_count
  from public.diary_entries d,
       lateral jsonb_array_elements_text(coalesce(d.triggers, '[]'::jsonb)) t
  where d.user_id = v_uid;

  v_earned := coalesce(
    (select array_agg(x) from jsonb_array_elements_text(coalesce(v_profile.badges, '[]'::jsonb)) x),
    '{}'::text[]
  );

  for v_badge_row in
    select * from (values
      ('first_entry',     v_diary_count >= 1),
      ('week_streak',     v_streak >= 7),
      ('month_streak',    v_streak >= 30),
      ('diary_10',        v_diary_count >= 10),
      ('diary_30',        v_diary_count >= 30),
      ('cbt_1',           v_cbt_count >= 1),
      ('cbt_4',           v_cbt_count >= 4),
      ('cbt_all',         v_cbt_count >= 8),
      ('first_no',        v_clean_count >= 1),
      ('trigger_master',  v_trigger_count >= 5),
      ('saved_1000',      v_money_saved >= 1000),
      ('saved_10000',     v_money_saved >= 10000)
    ) as checks(badge_id, earned)
    where checks.earned and not (checks.badge_id = any(v_earned))
  loop
    v_new_badges := v_new_badges || to_jsonb(v_badge_row.badge_id);
    v_earned := v_earned || v_badge_row.badge_id;
  end loop;

  select coalesce(jsonb_agg(x order by ord), '[]'::jsonb) into v_badges
  from (
    select x, ord from (
      select value as x, ordinality as ord
      from jsonb_array_elements(coalesce(v_profile.badges, '[]'::jsonb)) with ordinality
      union all
      select value, 1000 + ordinality
      from jsonb_array_elements(v_new_badges) with ordinality
    ) s
  ) t;

  update public.profiles
  set streak_days = v_streak,
      money_saved = v_money_saved,
      clean_since = v_clean_since,
      streak_freeze_used = v_freeze_used,
      streak_freeze_reset_date = v_freeze_reset,
      streak_freeze_bridged_date = v_freeze_bridged,
      badges = v_badges
  where id = v_uid;

  return jsonb_build_object(
    'streak_days', v_streak,
    'money_saved', v_money_saved,
    'clean_since', v_clean_since,
    'new_badges', v_new_badges,
    'freeze_activated', v_freeze_activated
  );
end;
$$;
revoke execute on function public.recompute_progress() from public, anon;
grant execute on function public.recompute_progress() to authenticated;

create or replace function public.increment_pact_play_count(pact_id uuid)
returns void
language sql
security invoker
set search_path = pg_catalog, public
as $$
  update public.precious_pacts
  set play_count = coalesce(play_count, 0) + 1
  where id = pact_id
    and user_id = auth.uid();
$$;
revoke execute on function public.increment_pact_play_count(uuid) from public, anon;
grant execute on function public.increment_pact_play_count(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Crisis pipeline (service-role writers; admin resolvers)
-- ---------------------------------------------------------------------------
create or replace function public.record_crisis_event(
  p_user_id uuid, p_context text, p_keywords text[], p_source text, p_max_sessions integer default 1
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_alert_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Trusted service access required';
  end if;
  if p_source is null or p_source not in ('chat', 'diary') then
    raise exception 'Invalid crisis source';
  end if;
  if p_context is null or length(btrim(p_context)) = 0 then
    raise exception 'Crisis context is required';
  end if;
  if coalesce(array_length(p_keywords, 1), 0) = 0 then
    raise exception 'At least one crisis keyword is required';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text), hashtext(p_source));
  select id into v_alert_id from public.crisis_alerts
  where user_id = p_user_id and source = p_source and resolved = false
    and created_at >= now() - interval '24 hours'
  order by created_at desc
  limit 1
  for update;
  if v_alert_id is null then
    insert into public.crisis_alerts (
      user_id, keywords, message_context, severity, source, keyword, message
    )
    values (
      p_user_id, p_keywords, left(p_context, 500), 'high', p_source,
      left(p_keywords[1], 120), left(p_context, 500)
    )
    returning id into v_alert_id;
  end if;

  begin
    perform public.pre_authorize_voucher(p_user_id, v_alert_id, p_max_sessions);
  exception when others then
    if sqlerrm <> 'An open voucher already exists for this user.' then raise; end if;
  end;
  return v_alert_id;
end;
$$;
revoke execute on function public.record_crisis_event(uuid, text, text[], text, integer)
  from authenticated, anon, public;
grant execute on function public.record_crisis_event(uuid, text, text[], text, integer) to service_role;

create or replace function public.pre_authorize_voucher(
  p_user_id uuid, p_crisis_alert_id uuid, p_max_sessions integer
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
  v_provider_voucher_id uuid;
  v_insurer_id uuid;
  v_b2b_client_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Trusted service access required';
  end if;
  if p_max_sessions is null or p_max_sessions < 1 or p_max_sessions > 10 then
    raise exception 'Invalid authorized session count';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id and status = 'active') then
    raise exception 'Active user not found';
  end if;
  if p_crisis_alert_id is not null and not exists (
    select 1 from public.crisis_alerts where id = p_crisis_alert_id and user_id = p_user_id
  ) then
    raise exception 'Crisis alert does not belong to this user';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text));
  if exists (
    select 1 from public.pre_auth_vouchers
    where user_id = p_user_id
      and status in ('pending', 'assigned', 'accepted')
      and expires_at > now()
  ) then
    raise exception 'An open voucher already exists for this user.';
  end if;

  select b2b_client_id into v_b2b_client_id
  from public.profiles where id = p_user_id;
  if v_b2b_client_id is not null then
    select ip.insurer_id into v_insurer_id
    from public.insurer_partnerships ip
    join public.insurers i on i.id = ip.insurer_id and i.status = 'active'
    where ip.b2b_client_id = v_b2b_client_id and ip.status = 'active'
      and (ip.contract_start is null or ip.contract_start <= current_date)
      and (ip.contract_end is null or ip.contract_end >= current_date)
    order by ip.created_at
    limit 1;
  end if;

  insert into public.pre_auth_vouchers (user_id, crisis_alert_id, max_sessions, insurer_id)
  values (p_user_id, p_crisis_alert_id, p_max_sessions, v_insurer_id)
  on conflict (crisis_alert_id) where crisis_alert_id is not null do nothing
  returning id into v_id;
  if v_id is null and p_crisis_alert_id is not null then
    select id into v_id from public.pre_auth_vouchers where crisis_alert_id = p_crisis_alert_id;
  end if;
  if v_id is null then raise exception 'Voucher authorization failed'; end if;

  insert into public.provider_vouchers (
    user_id, crisis_alert_id, pre_auth_voucher_id, insurer_id,
    max_sessions, expires_at, fee_per_session, status
  )
  select user_id, crisis_alert_id, id, insurer_id, max_sessions, expires_at, 0, status
  from public.pre_auth_vouchers where id = v_id
  on conflict (pre_auth_voucher_id) where pre_auth_voucher_id is not null do nothing
  returning id into v_provider_voucher_id;
  if v_provider_voucher_id is null then
    select id into v_provider_voucher_id
    from public.provider_vouchers where pre_auth_voucher_id = v_id;
  end if;
  if v_provider_voucher_id is null then raise exception 'Provider voucher creation failed'; end if;
  return v_id;
end;
$$;
revoke execute on function public.pre_authorize_voucher(uuid, uuid, integer)
  from authenticated, anon, public;
grant execute on function public.pre_authorize_voucher(uuid, uuid, integer) to service_role;

create or replace function public.crisis_resolve(p_alert_id uuid, p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row public.crisis_alerts;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can resolve crisis alerts';
  end if;
  update public.crisis_alerts
  set resolved = true,
      resolved_at = now(),
      resolved_by = auth.uid(),
      admin_notes = coalesce(nullif(btrim(coalesce(p_notes, '')), ''), admin_notes)
  where id = p_alert_id
  returning * into v_row;
  if not found then
    raise exception 'Alert not found';
  end if;
  perform public.log_admin_action('crisis_resolve', 'crisis_alerts', p_alert_id::text,
    jsonb_build_object('notes', p_notes));
  return to_jsonb(v_row);
end;
$$;
revoke execute on function public.crisis_resolve(uuid, text) from public, anon;
grant execute on function public.crisis_resolve(uuid, text) to authenticated;

create or replace function public.crisis_escalate(p_alert_id uuid, p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row public.crisis_alerts;
  v_note text := 'ESCALATED: ' || to_char(now() at time zone 'Africa/Nairobi', 'YYYY-MM-DD HH24:MI') ||
                coalesce(' — ' || nullif(btrim(coalesce(p_notes, '')), ''), ' — Requires immediate counselor intervention.');
begin
  if not public.is_admin() then
    raise exception 'Only administrators can escalate crisis alerts';
  end if;
  update public.crisis_alerts
  set escalated = true,
      escalated_at = now(),
      escalated_by = auth.uid(),
      admin_notes = coalesce(admin_notes || E'\n', '') || v_note
  where id = p_alert_id
  returning * into v_row;
  if not found then
    raise exception 'Alert not found';
  end if;
  perform public.log_admin_action('crisis_escalate', 'crisis_alerts', p_alert_id::text,
    jsonb_build_object('notes', p_notes));
  return to_jsonb(v_row);
end;
$$;
revoke execute on function public.crisis_escalate(uuid, text) from public, anon;
grant execute on function public.crisis_escalate(uuid, text) to authenticated;

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

-- ---------------------------------------------------------------------------
-- Broadcasts
-- ---------------------------------------------------------------------------
create or replace function public.send_broadcast(p_title text, p_message text, p_audience text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_audience text := lower(btrim(coalesce(p_audience, 'all')));
  v_broadcast public.broadcasts;
  v_count int := 0;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can send broadcasts';
  end if;
  if p_title is null or length(btrim(p_title)) = 0 or length(p_title) > 100 then
    raise exception 'Title is required (max 100 chars)';
  end if;
  if p_message is null or length(btrim(p_message)) = 0 or length(p_message) > 1000 then
    raise exception 'Message is required (max 1000 chars)';
  end if;
  if v_audience not in ('all', 'active', 'inactive', 'high_risk', 'medium_risk', 'new_users') then
    raise exception 'Unknown audience';
  end if;

  insert into public.broadcasts (title, message, audience, sent_at, created_by)
  values (btrim(p_title), btrim(p_message), v_audience, now(), auth.uid())
  returning * into v_broadcast;

  with recipients as (
    select p.id
    from public.profiles p
    where coalesce(p.status, 'active') <> 'suspended'
      and (
        v_audience = 'all'
        or (v_audience = 'active' and p.last_active >= now() - interval '7 days')
        or (v_audience = 'inactive' and (p.last_active is null or p.last_active < now() - interval '7 days'))
        or (v_audience = 'high_risk' and p.risk_level = 'high')
        or (v_audience = 'medium_risk' and p.risk_level = 'medium')
        or (v_audience = 'new_users' and p.created_at >= now() - interval '30 days')
      )
  ), inserted as (
    insert into public.notifications (user_id, title, message, type, link, broadcast_id)
    select r.id, left(v_broadcast.title, 200), left(v_broadcast.message, 500),
           'broadcast', '/dashboard', v_broadcast.id
    from recipients r
    returning user_id
  )
  select count(*) into v_count from inserted;

  update public.broadcasts set recipient_count = v_count where id = v_broadcast.id;
  v_broadcast.recipient_count := v_count;

  perform public.log_admin_action('send_broadcast', 'broadcasts', v_broadcast.id::text,
    jsonb_build_object('title', v_broadcast.title, 'audience', v_audience, 'recipient_count', v_count));

  return to_jsonb(v_broadcast);
end;
$$;
revoke execute on function public.send_broadcast(text, text, text) from public, anon;
grant execute on function public.send_broadcast(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin user actions + dashboard
-- ---------------------------------------------------------------------------
create or replace function public.admin_get_user_contact(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_email text;
  v_phone text;
begin
  if not public.is_super_admin() then
    raise exception 'Only super_admin can view user contact details';
  end if;

  select u.email into v_email from auth.users u where u.id = p_user_id;
  select p.phone into v_phone from public.profiles p where p.id = p_user_id;

  perform public.log_admin_action('view_user_contact', 'profiles', p_user_id::text,
    jsonb_build_object('target_user_id', p_user_id));

  return jsonb_build_object('email', v_email, 'phone', v_phone);
end;
$$;
revoke execute on function public.admin_get_user_contact(uuid) from public, anon;
grant execute on function public.admin_get_user_contact(uuid) to authenticated;

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

notify pgrst, 'reload schema';
