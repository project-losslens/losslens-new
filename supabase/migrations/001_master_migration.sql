-- ============================================================================
-- LossLens Master Migration
-- ============================================================================
-- Purpose:
--   Consolidates the repository's existing Supabase SQL migrations into one
--   reproducible script and adds the Unified Admin Portal schema changes.
--
-- How to run:
--   Run this file once in the Supabase SQL Editor, or apply it through the
--   project's normal migration process. The script is intended to be
--   idempotent: existing tables, columns, functions, and policies are preserved
--   where possible, and policies are dropped before recreation.
--
-- Included source migrations, in dependency order:
--   1. 20261104_000001_identity_profiles.sql
--   2. 20261104_000002_recovery_cbt.sql
--   3. 20261104_000003_resources_events.sql
--   4. 20261104_000004_notifications_communications.sql
--   5. 20261104_000005_support_circle_whispers.sql
--   6. 20261104_000006_media_admin_business.sql
--   7. 20261104_000007_functions_triggers.sql
--   8. 20261104_000008_rls_policies.sql
--   9. 20261104_000009_storage_realtime.sql
--   10. 20261106152654_add_profile_risk_columns.sql
-- ============================================================================

-- ============================================================================
-- SOURCE MIGRATION 1: 20261104_000001_identity_profiles.sql
-- ============================================================================

-- DRAFT ONLY: LossLens identity/profile reconstruction.
-- Source evidence: application signup, auth/profile joins, user/admin pages, protected routes.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  username text unique,
  email text,
  phone text,
  goal text,
  plan_type text,
  role text not null default 'user',
  status text not null default 'active',
  avatar_url text,
  risk_level text,
  streak_days integer not null default 0,
  money_saved numeric not null default 0,
  clean_since date,
  streak_freeze_used boolean not null default false,
  streak_freeze_reset_date date,
  badges jsonb not null default '[]'::jsonb,
  preferences jsonb not null default '{}'::jsonb,
  report_password text,
  accountability_partner_name text,
  accountability_partner_phone text,
  circle_user_hash text,
  circle_display_name text,
  b2b_client_id uuid,
  is_demo boolean not null default false,
  subscription_status text,
  subscription_plan text,
  subscription_expires_at timestamptz,
  created_at timestamptz not null default now(),
  last_active timestamptz
);

-- Reconcile canonical columns when a partially-created profiles table exists.
-- Existing values and incompatible types are not overwritten.
alter table public.profiles add column if not exists subscription_expires_at timestamptz;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists goal text;
alter table public.profiles add column if not exists plan_type text;
alter table public.profiles add column if not exists role text not null default 'user';
alter table public.profiles add column if not exists status text not null default 'active';
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists risk_level text;
alter table public.profiles add column if not exists streak_days integer not null default 0;
alter table public.profiles add column if not exists money_saved numeric not null default 0;
alter table public.profiles add column if not exists clean_since date;
alter table public.profiles add column if not exists streak_freeze_used boolean not null default false;
alter table public.profiles add column if not exists streak_freeze_reset_date date;
alter table public.profiles add column if not exists badges jsonb not null default '[]'::jsonb;
alter table public.profiles add column if not exists preferences jsonb not null default '{}'::jsonb;
alter table public.profiles add column if not exists report_password text;
alter table public.profiles add column if not exists accountability_partner_name text;
alter table public.profiles add column if not exists accountability_partner_phone text;
alter table public.profiles add column if not exists subscription_status text;
alter table public.profiles add column if not exists subscription_plan text;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists last_active timestamptz;
alter table public.profiles add column if not exists circle_user_hash text;
alter table public.profiles add column if not exists circle_display_name text;
alter table public.profiles add column if not exists b2b_client_id uuid;
alter table public.profiles add column if not exists is_demo boolean not null default false;
alter table public.profiles add column if not exists onboarding_completed boolean default false;
alter table public.profiles add column if not exists onboarding_skipped boolean default false;
alter table public.profiles add column if not exists screening_score integer;
alter table public.profiles add column if not exists screening_answers jsonb default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_role_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles add constraint profiles_role_check
      check (role in ('user', 'admin', 'super_admin'));
  end if;
end $$;

create index if not exists profiles_role_status_idx on public.profiles(role, status);
create index if not exists profiles_b2b_client_idx on public.profiles(b2b_client_id);
create index if not exists profiles_last_active_idx on public.profiles(last_active desc);
create unique index if not exists profiles_username_unique_idx on public.profiles(username) where username is not null;

-- ============================================================================
-- SOURCE MIGRATION 2: 20261104_000002_recovery_cbt.sql
-- ============================================================================

-- DRAFT ONLY: core recovery, CBT and badge functionality.

create table if not exists public.diary_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  gambled boolean not null default false,
  mood text,
  triggers jsonb not null default '[]'::jsonb,
  coping jsonb not null default '[]'::jsonb,
  thoughts text,
  notes text,
  amount numeric not null default 0,
  streak integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create table if not exists public.cbt_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  module_id text not null,
  module_title text,
  completed boolean not null default false,
  completed_at timestamptz,
  answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, module_id)
);

create table if not exists public.badges (
  id text primary key,
  name text not null,
  icon text,
  description text,
  points integer not null default 0,
  category text,
  condition jsonb,
  unlocked_at timestamptz
);

create table if not exists public.chat_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null,
  message text not null,
  created_at timestamptz not null default now()
);

alter table public.chat_history add column if not exists user_id uuid;
alter table public.chat_history add column if not exists role text;
alter table public.chat_history add column if not exists message text;
alter table public.chat_history add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chat_history_role_check'
      and conrelid = 'public.chat_history'::regclass
  ) then
    alter table public.chat_history add constraint chat_history_role_check
      check (role in ('user', 'assistant'));
  end if;
end $$;

create index if not exists diary_entries_user_date_idx on public.diary_entries(user_id, date desc);
create index if not exists cbt_progress_user_completed_idx on public.cbt_progress(user_id, completed);
create index if not exists chat_history_user_created_idx on public.chat_history(user_id, created_at desc);
create unique index if not exists diary_entries_user_date_unique_idx on public.diary_entries(user_id, date);
create unique index if not exists cbt_progress_user_module_unique_idx on public.cbt_progress(user_id, module_id);

-- ============================================================================
-- SOURCE MIGRATION 3: 20261104_000003_resources_events.sql
-- ============================================================================

-- DRAFT ONLY: resources, events, RSVP, discussions and contact messages.

create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  description text,
  phone text,
  website text,
  url text,
  hours text,
  address text,
  available_24_7 boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.resource_ratings (
  user_id uuid not null references public.profiles(id) on delete cascade,
  resource_id uuid not null references public.resources(id) on delete cascade,
  helpful boolean not null,
  primary key (user_id, resource_id)
);

create table if not exists public.resource_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  name text not null,
  description text,
  link text,
  notes text,
  category text,
  contact text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  date timestamptz not null,
  location text,
  type text,
  spots integer,
  image_url text,
  active boolean not null default true,
  discussion_enabled boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.events add column if not exists date timestamptz;
alter table public.events add column if not exists type text;
alter table public.events add column if not exists spots integer;
alter table public.events add column if not exists image_url text;
alter table public.events add column if not exists discussion_enabled boolean not null default true;

create table if not exists public.event_rsvps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  attendance text,
  status text,
  created_at timestamptz not null default now(),
  unique (user_id, event_id)
);

create table if not exists public.event_messages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  name text,
  phone text,
  email text,
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.event_discussions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  message text not null,
  is_admin_reply boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  meeting_day text,
  meeting_time text,
  location text,
  facilitator text,
  meets text,
  active boolean not null default true,
  max_members integer,
  category text,
  created_at timestamptz not null default now()
);

create index if not exists resources_active_category_idx on public.resources(active, category, name);
create index if not exists events_active_date_idx on public.events(active, date);
create index if not exists event_rsvps_event_idx on public.event_rsvps(event_id, user_id);
create index if not exists event_messages_event_created_idx on public.event_messages(event_id, created_at desc);
create index if not exists event_discussions_event_created_idx on public.event_discussions(event_id, created_at);
create unique index if not exists event_rsvps_user_event_unique_idx on public.event_rsvps(user_id, event_id);

-- ============================================================================
-- SOURCE MIGRATION 4: 20261104_000004_notifications_communications.sql
-- ============================================================================

-- DRAFT ONLY: crisis, broadcasts and notifications.

create table if not exists public.crisis_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  keyword text,
  message text,
  severity text,
  resolved boolean not null default false,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  escalated boolean not null default false,
  escalated_at timestamptz,
  escalated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  audience text not null,
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  message text,
  type text,
  icon text,
  link text,
  read boolean not null default false,
  broadcast_id uuid references public.broadcasts(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.notifications add column if not exists broadcast_id uuid;

create index if not exists crisis_alerts_open_created_idx on public.crisis_alerts(resolved, created_at desc);
create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);
create index if not exists notifications_user_unread_idx on public.notifications(user_id, read, created_at desc);

-- ============================================================================
-- SOURCE MIGRATION 5: 20261104_000005_support_circle_whispers.sql
-- ============================================================================

-- DRAFT ONLY: supporter, Circle and Whispers functionality.

create table if not exists public.supporter_invitations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  supporter_name text,
  supporter_email text,
  supporter_phone text,
  supporter_relation text,
  permissions jsonb not null default '[]'::jsonb,
  token text not null unique,
  status text not null default 'pending',
  anonymous_mode boolean not null default false,
  crisis_contact boolean not null default false,
  responded_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.supporter_messages (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.supporter_invitations(id) on delete cascade,
  sender text not null,
  content text not null,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'supporter_messages_sender_check'
      and conrelid = 'public.supporter_messages'::regclass
  ) then
    alter table public.supporter_messages add constraint supporter_messages_sender_check
      check (sender in ('user', 'supporter'));
  end if;
end $$;

create table if not exists public.supporter_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  invitation_id uuid not null references public.supporter_invitations(id) on delete cascade,
  felt_supported boolean not null,
  created_at timestamptz not null default now()
);

create table if not exists public.circle_room_members (
  room text not null,
  user_hash text not null,
  last_seen timestamptz not null default now(),
  primary key (room, user_hash)
);

create table if not exists public.circle_messages (
  id uuid primary key default gen_random_uuid(),
  room text not null,
  user_hash text not null,
  user_id uuid references public.profiles(id) on delete set null,
  mentioned_user_id uuid references public.profiles(id) on delete set null,
  display_name text,
  avatar_animal text,
  avatar_prefix text,
  message text not null,
  message_type text not null default 'text',
  expires_at timestamptz,
  reply_to_id uuid references public.circle_messages(id) on delete set null,
  reply_to_name text,
  created_at timestamptz not null default now()
);

alter table public.circle_messages add column if not exists user_id uuid;
alter table public.circle_messages add column if not exists mentioned_user_id uuid;

create table if not exists public.whispers_matches (
  id uuid primary key default gen_random_uuid(),
  user1_hash text,
  user2_hash text,
  user1_role text,
  user2_role text,
  status text not null default 'pending',
  request_message text,
  request_type text,
  user1_rating integer,
  user2_rating integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whispers_messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.whispers_matches(id) on delete cascade,
  sender_hash text not null,
  message text not null,
  reply_to_id uuid references public.whispers_messages(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.whispers_messages add column if not exists message text;
alter table public.whispers_messages add column if not exists reply_to_id uuid;

create table if not exists public.whispers_reports (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references public.whispers_matches(id) on delete set null,
  reporter_hash text not null,
  message_id uuid references public.whispers_messages(id) on delete set null,
  reason text,
  details text,
  created_at timestamptz not null default now()
);

create index if not exists supporter_invitations_token_idx on public.supporter_invitations(token);
create index if not exists supporter_invitations_user_status_idx on public.supporter_invitations(user_id, status);
create index if not exists supporter_messages_invitation_idx on public.supporter_messages(invitation_id, created_at);
create index if not exists circle_members_last_seen_idx on public.circle_room_members(room, last_seen desc);
create index if not exists circle_messages_room_created_idx on public.circle_messages(room, created_at desc);
create index if not exists circle_messages_expiry_idx on public.circle_messages(expires_at);
create index if not exists whispers_matches_hashes_idx on public.whispers_matches(user1_hash, user2_hash);
create index if not exists whispers_messages_match_created_idx on public.whispers_messages(match_id, created_at);
create unique index if not exists circle_room_members_room_hash_unique_idx on public.circle_room_members(room, user_hash);

-- ============================================================================
-- SOURCE MIGRATION 6: 20261104_000006_media_admin_business.sql
-- ============================================================================

-- DRAFT ONLY: private media metadata, administration and business tables.

create table if not exists public.mirror_recordings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  month text not null,
  storage_path text not null,
  type text not null default 'video',
  duration_seconds integer not null default 0,
  title text,
  recording_date timestamptz,
  prompt text,
  created_at timestamptz not null default now()
);

create table if not exists public.precious_pacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null,
  title text,
  description text,
  prompt text,
  duration_seconds integer not null default 0,
  play_count integer not null default 0,
  pact_type text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.mirror_recordings add column if not exists duration_seconds integer not null default 0;

create table if not exists public.b2b_clients (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  company_code text unique,
  contact_name text,
  email text,
  phone text,
  plan text,
  status text not null default 'active',
  max_users integer,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_b2b_client_fk'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles add constraint profiles_b2b_client_fk
      foreign key (b2b_client_id) references public.b2b_clients(id) on delete set null;
  end if;
end $$;

create table if not exists public.grant_applications (
  id uuid primary key default gen_random_uuid(),
  organization_name text,
  contact_name text,
  email text,
  phone text,
  status text not null default 'pending',
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.insurance_partners (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_name text,
  email text,
  phone text,
  status text not null default 'active',
  commission_rate numeric(8,4),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.system_settings (
  key text primary key,
  value jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  entity_type text,
  entity_id text,
  user_id uuid references public.profiles(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.upgrade_interest (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  email text,
  current_plan text,
  interested_plan text,
  created_at timestamptz not null default now()
);

create index if not exists mirror_recordings_owner_month_idx on public.mirror_recordings(user_id, month, created_at desc);
create index if not exists precious_pacts_owner_created_idx on public.precious_pacts(user_id, created_at desc);
create index if not exists audit_logs_created_idx on public.audit_logs(created_at desc);
create index if not exists audit_logs_entity_idx on public.audit_logs(entity_type, entity_id);

-- ============================================================================
-- SOURCE MIGRATION 7: 20261104_000007_functions_triggers.sql
-- ============================================================================

-- DRAFT ONLY: application-required RPC and trigger reconstruction.
-- The Circle reaction function is intentionally not recreated because the
-- reaction column mapping is unresolved.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.profiles (id, full_name, email, role, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    'user',
    'active'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.increment_pact_play_count(pact_id uuid)
returns void
language sql
security invoker
as $$
  update public.precious_pacts
  set play_count = coalesce(play_count, 0) + 1
  where id = pact_id
    and user_id = auth.uid();
$$;
revoke execute on function public.increment_pact_play_count(uuid) from public, anon;
grant execute on function public.increment_pact_play_count(uuid) to authenticated;

create or replace function public.add_recovery_coins(uid uuid, amount integer)
returns void
language sql
security invoker
as $$
  select null
  where false;
$$;

create or replace function public.get_user_email(user_id uuid)
returns text
language sql
security definer
set search_path = pg_catalog, auth, public
as $$
  select u.email
  from auth.users u
  where u.id = user_id
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    );
$$;

revoke execute on function public.add_recovery_coins(uuid, integer) from public, anon, authenticated;
revoke execute on function public.get_user_email(uuid) from public, anon;
grant execute on function public.get_user_email(uuid) to authenticated;

create or replace function public.supporter_invitation_lookup(p_token text)
returns table (
  id uuid, supporter_name text, supporter_relation text, permissions jsonb,
  anonymous_mode boolean, crisis_contact boolean, status text,
  responded_at timestamptz, expires_at timestamptz, created_at timestamptz
)
language sql
security definer
stable
set search_path = pg_catalog, public, pg_temp
as $$
  select i.id, i.supporter_name, i.supporter_relation, i.permissions,
         i.anonymous_mode, i.crisis_contact, i.status, i.responded_at,
         i.expires_at, i.created_at
  from public.supporter_invitations i
  where i.token = p_token
    and i.status = 'pending'
    and i.expires_at is not null
    and i.expires_at > now()
  limit 1;
$$;

revoke execute on function public.supporter_invitation_lookup(text) from public, authenticated;
grant execute on function public.supporter_invitation_lookup(text) to anon;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists whispers_matches_touch_updated_at on public.whispers_matches;
create trigger whispers_matches_touch_updated_at
before update on public.whispers_matches
for each row execute function public.touch_updated_at();

create or replace function public.enforce_profile_privilege_updates()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
  then
    return new;
  end if;

  if new.id = auth.uid() then
    if old.role is distinct from new.role
      or old.status is distinct from new.status
      or old.money_saved is distinct from new.money_saved
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
    then
      raise exception 'Users cannot change privileged profile fields';
    end if;
    return new;
  end if;

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
      or old.circle_user_hash is distinct from new.circle_user_hash)
     and not public.is_super_admin() then
    raise exception 'Only super_admin can change entitlements and privileged profile fields';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_profile_privilege_updates on public.profiles;
create trigger enforce_profile_privilege_updates
before update on public.profiles
for each row execute function public.enforce_profile_privilege_updates();

create or replace function public.enforce_whispers_match_identity()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    if old.user1_hash is distinct from new.user1_hash
      or old.user2_hash is distinct from new.user2_hash
      or old.user1_role is distinct from new.user1_role
      or old.user2_role is distinct from new.user2_role
    then
      raise exception 'Whispers participant identities are immutable';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_whispers_match_identity on public.whispers_matches;
create trigger enforce_whispers_match_identity
before update on public.whispers_matches
for each row execute function public.enforce_whispers_match_identity();

create or replace function public.enforce_whispers_message_identity()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if old.match_id is distinct from new.match_id
    or old.sender_hash is distinct from new.sender_hash
    or old.reply_to_id is distinct from new.reply_to_id
    or old.message is distinct from new.message
    or old.created_at is distinct from new.created_at
  then
    raise exception 'Whispers message identity fields are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_whispers_message_identity on public.whispers_messages;
create trigger enforce_whispers_message_identity
before update on public.whispers_messages
for each row execute function public.enforce_whispers_message_identity();

create or replace function public.prevent_direct_audit_writes()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Audit log entries are immutable';
  end if;
  if tg_op = 'UPDATE' then
    raise exception 'Audit log entries are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_direct_audit_writes on public.audit_logs;
create trigger prevent_direct_audit_writes
before update or delete on public.audit_logs
for each row execute function public.prevent_direct_audit_writes();

create or replace function public.enforce_crisis_alert_privileges()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
  then
    return new;
  end if;

  if tg_op = 'INSERT'
    and not public.is_admin()
    and (
      coalesce(new.resolved, false) is true
      or new.resolved_at is not null
      or new.resolved_by is not null
      or coalesce(new.escalated, false) is true
      or new.escalated_at is not null
      or new.escalated_by is not null
    )
  then
    raise exception 'Users cannot assign privileged crisis fields';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_crisis_alert_privileges() from public, anon, authenticated;

drop trigger if exists enforce_crisis_alert_privileges on public.crisis_alerts;
create trigger enforce_crisis_alert_privileges
before insert or update on public.crisis_alerts
for each row execute function public.enforce_crisis_alert_privileges();

-- ============================================================================
-- SOURCE MIGRATION 8: 20261104_000008_rls_policies.sql
-- ============================================================================

-- DRAFT ONLY: explicit LossLens RLS policy surface.
-- This package does not reconstruct policies from an unavailable old database.

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select p.role from public.profiles p where p.id = auth.uid();
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'super_admin'
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'super_admin')
  );
$$;

revoke execute on function public.current_user_role() from public, anon;
revoke execute on function public.is_super_admin() from public, anon;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.is_admin() to authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','badges','diary_entries','cbt_progress','chat_history','notifications',
    'crisis_alerts','resources','resource_ratings','resource_suggestions',
    'events','event_rsvps','event_messages','event_discussions','groups',
    'broadcasts','supporter_invitations','supporter_messages','supporter_feedback',
    'circle_room_members','circle_messages','whispers_matches','whispers_messages',
    'whispers_reports','mirror_recordings','precious_pacts','b2b_clients',
    'grant_applications','insurance_partners','system_settings','audit_logs',
    'upgrade_interest'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

-- Drop only policies explicitly named by this migration package.
drop policy if exists lossless_profiles_self_select on public.profiles;
drop policy if exists lossless_profiles_self_update on public.profiles;
drop policy if exists lossless_profiles_admin_select on public.profiles;
drop policy if exists lossless_profiles_admin_update on public.profiles;
drop policy if exists lossless_profiles_super_admin_delete on public.profiles;
drop policy if exists lossless_diary_owner_all on public.diary_entries;
drop policy if exists lossless_cbt_owner_all on public.cbt_progress;
drop policy if exists lossless_chat_owner_all on public.chat_history;
drop policy if exists lossless_notifications_owner_all on public.notifications;
drop policy if exists lossless_circle_members_owner_select on public.circle_room_members;
drop policy if exists lossless_circle_members_owner_insert on public.circle_room_members;
drop policy if exists lossless_circle_members_owner_delete on public.circle_room_members;
drop policy if exists lossless_circle_members_owner_select on public.circle_room_members;
drop policy if exists lossless_circle_members_owner_insert on public.circle_room_members;
drop policy if exists lossless_circle_members_owner_delete on public.circle_room_members;
drop policy if exists lossless_resources_public_select on public.resources;
drop policy if exists lossless_resources_admin_insert on public.resources;
drop policy if exists lossless_resources_admin_update on public.resources;
drop policy if exists lossless_resources_admin_delete on public.resources;
drop policy if exists lossless_groups_public_select on public.groups;
drop policy if exists lossless_groups_admin_insert on public.groups;
drop policy if exists lossless_groups_admin_update on public.groups;
drop policy if exists lossless_groups_admin_delete on public.groups;
drop policy if exists lossless_events_public_select on public.events;
drop policy if exists lossless_events_admin_insert on public.events;
drop policy if exists lossless_events_admin_update on public.events;
drop policy if exists lossless_events_admin_delete on public.events;
drop policy if exists lossless_badges_public_select on public.badges;
drop policy if exists lossless_badges_admin_insert on public.badges;
drop policy if exists lossless_badges_admin_update on public.badges;
drop policy if exists lossless_badges_admin_delete on public.badges;

-- Profiles
create policy lossless_profiles_self_select on public.profiles for select to authenticated
  using (id = auth.uid());
create policy lossless_profiles_admin_select on public.profiles for select to authenticated
  using (is_admin());
create policy lossless_profiles_self_update on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
create policy lossless_profiles_admin_update on public.profiles for update to authenticated
  using (is_admin() and id <> auth.uid())
  with check (is_admin() and id <> auth.uid());
create policy lossless_profiles_super_admin_delete on public.profiles for delete to authenticated
  using (is_super_admin() and id <> auth.uid());

-- Owner-only recovery data
create policy lossless_diary_owner_all on public.diary_entries for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy lossless_cbt_owner_all on public.cbt_progress for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy lossless_chat_owner_all on public.chat_history for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy lossless_notifications_owner_all on public.notifications for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Public catalogues
create policy lossless_resources_public_select on public.resources for select to anon, authenticated
  using (active = true);
create policy lossless_resources_admin_insert on public.resources for insert to authenticated
  with check (is_admin());
create policy lossless_resources_admin_update on public.resources for update to authenticated
  using (is_admin()) with check (is_admin());
create policy lossless_resources_admin_delete on public.resources for delete to authenticated
  using (is_admin());

create policy lossless_groups_public_select on public.groups for select to authenticated
  using (active = true);
drop policy if exists lossless_groups_anon_public_select on public.groups;
create policy lossless_groups_anon_public_select on public.groups for select to anon
  using (active = true);
create policy lossless_groups_admin_insert on public.groups for insert to authenticated
  with check (is_admin());
create policy lossless_groups_admin_update on public.groups for update to authenticated
  using (is_admin()) with check (is_admin());
create policy lossless_groups_admin_delete on public.groups for delete to authenticated
  using (is_admin());

create policy lossless_events_public_select on public.events for select to anon, authenticated
  using (active = true);
create policy lossless_events_admin_insert on public.events for insert to authenticated
  with check (is_admin());
create policy lossless_events_admin_update on public.events for update to authenticated
  using (is_admin()) with check (is_admin());
create policy lossless_events_admin_delete on public.events for delete to authenticated
  using (is_admin());

create policy lossless_badges_public_select on public.badges for select to anon, authenticated using (true);
create policy lossless_badges_admin_insert on public.badges for insert to authenticated with check (is_admin());
create policy lossless_badges_admin_update on public.badges for update to authenticated
  using (is_admin()) with check (is_admin());
create policy lossless_badges_admin_delete on public.badges for delete to authenticated using (is_admin());

-- Event participation, ratings and suggestions
drop policy if exists lossless_rsvps_owner_all on public.event_rsvps;
create policy lossless_rsvps_owner_all on public.event_rsvps for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists lossless_event_discussions_select on public.event_discussions;
create policy lossless_event_discussions_select on public.event_discussions for select to authenticated using (true);
drop policy if exists lossless_event_discussions_insert on public.event_discussions;
create policy lossless_event_discussions_insert on public.event_discussions for insert to authenticated
  with check (user_id = auth.uid() and is_admin_reply = false);
drop policy if exists lossless_event_discussions_admin_insert on public.event_discussions;
create policy lossless_event_discussions_admin_insert on public.event_discussions for insert to authenticated
  with check (user_id = auth.uid() and is_admin() and is_admin_reply = true);
drop policy if exists lossless_event_discussions_admin_update on public.event_discussions;
drop policy if exists lossless_event_discussions_admin_delete on public.event_discussions;
create policy lossless_event_discussions_admin_delete on public.event_discussions for delete to authenticated
  using (is_admin());
drop policy if exists lossless_event_messages_owner_select on public.event_messages;
create policy lossless_event_messages_owner_select on public.event_messages for select to authenticated
  using (user_id = auth.uid());
drop policy if exists lossless_event_messages_owner_insert on public.event_messages;
create policy lossless_event_messages_owner_insert on public.event_messages for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists lossless_event_messages_admin_select on public.event_messages;
create policy lossless_event_messages_admin_select on public.event_messages for select to authenticated
  using (is_admin());
drop policy if exists lossless_event_messages_admin_update on public.event_messages;
create policy lossless_event_messages_admin_update on public.event_messages for update to authenticated
  using (is_admin()) with check (is_admin());
drop policy if exists lossless_event_messages_admin_delete on public.event_messages;
create policy lossless_event_messages_admin_delete on public.event_messages for delete to authenticated
  using (is_admin());

drop policy if exists lossless_resource_ratings_owner_all on public.resource_ratings;
create policy lossless_resource_ratings_owner_all on public.resource_ratings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists lossless_resource_suggestions_owner_insert on public.resource_suggestions;
create policy lossless_resource_suggestions_owner_insert on public.resource_suggestions for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists lossless_resource_suggestions_admin_select on public.resource_suggestions;
create policy lossless_resource_suggestions_admin_select on public.resource_suggestions for select to authenticated
  using (is_admin());
drop policy if exists lossless_resource_suggestions_admin_update on public.resource_suggestions;
create policy lossless_resource_suggestions_admin_update on public.resource_suggestions for update to authenticated
  using (is_admin()) with check (is_admin());
drop policy if exists lossless_resource_suggestions_admin_delete on public.resource_suggestions;
create policy lossless_resource_suggestions_admin_delete on public.resource_suggestions for delete to authenticated
  using (is_admin());

-- Supporters
drop policy if exists lossless_invitations_owner_all on public.supporter_invitations;
create policy lossless_invitations_owner_all on public.supporter_invitations for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists lossless_supporter_messages_owner_select on public.supporter_messages;
create policy lossless_supporter_messages_owner_select on public.supporter_messages for select to authenticated
  using (exists (
    select 1 from public.supporter_invitations i
    where i.id = invitation_id and i.user_id = auth.uid()
  ));
drop policy if exists lossless_supporter_messages_owner_insert on public.supporter_messages;
create policy lossless_supporter_messages_owner_insert on public.supporter_messages for insert to authenticated
  with check (sender = 'user' and exists (
    select 1 from public.supporter_invitations i
    where i.id = invitation_id and i.user_id = auth.uid()
  ));
drop policy if exists lossless_supporter_feedback_owner_insert on public.supporter_feedback;
create policy lossless_supporter_feedback_owner_insert on public.supporter_feedback for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.supporter_invitations i
      where i.id = invitation_id and i.user_id = auth.uid()
    )
  );

-- Circle membership and messages
drop policy if exists lossless_circle_members_owner_all on public.circle_room_members;
create policy lossless_circle_members_owner_select on public.circle_room_members for select to authenticated
  using (user_hash = (select p.circle_user_hash from public.profiles p where p.id = auth.uid()));
create policy lossless_circle_members_owner_insert on public.circle_room_members for insert to authenticated
  with check (user_hash = (select p.circle_user_hash from public.profiles p where p.id = auth.uid()));
create policy lossless_circle_members_owner_delete on public.circle_room_members for delete to authenticated
  using (user_hash = (select p.circle_user_hash from public.profiles p where p.id = auth.uid()));
drop policy if exists lossless_circle_messages_member_select on public.circle_messages;
create policy lossless_circle_messages_member_select on public.circle_messages for select to authenticated
  using (exists (
    select 1 from public.circle_room_members m
    join public.profiles p on p.id = auth.uid()
    where m.room = circle_messages.room and m.user_hash = p.circle_user_hash
  ));
drop policy if exists lossless_circle_messages_member_insert on public.circle_messages;
create policy lossless_circle_messages_member_insert on public.circle_messages for insert to authenticated
  with check (
    user_hash = (select p.circle_user_hash from public.profiles p where p.id = auth.uid())
    and (user_id is null or user_id = auth.uid())
    and exists (
      select 1 from public.circle_room_members m
      where m.room = circle_messages.room
        and m.user_hash = (select p.circle_user_hash from public.profiles p where p.id = auth.uid())
    )
  );
drop policy if exists lossless_circle_messages_owner_delete on public.circle_messages;
create policy lossless_circle_messages_owner_delete on public.circle_messages for delete to authenticated
  using (
    user_hash = (select p.circle_user_hash from public.profiles p where p.id = auth.uid())
    or is_admin()
  );

-- Whispers
drop policy if exists lossless_whispers_match_participant_select on public.whispers_matches;
create policy lossless_whispers_match_participant_select on public.whispers_matches for select to authenticated
  using (
    user1_hash = (select p.circle_user_hash from public.profiles p where p.id = auth.uid())
    or user2_hash = (select p.circle_user_hash from public.profiles p where p.id = auth.uid())
  );
drop policy if exists lossless_whispers_match_participant_insert on public.whispers_matches;
create policy lossless_whispers_match_participant_insert on public.whispers_matches for insert to authenticated
  with check (
    user1_hash is not null
    and user2_hash is not null
    and user1_hash is distinct from user2_hash
    and (
      user1_hash = (select p.circle_user_hash from public.profiles p where p.id = auth.uid())
      or user2_hash = (select p.circle_user_hash from public.profiles p where p.id = auth.uid())
    )
  );
drop policy if exists lossless_whispers_match_participant_update on public.whispers_matches;
create policy lossless_whispers_match_participant_update on public.whispers_matches for update to authenticated
  using (
    user1_hash = (select p.circle_user_hash from public.profiles p where p.id = auth.uid())
    or user2_hash = (select p.circle_user_hash from public.profiles p where p.id = auth.uid())
  )
  with check (
    user1_hash = (select p.circle_user_hash from public.profiles p where p.id = auth.uid())
    or user2_hash = (select p.circle_user_hash from public.profiles p where p.id = auth.uid())
  );
drop policy if exists lossless_whispers_match_participant_delete on public.whispers_matches;
create policy lossless_whispers_match_participant_delete on public.whispers_matches for delete to authenticated
  using (
    user1_hash = (select p.circle_user_hash from public.profiles p where p.id = auth.uid())
    or user2_hash = (select p.circle_user_hash from public.profiles p where p.id = auth.uid())
  );

drop policy if exists lossless_whispers_message_participant_select on public.whispers_messages;
create policy lossless_whispers_message_participant_select on public.whispers_messages for select to authenticated
  using (exists (
    select 1 from public.whispers_matches wm
    join public.profiles p on p.id = auth.uid()
    where wm.id = whispers_messages.match_id
      and (wm.user1_hash = p.circle_user_hash or wm.user2_hash = p.circle_user_hash)
  ));
drop policy if exists lossless_whispers_message_participant_insert on public.whispers_messages;
create policy lossless_whispers_message_participant_insert on public.whispers_messages for insert to authenticated
  with check (
    sender_hash = (select p.circle_user_hash from public.profiles p where p.id = auth.uid())
    and exists (
      select 1 from public.whispers_matches wm
      join public.profiles p on p.id = auth.uid()
      where wm.id = whispers_messages.match_id
        and (wm.user1_hash = p.circle_user_hash or wm.user2_hash = p.circle_user_hash)
    )
  );
drop policy if exists lossless_whispers_message_sender_update on public.whispers_messages;
drop policy if exists lossless_whispers_message_sender_delete on public.whispers_messages;
create policy lossless_whispers_message_sender_delete on public.whispers_messages for delete to authenticated
  using (sender_hash = (select p.circle_user_hash from public.profiles p where p.id = auth.uid()));

drop policy if exists lossless_whispers_report_owner_insert on public.whispers_reports;
create policy lossless_whispers_report_owner_insert on public.whispers_reports for insert to authenticated
  with check (
    reporter_hash = (select p.circle_user_hash from public.profiles p where p.id = auth.uid())
    and exists (
      select 1
      from public.whispers_matches wm
      join public.profiles p on p.id = auth.uid()
      where wm.id = whispers_reports.match_id
        and (wm.user1_hash = p.circle_user_hash or wm.user2_hash = p.circle_user_hash)
    )
    and (
      whispers_reports.message_id is null
      or exists (
        select 1
        from public.whispers_messages wm
        where wm.id = whispers_reports.message_id
          and wm.match_id = whispers_reports.match_id
      )
    )
  );
drop policy if exists lossless_whispers_report_admin_select on public.whispers_reports;
create policy lossless_whispers_report_admin_select on public.whispers_reports for select to authenticated using (is_admin());
drop policy if exists lossless_whispers_report_admin_update on public.whispers_reports;
create policy lossless_whispers_report_admin_update on public.whispers_reports for update to authenticated
  using (is_admin()) with check (is_admin());
drop policy if exists lossless_whispers_report_admin_delete on public.whispers_reports;
create policy lossless_whispers_report_admin_delete on public.whispers_reports for delete to authenticated using (is_admin());

-- Private recovery media: owner-only until an admin privacy decision is implemented.
drop policy if exists lossless_mirror_owner_select on public.mirror_recordings;
create policy lossless_mirror_owner_select on public.mirror_recordings for select to authenticated
  using (user_id = auth.uid());
drop policy if exists lossless_mirror_owner_insert on public.mirror_recordings;
create policy lossless_mirror_owner_insert on public.mirror_recordings for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists lossless_mirror_owner_update on public.mirror_recordings;
create policy lossless_mirror_owner_update on public.mirror_recordings for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists lossless_mirror_owner_delete on public.mirror_recordings;
create policy lossless_mirror_owner_delete on public.mirror_recordings for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists lossless_pact_owner_select on public.precious_pacts;
create policy lossless_pact_owner_select on public.precious_pacts for select to authenticated
  using (user_id = auth.uid());
drop policy if exists lossless_pact_owner_insert on public.precious_pacts;
create policy lossless_pact_owner_insert on public.precious_pacts for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists lossless_pact_owner_update on public.precious_pacts;
create policy lossless_pact_owner_update on public.precious_pacts for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists lossless_pact_owner_delete on public.precious_pacts;
create policy lossless_pact_owner_delete on public.precious_pacts for delete to authenticated
  using (user_id = auth.uid());

-- Crisis, broadcasts, business and audit
drop policy if exists lossless_crisis_user_insert on public.crisis_alerts;
create policy lossless_crisis_user_insert on public.crisis_alerts for insert to authenticated
  with check (
    (user_id = auth.uid() or user_id is null)
    and resolved = false
    and resolved_at is null
    and resolved_by is null
    and escalated = false
    and escalated_at is null
    and escalated_by is null
  );
drop policy if exists lossless_crisis_admin_select on public.crisis_alerts;
create policy lossless_crisis_admin_select on public.crisis_alerts for select to authenticated using (is_admin());
drop policy if exists lossless_crisis_admin_update on public.crisis_alerts;
create policy lossless_crisis_admin_update on public.crisis_alerts for update to authenticated
  using (is_admin()) with check (is_admin());
drop policy if exists lossless_broadcasts_public_select on public.broadcasts;
create policy lossless_broadcasts_public_select on public.broadcasts for select to authenticated, anon
  using (sent_at is not null and sent_at <= now());
drop policy if exists lossless_broadcasts_admin_select on public.broadcasts;
create policy lossless_broadcasts_admin_select on public.broadcasts for select to authenticated
  using (is_admin());
drop policy if exists lossless_broadcasts_admin_insert on public.broadcasts;
create policy lossless_broadcasts_admin_insert on public.broadcasts for insert to authenticated
  with check (is_admin() and created_by = auth.uid());
drop policy if exists lossless_broadcasts_admin_update on public.broadcasts;
create policy lossless_broadcasts_admin_update on public.broadcasts for update to authenticated
  using (is_admin()) with check (is_admin());
drop policy if exists lossless_broadcasts_admin_delete on public.broadcasts;
create policy lossless_broadcasts_admin_delete on public.broadcasts for delete to authenticated using (is_admin());

drop policy if exists lossless_b2b_super_admin_all on public.b2b_clients;
create policy lossless_b2b_super_admin_all on public.b2b_clients for all to authenticated
  using (is_super_admin()) with check (is_super_admin());
drop policy if exists lossless_grants_super_admin_all on public.grant_applications;
create policy lossless_grants_super_admin_all on public.grant_applications for all to authenticated
  using (is_super_admin()) with check (is_super_admin());
drop policy if exists lossless_insurance_super_admin_all on public.insurance_partners;
create policy lossless_insurance_super_admin_all on public.insurance_partners for all to authenticated
  using (is_super_admin()) with check (is_super_admin());
drop policy if exists lossless_settings_super_admin_all on public.system_settings;
create policy lossless_settings_super_admin_all on public.system_settings for all to authenticated
  using (is_super_admin()) with check (is_super_admin());
drop policy if exists lossless_audit_super_admin_select on public.audit_logs;
create policy lossless_audit_super_admin_select on public.audit_logs for select to authenticated
  using (is_super_admin());

drop policy if exists lossless_upgrade_owner_insert on public.upgrade_interest;
create policy lossless_upgrade_owner_insert on public.upgrade_interest for insert to authenticated
  with check (user_id = auth.uid());

-- Explicit API grants. RLS remains mandatory on every application table.
revoke all on all tables in schema public from anon;
grant usage on schema public to anon, authenticated;
grant select on public.resources, public.events, public.groups, public.badges, public.broadcasts to anon;

grant select on all tables in schema public to authenticated;
grant insert, update, delete on
  public.profiles, public.diary_entries, public.cbt_progress, public.chat_history,
  public.notifications, public.resource_ratings, public.resource_suggestions,
  public.events, public.event_rsvps, public.event_messages, public.event_discussions,
  public.supporter_invitations, public.supporter_messages, public.supporter_feedback,
  public.circle_room_members, public.circle_messages, public.whispers_matches,
  public.whispers_messages, public.whispers_reports, public.mirror_recordings,
  public.precious_pacts, public.crisis_alerts, public.upgrade_interest
to authenticated;

grant insert, update, delete on
  public.resources, public.groups, public.badges, public.broadcasts,
  public.b2b_clients, public.grant_applications, public.insurance_partners,
  public.system_settings
to authenticated;

-- ============================================================================
-- SOURCE MIGRATION 9: 20261104_000009_storage_realtime.sql
-- ============================================================================

-- DRAFT ONLY: storage and realtime configuration.
-- Public/private settings remain subject to validation because source uses public URLs
-- for every bucket.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 5242880, array['image/jpeg','image/png','image/webp']),
  ('mirror-recordings', 'mirror-recordings', false, 104857600, array['video/webm']),
  ('precious-pacts', 'precious-pacts', false, 104857600, array['video/webm'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatar owner read" on storage.objects;
create policy "avatar owner read" on storage.objects for select to public
  using (bucket_id = 'avatars');
drop policy if exists "avatar owner insert" on storage.objects;
create policy "avatar owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatar owner update" on storage.objects;
create policy "avatar owner update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatar owner delete" on storage.objects;
create policy "avatar owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "mirror read" on storage.objects;
create policy "mirror read" on storage.objects for select to authenticated
  using (bucket_id = 'mirror-recordings' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "mirror write" on storage.objects;
create policy "mirror write" on storage.objects for insert to authenticated
  with check (bucket_id = 'mirror-recordings' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "mirror update" on storage.objects;
create policy "mirror update" on storage.objects for update to authenticated
  using (bucket_id = 'mirror-recordings' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'mirror-recordings' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "mirror delete" on storage.objects;
create policy "mirror delete" on storage.objects for delete to authenticated
  using (bucket_id = 'mirror-recordings' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "pact read" on storage.objects;
create policy "pact read" on storage.objects for select to authenticated
  using (bucket_id = 'precious-pacts' and ((storage.foldername(name))[1] = auth.uid()::text));
drop policy if exists "pact write" on storage.objects;
create policy "pact write" on storage.objects for insert to authenticated
  with check (bucket_id = 'precious-pacts' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "pact update" on storage.objects;
create policy "pact update" on storage.objects for update to authenticated
  using (bucket_id = 'precious-pacts' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'precious-pacts' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "pact delete" on storage.objects;
create policy "pact delete" on storage.objects for delete to authenticated
  using (bucket_id = 'precious-pacts' and (storage.foldername(name))[1] = auth.uid()::text);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
    ) then execute 'alter publication supabase_realtime add table public.notifications'; end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'circle_messages'
    ) then execute 'alter publication supabase_realtime add table public.circle_messages'; end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'crisis_alerts'
    ) then execute 'alter publication supabase_realtime add table public.crisis_alerts'; end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'audit_logs'
    ) then execute 'alter publication supabase_realtime add table public.audit_logs'; end if;
  end if;
end $$;

-- ============================================================================
-- SOURCE MIGRATION 10: 20261106152654_add_profile_risk_columns.sql
-- ============================================================================

alter table public.profiles
  add column if not exists daily_risk_score integer not null default 0,
  add column if not exists risk_factors jsonb not null default '[]'::jsonb,
  add column if not exists last_risk_check date;

notify pgrst, 'reload schema';

-- ============================================================================
-- UNIFIED ADMIN PORTAL ADDITIONS
-- ============================================================================

-- Add Super Admin flag and preserve existing role-based super admins.
alter table public.profiles
  add column if not exists is_super_admin boolean default false;

update public.profiles
set is_super_admin = true
where role = 'super_admin'
  and is_super_admin is not true;

-- Create Audit Logs table. The historical migration already creates an
-- audit_logs table with entity_type/entity_id/user_id/details, so the new
-- portal columns are added below as well.
create table if not exists public.audit_logs (
    id uuid primary key default gen_random_uuid(),
    admin_id uuid references public.profiles(id),
    action text not null,
    target_table text,
    target_id uuid,
    metadata jsonb,
    created_at timestamptz default now()
);

alter table public.audit_logs
  add column if not exists admin_id uuid references public.profiles(id),
  add column if not exists target_table text,
  add column if not exists target_id uuid,
  add column if not exists metadata jsonb,
  add column if not exists table_name text,
  add column if not exists record_id text,
  add column if not exists performed_by text;

create index if not exists audit_logs_admin_created_idx
  on public.audit_logs(admin_id, created_at desc);
create index if not exists audit_logs_target_idx
  on public.audit_logs(target_table, target_id);
create index if not exists audit_logs_table_name_idx
  on public.audit_logs(table_name);

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.audit_logs enable row level security;

-- Sensitive admin tables: explicit super-admin SELECT policies backed by the
-- new boolean flag. Existing FOR ALL policies remain in place and are made
-- boolean-aware by the updated is_super_admin() helper below.
drop policy if exists "Super admins can view insurance partners" on public.insurance_partners;
create policy "Super admins can view insurance partners"
on public.insurance_partners for select to authenticated
using (
    exists (
        select 1 from public.profiles
        where profiles.id = auth.uid()
        and profiles.is_super_admin = true
    )
);

drop policy if exists "Super admins can view B2B clients" on public.b2b_clients;
create policy "Super admins can view B2B clients"
on public.b2b_clients for select to authenticated
using (
    exists (
        select 1 from public.profiles
        where profiles.id = auth.uid()
        and profiles.is_super_admin = true
    )
);

drop policy if exists "Super admins can view grant applications" on public.grant_applications;
create policy "Super admins can view grant applications"
on public.grant_applications for select to authenticated
using (
    exists (
        select 1 from public.profiles
        where profiles.id = auth.uid()
        and profiles.is_super_admin = true
    )
);

-- Drop existing conflicting audit-log policies (safe to re-run).
drop policy if exists "Super admins can read audit logs" on public.audit_logs;
drop policy if exists "Admins can insert audit logs" on public.audit_logs;

-- Create new audit-log policies.
create policy "Super admins can read audit logs"
on public.audit_logs for select
using (
    exists (
        select 1 from public.profiles
        where profiles.id = auth.uid()
        and profiles.is_super_admin = true
    )
);

create policy "Admins can insert audit logs"
on public.audit_logs for insert
with check (
    exists (
        select 1 from public.profiles
        where profiles.id = auth.uid()
        and (profiles.role = 'admin' or profiles.is_super_admin = true)
    )
);

-- Authenticated admins need table-level INSERT permission in addition to the
-- RLS INSERT policy. SELECT is already granted to authenticated users above.
grant insert on public.audit_logs to authenticated;

-- Reconcile helper functions with both legacy role='super_admin' accounts and
-- the new profiles.is_super_admin boolean.
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.is_super_admin = true or p.role = 'super_admin')
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role in ('admin', 'super_admin') or p.is_super_admin = true)
  );
$$;

-- Protect the new privilege flag from self-service or non-super-admin edits.
create or replace function public.enforce_profile_privilege_updates()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
  then
    return new;
  end if;

  if public.is_super_admin() then
    return new;
  end if;

  if old.role is distinct from new.role
     or old.status is distinct from new.status
     or old.subscription_status is distinct from new.subscription_status
     or old.subscription_plan is distinct from new.subscription_plan
     or old.subscription_expires_at is distinct from new.subscription_expires_at
     or old.b2b_client_id is distinct from new.b2b_client_id
     or old.plan_type is distinct from new.plan_type
     or old.is_super_admin is distinct from new.is_super_admin
  then
    raise exception 'Only super_admin can change privileged profile fields';
  end if;
  return new;
end;
$$;

-- Additional idempotent user-facing RLS policies. Existing policies remain
-- intact; these policy names cover tables whose hashed identities or
-- owner columns are not direct auth.uid() references.
drop policy if exists lossless_circle_members_owner_update_v2 on public.circle_room_members;
create policy lossless_circle_members_owner_update_v2 on public.circle_room_members for update to authenticated
  using (user_hash = (select p.circle_user_hash from public.profiles p where p.id = auth.uid()))
  with check (user_hash = (select p.circle_user_hash from public.profiles p where p.id = auth.uid()));

drop policy if exists lossless_circle_messages_owner_select_v2 on public.circle_messages;
create policy lossless_circle_messages_owner_select_v2 on public.circle_messages for select to authenticated
  using (
    user_hash = (select p.circle_user_hash from public.profiles p where p.id = auth.uid())
    or exists (
      select 1 from public.circle_room_members m
      join public.profiles p on p.id = auth.uid()
      where m.room = circle_messages.room and m.user_hash = p.circle_user_hash
    )
  );
drop policy if exists lossless_circle_messages_owner_update_v2 on public.circle_messages;
create policy lossless_circle_messages_owner_update_v2 on public.circle_messages for update to authenticated
  using (user_hash = (select p.circle_user_hash from public.profiles p where p.id = auth.uid()))
  with check (user_hash = (select p.circle_user_hash from public.profiles p where p.id = auth.uid()));

drop policy if exists lossless_whispers_match_insert_v2 on public.whispers_matches;
create policy lossless_whispers_match_insert_v2 on public.whispers_matches for insert to authenticated
  with check (
    user1_hash = (select p.circle_user_hash from public.profiles p where p.id = auth.uid())
    or user2_hash = (select p.circle_user_hash from public.profiles p where p.id = auth.uid())
  );

drop policy if exists lossless_whispers_message_update_v2 on public.whispers_messages;
create policy lossless_whispers_message_update_v2 on public.whispers_messages for update to authenticated
  using (
    sender_hash = (select p.circle_user_hash from public.profiles p where p.id = auth.uid())
  )
  with check (
    sender_hash = (select p.circle_user_hash from public.profiles p where p.id = auth.uid())
  );

drop policy if exists lossless_event_rsvps_owner_update_v2 on public.event_rsvps;
create policy lossless_event_rsvps_owner_update_v2 on public.event_rsvps for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists lossless_event_rsvps_owner_delete_v2 on public.event_rsvps;
create policy lossless_event_rsvps_owner_delete_v2 on public.event_rsvps for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists lossless_mirror_owner_insert_v2 on public.mirror_recordings;
create policy lossless_mirror_owner_insert_v2 on public.mirror_recordings for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists lossless_pact_owner_insert_v2 on public.precious_pacts;
create policy lossless_pact_owner_insert_v2 on public.precious_pacts for insert to authenticated
  with check (user_id = auth.uid());

-- Reload schema cache
notify pgrst, 'reload schema';
