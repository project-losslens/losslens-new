-- Urge Toolkit session log for offline-synced toolkit usage.
-- Idempotent; safe to apply twice.

create table if not exists public.urge_toolkit_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tool text not null,
  duration_seconds integer,
  completed boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.urge_toolkit_sessions enable row level security;

create index if not exists urge_toolkit_sessions_user_idx
  on public.urge_toolkit_sessions(user_id, created_at desc);

drop policy if exists urge_toolkit_sessions_owner_select on public.urge_toolkit_sessions;
create policy urge_toolkit_sessions_owner_select on public.urge_toolkit_sessions
  for select to authenticated
  using (user_id = auth.uid() and public.is_active_user());

drop policy if exists urge_toolkit_sessions_owner_insert on public.urge_toolkit_sessions;
create policy urge_toolkit_sessions_owner_insert on public.urge_toolkit_sessions
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_active_user());

grant select, insert on public.urge_toolkit_sessions to authenticated;

notify pgrst, 'reload schema';
