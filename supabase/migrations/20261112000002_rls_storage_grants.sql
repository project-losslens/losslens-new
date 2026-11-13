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

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
drop policy if exists lossless_profiles_self_select on public.profiles;
create policy lossless_profiles_self_select on public.profiles for select to authenticated
  using (id = auth.uid());
drop policy if exists losslens_profiles_super_admin_select on public.profiles;
create policy losslens_profiles_super_admin_select on public.profiles
  for select to authenticated using (public.is_super_admin());
drop policy if exists lossless_profiles_self_update on public.profiles;
create policy lossless_profiles_self_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists lossless_profiles_admin_update on public.profiles;
drop policy if exists lossless_profiles_super_admin_delete on public.profiles;
create policy lossless_profiles_super_admin_delete on public.profiles for delete to authenticated
  using (public.is_super_admin() and id <> auth.uid());

-- ---------------------------------------------------------------------------
-- Owner-only recovery data
-- ---------------------------------------------------------------------------
drop policy if exists lossless_diary_owner_all on public.diary_entries;
create policy lossless_diary_owner_all on public.diary_entries for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists lossless_cbt_owner_all on public.cbt_progress;
create policy lossless_cbt_owner_all on public.cbt_progress for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists lossless_chat_owner_all on public.chat_history;
create policy lossless_chat_owner_all on public.chat_history for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists lossless_notifications_owner_all on public.notifications;
create policy lossless_notifications_owner_all on public.notifications for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

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
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists lossless_event_rsvps_owner_update_v2 on public.event_rsvps;
create policy lossless_event_rsvps_owner_update_v2 on public.event_rsvps for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists lossless_event_rsvps_owner_delete_v2 on public.event_rsvps;
create policy lossless_event_rsvps_owner_delete_v2 on public.event_rsvps for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists lossless_event_discussions_select on public.event_discussions;
create policy lossless_event_discussions_select on public.event_discussions
  for select to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.active = true));
drop policy if exists lossless_event_discussions_insert on public.event_discussions;
create policy lossless_event_discussions_insert on public.event_discussions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and is_admin_reply = false
    and exists (select 1 from public.events e where e.id = event_id and e.active = true)
  );
drop policy if exists lossless_event_discussions_admin_insert on public.event_discussions;
create policy lossless_event_discussions_admin_insert on public.event_discussions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and is_admin()
    and is_admin_reply = true
    and exists (select 1 from public.events e where e.id = event_id and e.active = true)
  );
drop policy if exists lossless_event_discussions_admin_delete on public.event_discussions;
create policy lossless_event_discussions_admin_delete on public.event_discussions for delete to authenticated
  using (public.is_admin());

drop policy if exists lossless_event_messages_owner_select on public.event_messages;
create policy lossless_event_messages_owner_select on public.event_messages for select to authenticated
  using (user_id = auth.uid());
drop policy if exists lossless_event_messages_owner_insert on public.event_messages;
create policy lossless_event_messages_owner_insert on public.event_messages for insert to authenticated
  with check (user_id = auth.uid());
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
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists lossless_resource_suggestions_owner_insert on public.resource_suggestions;
create policy lossless_resource_suggestions_owner_insert on public.resource_suggestions for insert to authenticated
  with check (user_id = auth.uid());
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
      select 1 from public.supporter_invitations i
      where i.id = invitation_id and i.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Circle membership and messages
-- ---------------------------------------------------------------------------
drop policy if exists lossless_circle_members_owner_select on public.circle_room_members;
create policy lossless_circle_members_owner_select on public.circle_room_members for select to authenticated
  using (user_hash = (select p.circle_user_hash from public.profiles p where p.id = auth.uid()));
drop policy if exists lossless_circle_members_owner_insert on public.circle_room_members;
create policy lossless_circle_members_owner_insert on public.circle_room_members for insert to authenticated
  with check (user_hash = (select p.circle_user_hash from public.profiles p where p.id = auth.uid()));
drop policy if exists lossless_circle_members_owner_delete on public.circle_room_members;
create policy lossless_circle_members_owner_delete on public.circle_room_members for delete to authenticated
  using (user_hash = (select p.circle_user_hash from public.profiles p where p.id = auth.uid()));
drop policy if exists lossless_circle_members_owner_update_v2 on public.circle_room_members;
create policy lossless_circle_members_owner_update_v2 on public.circle_room_members for update to authenticated
  using (user_hash = (select p.circle_user_hash from public.profiles p where p.id = auth.uid()))
  with check (user_hash = (select p.circle_user_hash from public.profiles p where p.id = auth.uid()));

drop policy if exists lossless_circle_messages_member_select on public.circle_messages;
create policy lossless_circle_messages_member_select on public.circle_messages for select to authenticated
  using (
    (expires_at is null or expires_at > now())
    and exists (
      select 1 from public.circle_room_members m
      join public.profiles p on p.id = auth.uid()
      where m.room = circle_messages.room and m.user_hash = p.circle_user_hash
    )
  );
drop policy if exists lossless_circle_messages_owner_select_v2 on public.circle_messages;
create policy lossless_circle_messages_owner_select_v2 on public.circle_messages for select to authenticated
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
drop policy if exists lossless_circle_messages_member_insert on public.circle_messages;
create policy lossless_circle_messages_member_insert on public.circle_messages for insert to authenticated
  with check (
    user_hash = (select p.circle_user_hash from public.profiles p where p.id = auth.uid())
    and user_id is null
    and mentioned_user_id is null
    and exists (
      select 1 from public.circle_room_members m
      where m.room = circle_messages.room
        and m.user_hash = (select p.circle_user_hash from public.profiles p where p.id = auth.uid())
    )
  );
drop policy if exists lossless_circle_messages_owner_update on public.circle_messages;
create policy lossless_circle_messages_owner_update on public.circle_messages for update to authenticated
  using (user_hash = (select circle_user_hash from public.profiles where id = auth.uid()))
  with check (user_hash = (select circle_user_hash from public.profiles where id = auth.uid()));
drop policy if exists lossless_circle_messages_owner_delete on public.circle_messages;
create policy lossless_circle_messages_owner_delete on public.circle_messages for delete to authenticated
  using (
    user_hash = (select p.circle_user_hash from public.profiles p where p.id = auth.uid())
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
    user1_hash = (select p.circle_user_hash from public.profiles p where p.id = auth.uid())
    or user2_hash = (select p.circle_user_hash from public.profiles p where p.id = auth.uid())
  );
drop policy if exists lossless_whispers_match_insert_v2 on public.whispers_matches;
create policy lossless_whispers_match_insert_v2 on public.whispers_matches for insert to authenticated
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
drop policy if exists lossless_whispers_message_update_v2 on public.whispers_messages;
drop policy if exists lossless_whispers_message_sender_update on public.whispers_messages;
drop policy if exists lossless_whispers_message_sender_delete on public.whispers_messages;
create policy lossless_whispers_message_sender_delete on public.whispers_messages for delete to authenticated
  using (sender_hash = (select p.circle_user_hash from public.profiles p where p.id = auth.uid()));

drop policy if exists lossless_whispers_report_owner_insert on public.whispers_reports;
create policy lossless_whispers_report_owner_insert on public.whispers_reports for insert to authenticated
  with check (
    reporter_hash = (select p.circle_user_hash from public.profiles p where p.id = auth.uid())
    and exists (
      select 1 from public.whispers_matches wm
      join public.profiles p on p.id = auth.uid()
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
  using (user_id = auth.uid());
drop policy if exists lossless_mirror_owner_insert on public.mirror_recordings;
create policy lossless_mirror_owner_insert on public.mirror_recordings for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists lossless_mirror_owner_insert_v2 on public.mirror_recordings;
create policy lossless_mirror_owner_insert_v2 on public.mirror_recordings for insert to authenticated
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
drop policy if exists lossless_pact_owner_insert_v2 on public.precious_pacts;
create policy lossless_pact_owner_insert_v2 on public.precious_pacts for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists lossless_pact_owner_update on public.precious_pacts;
create policy lossless_pact_owner_update on public.precious_pacts for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists lossless_pact_owner_delete on public.precious_pacts;
create policy lossless_pact_owner_delete on public.precious_pacts for delete to authenticated
  using (user_id = auth.uid());

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
  with check (public.is_admin() and created_by = auth.uid());
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
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_super_admin = true));

drop policy if exists lossless_grants_super_admin_all on public.grant_applications;
create policy lossless_grants_super_admin_all on public.grant_applications for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists "Super admins can view grant applications" on public.grant_applications;
create policy "Super admins can view grant applications" on public.grant_applications for select to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_super_admin = true));

drop policy if exists lossless_insurance_super_admin_all on public.insurance_partners;
create policy lossless_insurance_super_admin_all on public.insurance_partners for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists "Super admins can view insurance partners" on public.insurance_partners;
create policy "Super admins can view insurance partners" on public.insurance_partners for select to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_super_admin = true));

drop policy if exists lossless_settings_super_admin_all on public.system_settings;
create policy lossless_settings_super_admin_all on public.system_settings for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists lossless_audit_super_admin_select on public.audit_logs;
create policy lossless_audit_super_admin_select on public.audit_logs for select to authenticated
  using (public.is_super_admin());
drop policy if exists "Super admins can read audit logs" on public.audit_logs;
create policy "Super admins can read audit logs" on public.audit_logs for select
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_super_admin = true));

drop policy if exists lossless_upgrade_owner_insert on public.upgrade_interest;
create policy lossless_upgrade_owner_insert on public.upgrade_interest for insert to authenticated
  with check (user_id = auth.uid());
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
drop policy if exists "avatar owner read" on storage.objects;
drop policy if exists "avatars public select" on storage.objects;
drop policy if exists "avatar owner select" on storage.objects;
create policy "avatar owner select" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
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

drop policy if exists therapist_documents_read on storage.objects;
create policy therapist_documents_read on storage.objects for select to authenticated
  using (bucket_id = 'therapist-documents'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_super_admin()));
drop policy if exists therapist_documents_insert on storage.objects;
create policy therapist_documents_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'therapist-documents'
    and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists therapist_documents_update on storage.objects;
create policy therapist_documents_update on storage.objects for update to authenticated
  using (bucket_id = 'therapist-documents'
    and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'therapist-documents'
    and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists therapist_documents_delete on storage.objects;
create policy therapist_documents_delete on storage.objects for delete to authenticated
  using (bucket_id = 'therapist-documents'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_super_admin()));

notify pgrst, 'reload schema';
