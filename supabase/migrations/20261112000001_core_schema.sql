-- Consolidated migration: absorbs 20261112000002_rls_storage_grants.sql and 20261112000003_rpc_functions.sql (applied in original order).

-- 01_core_schema.sql — LossLens consolidated schema (part 1/8)
-- Consolidated from: 20261110000001_core_schema.sql
-- Apply first. Idempotent. See docs/MIGRATION_NOTES.md.

-- ============================================================================
-- 20261110000001_core_schema.sql — LossLens core schema (consolidated)
-- ============================================================================
-- Final state of all user-domain tables, indexes, base helper functions,
-- triggers, views, seed data, realtime publication and storage buckets.
-- Portal/claims tables live in 20261110000004_portals_claims.sql.
-- Idempotent: safe to apply twice. Uses pgcrypto (extensions schema) for
-- SHA-256 hashing of supporter invitation tokens.
-- ============================================================================

-- pgcrypto provides digest() for SHA-256 token hashing (supporter invites).
create extension if not exists pgcrypto with schema extensions;

-- b2b_clients must exist before the profiles FK below references it.
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

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
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
  streak_freeze_bridged_date date,
  badges jsonb not null default '[]'::jsonb,
  preferences jsonb not null default '{}'::jsonb,
  accountability_partner_name text,
  accountability_partner_phone text,
  circle_user_hash text,
  circle_display_name text,
  circle_display_name_set boolean not null default false,
  b2b_client_id uuid,
  is_demo boolean not null default false,
  subscription_status text,
  subscription_plan text,
  subscription_expires_at timestamptz,
  onboarding_completed boolean default false,
  onboarding_skipped boolean default false,
  screening_score integer,
  screening_answers jsonb default '{}'::jsonb,
  daily_risk_score integer not null default 0,
  risk_factors jsonb not null default '[]'::jsonb,
  last_risk_check date,
  is_super_admin boolean default false,
  must_change_password boolean not null default false,
  ai_data_consent_at timestamptz,
  created_at timestamptz not null default now(),
  last_active timestamptz
);

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
alter table public.profiles add column if not exists streak_freeze_bridged_date date;
alter table public.profiles add column if not exists badges jsonb not null default '[]'::jsonb;
alter table public.profiles add column if not exists preferences jsonb not null default '{}'::jsonb;
alter table public.profiles add column if not exists accountability_partner_name text;
alter table public.profiles add column if not exists accountability_partner_phone text;
alter table public.profiles add column if not exists subscription_status text;
alter table public.profiles add column if not exists subscription_plan text;
alter table public.profiles add column if not exists subscription_expires_at timestamptz;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists last_active timestamptz;
alter table public.profiles add column if not exists circle_user_hash text;
alter table public.profiles add column if not exists circle_display_name text;
alter table public.profiles add column if not exists circle_display_name_set boolean not null default false;
alter table public.profiles add column if not exists b2b_client_id uuid;
alter table public.profiles add column if not exists is_demo boolean not null default false;
alter table public.profiles add column if not exists onboarding_completed boolean default false;
alter table public.profiles add column if not exists onboarding_skipped boolean default false;
alter table public.profiles add column if not exists screening_score integer;
alter table public.profiles add column if not exists screening_answers jsonb default '{}'::jsonb;
alter table public.profiles add column if not exists daily_risk_score integer not null default 0;
alter table public.profiles add column if not exists risk_factors jsonb not null default '[]'::jsonb;
alter table public.profiles add column if not exists last_risk_check date;
alter table public.profiles add column if not exists is_super_admin boolean default false;
alter table public.profiles add column if not exists ai_data_consent_at timestamptz;
alter table public.profiles add column if not exists must_change_password boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_role_check' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_role_check
      check (role in ('user', 'admin', 'super_admin', 'therapist', 'insurer'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_b2b_client_fk' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_b2b_client_fk
      foreign key (b2b_client_id) references public.b2b_clients(id) on delete set null;
  end if;
end $$;

create index if not exists profiles_role_status_idx on public.profiles(role, status);
create index if not exists profiles_b2b_client_idx on public.profiles(b2b_client_id);
create index if not exists profiles_last_active_idx on public.profiles(last_active desc);
create unique index if not exists profiles_username_unique_idx on public.profiles(username) where username is not null;
do $$
begin
  if exists (
    select 1 from public.profiles
    where username is not null
    group by lower(username)
    having count(*) > 1
  ) then
    raise exception 'Resolve duplicate usernames ignoring case before applying this migration';
  end if;
  -- Reserved usernames are prohibited for ordinary users. The only
  -- exemption is a super_admin account (the role is assigned exclusively
  -- through privileged RPCs guarded by enforce_profile_privilege_updates,
  -- so it cannot be self-claimed). Other staff roles get no exemption.
  if exists (
    select 1 from public.profiles
    where lower(btrim(username)) in ('admin','support','losslens','oloo','system')
      and role <> 'super_admin'
  ) then
    raise exception 'Reserved usernames held by non-super-admin accounts must be resolved before applying this migration';
  end if;
end $$;
drop index if exists public.profiles_username_lower_unique_idx;
create unique index profiles_username_lower_unique_idx
  on public.profiles(lower(btrim(username))) where username is not null;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_username_not_reserved'
      and conrelid = 'public.profiles'::regclass
  ) then
    -- Super-admin accounts may hold a reserved username (e.g. the founding
    -- admin account); every other role is blocked. Role changes are guarded
    -- by enforce_profile_privilege_updates, so this cannot be self-claimed.
    alter table public.profiles add constraint profiles_username_not_reserved
      check (username is null
        or lower(btrim(username)) not in ('admin', 'support', 'losslens', 'oloo', 'system')
        or role = 'super_admin');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Recovery / CBT / chat
-- ---------------------------------------------------------------------------
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
  gambling_type text,
  time_spent numeric,
  money_spent numeric,
  money_won numeric,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);
alter table public.diary_entries add column if not exists gambling_type text;
alter table public.diary_entries add column if not exists time_spent numeric;
alter table public.diary_entries add column if not exists money_spent numeric;
alter table public.diary_entries add column if not exists money_won numeric;

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
  role text not null check (role in ('user', 'assistant')),
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists diary_entries_user_date_idx on public.diary_entries(user_id, date desc);
create index if not exists cbt_progress_user_completed_idx on public.cbt_progress(user_id, completed);
create index if not exists chat_history_user_created_idx on public.chat_history(user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Resources / events / groups
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Crisis / broadcasts / notifications
-- ---------------------------------------------------------------------------
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
  admin_notes text,
  message_context text,
  source text,
  keywords text[],
  created_at timestamptz not null default now()
);
alter table public.crisis_alerts add column if not exists admin_notes text;
alter table public.crisis_alerts add column if not exists message_context text;
alter table public.crisis_alerts add column if not exists source text;
alter table public.crisis_alerts add column if not exists keywords text[];

create index if not exists crisis_alerts_open_created_idx on public.crisis_alerts(resolved, created_at desc);

create table if not exists public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  audience text not null,
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  recipient_count integer,
  created_at timestamptz not null default now()
);
alter table public.broadcasts add column if not exists recipient_count integer;

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
create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);
create index if not exists notifications_user_unread_idx on public.notifications(user_id, read, created_at desc);

-- ---------------------------------------------------------------------------
-- Supporters / family portal
-- ---------------------------------------------------------------------------
create table if not exists public.supporter_invitations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  supporter_name text,
  supporter_email text,
  supporter_phone text,
  supporter_relation text,
  permissions jsonb not null default '[]'::jsonb,
  -- Only the hash is stored; the raw token is returned once at creation.
  token_hash text not null unique,
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
  sender text not null check (sender in ('user', 'supporter')),
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.supporter_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  invitation_id uuid not null references public.supporter_invitations(id) on delete cascade,
  felt_supported boolean not null,
  created_at timestamptz not null default now()
);

-- Databases created before token hashing already have this table with a
-- raw `token` column; create table if not exists skips them, so add the
-- hash column explicitly before anything references it.
alter table public.supporter_invitations add column if not exists token_hash text;

create index if not exists supporter_invitations_token_hash_idx on public.supporter_invitations(token_hash);

-- Migration path for databases created before token hashing: backfill the
-- hash from any legacy raw token column, then drop it. Idempotent.
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'supporter_invitations'
      and column_name = 'token'
  ) then
    execute $q$update public.supporter_invitations set token_hash = encode(extensions.digest(token,'sha256'),'hex') where token_hash is null$q$;
    execute 'alter table public.supporter_invitations drop column token';
  end if;
  -- Column is NOT NULL on fresh installs; enforce it for upgraded tables too.
  execute 'alter table public.supporter_invitations alter column token_hash set not null';
  if not exists (
    select 1 from pg_constraint
    where conname = 'supporter_invitations_token_hash_key'
      and conrelid = 'public.supporter_invitations'::regclass
  ) then
    execute 'alter table public.supporter_invitations add constraint supporter_invitations_token_hash_key unique (token_hash)';
  end if;
end $$;
create index if not exists supporter_invitations_user_status_idx on public.supporter_invitations(user_id, status);
create index if not exists supporter_messages_invitation_idx on public.supporter_messages(invitation_id, created_at);

-- ---------------------------------------------------------------------------
-- Circle (anonymous rooms)
-- ---------------------------------------------------------------------------
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

create table if not exists public.circle_message_authors (
  message_id uuid primary key references public.circle_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.circle_message_reactions (
  message_id uuid not null references public.circle_messages(id) on delete cascade,
  user_hash text not null,
  reaction text not null check (reaction in ('support','love','fire','heart','star')),
  primary key (message_id, user_hash, reaction)
);

create index if not exists circle_members_last_seen_idx on public.circle_room_members(room, last_seen desc);
create index if not exists circle_messages_room_created_idx on public.circle_messages(room, created_at desc);
create index if not exists circle_messages_expiry_idx on public.circle_messages(expires_at);

-- ---------------------------------------------------------------------------
-- Whispers (anonymous 1:1)
-- ---------------------------------------------------------------------------
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
  rejected_at timestamptz,
  rejected_by text,
  ended_at timestamptz,
  user1_feedback text,
  user2_feedback text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.whispers_matches add column if not exists rejected_at timestamptz;
alter table public.whispers_matches add column if not exists rejected_by text;
alter table public.whispers_matches add column if not exists ended_at timestamptz;
alter table public.whispers_matches add column if not exists user1_feedback text;
alter table public.whispers_matches add column if not exists user2_feedback text;

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

create table if not exists public.whispers_declines (
  match_id uuid not null references public.whispers_matches(id) on delete cascade,
  user_hash text not null,
  primary key (match_id, user_hash)
);

create index if not exists whispers_matches_hashes_idx on public.whispers_matches(user1_hash, user2_hash);
create index if not exists whispers_messages_match_created_idx on public.whispers_messages(match_id, created_at);

-- ---------------------------------------------------------------------------
-- Private media metadata
-- ---------------------------------------------------------------------------
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

create index if not exists mirror_recordings_owner_month_idx on public.mirror_recordings(user_id, month, created_at desc);
create index if not exists precious_pacts_owner_created_idx on public.precious_pacts(user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Business / admin tables
-- ---------------------------------------------------------------------------
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
  contact_email text,
  email text,
  phone text,
  status text not null default 'active',
  commission_rate numeric(8,4),
  commission_pct numeric(5,2) check (commission_pct is null or commission_pct between 0 and 100),
  coverage_types text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now()
);
alter table public.insurance_partners add column if not exists contact_email text;
alter table public.insurance_partners add column if not exists commission_pct numeric(5,2);
alter table public.insurance_partners add column if not exists coverage_types text[] not null default '{}';
update public.insurance_partners
set contact_email = email
where contact_email is null and email is not null;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'insurance_partners_commission_pct_range'
      and conrelid = 'public.insurance_partners'::regclass
  ) then
    alter table public.insurance_partners
      add constraint insurance_partners_commission_pct_range
      check (commission_pct is null or commission_pct between 0 and 100);
  end if;
end;
$$;

create table if not exists public.system_settings (
  key text primary key,
  value jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

-- audit_logs: final unified shape only.
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  target_table text,
  target_id text,
  metadata jsonb,
  created_at timestamptz default now()
);
alter table public.audit_logs add column if not exists actor_id uuid;
alter table public.audit_logs add column if not exists action text;
alter table public.audit_logs add column if not exists target_table text;
alter table public.audit_logs add column if not exists target_id text;
alter table public.audit_logs add column if not exists metadata jsonb;
alter table public.audit_logs add column if not exists created_at timestamptz default now();
create index if not exists audit_logs_created_idx on public.audit_logs(created_at desc);
create index if not exists audit_logs_actor_idx on public.audit_logs(actor_id, created_at desc);
create index if not exists audit_logs_target_idx on public.audit_logs(target_table, target_id);

create table if not exists public.upgrade_interest (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  email text,
  current_plan text,
  interested_plan text,
  created_at timestamptz not null default now()
);

create table if not exists public.company_code_validation_attempts (
  id uuid primary key default gen_random_uuid(),
  ip_hash text,
  attempted_at timestamptz not null default now()
);
alter table public.company_code_validation_attempts add column if not exists ip_hash text;
alter table public.company_code_validation_attempts add column if not exists actor_key text;
create index if not exists company_code_attempts_ip_time_idx
  on public.company_code_validation_attempts(ip_hash, attempted_at desc);
create index if not exists company_code_attempts_actor_time_idx
  on public.company_code_validation_attempts(actor_key, attempted_at desc);

create table if not exists public.account_deletion_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  step text not null,
  status text not null,
  error text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Base helper functions
-- ---------------------------------------------------------------------------
create or replace function public.current_user_role()
returns text
language sql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$ select p.role from public.profiles p where p.id = (select auth.uid()); $$;

create or replace function public.is_super_admin()
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'super_admin'
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('admin', 'super_admin')
  );
$$;

create or replace function public.is_active_user()
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select coalesce(
    (select p.status <> 'suspended'
       and not p.must_change_password
       from public.profiles p where p.id = (select auth.uid())),
    true
  );
$$;

create or replace function public.is_recently_authenticated()
returns boolean
language sql stable
set search_path = pg_catalog, auth
as $$
  select case
    when coalesce(auth.jwt()->>'iat', '') ~ '^[0-9]{1,12}$'
      then (auth.jwt()->>'iat')::bigint >= extract(epoch from now())::bigint - 900
    else false
  end;
$$;

revoke execute on function public.current_user_role() from public, anon;
revoke execute on function public.is_super_admin() from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_active_user() from public, anon;
revoke execute on function public.is_recently_authenticated() from public, anon;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.is_recently_authenticated() to authenticated;

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
  if not public.is_admin() or not public.is_recently_authenticated() then
    raise exception 'Recently authenticated administrator access required';
  end if;
  insert into public.audit_logs (actor_id, action, target_table, target_id, metadata)
  values ((select auth.uid()), left(p_action, 120), left(p_target_table, 120),
    left(p_target_id, 120), coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.log_admin_action(text, text, text, jsonb) from public, anon;
grant execute on function public.log_admin_action(text, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Triggers (user domain)
-- ---------------------------------------------------------------------------
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
  v_max_users integer;
  v_used integer;
  v_cname text;
begin
  v_username := nullif(btrim(coalesce(new.raw_user_meta_data->>'username', '')), '');
  if v_username is not null and exists (
    select 1 from public.profiles where username = v_username
  ) then
    v_username := null;
  end if;

  v_company_code := nullif(btrim(coalesce(new.raw_user_meta_data->>'company_code', '')), '');
  if v_company_code is not null then
    select id, max_users into v_client_id, v_max_users
    from public.b2b_clients
    where upper(company_code) = upper(v_company_code) and status = 'active'
    limit 1 for update;
    if v_client_id is not null and v_max_users is not null then
      select count(*) into v_used from public.profiles where b2b_client_id = v_client_id;
      if v_used >= v_max_users then
        raise exception 'No seats remaining for this company code';
      end if;
    end if;
  end if;

  -- Username uniqueness is enforced by a unique constraint; a concurrent
  -- signup can win the race after the exists-check above. On a username
  -- collision, retry once with a random suffix so both signups succeed.
  begin
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
  exception when unique_violation then
    get stacked diagnostics v_cname = constraint_name;
    if v_username is null or v_cname is null or v_cname not like '%username%' then
      raise;
    end if;
    v_username := left(v_username, 20) || '_' ||
      substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
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
  end;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.sync_profile_auth_contact()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  if new.phone is distinct from old.phone then
    update public.profiles set phone = new.phone where id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists sync_profile_auth_contact on auth.users;
create trigger sync_profile_auth_contact
  after update of email, phone on auth.users
  for each row execute function public.sync_profile_auth_contact();

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

  if new.id = (select auth.uid()) then
    if old.circle_user_hash is not null
       and old.circle_user_hash is distinct from new.circle_user_hash then
      raise exception 'circle_user_hash is immutable once set';
    end if;
    if old.role is distinct from new.role
      or old.status is distinct from new.status
      or old.is_super_admin is distinct from new.is_super_admin
      or old.must_change_password is distinct from new.must_change_password
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
      or old.streak_freeze_bridged_date is distinct from new.streak_freeze_bridged_date
      or old.ai_data_consent_at is distinct from new.ai_data_consent_at
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
      or old.streak_freeze_bridged_date is distinct from new.streak_freeze_bridged_date
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
      or old.is_super_admin is distinct from new.is_super_admin
      or old.must_change_password is distinct from new.must_change_password
      or old.ai_data_consent_at is distinct from new.ai_data_consent_at)
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

update public.profiles
set is_super_admin = (role = 'super_admin')
where is_super_admin is distinct from (role = 'super_admin');

create or replace function public.prevent_last_super_admin_removal()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
begin
  if tg_op = 'UPDATE' then
    if old.role = 'super_admin' and old.status = 'active'
       and (new.role is distinct from 'super_admin' or new.status is distinct from 'active') then
      perform pg_advisory_xact_lock(19830716, 1);
      select count(*) into v_count
      from public.profiles
      where role = 'super_admin' and status = 'active';
      if v_count <= 1 then
        raise exception 'Cannot remove or deactivate the last active super_admin';
      end if;
    end if;
    return new;
  end if;

  if old.role = 'super_admin' and old.status = 'active' then
    if old.id = (select auth.uid()) then
      raise exception 'A super_admin cannot delete their own account';
    end if;
    perform pg_advisory_xact_lock(19830716, 1);
    select count(*) into v_count
    from public.profiles
    where role = 'super_admin' and status = 'active';
    if v_count <= 1 then
      raise exception 'Cannot delete the last active super_admin';
    end if;
  end if;
  return old;
end;
$$;
drop trigger if exists prevent_last_super_admin_removal on public.profiles;
create trigger prevent_last_super_admin_removal
  before update of role, status or delete on public.profiles
  for each row execute function public.prevent_last_super_admin_removal();

create or replace function public.audit_profile_privileged_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    insert into public.audit_logs (actor_id, action, target_table, target_id, metadata)
    values ((select auth.uid()), 'profiles.delete', 'profiles', old.id::text,
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
    values ((select auth.uid()), 'profiles.privileged_update', 'profiles', new.id::text,
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
drop trigger if exists audit_profile_privileged_change on public.profiles;
create trigger audit_profile_privileged_change
  after update or delete on public.profiles
  for each row execute function public.audit_profile_privileged_change();

create or replace function public.prevent_direct_audit_writes()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception 'Audit log entries are immutable';
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
  if coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role' then
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
drop trigger if exists enforce_crisis_alert_privileges on public.crisis_alerts;
create trigger enforce_crisis_alert_privileges
  before insert or update on public.crisis_alerts
  for each row execute function public.enforce_crisis_alert_privileges();

-- Whispers identity immutability
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

-- Circle anonymity: scrub identity columns on insert; record real author
-- server-side from (select auth.uid()).
create or replace function public.circle_messages_scrub_identity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  new.user_id := null;
  new.mentioned_user_id := null;
  return new;
end;
$$;
drop trigger if exists circle_messages_scrub on public.circle_messages;
create trigger circle_messages_scrub before insert on public.circle_messages
  for each row execute function public.circle_messages_scrub_identity();

create or replace function public.circle_messages_record_author()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if (select auth.uid()) is not null then
    insert into public.circle_message_authors (message_id, user_id)
    values (new.id, (select auth.uid()))
    on conflict (message_id) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists circle_messages_author on public.circle_messages;
drop trigger if exists record_circle_message_author on public.circle_messages;
create trigger circle_messages_author after insert on public.circle_messages
  for each row execute function public.circle_messages_record_author();

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
    (select auth.uid()),
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

-- ---------------------------------------------------------------------------
-- Views (user domain)
-- ---------------------------------------------------------------------------
create or replace view public.admin_profiles_safe as
select
  id, full_name, username, role, status, risk_level,
  streak_days, plan_type, subscription_plan, subscription_status,
  created_at, last_active
from public.profiles
where public.is_admin();

create or replace view public.circle_messages_safe
with (security_invoker = true) as
select
  id, room, user_hash, display_name, avatar_animal, avatar_prefix,
  message, message_type, expires_at, reply_to_id, reply_to_name, created_at
from public.circle_messages;

-- ---------------------------------------------------------------------------
-- Seed data
-- ---------------------------------------------------------------------------
insert into public.badges (id, name, icon, description, points, category)
values
  ('first_entry', 'First Entry', 'entry', 'Logged your first diary entry', 10, 'engagement'),
  ('week_streak', '7-Day Streak', 'flame', '7 consecutive clean days', 50, 'learning'),
  ('month_streak', '30-Day Streak', 'star', '30 consecutive clean days', 150, 'learning'),
  ('diary_10', 'Diary Regular', 'book', '10 diary entries', 30, 'engagement'),
  ('diary_30', 'Diary Devoted', 'book', '30 diary entries', 80, 'engagement'),
  ('cbt_1', 'CBT Starter', 'brain', 'Completed 1 CBT module', 20, 'learning'),
  ('cbt_4', 'CBT Regular', 'brain', 'Completed 4 CBT modules', 60, 'learning'),
  ('cbt_all', 'CBT Complete', 'brain', 'Completed all CBT modules', 200, 'learning'),
  ('first_no', 'Clean Day', 'check', 'First clean day logged', 15, 'engagement'),
  ('trigger_master', 'Trigger Aware', 'target', 'Identified 5+ triggers', 40, 'learning'),
  ('saved_1000', 'Saver', 'coin', 'KSh 1,000 saved', 50, 'engagement'),
  ('saved_10000', 'Big Saver', 'coin', 'KSh 10,000 saved', 200, 'engagement')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Realtime publication
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
      execute 'alter publication supabase_realtime add table public.notifications';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'circle_messages') then
      execute 'alter publication supabase_realtime add table public.circle_messages';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'crisis_alerts') then
      execute 'alter publication supabase_realtime add table public.crisis_alerts';
    end if;
    -- audit_logs is deliberately NOT published: it is admin-only audit data
    -- with no client-side realtime consumer. Re-add only via a reviewed change.
    if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'audit_logs') then
      execute 'alter publication supabase_realtime drop table public.audit_logs';
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Storage buckets (final MIME types)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', false, 5242880, array['image/jpeg','image/png','image/webp']),
  ('mirror-recordings', 'mirror-recordings', false, 104857600, array['video/webm','video/mp4','audio/webm','audio/mp4']),
  ('precious-pacts', 'precious-pacts', false, 104857600, array['audio/webm','audio/mp4','audio/ogg','audio/x-m4a']),
  ('therapist-documents', 'therapist-documents', false, 5242880, array['application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Default privileges: new tables get no anon access.
alter default privileges in schema public revoke all on tables from anon;

notify pgrst, 'reload schema';

-- ===== Absorbed: 20261112000002_rls_storage_grants.sql =====

-- 02_rls_storage_grants.sql — LossLens consolidated RLS/grants/storage (part 2/8)
-- Consolidated from: 20261110000002_rls_grants_storage.sql
-- Depends on 01.

-- ============================================================================
-- 20261110000002_rls_grants_storage.sql — LossLens RLS, grants, storage (consolidated)
-- ============================================================================
-- Final policy set (every drop policy immediately before its create), table
-- grants/revokes, default privileges and storage.objects policies.
-- Depends on 20261110000001_core_schema.sql and
-- 20261110000004_portals_claims.sql objects existing.
-- Idempotent: safe to apply twice.
-- ============================================================================

-- Enable RLS on every application table.
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','badges','diary_entries','cbt_progress','chat_history','notifications',
    'crisis_alerts','resources','resource_ratings','resource_suggestions',
    'events','event_rsvps','event_messages','event_discussions','groups',
    'broadcasts','supporter_invitations','supporter_messages','supporter_feedback',
    'circle_room_members','circle_messages','circle_message_authors','circle_message_reactions',
    'whispers_matches','whispers_messages','whispers_reports','whispers_declines',
    'mirror_recordings','precious_pacts','b2b_clients','grant_applications',
    'insurance_partners','system_settings','audit_logs','upgrade_interest',
    'company_code_validation_attempts','account_deletion_log'
    -- Portal/claims tables (therapists, provider_vouchers, provider_claims,
    -- provider_payouts, insurers, insurer_partnerships, claim_submissions,
    -- bulk_invoices, bulk_invoice_claims, claims_float,
    -- claims_float_transactions, pre_auth_vouchers) are created in script 04,
    -- which enables RLS on each of them. Do NOT reference them here.
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Restrictive suspension gate on user-data tables.
do $$
declare t text;
begin
  foreach t in array array[
    'diary_entries','cbt_progress','chat_history',
    'circle_messages','circle_room_members','circle_message_reactions',
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

-- A former member promoted to staff must not retain direct RLS access to
-- member recovery content. The restrictive policies preserve owner scoping
-- while requiring the live profiles.role value to remain 'user'.
do $$
declare t text;
begin
  foreach t in array array[
    'diary_entries','cbt_progress','chat_history',
    'mirror_recordings','precious_pacts'
  ] loop
    execute format('drop policy if exists losslens_recovery_role_user on public.%I', t);
    execute format(
      'create policy losslens_recovery_role_user on public.%I as restrictive for all to authenticated '
      'using (public.current_user_role() = ''user'') with check (public.current_user_role() = ''user'')',
      t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
drop policy if exists lossless_profiles_self_select on public.profiles;
create policy lossless_profiles_self_select on public.profiles for select to authenticated
  using (id = (select auth.uid()));
drop policy if exists losslens_profiles_super_admin_select on public.profiles;
create policy losslens_profiles_super_admin_select on public.profiles
  for select to authenticated using (public.is_super_admin());
drop policy if exists lossless_profiles_self_update on public.profiles;
create policy lossless_profiles_self_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
drop policy if exists lossless_profiles_admin_update on public.profiles;
drop policy if exists lossless_profiles_super_admin_delete on public.profiles;
create policy lossless_profiles_super_admin_delete on public.profiles for delete to authenticated
  using (public.is_super_admin() and id <> (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Owner-only recovery data
-- ---------------------------------------------------------------------------
drop policy if exists lossless_diary_owner_all on public.diary_entries;
create policy lossless_diary_owner_all on public.diary_entries for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists lossless_cbt_owner_all on public.cbt_progress;
create policy lossless_cbt_owner_all on public.cbt_progress for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists lossless_chat_owner_all on public.chat_history;
create policy lossless_chat_owner_all on public.chat_history for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists lossless_notifications_owner_all on public.notifications;
create policy lossless_notifications_owner_all on public.notifications for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Public catalogues
-- ---------------------------------------------------------------------------
drop policy if exists lossless_resources_public_select on public.resources;
create policy lossless_resources_public_select on public.resources for select to anon, authenticated
  using (active = true);
drop policy if exists admin_select_any_resources on public.resources;
create policy admin_select_any_resources on public.resources for select to authenticated
  using (public.is_admin());
drop policy if exists lossless_resources_admin_insert on public.resources;
create policy lossless_resources_admin_insert on public.resources for insert to authenticated
  with check (public.is_admin());
drop policy if exists lossless_resources_admin_update on public.resources;
create policy lossless_resources_admin_update on public.resources for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists lossless_resources_admin_delete on public.resources;
create policy lossless_resources_admin_delete on public.resources for delete to authenticated
  using (public.is_admin());

drop policy if exists lossless_groups_public_select on public.groups;
create policy lossless_groups_public_select on public.groups for select to authenticated
  using (active = true);
drop policy if exists lossless_groups_anon_public_select on public.groups;
create policy lossless_groups_anon_public_select on public.groups for select to anon
  using (active = true);
drop policy if exists admin_select_any_groups on public.groups;
create policy admin_select_any_groups on public.groups for select to authenticated
  using (public.is_admin());
drop policy if exists lossless_groups_admin_insert on public.groups;
create policy lossless_groups_admin_insert on public.groups for insert to authenticated
  with check (public.is_admin());
drop policy if exists lossless_groups_admin_update on public.groups;
create policy lossless_groups_admin_update on public.groups for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists lossless_groups_admin_delete on public.groups;
create policy lossless_groups_admin_delete on public.groups for delete to authenticated
  using (public.is_admin());

drop policy if exists lossless_events_public_select on public.events;
create policy lossless_events_public_select on public.events for select to anon, authenticated
  using (active = true);
drop policy if exists admin_select_any_events on public.events;
create policy admin_select_any_events on public.events for select to authenticated
  using (public.is_admin());
drop policy if exists lossless_events_admin_insert on public.events;
create policy lossless_events_admin_insert on public.events for insert to authenticated
  with check (public.is_admin());
drop policy if exists lossless_events_admin_update on public.events;
create policy lossless_events_admin_update on public.events for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists lossless_events_admin_delete on public.events;
create policy lossless_events_admin_delete on public.events for delete to authenticated
  using (public.is_admin());

drop policy if exists lossless_badges_public_select on public.badges;
create policy lossless_badges_public_select on public.badges for select to anon, authenticated using (true);
drop policy if exists lossless_badges_admin_insert on public.badges;
create policy lossless_badges_admin_insert on public.badges for insert to authenticated with check (public.is_admin());
drop policy if exists lossless_badges_admin_update on public.badges;
create policy lossless_badges_admin_update on public.badges for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists lossless_badges_admin_delete on public.badges;
create policy lossless_badges_admin_delete on public.badges for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Event participation / discussions / messages
-- ---------------------------------------------------------------------------
drop policy if exists lossless_rsvps_owner_all on public.event_rsvps;
create policy lossless_rsvps_owner_all on public.event_rsvps for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists lossless_event_rsvps_owner_update_v2 on public.event_rsvps;
create policy lossless_event_rsvps_owner_update_v2 on public.event_rsvps for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists lossless_event_rsvps_owner_delete_v2 on public.event_rsvps;
create policy lossless_event_rsvps_owner_delete_v2 on public.event_rsvps for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists lossless_event_discussions_select on public.event_discussions;
create policy lossless_event_discussions_select on public.event_discussions
  for select to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.active = true));
drop policy if exists lossless_event_discussions_insert on public.event_discussions;
create policy lossless_event_discussions_insert on public.event_discussions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and is_admin_reply = false
    and exists (select 1 from public.events e where e.id = event_id and e.active = true)
  );
drop policy if exists lossless_event_discussions_admin_insert on public.event_discussions;
create policy lossless_event_discussions_admin_insert on public.event_discussions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and is_admin()
    and is_admin_reply = true
    and exists (select 1 from public.events e where e.id = event_id and e.active = true)
  );
drop policy if exists lossless_event_discussions_admin_delete on public.event_discussions;
create policy lossless_event_discussions_admin_delete on public.event_discussions for delete to authenticated
  using (public.is_admin());

drop policy if exists lossless_event_messages_owner_select on public.event_messages;
create policy lossless_event_messages_owner_select on public.event_messages for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists lossless_event_messages_owner_insert on public.event_messages;
create policy lossless_event_messages_owner_insert on public.event_messages for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists lossless_event_messages_admin_select on public.event_messages;
create policy lossless_event_messages_admin_select on public.event_messages for select to authenticated
  using (public.is_admin());
drop policy if exists lossless_event_messages_admin_update on public.event_messages;
create policy lossless_event_messages_admin_update on public.event_messages for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists lossless_event_messages_admin_delete on public.event_messages;
create policy lossless_event_messages_admin_delete on public.event_messages for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Ratings / suggestions
-- ---------------------------------------------------------------------------
drop policy if exists lossless_resource_ratings_owner_all on public.resource_ratings;
create policy lossless_resource_ratings_owner_all on public.resource_ratings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists lossless_resource_suggestions_owner_insert on public.resource_suggestions;
create policy lossless_resource_suggestions_owner_insert on public.resource_suggestions for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists lossless_resource_suggestions_admin_select on public.resource_suggestions;
create policy lossless_resource_suggestions_admin_select on public.resource_suggestions for select to authenticated
  using (public.is_admin());
drop policy if exists lossless_resource_suggestions_admin_update on public.resource_suggestions;
create policy lossless_resource_suggestions_admin_update on public.resource_suggestions for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists lossless_resource_suggestions_admin_delete on public.resource_suggestions;
create policy lossless_resource_suggestions_admin_delete on public.resource_suggestions for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Supporters
-- ---------------------------------------------------------------------------
drop policy if exists lossless_invitations_owner_all on public.supporter_invitations;
create policy lossless_invitations_owner_all on public.supporter_invitations for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists lossless_supporter_messages_owner_select on public.supporter_messages;
create policy lossless_supporter_messages_owner_select on public.supporter_messages for select to authenticated
  using (exists (
    select 1 from public.supporter_invitations i
    where i.id = invitation_id and i.user_id = (select auth.uid())
  ));
drop policy if exists lossless_supporter_messages_owner_insert on public.supporter_messages;
create policy lossless_supporter_messages_owner_insert on public.supporter_messages for insert to authenticated
  with check (sender = 'user' and exists (
    select 1 from public.supporter_invitations i
    where i.id = invitation_id and i.user_id = (select auth.uid())
  ));
drop policy if exists lossless_supporter_feedback_owner_insert on public.supporter_feedback;
create policy lossless_supporter_feedback_owner_insert on public.supporter_feedback for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.supporter_invitations i
      where i.id = invitation_id and i.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Circle membership and messages
-- ---------------------------------------------------------------------------
drop policy if exists lossless_circle_members_owner_select on public.circle_room_members;
create policy lossless_circle_members_owner_select on public.circle_room_members for select to authenticated
  using (user_hash = (select p.circle_user_hash from public.profiles p where p.id = (select auth.uid())));
drop policy if exists lossless_circle_members_owner_insert on public.circle_room_members;
create policy lossless_circle_members_owner_insert on public.circle_room_members for insert to authenticated
  with check (user_hash = (select p.circle_user_hash from public.profiles p where p.id = (select auth.uid())));
drop policy if exists lossless_circle_members_owner_delete on public.circle_room_members;
create policy lossless_circle_members_owner_delete on public.circle_room_members for delete to authenticated
  using (user_hash = (select p.circle_user_hash from public.profiles p where p.id = (select auth.uid())));
drop policy if exists lossless_circle_members_owner_update_v2 on public.circle_room_members;
create policy lossless_circle_members_owner_update_v2 on public.circle_room_members for update to authenticated
  using (user_hash = (select p.circle_user_hash from public.profiles p where p.id = (select auth.uid())))
  with check (user_hash = (select p.circle_user_hash from public.profiles p where p.id = (select auth.uid())));

drop policy if exists lossless_circle_messages_member_select on public.circle_messages;
create policy lossless_circle_messages_member_select on public.circle_messages for select to authenticated
  using (
    (expires_at is null or expires_at > now())
    and exists (
      select 1 from public.circle_room_members m
      join public.profiles p on p.id = (select auth.uid())
      where m.room = circle_messages.room and m.user_hash = p.circle_user_hash
    )
  );
drop policy if exists lossless_circle_messages_owner_select_v2 on public.circle_messages;
create policy lossless_circle_messages_owner_select_v2 on public.circle_messages for select to authenticated
  using (
    (expires_at is null or expires_at > now())
    and (
      user_hash = (select p.circle_user_hash from public.profiles p where p.id = (select auth.uid()))
      or exists (
        select 1 from public.circle_room_members m
        join public.profiles p on p.id = (select auth.uid())
        where m.room = circle_messages.room and m.user_hash = p.circle_user_hash
      )
    )
  );
drop policy if exists lossless_circle_messages_member_insert on public.circle_messages;
create policy lossless_circle_messages_member_insert on public.circle_messages for insert to authenticated
  with check (
    user_hash = (select p.circle_user_hash from public.profiles p where p.id = (select auth.uid()))
    and user_id is null
    and mentioned_user_id is null
    and exists (
      select 1 from public.circle_room_members m
      where m.room = circle_messages.room
        and m.user_hash = (select p.circle_user_hash from public.profiles p where p.id = (select auth.uid()))
    )
  );
drop policy if exists lossless_circle_messages_owner_update on public.circle_messages;
create policy lossless_circle_messages_owner_update on public.circle_messages for update to authenticated
  using (user_hash = (select circle_user_hash from public.profiles where id = (select auth.uid())))
  with check (user_hash = (select circle_user_hash from public.profiles where id = (select auth.uid())));
drop policy if exists lossless_circle_messages_owner_delete on public.circle_messages;
create policy lossless_circle_messages_owner_delete on public.circle_messages for delete to authenticated
  using (
    user_hash = (select p.circle_user_hash from public.profiles p where p.id = (select auth.uid()))
    or public.is_admin()
  );

drop policy if exists losslens_circle_authors_admin_select on public.circle_message_authors;
create policy losslens_circle_authors_admin_select on public.circle_message_authors
  for select to authenticated using (public.is_admin());

drop policy if exists circle_reactions_member_select on public.circle_message_reactions;
create policy circle_reactions_member_select on public.circle_message_reactions
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Whispers
-- ---------------------------------------------------------------------------
drop policy if exists lossless_whispers_match_participant_select on public.whispers_matches;
create policy lossless_whispers_match_participant_select on public.whispers_matches for select to authenticated
  using (
    user1_hash = (select p.circle_user_hash from public.profiles p where p.id = (select auth.uid()))
    or user2_hash = (select p.circle_user_hash from public.profiles p where p.id = (select auth.uid()))
  );
drop policy if exists lossless_whispers_match_insert_v2 on public.whispers_matches;
create policy lossless_whispers_match_insert_v2 on public.whispers_matches for insert to authenticated
  with check (
    user1_hash = (select p.circle_user_hash from public.profiles p where p.id = (select auth.uid()))
    or user2_hash = (select p.circle_user_hash from public.profiles p where p.id = (select auth.uid()))
  );
drop policy if exists lossless_whispers_match_participant_delete on public.whispers_matches;
create policy lossless_whispers_match_participant_delete on public.whispers_matches for delete to authenticated
  using (
    user1_hash = (select p.circle_user_hash from public.profiles p where p.id = (select auth.uid()))
    or user2_hash = (select p.circle_user_hash from public.profiles p where p.id = (select auth.uid()))
  );

drop policy if exists lossless_whispers_message_participant_select on public.whispers_messages;
create policy lossless_whispers_message_participant_select on public.whispers_messages for select to authenticated
  using (exists (
    select 1 from public.whispers_matches wm
    join public.profiles p on p.id = (select auth.uid())
    where wm.id = whispers_messages.match_id
      and (wm.user1_hash = p.circle_user_hash or wm.user2_hash = p.circle_user_hash)
  ));
drop policy if exists lossless_whispers_message_participant_insert on public.whispers_messages;
create policy lossless_whispers_message_participant_insert on public.whispers_messages
  for insert to authenticated
  with check (
    sender_hash = (select p.circle_user_hash from public.profiles p where p.id = (select auth.uid()))
    and exists (
      select 1 from public.whispers_matches wm
      join public.profiles p on p.id = (select auth.uid())
      where wm.id = whispers_messages.match_id
        and wm.status = 'active'
        and (wm.user1_hash = p.circle_user_hash or wm.user2_hash = p.circle_user_hash)
    )
  );
drop policy if exists lossless_whispers_message_update_v2 on public.whispers_messages;
drop policy if exists lossless_whispers_message_sender_update on public.whispers_messages;
drop policy if exists lossless_whispers_message_sender_delete on public.whispers_messages;
create policy lossless_whispers_message_sender_delete on public.whispers_messages for delete to authenticated
  using (sender_hash = (select p.circle_user_hash from public.profiles p where p.id = (select auth.uid())));

drop policy if exists lossless_whispers_report_owner_insert on public.whispers_reports;
create policy lossless_whispers_report_owner_insert on public.whispers_reports for insert to authenticated
  with check (
    reporter_hash = (select p.circle_user_hash from public.profiles p where p.id = (select auth.uid()))
    and exists (
      select 1 from public.whispers_matches wm
      join public.profiles p on p.id = (select auth.uid())
      where wm.id = whispers_reports.match_id
        and (wm.user1_hash = p.circle_user_hash or wm.user2_hash = p.circle_user_hash)
    )
    and (
      whispers_reports.message_id is null
      or exists (
        select 1 from public.whispers_messages wm
        where wm.id = whispers_reports.message_id
          and wm.match_id = whispers_reports.match_id
      )
    )
  );
drop policy if exists lossless_whispers_report_admin_select on public.whispers_reports;
create policy lossless_whispers_report_admin_select on public.whispers_reports for select to authenticated using (public.is_admin());
drop policy if exists lossless_whispers_report_admin_update on public.whispers_reports;
create policy lossless_whispers_report_admin_update on public.whispers_reports for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists lossless_whispers_report_admin_delete on public.whispers_reports;
create policy lossless_whispers_report_admin_delete on public.whispers_reports for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Private media (owner-only)
-- ---------------------------------------------------------------------------
drop policy if exists lossless_mirror_owner_select on public.mirror_recordings;
create policy lossless_mirror_owner_select on public.mirror_recordings for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists lossless_mirror_owner_insert on public.mirror_recordings;
create policy lossless_mirror_owner_insert on public.mirror_recordings for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists lossless_mirror_owner_insert_v2 on public.mirror_recordings;
create policy lossless_mirror_owner_insert_v2 on public.mirror_recordings for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists lossless_mirror_owner_update on public.mirror_recordings;
create policy lossless_mirror_owner_update on public.mirror_recordings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists lossless_mirror_owner_delete on public.mirror_recordings;
create policy lossless_mirror_owner_delete on public.mirror_recordings for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists lossless_pact_owner_select on public.precious_pacts;
create policy lossless_pact_owner_select on public.precious_pacts for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists lossless_pact_owner_insert on public.precious_pacts;
create policy lossless_pact_owner_insert on public.precious_pacts for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists lossless_pact_owner_insert_v2 on public.precious_pacts;
create policy lossless_pact_owner_insert_v2 on public.precious_pacts for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists lossless_pact_owner_update on public.precious_pacts;
create policy lossless_pact_owner_update on public.precious_pacts for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists lossless_pact_owner_delete on public.precious_pacts;
create policy lossless_pact_owner_delete on public.precious_pacts for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Crisis / broadcasts / business / audit
-- ---------------------------------------------------------------------------
drop policy if exists lossless_crisis_user_insert on public.crisis_alerts;
drop policy if exists lossless_crisis_admin_select on public.crisis_alerts;
create policy lossless_crisis_admin_select on public.crisis_alerts for select to authenticated using (public.is_admin());
drop policy if exists lossless_crisis_admin_update on public.crisis_alerts;
create policy lossless_crisis_admin_update on public.crisis_alerts for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists lossless_broadcasts_public_select on public.broadcasts;
drop policy if exists broadcasts_anon_select on public.broadcasts;
drop policy if exists losslens_broadcasts_authenticated_select on public.broadcasts;
create policy losslens_broadcasts_authenticated_select on public.broadcasts
  for select to authenticated using (sent_at is not null and sent_at <= now());
drop policy if exists lossless_broadcasts_admin_select on public.broadcasts;
create policy lossless_broadcasts_admin_select on public.broadcasts for select to authenticated
  using (public.is_admin());
drop policy if exists lossless_broadcasts_admin_insert on public.broadcasts;
create policy lossless_broadcasts_admin_insert on public.broadcasts for insert to authenticated
  with check (public.is_admin() and created_by = (select auth.uid()));
drop policy if exists lossless_broadcasts_admin_update on public.broadcasts;
create policy lossless_broadcasts_admin_update on public.broadcasts for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists lossless_broadcasts_admin_delete on public.broadcasts;
create policy lossless_broadcasts_admin_delete on public.broadcasts for delete to authenticated using (public.is_admin());

drop policy if exists lossless_b2b_super_admin_all on public.b2b_clients;
create policy lossless_b2b_super_admin_all on public.b2b_clients for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists "Super admins can view B2B clients" on public.b2b_clients;
create policy "Super admins can view B2B clients" on public.b2b_clients for select to authenticated
  using (exists (select 1 from public.profiles where profiles.id = (select auth.uid()) and profiles.is_super_admin = true));

drop policy if exists lossless_grants_super_admin_all on public.grant_applications;
create policy lossless_grants_super_admin_all on public.grant_applications for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists "Super admins can view grant applications" on public.grant_applications;
create policy "Super admins can view grant applications" on public.grant_applications for select to authenticated
  using (exists (select 1 from public.profiles where profiles.id = (select auth.uid()) and profiles.is_super_admin = true));

drop policy if exists lossless_insurance_super_admin_all on public.insurance_partners;
create policy lossless_insurance_super_admin_all on public.insurance_partners for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists "Super admins can view insurance partners" on public.insurance_partners;
create policy "Super admins can view insurance partners" on public.insurance_partners for select to authenticated
  using (exists (select 1 from public.profiles where profiles.id = (select auth.uid()) and profiles.is_super_admin = true));

drop policy if exists lossless_settings_super_admin_all on public.system_settings;
create policy lossless_settings_super_admin_all on public.system_settings for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists lossless_audit_super_admin_select on public.audit_logs;
create policy lossless_audit_super_admin_select on public.audit_logs for select to authenticated
  using (public.is_super_admin());
drop policy if exists "Super admins can read audit logs" on public.audit_logs;
create policy "Super admins can read audit logs" on public.audit_logs for select
  using (exists (select 1 from public.profiles where profiles.id = (select auth.uid()) and profiles.is_super_admin = true));

drop policy if exists lossless_upgrade_owner_insert on public.upgrade_interest;
create policy lossless_upgrade_owner_insert on public.upgrade_interest for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists upgrade_interest_super_admin_select on public.upgrade_interest;
create policy upgrade_interest_super_admin_select on public.upgrade_interest for select
  using (public.is_super_admin());

-- Service-only tables: no client policies at all (RLS denies everything).
alter table public.company_code_validation_attempts enable row level security;
alter table public.account_deletion_log enable row level security;
drop policy if exists account_deletion_log_service_only on public.account_deletion_log;
create policy account_deletion_log_service_only on public.account_deletion_log
  for all to authenticated, anon using (false) with check (false);

-- NOTE: portal/claims tables (therapists, insurers, vouchers, claims, invoices,
-- float) are created in 20261110000004_portals_claims.sql and carry their own
-- RLS/grants there — they intentionally do not appear in this file.

-- ---------------------------------------------------------------------------
-- Table grants
-- ---------------------------------------------------------------------------
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
  public.precious_pacts, public.crisis_alerts, public.upgrade_interest,
  public.resources, public.groups, public.badges, public.broadcasts,
  public.b2b_clients, public.grant_applications, public.insurance_partners,
  public.system_settings
  to authenticated;

revoke insert, update, delete on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;

revoke all on public.circle_message_authors from anon;
grant select on public.circle_message_authors to authenticated;

-- audit_logs actor FK (NOT VALID then validate; idempotent via constraint check)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'audit_logs_actor_id_fkey'
      and conrelid = 'public.audit_logs'::regclass
  ) then
    alter table public.audit_logs
      add constraint audit_logs_actor_id_fkey
      foreign key (actor_id) references public.profiles(id) on delete set null
      not valid;
    alter table public.audit_logs validate constraint audit_logs_actor_id_fkey;
  end if;
end $$;

revoke all on public.circle_message_authors from anon;
grant select on public.circle_message_authors to authenticated;
revoke all on public.circle_message_reactions from anon;
grant select on public.circle_message_reactions to authenticated;
revoke all on public.whispers_declines from anon, authenticated;
revoke all on public.company_code_validation_attempts from anon, authenticated;
revoke all on public.account_deletion_log from anon, authenticated;
grant all on public.account_deletion_log to service_role;
revoke all on public.admin_profiles_safe from anon;
grant select on public.admin_profiles_safe to authenticated;
revoke all on public.circle_messages_safe from anon;
grant select on public.circle_messages_safe to authenticated;
-- NOTE: grants for therapists_public and insurer_aggregate_stats live in
-- 20261110000004_portals_claims.sql (views are created there).

-- ---------------------------------------------------------------------------
-- Storage policies (storage.objects)
-- ---------------------------------------------------------------------------

-- Event images: public-read bucket; only admins may write objects.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-images', 'event-images', true, 5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "event-images public read" on storage.objects;
create policy "event-images public read" on storage.objects for select
  using (bucket_id = 'event-images');
drop policy if exists "event-images admin write" on storage.objects;
create policy "event-images admin write" on storage.objects for insert to authenticated
  with check (bucket_id = 'event-images' and public.is_super_admin());
drop policy if exists "event-images admin update" on storage.objects;
create policy "event-images admin update" on storage.objects for update to authenticated
  using (bucket_id = 'event-images' and public.is_super_admin())
  with check (bucket_id = 'event-images' and public.is_super_admin());
drop policy if exists "event-images admin delete" on storage.objects;
create policy "event-images admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'event-images' and public.is_super_admin());

-- Per-user storage quota (500 MB across all buckets). Checked inside the
-- user-writable bucket INSERT policies below.
create or replace function public.storage_user_quota_ok()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce((
    select sum(coalesce((o.metadata->>'size')::bigint, 0))
    from storage.objects o
    where o.owner = (select auth.uid())
  ), 0) < 524288000;
$$;
revoke execute on function public.storage_user_quota_ok() from public, anon;
grant execute on function public.storage_user_quota_ok() to authenticated;
drop policy if exists "avatar owner read" on storage.objects;
drop policy if exists "avatars public select" on storage.objects;
drop policy if exists "avatar owner select" on storage.objects;
create policy "avatar owner select" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "avatar owner insert" on storage.objects;
create policy "avatar owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text and public.storage_user_quota_ok());
drop policy if exists "avatar owner update" on storage.objects;
create policy "avatar owner update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "avatar owner delete" on storage.objects;
create policy "avatar owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "mirror read" on storage.objects;
create policy "mirror read" on storage.objects for select to authenticated
  using (bucket_id = 'mirror-recordings' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "mirror write" on storage.objects;
create policy "mirror write" on storage.objects for insert to authenticated
  with check (bucket_id = 'mirror-recordings' and (storage.foldername(name))[1] = (select auth.uid())::text and public.storage_user_quota_ok());
drop policy if exists "mirror update" on storage.objects;
create policy "mirror update" on storage.objects for update to authenticated
  using (bucket_id = 'mirror-recordings' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'mirror-recordings' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "mirror delete" on storage.objects;
create policy "mirror delete" on storage.objects for delete to authenticated
  using (bucket_id = 'mirror-recordings' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "pact read" on storage.objects;
create policy "pact read" on storage.objects for select to authenticated
  using (bucket_id = 'precious-pacts' and ((storage.foldername(name))[1] = (select auth.uid())::text));
drop policy if exists "pact write" on storage.objects;
create policy "pact write" on storage.objects for insert to authenticated
  with check (bucket_id = 'precious-pacts' and (storage.foldername(name))[1] = (select auth.uid())::text and public.storage_user_quota_ok());
drop policy if exists "pact update" on storage.objects;
create policy "pact update" on storage.objects for update to authenticated
  using (bucket_id = 'precious-pacts' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'precious-pacts' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "pact delete" on storage.objects;
create policy "pact delete" on storage.objects for delete to authenticated
  using (bucket_id = 'precious-pacts' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists therapist_documents_read on storage.objects;
create policy therapist_documents_read on storage.objects for select to authenticated
  using (bucket_id = 'therapist-documents'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_super_admin()));
drop policy if exists therapist_documents_insert on storage.objects;
create policy therapist_documents_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'therapist-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.storage_user_quota_ok());
drop policy if exists therapist_documents_update on storage.objects;
create policy therapist_documents_update on storage.objects for update to authenticated
  using (bucket_id = 'therapist-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'therapist-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists therapist_documents_delete on storage.objects;
create policy therapist_documents_delete on storage.objects for delete to authenticated
  using (bucket_id = 'therapist-documents'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_super_admin()));

notify pgrst, 'reload schema';

-- ===== Absorbed: 20261112000003_rpc_functions.sql =====

-- 03_rpc_functions.sql — LossLens consolidated core RPCs (part 3/8)
-- Consolidated from: 20261110000003_rpc_functions.sql
-- Depends on 01-02.

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
  v_uid uuid := (select auth.uid());
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
  select p.circle_user_hash from public.profiles p where p.id = (select auth.uid());
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
  v_caller uuid := (select auth.uid());
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
  v_attempts integer;
  v_key text := 'sup:' || encode(extensions.digest(coalesce(p_token, ''),'sha256'),'hex');
begin
  -- Failed-lookup throttle: tokens are secrets, so only their hash is stored.
  -- >30 lookups per token per hour returns the same null as a bad token.
  delete from public.company_code_validation_attempts
  where actor_key = v_key and attempted_at < now() - interval '1 hour';
  insert into public.company_code_validation_attempts(actor_key) values (v_key);
  select count(*) into v_attempts from public.company_code_validation_attempts
  where actor_key = v_key and attempted_at >= now() - interval '1 hour';
  if v_attempts > 30 then
    return null;
  end if;

  select * into v_inv from public.supporter_invitations
  where token_hash = encode(extensions.digest(p_token,'sha256'),'hex') limit 1;
  -- Uniform response: unknown, expired and revoked tokens are
  -- indistinguishable to the caller.
  if not found
     or v_inv.status = 'revoked'
     or (v_inv.expires_at is not null and v_inv.expires_at <= now()) then
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
    'status', v_inv.status,
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
  where token_hash = encode(extensions.digest(p_token,'sha256'),'hex') for update;
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

-- Supporter-initiated end of an ACTIVE relationship. Distinct from
-- supporter_respond (which only handles pending invitations): revocation is
-- permanent and cannot be undone by either party — a new invitation is
-- required to reconnect.
create or replace function public.supporter_leave(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_inv public.supporter_invitations;
begin
  select * into v_inv from public.supporter_invitations
  where token_hash = encode(extensions.digest(p_token,'sha256'),'hex') for update;
  if not found or v_inv.status <> 'active'
     or (v_inv.expires_at is not null and v_inv.expires_at <= now()) then
    -- Uniform response: do not reveal whether the token exists.
    return jsonb_build_object('left', false);
  end if;
  update public.supporter_invitations
  set status = 'revoked', responded_at = now()
  where id = v_inv.id;
  return jsonb_build_object('left', true);
end;
$$;
revoke execute on function public.supporter_leave(text) from public;
grant execute on function public.supporter_leave(text) to anon, authenticated;

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
  where token_hash = encode(extensions.digest(p_token,'sha256'),'hex');
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
  where token_hash = encode(extensions.digest(p_token,'sha256'),'hex');
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
  where token_hash = encode(extensions.digest(p_token,'sha256'),'hex');
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
  v_uid uuid := (select auth.uid());
  v_count int;
  v_inv public.supporter_invitations;
  v_raw_token text := encode(extensions.gen_random_bytes(24), 'hex');
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

  -- Only the hash is persisted; the raw token is returned once so the owner
  -- can build the invite link. It is never stored or logged.
  insert into public.supporter_invitations (
    user_id, supporter_name, supporter_email, supporter_phone, supporter_relation,
    permissions, anonymous_mode, crisis_contact, token_hash, status, expires_at
  ) values (
    v_uid, btrim(p_supporter_name), nullif(btrim(coalesce(p_supporter_email,'')), ''),
    nullif(btrim(coalesce(p_supporter_phone,'')), ''), nullif(btrim(coalesce(p_supporter_relation,'')), ''),
    coalesce(p_permissions, '[]'::jsonb), coalesce(p_anonymous_mode, false),
    coalesce(p_crisis_contact, false),
    encode(extensions.digest(v_raw_token,'sha256'),'hex'),
    'pending', now() + interval '30 days'
  ) returning * into v_inv;

  return to_jsonb(v_inv) || jsonb_build_object('token', v_raw_token);
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
  if (select auth.uid()) is null or not public.is_active_user() then
    raise exception 'Active sign-in required';
  end if;
  select coalesce(jsonb_agg(to_jsonb(i) order by i.created_at desc), '[]'::jsonb)
  into v_result
  from public.supporter_invitations i
  where i.user_id = (select auth.uid());
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
  v_new_token text;
begin
  if (select auth.uid()) is null or not public.is_active_user() then
    raise exception 'Active sign-in required';
  end if;
  select * into v_inv from public.supporter_invitations
  where id = p_invitation_id and user_id = (select auth.uid())
  for update;
  if not found then raise exception 'Invitation not found'; end if;

  if p_action = 'remove' then
    -- Revoke rather than delete: keeps an audit record and every supporter
    -- RPC already requires status = 'active', so access ends immediately.
    update public.supporter_invitations set status = 'revoked' where id = v_inv.id returning * into v_inv;
    return to_jsonb(v_inv) || jsonb_build_object('revoked', true);
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
    -- A revoked relationship can never be reactivated; a new invitation is
    -- required instead.
    if v_inv.status = 'revoked' then raise exception 'Revoked invitations cannot be renewed'; end if;
    -- Rotate the token on renew so an old link cannot be reused. Only the
    -- hash is stored; the new raw token is returned once to the owner.
    v_new_token := encode(extensions.gen_random_bytes(24), 'hex');
    update public.supporter_invitations
    set expires_at = now() + interval '7 days', status = 'pending', responded_at = null,
        token_hash = encode(extensions.digest(v_new_token,'sha256'),'hex')
    where id = v_inv.id returning * into v_inv;
  else
    raise exception 'Unsupported invitation action';
  end if;
  return to_jsonb(v_inv)
    || case when v_new_token is not null
            then jsonb_build_object('token', v_new_token)
            else '{}'::jsonb end;
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
  if (select auth.uid()) is null or not public.is_active_user() then
    raise exception 'Active sign-in required';
  end if;
  if not exists (
    select 1 from public.supporter_invitations
    where id = p_invitation_id and user_id = (select auth.uid()) and status = 'active'
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
  if (select auth.uid()) is null or not public.is_active_user() then
    raise exception 'Active sign-in required';
  end if;
  if not exists (
    select 1 from public.supporter_invitations
    where id = p_invitation_id and user_id = (select auth.uid()) and status = 'active'
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
  if (select auth.uid()) is null or not public.is_active_user() then
    raise exception 'Active sign-in required';
  end if;
  if not exists (
    select 1 from public.supporter_invitations
    where id = p_invitation_id and user_id = (select auth.uid())
  ) then raise exception 'Invitation not found'; end if;
  insert into public.supporter_feedback (user_id, invitation_id, felt_supported)
  values ((select auth.uid()), p_invitation_id, p_felt_supported)
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
  v_code_attempts integer;
  v_ip text;
  v_ip_raw text;
  v_xff text[];
  v_valid boolean := false;
begin
  -- Trust only the right-most X-Forwarded-For entry: it is the value appended
  -- by the closest proxy. Earlier entries are client-controlled and can be
  -- spoofed to reset rate-limit counters.
  begin
    v_ip_raw := current_setting('request.headers', true)::jsonb->>'x-forwarded-for';
  exception when others then
    v_ip_raw := null;
  end;
  if v_ip_raw is not null and btrim(v_ip_raw) <> '' then
    v_xff := string_to_array(v_ip_raw, ',');
    v_ip := btrim(v_xff[array_length(v_xff, 1)]);
  else
    v_ip := null;
  end if;
  v_actor := coalesce(nullif(v_ip, ''), (select auth.uid())::text, 'anonymous');
  perform pg_advisory_xact_lock(hashtext(v_actor));
  delete from public.company_code_validation_attempts
  where actor_key = v_actor and attempted_at < now() - interval '1 hour';
  delete from public.company_code_validation_attempts
  where actor_key = 'code:' || v_code and attempted_at < now() - interval '1 hour';
  insert into public.company_code_validation_attempts(actor_key) values (v_actor);
  insert into public.company_code_validation_attempts(actor_key) values ('code:' || v_code);
  select count(*) into v_attempts from public.company_code_validation_attempts
  where actor_key = v_actor and attempted_at >= now() - interval '1 hour';
  select count(*) into v_code_attempts from public.company_code_validation_attempts
  where actor_key = 'code:' || v_code and attempted_at >= now() - interval '1 hour';

  select * into v_client from public.b2b_clients
  where upper(company_code) = v_code and status = 'active'
  limit 1;
  select count(*) into v_used from public.profiles where b2b_client_id = v_client.id;
  v_remaining := case when v_client.max_users is null then null
    else greatest(v_client.max_users - v_used, 0) end;
  v_valid := v_client.id is not null
    and (v_client.max_users is null or v_remaining > 0);

  perform pg_sleep(0.15);
  -- Per-actor and global per-code throttles. Over-limit responses are
  -- identical in shape to a normal negative result (no oracle).
  if v_attempts > 20 or v_code_attempts > 200 then v_valid := false; end if;
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
  v_uid uuid := (select auth.uid());
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
  -- Lock the company row so seat counting and the profile update are atomic
  -- across concurrent redeemers.
  select * into v_client from public.b2b_clients
  where upper(company_code) = v_code and status = 'active' limit 1 for update;
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
  v_uid uuid := (select auth.uid());
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
    and user_id = (select auth.uid());
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
      resolved_by = (select auth.uid()),
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
      escalated_by = (select auth.uid()),
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
  values (btrim(p_title), btrim(p_message), v_audience, now(), (select auth.uid()))
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
