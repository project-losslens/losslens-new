-- 01_core_schema.sql — LossLens consolidated schema (part 1/8)
-- Consolidated from: 20261110000001_core_schema.sql
-- Apply first. Idempotent. See docs/MIGRATION_NOTES.md.

-- ============================================================================
-- 20261110000001_core_schema.sql — LossLens core schema (consolidated)
-- ============================================================================
-- Final state of all user-domain tables, indexes, base helper functions,
-- triggers, views, seed data, realtime publication and storage buckets.
-- Portal/claims tables live in 20261110000004_portals_claims.sql.
-- Idempotent: safe to apply twice. No pgcrypto dependency (gen_random_uuid only).
-- ============================================================================

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

create index if not exists supporter_invitations_token_idx on public.supporter_invitations(token);
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
as $$ select p.role from public.profiles p where p.id = auth.uid(); $$;

create or replace function public.is_super_admin()
returns boolean
language sql stable security definer
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
language sql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role in ('admin', 'super_admin') or p.is_super_admin = true)
  );
$$;

create or replace function public.is_active_user()
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select coalesce(
    (select p.status from public.profiles p where p.id = auth.uid()),
    'active'
  ) <> 'suspended';
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
  values (auth.uid(), left(p_action, 120), left(p_target_table, 120),
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

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

  if new.id = auth.uid() then
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
-- server-side from auth.uid().
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
  if auth.uid() is not null then
    insert into public.circle_message_authors (message_id, user_id)
    values (new.id, auth.uid())
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
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'audit_logs') then
      execute 'alter publication supabase_realtime add table public.audit_logs';
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Storage buckets (final MIME types)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', false, 5242880, array['image/jpeg','image/png','image/webp']),
  ('mirror-recordings', 'mirror-recordings', false, 104857600, array['video/webm','video/mp4']),
  ('precious-pacts', 'precious-pacts', false, 104857600, array['audio/webm','audio/mp4','audio/ogg','audio/x-m4a']),
  ('therapist-documents', 'therapist-documents', false, 5242880, array['application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Default privileges: new tables get no anon access.
alter default privileges in schema public revoke all on tables from anon;

notify pgrst, 'reload schema';
