-- ============================================================================
-- LossLens Security Hardening — Phase 1
-- ============================================================================
-- Idempotent. Does not drop data. Safe to re-run.
-- Covers audit items: S1, S2, S4, S5, S7, S9, S10/F2 (schema), S13, S15,
-- S16, S17, F1, F3/F5 (schema side).
--
-- IMPORTANT: apply AFTER 001_master_migration.sql.
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- S1 — Circle identity: server-issued hash
-- ============================================================================

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
    v_hash := encode(gen_random_bytes(16), 'hex');
    update public.profiles
    set circle_user_hash = v_hash
    where id = v_uid
      and circle_user_hash is null;
    -- Re-read in case of a concurrent setter.
    select circle_user_hash into v_hash
    from public.profiles
    where id = v_uid;
  end if;

  return v_hash;
end;
$$;

revoke execute on function public.ensure_circle_identity() from public, anon;
grant execute on function public.ensure_circle_identity() to authenticated;

-- ============================================================================
-- S1/S4 — Profile privilege trigger rewrite
--    * Bypass for service_role JWT or postgres/supabase_admin sessions
--      (SECURITY INVOKER so current_user reflects the real caller; definer
--      RPCs such as recompute_progress/redeem_company_code run as the
--      function owner and therefore bypass intentionally).
--    * circle_user_hash may only be SET when OLD is null (immutable after).
--    * Self-updates may never touch privileged/entitlement/progress fields.
-- ============================================================================

create or replace function public.enforce_profile_privilege_updates()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_is_service boolean := coalesce(auth.role(), '') = 'service_role';
  v_is_migration boolean := current_user in ('postgres', 'supabase_admin');
begin
  if v_is_service or v_is_migration then
    return new;
  end if;

  -- Self-update path: the caller is editing their own row.
  if new.id = auth.uid() then
    -- circle_user_hash: settable only while still NULL.
    if old.circle_user_hash is not null
       and old.circle_user_hash is distinct from new.circle_user_hash then
      raise exception 'circle_user_hash is immutable once set';
    end if;

    if old.role is distinct from new.role
      or old.status is distinct from new.status
      or old.is_super_admin is distinct from new.is_super_admin
      or old.plan_type is distinct from new.plan_type
      or old.b2b_client_id is distinct from new.b2b_client_id
      or old.subscription_status is distinct from new.subscription_status
      or old.subscription_plan is distinct from new.subscription_plan
      or old.subscription_expires_at is distinct from new.subscription_expires_at
      or old.risk_level is distinct from new.risk_level
      or old.is_demo is distinct from new.is_demo
      or old.streak_days is distinct from new.streak_days
      or old.money_saved is distinct from new.money_saved
      or old.badges is distinct from new.badges
      or old.clean_since is distinct from new.clean_since
      or old.streak_freeze_used is distinct from new.streak_freeze_used
      or old.streak_freeze_reset_date is distinct from new.streak_freeze_reset_date
    then
      raise exception 'Users cannot change privileged profile fields';
    end if;
    return new;
  end if;

  -- Non-self update (admin paths).
  if old.role is distinct from new.role and not public.is_super_admin() then
    raise exception 'Only super_admin can change profile roles';
  end if;

  if old.status is distinct from new.status and not public.is_admin() then
    raise exception 'Only administrators can change profile status';
  end if;

  if (old.money_saved is distinct from new.money_saved
      or old.streak_days is distinct from new.streak_days
      or old.streak_freeze_used is distinct from new.streak_freeze_used
      or old.streak_freeze_reset_date is distinct from new.streak_freeze_reset_date
      or old.clean_since is distinct from new.clean_since
      or old.badges is distinct from new.badges
      or old.subscription_status is distinct from new.subscription_status
      or old.subscription_plan is distinct from new.subscription_plan
      or old.subscription_expires_at is distinct from new.subscription_expires_at
      or old.plan_type is distinct from new.plan_type
      or old.b2b_client_id is distinct from new.b2b_client_id
      or old.is_demo is distinct from new.is_demo
      or old.risk_level is distinct from new.risk_level
      or old.circle_user_hash is distinct from new.circle_user_hash
      or old.is_super_admin is distinct from new.is_super_admin)
     and not public.is_super_admin() then
    raise exception 'Only super_admin can change entitlements and privileged profile fields';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_profile_privilege_updates() from public, anon, authenticated;

drop trigger if exists enforce_profile_privilege_updates on public.profiles;
create trigger enforce_profile_privilege_updates
before update on public.profiles
for each row execute function public.enforce_profile_privilege_updates();

-- S4 — profiles.role is the single source of truth; keep the legacy boolean
-- flag in sync so older code paths keep working.
create or replace function public.sync_is_super_admin_flag()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  new.is_super_admin := (new.role = 'super_admin');
  return new;
end;
$$;

drop trigger if exists sync_is_super_admin_flag on public.profiles;
create trigger sync_is_super_admin_flag
before insert or update on public.profiles
for each row execute function public.sync_is_super_admin_flag();

-- Reconcile existing rows.
update public.profiles set is_super_admin = (role = 'super_admin')
where is_super_admin is distinct from (role = 'super_admin');

-- ============================================================================
-- S9 — Suspension: is_active_user() + restrictive policies
-- ============================================================================

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select coalesce(
    (select p.status from public.profiles p where p.id = auth.uid()),
    'active'
  ) <> 'suspended';
$$;

revoke execute on function public.is_active_user() from public, anon;
grant execute on function public.is_active_user() to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'diary_entries','cbt_progress','chat_history',
    'circle_messages','circle_room_members',
    'whispers_matches','whispers_messages',
    'mirror_recordings','precious_pacts',
    'event_rsvps','event_discussions',
    'supporter_invitations','supporter_messages'
  ] loop
    execute format('drop policy if exists losslens_active_user on public.%I', t);
    execute format(
      'create policy losslens_active_user on public.%I as restrictive for all to authenticated '
      'using (public.is_active_user()) with check (public.is_active_user())', t);
  end loop;
end $$;

-- ============================================================================
-- S2 — Circle anonymity: author side-table + safe view
-- ============================================================================

create table if not exists public.circle_message_authors (
  message_id uuid primary key references public.circle_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.circle_message_authors enable row level security;

drop policy if exists losslens_circle_authors_admin_select on public.circle_message_authors;
create policy losslens_circle_authors_admin_select on public.circle_message_authors
  for select to authenticated using (public.is_admin());
-- No INSERT/UPDATE/DELETE policies: rows are written only by the trigger below.

grant select on public.circle_message_authors to authenticated;
revoke all on public.circle_message_authors from anon;

create or replace function public.record_circle_message_author()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.user_id is not null then
    insert into public.circle_message_authors (message_id, user_id)
    values (new.id, new.user_id)
    on conflict (message_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists record_circle_message_author on public.circle_messages;
create trigger record_circle_message_author
after insert on public.circle_messages
for each row execute function public.record_circle_message_author();

revoke execute on function public.record_circle_message_author() from public, anon, authenticated;

-- Safe view: identical to circle_messages minus user_id / mentioned_user_id.
-- security_invoker keeps the base table's room-membership RLS in force.
create or replace view public.circle_messages_safe
with (security_invoker = true) as
select
  id, room, user_hash, display_name, avatar_animal, avatar_prefix,
  message, message_type, expires_at, reply_to_id, reply_to_name, created_at
from public.circle_messages;

grant select on public.circle_messages_safe to authenticated;
revoke all on public.circle_messages_safe from anon;

-- ============================================================================
-- S15 — Whispers: RPC-only match lifecycle
-- ============================================================================

-- Columns the UI already writes but the schema lacked.
alter table public.whispers_matches
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by text,
  add column if not exists ended_at timestamptz,
  add column if not exists user1_feedback text,
  add column if not exists user2_feedback text;

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

create or replace function public.whispers_respond(p_match_id uuid, p_accept boolean)
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

  select * into v_row from public.whispers_matches where id = p_match_id for update;
  if not found then
    raise exception 'Match not found';
  end if;

  -- Open broadcast request: anyone may claim or decline it.
  if v_row.user2_hash is null and v_row.user1_hash <> v_hash and v_row.status = 'pending' then
    if p_accept then
      update public.whispers_matches
      set user2_hash = v_hash, user2_role = 'flexible', status = 'active'
      where id = p_match_id and user2_hash is null
      returning * into v_row;
      if not found then
        raise exception 'This request was already taken';
      end if;
    else
      update public.whispers_matches
      set status = 'rejected', rejected_at = now(), rejected_by = v_hash
      where id = p_match_id and user2_hash is null
      returning * into v_row;
    end if;
    return to_jsonb(v_row);
  end if;

  -- Owner cancelling their own still-open request.
  if v_row.user1_hash = v_hash and v_row.user2_hash is null and v_row.status = 'pending' then
    if p_accept then
      raise exception 'Cannot accept your own request';
    end if;
    update public.whispers_matches
    set status = 'cancelled'
    where id = p_match_id
    returning * into v_row;
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

-- Drop the broad participant write policies; all match mutations now go
-- through the SECURITY DEFINER RPCs above. SELECT/DELETE stay for UX.
drop policy if exists lossless_whispers_match_participant_insert on public.whispers_matches;
drop policy if exists lossless_whispers_match_participant_update on public.whispers_matches;
drop policy if exists lossless_whispers_match_insert_v2 on public.whispers_matches;
drop policy if exists lossless_whispers_match_participant_delete on public.whispers_matches;

-- ============================================================================
-- S16 — Audit log: unified schema + log_admin_action + audit triggers
-- ============================================================================

-- Migrate the split-brain audit_logs table into:
--   id, actor_id, action, target_table, target_id, metadata, created_at
alter table public.audit_logs add column if not exists actor_id uuid;
alter table public.audit_logs add column if not exists target_id_text text;

-- Backfill (guarded so re-runs are harmless). The immutability trigger blocks
-- UPDATE, so disable it for the migration window and re-enable after.
alter table public.audit_logs disable trigger prevent_direct_audit_writes;

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='audit_logs' and column_name='admin_id') then
    update public.audit_logs set actor_id = admin_id where actor_id is null and admin_id is not null;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='audit_logs' and column_name='user_id') then
    update public.audit_logs set actor_id = user_id where actor_id is null and user_id is not null;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='audit_logs' and column_name='entity_type') then
    update public.audit_logs set target_table = entity_type where target_table is null and entity_type is not null;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='audit_logs' and column_name='table_name') then
    update public.audit_logs set target_table = table_name where target_table is null and table_name is not null;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='audit_logs' and column_name='target_id') then
    update public.audit_logs set target_id_text = target_id::text where target_id_text is null and target_id is not null;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='audit_logs' and column_name='entity_id') then
    update public.audit_logs set target_id_text = entity_id where target_id_text is null and entity_id is not null;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='audit_logs' and column_name='record_id') then
    update public.audit_logs set target_id_text = record_id where target_id_text is null and record_id is not null;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='audit_logs' and column_name='details') then
    update public.audit_logs set metadata = details where metadata is null and details is not null;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='audit_logs' and column_name='performed_by') then
    update public.audit_logs set metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object('performed_by', performed_by)
      where performed_by is not null;
  end if;
end $$;

alter table public.audit_logs enable trigger prevent_direct_audit_writes;

alter table public.audit_logs
  drop column if exists admin_id,
  drop column if exists user_id,
  drop column if exists entity_type,
  drop column if exists entity_id,
  drop column if exists details,
  drop column if exists table_name,
  drop column if exists record_id,
  drop column if exists performed_by,
  drop column if exists target_id;

-- Rename the migrated text column into place (idempotent).
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'audit_logs' and column_name = 'target_id_text')
     and not exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'audit_logs' and column_name = 'target_id') then
    alter table public.audit_logs rename column target_id_text to target_id;
  else
    alter table public.audit_logs drop column if exists target_id_text;
  end if;
end $$;

alter table public.audit_logs alter column target_id type text using target_id::text;

create index if not exists audit_logs_actor_idx on public.audit_logs(actor_id, created_at desc);
create index if not exists audit_logs_target_idx2 on public.audit_logs(target_table, target_id);

-- No direct writes from clients; all inserts via RPCs/triggers.
revoke insert, update, delete on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;

create or replace function public.log_admin_action(
  p_action text,
  p_target_table text default null,
  p_target_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can write audit logs';
  end if;
  insert into public.audit_logs (actor_id, action, target_table, target_id, metadata)
  values (auth.uid(), left(p_action, 120), left(p_target_table, 120), left(p_target_id, 120), coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.log_admin_action(text, text, text, jsonb) from public, anon;
grant execute on function public.log_admin_action(text, text, text, jsonb) to authenticated;

-- Generic audit trigger for admin-managed tables.
create or replace function public.audit_admin_table_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row jsonb;
  v_id text;
begin
  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
    v_id := coalesce(v_row ->> 'id', v_row ->> 'key');
  else
    v_row := to_jsonb(new);
    v_id := coalesce(v_row ->> 'id', v_row ->> 'key');
  end if;

  insert into public.audit_logs (actor_id, action, target_table, target_id, metadata)
  values (
    auth.uid(),
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    left(v_id, 120),
    jsonb_build_object('op', tg_op, 'row', v_row)
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function public.audit_admin_table_change() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'broadcasts','b2b_clients','insurance_partners','grant_applications','system_settings'
  ] loop
    execute format('drop trigger if exists audit_%I_changes on public.%I', t, t);
    execute format(
      'create trigger audit_%I_changes after insert or update or delete on public.%I '
      'for each row execute function public.audit_admin_table_change()', t, t);
  end loop;
end $$;

-- Profiles: audit only privileged-field changes and deletes.
create or replace function public.audit_profile_privileged_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    insert into public.audit_logs (actor_id, action, target_table, target_id, metadata)
    values (auth.uid(), 'profiles.delete', 'profiles', old.id::text,
            jsonb_build_object('role', old.role, 'status', old.status));
    return old;
  end if;

  if old.role is distinct from new.role
    or old.status is distinct from new.status
    or old.is_super_admin is distinct from new.is_super_admin
    or old.subscription_status is distinct from new.subscription_status
    or old.subscription_plan is distinct from new.subscription_plan
    or old.subscription_expires_at is distinct from new.subscription_expires_at
    or old.plan_type is distinct from new.plan_type
    or old.b2b_client_id is distinct from new.b2b_client_id
  then
    insert into public.audit_logs (actor_id, action, target_table, target_id, metadata)
    values (auth.uid(), 'profiles.privileged_update', 'profiles', new.id::text,
            jsonb_build_object(
              'role', jsonb_build_object('old', old.role, 'new', new.role),
              'status', jsonb_build_object('old', old.status, 'new', new.status),
              'subscription_plan', jsonb_build_object('old', old.subscription_plan, 'new', new.subscription_plan),
              'plan_type', jsonb_build_object('old', old.plan_type, 'new', new.plan_type),
              'b2b_client_id', jsonb_build_object('old', old.b2b_client_id, 'new', new.b2b_client_id)
            ));
  end if;
  return new;
end;
$$;

revoke execute on function public.audit_profile_privileged_change() from public, anon, authenticated;

drop trigger if exists audit_profile_privileged_change on public.profiles;
create trigger audit_profile_privileged_change
  after update or delete on public.profiles
  for each row execute function public.audit_profile_privileged_change();

-- Keep the immutability trigger working with the unified schema.
drop trigger if exists prevent_direct_audit_writes on public.audit_logs;
create trigger prevent_direct_audit_writes
before update or delete on public.audit_logs
for each row execute function public.prevent_direct_audit_writes();

-- ============================================================================
-- S7 — Admin data exposure
-- ============================================================================

-- Safe projection for standard admins (definer view: bypasses profiles RLS,
-- exposes only non-sensitive columns, gated by is_admin()).
create or replace view public.admin_profiles_safe as
select
  id, full_name, username, role, status, risk_level,
  streak_days, plan_type, subscription_plan, subscription_status,
  created_at, last_active
from public.profiles
where public.is_admin();

grant select on public.admin_profiles_safe to authenticated;
revoke all on public.admin_profiles_safe from anon;

-- Standard admins no longer read raw profiles (email/phone live there too).
drop policy if exists lossless_profiles_admin_select on public.profiles;
drop policy if exists losslens_profiles_super_admin_select on public.profiles;
create policy losslens_profiles_super_admin_select on public.profiles
  for select to authenticated using (public.is_super_admin());

-- Super-admin contact lookup; writes an audit row.
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

-- S5 — Remove the plaintext report password column.
alter table public.profiles drop column if exists report_password;

-- ============================================================================
-- S13 — Supporter/family flow: token RPCs (anon + authenticated)
-- ============================================================================

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

-- Returns only the fields the invitation's permissions allow.
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

-- Authenticated user creates an invitation; token generated server-side.
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
    encode(gen_random_bytes(24), 'hex'), 'pending', now() + interval '30 days'
  ) returning * into v_inv;

  return to_jsonb(v_inv);
end;
$$;

revoke execute on function public.create_supporter_invitation(text, text, text, text, jsonb, boolean, boolean) from public, anon;
grant execute on function public.create_supporter_invitation(text, text, text, text, jsonb, boolean, boolean) to authenticated;

-- ============================================================================
-- F1 — Broadcasts: single RPC, audience allow-list, notifications + audit
-- ============================================================================

alter table public.broadcasts add column if not exists recipient_count integer;

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

  -- Audit row (the broadcasts audit trigger also records the insert).
  perform public.log_admin_action('send_broadcast', 'broadcasts', v_broadcast.id::text,
    jsonb_build_object('title', v_broadcast.title, 'audience', v_audience, 'recipient_count', v_count));

  return to_jsonb(v_broadcast);
end;
$$;

revoke execute on function public.send_broadcast(text, text, text) from public, anon;
grant execute on function public.send_broadcast(text, text, text) to authenticated;

-- ============================================================================
-- S10/F2 — Crisis alert schema + resolve/escalate RPCs
-- ============================================================================

alter table public.crisis_alerts
  add column if not exists admin_notes text,
  add column if not exists message_context text,
  add column if not exists source text,
  add column if not exists keywords text[];

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

-- ============================================================================
-- F3/F5 — Company codes, signup metadata, subscription redemption
-- ============================================================================

create or replace function public.validate_company_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_client public.b2b_clients;
  v_used int;
  v_remaining int;
begin
  if v_code = '' then
    return jsonb_build_object('valid', false);
  end if;
  select * into v_client from public.b2b_clients
  where upper(company_code) = v_code and status = 'active' limit 1;
  if not found then
    return jsonb_build_object('valid', false);
  end if;

  select count(*) into v_used from public.profiles where b2b_client_id = v_client.id;
  v_remaining := case when v_client.max_users is null then null
                      else greatest(v_client.max_users - v_used, 0) end;

  return jsonb_build_object(
    'valid', true,
    'company_name', v_client.company_name,
    'seats_remaining', v_remaining
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
  select * into v_client from public.b2b_clients
  where upper(company_code) = v_code and status = 'active' limit 1;
  if not found then
    raise exception 'Invalid or inactive company code';
  end if;

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

  perform public.log_admin_action('redeem_company_code', 'b2b_clients', v_client.id::text,
    jsonb_build_object('user_id', v_uid, 'code', v_code));

  return jsonb_build_object('success', true, 'company_name', v_client.company_name);
end;
$$;

revoke execute on function public.redeem_company_code(text) from public, anon;
grant execute on function public.redeem_company_code(text) to authenticated;

-- Signup trigger: pick up username, phone, full_name and company code from
-- raw_user_meta_data.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_username text;
  v_company_code text;
  v_client_id uuid;
begin
  v_username := nullif(btrim(coalesce(new.raw_user_meta_data->>'username', '')), '');
  if v_username is not null and exists (
    select 1 from public.profiles where username = v_username
  ) then
    v_username := null;
  end if;

  v_company_code := nullif(btrim(coalesce(new.raw_user_meta_data->>'company_code', '')), '');
  if v_company_code is not null then
    select id into v_client_id from public.b2b_clients
    where upper(company_code) = upper(v_company_code) and status = 'active'
    limit 1;
  end if;

  insert into public.profiles (
    id, full_name, username, email, phone, role, status,
    plan_type, b2b_client_id, subscription_plan, subscription_status
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    v_username,
    new.email,
    new.raw_user_meta_data->>'phone',
    'user',
    'active',
    case when v_client_id is not null then 'company' else null end,
    v_client_id,
    case when v_client_id is not null then 'company' else null end,
    case when v_client_id is not null then 'active' else null end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ============================================================================
-- S17 — Gamification: server-authoritative recompute_progress()
-- ============================================================================

-- Diary columns the UI already writes.
alter table public.diary_entries
  add column if not exists gambling_type text,
  add column if not exists time_spent numeric,
  add column if not exists money_spent numeric,
  add column if not exists money_won numeric;

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

  -- Streak freeze: renew every 30 days.
  v_freeze_used := coalesce(v_profile.streak_freeze_used, false);
  v_freeze_reset := v_profile.streak_freeze_reset_date;
  if v_freeze_used and v_freeze_reset is not null and v_freeze_reset <= v_today then
    v_freeze_used := false;
    v_freeze_reset := null;
  end if;

  -- Walk backwards from the most recent diary date.
  select max(date) into v_cur
  from public.diary_entries where user_id = v_uid;

  while v_cur is not null loop
    select count(*), bool_or(not d.gambled)
    into v_day_count, v_day_clean
    from public.diary_entries d
    where d.user_id = v_uid and d.date = v_cur;

    if v_day_count = 0 then
      exit; -- missing day breaks the chain
    elsif v_day_clean then
      v_streak := v_streak + 1;
      v_cur := v_cur - 1;
    else -- gamble day
      if not v_freeze_used then
        -- Auto-consume a streak freeze to protect the streak.
        v_freeze_used := true;
        v_freeze_reset := v_today + 30;
        v_freeze_activated := true;
        v_cur := v_cur - 1;
      else
        exit;
      end if;
    end if;
  end loop;

  v_clean_since := case when v_streak > 0 then v_cur + 1 else null end;

  -- Money saved mirrors the legacy client formula: money_spent recorded on
  -- non-gambled entries.
  select coalesce(sum(d.money_spent), 0) into v_money_saved
  from public.diary_entries d
  where d.user_id = v_uid and d.gambled = false;

  -- Badge inputs.
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

  -- Merge badges jsonb.
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

-- Remove the stub coin function entirely.
drop function if exists public.add_recovery_coins(uuid, integer);

-- Future tables default to no anon access.
alter default privileges in schema public revoke all on tables from anon;

-- ============================================================================
-- notify PostgREST to reload the schema cache
-- ============================================================================
notify pgrst, 'reload schema';
