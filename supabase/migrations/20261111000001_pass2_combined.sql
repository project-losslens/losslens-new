-- LossLens Pass 2 database changes.
-- Apply after the existing 20261110000001 through 20261110000006 migrations.
-- This file is intentionally additive and safe to run more than once.

-- Phase 2: remove the JWT-age password step-up while retaining role checks.
-- RPCs still enforce is_admin() or is_super_admin(); this helper only confirms
-- that the caller is an active administrator for backward compatibility.
create or replace function public.is_recently_authenticated()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.is_active_user() and public.is_admin();
$$;

revoke execute on function public.is_recently_authenticated() from public, anon;
grant execute on function public.is_recently_authenticated() to authenticated;

-- Phase 2: reversible therapist-only role assignment.
create or replace function public.admin_revert_therapist(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_super_admin() or not public.is_active_user() then
    raise exception 'Active super-admin access required';
  end if;

  update public.profiles
  set role = 'user'
  where id = p_user_id and role = 'therapist';
  if not found then
    raise exception 'Therapist account not found';
  end if;

  update public.therapists
  set status = 'suspended', verified_at = null, verified_by = null
  where id = p_user_id;

  perform public.log_admin_action(
    'therapist_reverted_to_user',
    'profiles',
    p_user_id::text,
    '{}'::jsonb
  );
  return p_user_id;
end;
$$;

revoke execute on function public.admin_revert_therapist(uuid) from public, anon;
grant execute on function public.admin_revert_therapist(uuid) to authenticated;

drop policy if exists therapist_self_select on public.therapists;
create policy therapist_self_select on public.therapists for select to authenticated
  using (
    id = auth.uid()
    and public.is_active_user()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'therapist')
  );

drop policy if exists therapist_self_update on public.therapists;
create policy therapist_self_update on public.therapists for update to authenticated
  using (
    id = auth.uid()
    and public.is_active_user()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'therapist')
  )
  with check (
    id = auth.uid()
    and public.is_active_user()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'therapist')
  );

-- Phase 3: profile pictures are shown in the top bar and in admin, insurer
-- and therapist user lists, so any signed-in user may read the avatars bucket.
-- Writes remain restricted to each user's own folder by the existing
-- 20261110000002_rls_grants_storage.sql policies.
drop policy if exists "avatars authenticated read" on storage.objects;
create policy "avatars authenticated read" on storage.objects for select to authenticated
  using (bucket_id = 'avatars');

-- Phase 4 / The Circle: the "Slip & Recovery" and "Family & Friends" rooms
-- are removed from the product. DESTRUCTIVE: deletes their messages,
-- reactions, authors and room-member rows. Room is a free-text column (no
-- check constraint), and circle_room_counts / circle_purge_expired are
-- room-agnostic, so no function changes are needed.
delete from public.circle_message_reactions
  where message_id in (
    select id from public.circle_messages
    where room in ('slip_recovery', 'family_friends')
  );

delete from public.circle_message_authors
  where message_id in (
    select id from public.circle_messages
    where room in ('slip_recovery', 'family_friends')
  );

delete from public.circle_messages
  where room in ('slip_recovery', 'family_friends');

delete from public.circle_room_members
  where room in ('slip_recovery', 'family_friends');

-- Phase 4 / Urge Toolkit: user-chosen distraction challenges
-- ("My challenges"). Owner-only RLS; status is doing/done/dropped.
create table if not exists public.urge_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  challenge text not null,
  status text not null default 'doing' check (status in ('doing', 'done', 'dropped')),
  chosen_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists urge_challenges_user_idx on public.urge_challenges (user_id, chosen_at desc);
alter table public.urge_challenges enable row level security;
drop policy if exists urge_challenges_owner_all on public.urge_challenges;
create policy urge_challenges_owner_all on public.urge_challenges for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Verification: run as an authenticated administrator after applying.
select
  public.is_active_user() as active_user,
  public.is_admin() as administrator,
  public.is_super_admin() as super_administrator,
  public.is_recently_authenticated() as legacy_step_up_check;

select
  to_regprocedure('public.admin_revert_therapist(uuid)') as revert_therapist_rpc,
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'therapists'
      and policyname = 'therapist_self_update'
  ) as therapist_self_update_policy_exists;
