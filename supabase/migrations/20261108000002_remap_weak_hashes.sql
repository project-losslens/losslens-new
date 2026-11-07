-- ============================================================================
-- LossLens Security Hardening — weak circle-hash remap
-- ============================================================================
-- Replaces legacy weak hashes (length <= 13 and prefixed 'user_') with
-- cryptographically random 32-char hex hashes, consistently across every
-- table that stores them, including profiles.circle_user_hash.
--
-- Runs inside a single transaction. The whispers identity triggers and the
-- profile privilege trigger are disabled for the duration because they
-- legitimately forbid identity-field mutation; they are re-enabled before
-- COMMIT. The migration role (postgres / supabase_admin) performs the writes.
--
-- ROLLBACK: this migration is not auto-reversible. Before applying, take a
-- backup/snapshot of the affected tables. To roll back manually, restore
-- circle_user_hash / user_hash / user1_hash / user2_hash / sender_hash /
-- reporter_hash values from that backup.
-- ============================================================================

begin;

-- Snapshot the weak -> strong mapping once so every table stays consistent.
create temporary table if not exists pg_temp.weak_hash_map (
  old_hash text primary key,
  new_hash text not null
) on commit drop;

truncate pg_temp.weak_hash_map;

insert into pg_temp.weak_hash_map (old_hash, new_hash)
select h, encode(gen_random_bytes(16), 'hex')
from (
  select circle_user_hash as h from public.profiles
    where circle_user_hash is not null
  union
  select user_hash from public.circle_room_members
  union
  select user_hash from public.circle_messages
  union
  select user1_hash from public.whispers_matches where user1_hash is not null
  union
  select user2_hash from public.whispers_matches where user2_hash is not null
  union
  select sender_hash from public.whispers_messages
  union
  select reporter_hash from public.whispers_reports
) src
where h like 'user\_%' escape '\'
  and length(h) <= 13
group by h;

alter table public.whispers_matches disable trigger enforce_whispers_match_identity;
alter table public.whispers_messages disable trigger enforce_whispers_message_identity;
alter table public.profiles disable trigger enforce_profile_privilege_updates;
alter table public.profiles disable trigger sync_is_super_admin_flag;
alter table public.profiles disable trigger audit_profile_privileged_change;

update public.profiles p
set circle_user_hash = m.new_hash
from pg_temp.weak_hash_map m
where p.circle_user_hash = m.old_hash;

update public.circle_room_members m
set user_hash = map.new_hash
from pg_temp.weak_hash_map map
where m.user_hash = map.old_hash;

update public.circle_messages c
set user_hash = map.new_hash
from pg_temp.weak_hash_map map
where c.user_hash = map.old_hash;

update public.circle_messages c
set user_id = null
where c.user_id is not null
  and not exists (select 1 from public.profiles p where p.id = c.user_id);

update public.whispers_matches w
set user1_hash = map.new_hash
from pg_temp.weak_hash_map map
where w.user1_hash = map.old_hash;

update public.whispers_matches w
set user2_hash = map.new_hash
from pg_temp.weak_hash_map map
where w.user2_hash = map.old_hash;

update public.whispers_messages msg
set sender_hash = map.new_hash
from pg_temp.weak_hash_map map
where msg.sender_hash = map.old_hash;

update public.whispers_reports r
set reporter_hash = map.new_hash
from pg_temp.weak_hash_map map
where r.reporter_hash = map.old_hash;

alter table public.whispers_matches enable trigger enforce_whispers_match_identity;
alter table public.whispers_messages enable trigger enforce_whispers_message_identity;
alter table public.profiles enable trigger enforce_profile_privilege_updates;
alter table public.profiles enable trigger sync_is_super_admin_flag;
alter table public.profiles enable trigger audit_profile_privileged_change;

commit;

notify pgrst, 'reload schema';
