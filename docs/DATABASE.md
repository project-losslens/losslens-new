# LossLens Database

# LossLens Schema Notes

The schema is consolidated into six migrations in `supabase/migrations/`,
applied in filename order. They are the final state of the schema — idempotent
(`create table if not exists`, `create or replace function`, `drop policy if
exists` before every `create policy`) and safe to re-run.

| File | Contents |
| --- | --- |
| `20261110000001_core_schema.sql` | All user-domain tables (profiles incl. risk/freeze/AI-consent columns, diary, CBT, chat, resources, events, groups, crisis_alerts, broadcasts, notifications, supporters, circle + reactions, whispers + declines, media metadata, business/admin tables, audit_logs final shape, company-code attempts, account_deletion_log), indexes, base helpers (`current_user_role`, `is_super_admin`, `is_admin`, `is_active_user`, `is_recently_authenticated`, `log_admin_action`), triggers (new-user, privilege protection, identity scrub, audit immutability, updated_at, audit-table triggers), views (`admin_profiles_safe`, `circle_messages_safe`), badge seed data, realtime publication, storage buckets with final MIME types. |
| `20261110000002_rls_grants_storage.sql` | `enable row level security` on every table, the single final policy set (owner policies, admin policies, restrictive `is_active_user` policies, hashed-identity circle/whispers policies), table grants/revokes, audit_logs actor FK, storage.objects policies for avatars/mirror-recordings/precious-pacts/therapist-documents. Portal/claims RLS lives in file 04. |
| `20261110000003_rpc_functions.sql` | All user-domain security-definer RPCs: circle identity/reactions/notify/counts/purge, whispers (request, list open, respond, rate, report), supporter token + owner RPCs, company codes (validate rate-limited, redeem), `recompute_progress` (Nairobi-anchored, idempotent freeze), crisis (`record_crisis_event`/`pre_authorize_voucher` service-role only, resolve/escalate/contact), `send_broadcast`, `admin_get_user_contact`, `admin_dashboard_stats`, `increment_pact_play_count`. |
| `20261110000004_portals_claims.sql` | Therapists, insurers, partnerships, provider_vouchers + pre_auth_vouchers (kept separate), provider_claims/payouts, claim_submissions, bulk invoices + claims, claims float + ledger; their RLS/grants; views `therapists_public` (active only) and `insurer_aggregate_stats` (cohort ≥ 25, banded risk); all portal/claims RPCs with elevated-access (`is_recently_authenticated`) guards on admin functions; insurer reports payment, only super-admin confirmation credits the float; ends with a guarded legacy weak-hash (`user_%`) remap that is a no-op on fresh databases. |
| `20261110000005_diary_urge_level.sql` | Adds `diary_entries.urge_level smallint` with a 0–10 check constraint for the quick check-in. |
| `20261110000006_urge_toolkit_sessions.sql` | `urge_toolkit_sessions` (user_id, tool, duration_seconds, completed, metadata, created_at) with owner-only select/insert RLS for offline-synced toolkit logs. |

## Notes

- No `pgcrypto` dependency: randomness uses `gen_random_uuid()` only.
- `record_crisis_event` and `pre_authorize_voucher` are executable by
  `service_role` only; the browser reaches them via `api/chat.js` /
  `api/crisis.js`.
- `profiles.ai_data_consent_at` gates Oloo AI chat (enforced in `api/chat.js`).
- MFA must be enabled in the Supabase dashboard for admin roles (elevated RPCs
  require `is_recently_authenticated()`).
- Verification queries live in `docs/DB_SETUP.md`.


---

# LossLens Database Setup

## Applying the schema

The schema is six idempotent migrations in `supabase/migrations/`:

1. `20261110000001_core_schema.sql` — tables, helpers, triggers, views, seeds, storage buckets
2. `20261110000002_rls_grants_storage.sql` — RLS policies, grants, storage policies
3. `20261110000003_rpc_functions.sql` — user-domain RPCs
4. `20261110000004_portals_claims.sql` — therapist/insurer/claims schema, RLS, RPCs
5. `20261110000005_diary_urge_level.sql` — `diary_entries.urge_level` (0–10 check)
6. `20261110000006_urge_toolkit_sessions.sql` — `urge_toolkit_sessions` table, owner-only RLS

Apply **in order, once each** (they are also safe to re-run).

### Option A — Supabase CLI (local)

```bash
npx supabase start        # starts local Postgres + auth + storage
npx supabase db reset     # applies supabase/migrations in order
```

### Option B — Remote project

```bash
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push      # pushes pending migrations
```

Or paste each file, in order, into the Supabase Dashboard → SQL Editor and run.

## Required environment variables

| Name | Where | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Vercel + local `.env` | Supabase project URL (client) |
| `VITE_SUPABASE_ANON_KEY` | Vercel + local `.env` | Supabase anon key (client) |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel (serverless) | Required by `api/chat.js` / `api/crisis.js` — **fails closed if missing** |
| `GROQ_API_KEY` | Vercel (serverless) | Groq API key for Oloo chat — never expose to client |
| `ALLOWED_ORIGIN` | Edge functions (`send-invite`, `delete-account`) | Exact app origin; functions fail closed if unset |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` | optional, CLI deploys only | Edge function deployment |

## Post-apply steps

1. **Enable MFA (TOTP)** for admin roles in Supabase Dashboard → Authentication →
   Sign In / Providers. Elevated RPCs require `is_recently_authenticated()`
   (JWT `iat` within 15 minutes) in addition to admin role.
2. **Deploy edge functions**: `supabase functions deploy send-invite delete-account`.
3. **Schedule the circle expiry purge** (optional, needs pg_cron):
   `select cron.schedule('circle-purge-expired', '*/15 * * * *', 'select public.circle_purge_expired()');`

## VERIFY queries (run after applying)

```sql
-- 1. pgcrypto must NOT be required by the schema functions.
select extname, extnamespace::regnamespace
from pg_extension where extname = 'pgcrypto';
-- Expected: at most one row; no function should fail without it.

-- 2. crisis_alerts FK constraint names.
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.crisis_alerts'::regclass and contype = 'f';

-- 3. Key RPCs exist with expected signatures.
select proname, pg_get_function_arguments(oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and proname in (
  'ensure_circle_identity','create_supporter_invitation','whispers_request',
  'whispers_list_open_requests','whispers_respond','whispers_report',
  'redeem_company_code','validate_company_code','recompute_progress',
  'record_crisis_event','pre_authorize_voucher','crisis_resolve',
  'crisis_escalate','crisis_get_contact','send_broadcast',
  'admin_dashboard_stats','admin_confirm_invoice_payment',
  'insurer_generate_bulk_invoice','therapist_accept_voucher',
  'circle_toggle_reaction','circle_room_counts','circle_notify',
  'circle_purge_expired','log_admin_action','is_recently_authenticated'
) order by proname;

-- 4. Policy count per table (sanity: every app table has >= 1 policy
--    except the intentionally service-only ones).
select tablename, count(*) as policies
from pg_policies where schemaname = 'public'
group by tablename order by tablename;

-- 5. Service-role-only crisis functions: authenticated must NOT have EXECUTE.
select proname, proacl
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and proname in ('record_crisis_event','pre_authorize_voucher');

-- 6. Exactly six migration files were applied (supabase_migrations if CLI used).
select version from supabase_migrations.schema_migrations
order by version;
```


---

## Schema reference (replayed from migrations)


Replay order: `001_master_migration.sql` → `20261106152654_add_profile_risk_columns.sql` →
`20261108000001_security_hardening.sql` → `20261108000002_remap_weak_hashes.sql` →
`20261109000003_supporter_rpcs.sql` → `20261109000004_therapist_portal.sql` →
`20261109000005_insurer_portal.sql` → `20261109000006_claims_protocols.sql`.
(Draft files `003_*`, `004_*`, `005_*` sort before `20261108*` lexically and are
unapplied "apply manually" notes; the `20261110*` files in this round supersede them.)

## Tables (final shape)

- **profiles**: id (PK→auth.users cascade), full_name, username (unique), email, phone,
  goal, plan_type, role CHECK in ('user','admin','super_admin','therapist','insurer')
  [widened by 20261109000004], status, avatar_url, risk_level, streak_days, money_saved,
  clean_since, streak_freeze_used, streak_freeze_reset_date, badges jsonb, preferences
  jsonb, accountability_partner_name/phone, circle_user_hash, circle_display_name,
  b2b_client_id (FK→b2b_clients set null, constraint `profiles_b2b_client_fk`),
  is_demo, subscription_status/plan/expires_at, created_at, last_active, onboarding_*,
  screening_score/answers, daily_risk_score, risk_factors, last_risk_check,
  is_super_admin, ai_data_consent_at (added in 003 draft / 20261110 round).
  `report_password` dropped by hardening.
- **diary_entries**: id, user_id→profiles cascade, date, gambled, mood, triggers jsonb,
  coping jsonb, thoughts, notes, amount, streak, created_at, unique(user_id,date);
  + gambling_type, time_spent, money_spent, money_won.
- **cbt_progress**: id, user_id→profiles cascade, module_id, module_title, completed,
  completed_at, answers jsonb, created_at; unique(user_id,module_id).
- **badges**: id text PK, name, icon, description, points, category, condition jsonb,
  unlocked_at.
- **chat_history**: id, user_id→profiles cascade, role CHECK('user','assistant'),
  message, created_at.
- **resources**: id, name, category, description, phone, website, url, hours, address,
  available_24_7, active, created_at.
- **resource_ratings**: PK(user_id→profiles cascade, resource_id→resources cascade), helpful.
- **resource_suggestions**: id, user_id→profiles set null, name, description, link,
  notes, category, contact, status, created_at.
- **events**: id, title, description, date timestamptz, location, type, spots,
  image_url, active, discussion_enabled, created_by→profiles set null, created_at.
- **event_rsvps**: id, user_id→profiles cascade, event_id→events cascade, attendance,
  status, created_at; unique(user_id,event_id).
- **event_messages**: id, event_id→events cascade, user_id→profiles set null, name,
  phone, email, message, read, created_at.
- **event_discussions**: id, event_id→events cascade, user_id→profiles set null,
  message, is_admin_reply, created_at.
- **groups**: id, name, description, meeting_day/time, location, facilitator, meets,
  active, max_members, category, created_at.
- **crisis_alerts**: id, user_id→profiles set null, keyword, message, severity,
  resolved, resolved_at, resolved_by→profiles set null, escalated, escalated_at,
  escalated_by→profiles set null, created_at; + admin_notes, message_context, source
  ('chat'|'diary'), keywords text[].
- **broadcasts**: id, title, message, audience, scheduled_at, sent_at, created_by,
  created_at; + recipient_count.
- **notifications**: id, user_id→profiles cascade, title, message, type, icon, link,
  read, broadcast_id→broadcasts set null, created_at.
- **supporter_invitations**: id, user_id→profiles cascade, supporter_name/email/phone/
  relation, permissions jsonb, token unique, status, anonymous_mode, crisis_contact,
  responded_at, expires_at, created_at.
- **supporter_messages**: id, invitation_id→supporter_invitations cascade, sender
  CHECK('user','supporter'), content, created_at.
- **supporter_feedback**: id, user_id→profiles cascade, invitation_id→… cascade,
  felt_supported, created_at.
- **circle_room_members**: PK(room, user_hash), last_seen.
- **circle_messages**: id, room, user_hash, user_id→profiles set null,
  mentioned_user_id→profiles set null, display_name, avatar_animal, avatar_prefix,
  message, message_type default 'text', expires_at, reply_to_id→circle_messages set
  null, reply_to_name, created_at.
- **circle_message_authors** (hardening): message_id PK→circle_messages cascade,
  user_id→profiles cascade, created_at. Admin-only SELECT; writes via trigger.
- **whispers_matches**: id, user1_hash, user2_hash, user1_role, user2_role,
  status default 'pending', request_message, request_type, user1/2_rating,
  created_at, updated_at; + rejected_at, rejected_by, ended_at, user1/2_feedback.
- **whispers_messages**: id, match_id→whispers_matches cascade, sender_hash, message,
  reply_to_id self-FK set null, created_at.
- **whispers_reports**: id, match_id→whispers_matches set null, reporter_hash,
  message_id→whispers_messages set null, reason, details, created_at.
- **mirror_recordings**: id, user_id→profiles cascade, month, storage_path, type,
  duration_seconds, title, recording_date, prompt, created_at.
- **precious_pacts**: id, user_id→profiles cascade, storage_path, title, description,
  prompt, duration_seconds, play_count, pact_type, is_active, created_at.
- **b2b_clients**: id, company_name, company_code unique, contact_name, email, phone,
  plan, status, max_users, settings jsonb, created_at.
- **grant_applications**: id, organization_name, contact_name, email, phone, status,
  notes, created_at.
- **insurance_partners**: id, company_name, contact_name, email, phone, status,
  commission_rate numeric(8,4), notes, created_at.
- **system_settings**: key PK, value jsonb, updated_at, updated_by→profiles set null.
- **audit_logs** (final, hardening): id, actor_id uuid, action, target_table, target_id
  text, metadata jsonb, created_at. Legacy columns (admin_id,user_id,entity_type,
  entity_id,details,table_name,record_id,performed_by,target_id uuid) dropped.
  INSERT/UPDATE/DELETE revoked from clients; writes via `log_admin_action` + triggers.
- **upgrade_interest**: id, user_id→profiles set null, email, current_plan,
  interested_plan, created_at.
- **therapists** (20261109000004): id PK→profiles cascade, license_number, specialty,
  languages text[], bio, license_document_path, status CHECK('pending','active',
  'suspended') [003 draft adds 'deleted'], verified_at, verified_by→profiles set null,
  created_at.
- **provider_vouchers**: id, user_id→profiles cascade [003 draft drops NOT NULL],
  therapist_id→therapists set null, crisis_alert_id→crisis_alerts set null,
  status CHECK('pending','assigned','accepted','completed','expired','void'),
  max_sessions, fee_per_session, expires_at, created_at, updated_at;
  + pre_auth_voucher_id→pre_auth_vouchers set null (unique where not null), insurer_id.
- **provider_claims**: id, voucher_id→provider_vouchers restrict, therapist_id→
  therapists restrict [003 draft drops NOT NULL], session_date, clinical_notes,
  icd_code, claim_amount, status CHECK('submitted','approved','paid','rejected',
  'disputed'), paid_at, insurer_reimbursed_at, created_at.
- **provider_payouts**: id, therapist_id→therapists restrict, claim_id unique→
  provider_claims restrict, amount, mpesa_ref, paid_at.
- **insurers** (20261109000005): id, profile_id unique→profiles restrict [003 draft
  drops NOT NULL], name, license_number, contact_email/phone, status
  CHECK('active','suspended'), created_at.
- **insurer_partnerships**: id, insurer_id→insurers restrict, cohort_name,
  b2b_client_id→b2b_clients set null, contract_start/end, per_member_fee, member_count,
  status CHECK('active','inactive','expired'), created_at.
- **claim_submissions**: id, claim_id→provider_claims restrict, insurer_id→insurers
  restrict, submitted_at, insurer_status CHECK('submitted','approved','paid',
  'rejected','disputed'), insurer_notes, insurer_reviewed_at/by→profiles set null,
  created_at; unique(claim_id,insurer_id).
- **bulk_invoices**: id, insurer_id→insurers restrict, invoice_period_start/end,
  total_claims, total_amount, status CHECK('draft','sent','paid','disputed')
  [003 draft adds 'payment_reported'], sent_at, paid_at, mpesa_or_ach_ref, created_at;
  + payment_reference, payment_reported_at (003 draft).
- **bulk_invoice_claims**: PK(invoice_id→bulk_invoices cascade, claim_id→
  claim_submissions restrict), unique(claim_id).
- **claims_float**: id smallint PK=1, balance>=0, updated_at, note.
- **claims_float_transactions**: id, type CHECK('inflow','outflow'), amount>0,
  claim_id→provider_claims set null, therapist_id→therapists set null,
  insurer_id→insurers set null, note, created_at.
- **pre_auth_vouchers** (20261109000006): id, user_id→profiles cascade,
  crisis_alert_id→crisis_alerts set null, status CHECK('pending','assigned','accepted',
  'completed','expired','void'), expires_at, therapist_id→therapists set null,
  insurer_id→insurers set null, max_sessions, created_at, updated_at.
  Unique partial index on crisis_alert_id.
- **company_code_validation_attempts** (003 draft): actor_key, attempted_at.
  20261110 round uses `ip_hash`/`id` variant per task spec.
- **account_deletion_log** (003 draft): id, user_id, step, status, error, created_at;
  RLS enabled, no client access.
- **circle_message_reactions** (FN-05, this round): message_id→circle_messages
  cascade, user_hash, reaction CHECK('support','love','fire','heart','star'),
  PK(message_id,user_hash,reaction).
- **whispers_declines** (FN-04, this round): match_id→whispers_matches cascade,
  user_hash, PK(match_id,user_hash).

## Functions (final signatures; auth = SECURITY DEFINER unless noted)

Helpers: `current_user_role()`, `is_super_admin()` (role='super_admin' OR
is_super_admin flag), `is_admin()` (admin|super_admin|flag), `is_active_user()`
(status<>'suspended', definer), `is_active_insurer(uuid)`,
`is_recently_authenticated()` (005: jwt iat within 900s), `whispers_own_hash()`
(revoked from clients), `ensure_circle_identity()` → text (gen_random_bytes(16)
hex; FN-01 replaces with uuid hex), `log_admin_action(text,text,text,jsonb)` → uuid
(requires is_admin + recently_authenticated per 005), `admin_get_user_contact(uuid)`
→ jsonb (super_admin + recent auth, audited).

Triggers: `handle_new_user()` (003 draft version reads username/company_code,
seat check FOR UPDATE), `enforce_profile_privilege_updates()` (invoker; service/
postgres bypass; self cannot change privileged fields; hash immutable once set),
`sync_is_super_admin_flag()`, `audit_profile_privileged_change()`,
`enforce_whispers_match_identity()`, `enforce_whispers_message_identity()`,
`prevent_direct_audit_writes()` (audit_logs immutable),
`enforce_crisis_alert_privileges()`, `audit_admin_table_change()` on
broadcasts/b2b_clients/insurance_partners/grant_applications/system_settings,
`record_circle_message_author()`/`circle_messages_record_author()` (003 draft
replaces with auth.uid() variant), `circle_messages_scrub_identity()` (003 draft),
`therapists_reset_review_on_identity_change()` (003 draft),
`touch_updated_at()`, `whispers_matches_touch_updated_at`.

RPCs (execute grants to `authenticated` unless noted):
- increment_pact_play_count(uuid); supporter_invitation_lookup(text)→table
  [SEC-11/FN-08: drop; FamilyJoin must use supporter_lookup];
  supporter_lookup(text)→jsonb [003: only pending/active + unexpired];
  supporter_respond(text,boolean)→jsonb; supporter_get_summary(text)→jsonb;
  supporter_post_message(text,text)→jsonb; supporter_list_messages(text)→jsonb;
  create_supporter_invitation(text,text,text,text,jsonb,boolean,boolean)→jsonb
  [003: token = 48 hex chars via gen_random_bytes(24); FN-01 → 64 chars via
  gen_random_uuid];
  supporter_owner_list_invitations()→jsonb; supporter_owner_manage(uuid,text,jsonb)
  →jsonb [003: renew regenerates token]; supporter_owner_list_messages(uuid)→jsonb;
  supporter_owner_post_message(uuid,text)→jsonb; supporter_owner_feedback(uuid,
  boolean)→uuid.
- whispers_request(text,text)→jsonb; whispers_respond(uuid,boolean)→jsonb
  [003 version: only user2 accepts open requests; FN-04 adds declines +
  3-active limit]; whispers_rate(uuid,integer,text)→jsonb;
  whispers_list_open_requests()→TABLE [FN-04 new]; whispers_report(uuid,text,uuid)
  →jsonb [FN-04 new].
- send_broadcast(text,text,text)→jsonb; crisis_resolve(uuid,text)→jsonb;
  crisis_escalate(uuid,text)→jsonb; validate_company_code(text)→jsonb
  [003: rate-limited, constant-shape]; redeem_company_code(text)→jsonb
  [003/FN-03: audit insert instead of log_admin_action for non-admin callers];
  recompute_progress()→jsonb [FN-09 rewrites for Nairobi + freeze idempotency].
- admin_promote_therapist(uuid)→uuid; admin_set_therapist_status(uuid,text)→void;
  admin_list_therapists()→TABLE; therapist_get_self_profile()→jsonb;
  therapist_accept_voucher(uuid)→provider_vouchers; therapist_submit_claim
  (uuid,text,text,numeric)→uuid; therapist_complete_session(uuid,text,text)→uuid;
  admin_assign_voucher(uuid,uuid)→void [SEC-11/FN-08: DROP];
  admin_assign_voucher_with_fee(uuid,uuid,numeric)→void;
  assign_voucher_to_therapist(uuid,uuid)→void; void_voucher(uuid,text)→void;
  admin_approve_claim(uuid)→void; admin_mark_claim_paid(uuid,text)→void;
  admin_adjust_claims_float(text,numeric,text)→numeric;
  pay_therapist_float(uuid,text)→numeric.
- insurer_list_claims()→TABLE; insurer_approve_claim(uuid,text)→void;
  insurer_reject_claim(uuid,text)→void; insurer_generate_bulk_invoice(uuid,date,
  date)→uuid [FN-10 changes candidate filter]; insurer_send_bulk_invoice(uuid)→void;
  insurer_mark_invoice_paid(uuid,text)→void [003: sets payment_reported only];
  insurer_export_invoice_csv(uuid)→TABLE; insurer_reimburse_bulk(uuid,uuid,text)
  →numeric [003: service_role only]; admin_confirm_invoice_payment(uuid,text)
  →numeric [003/SEC-02]; insurer_aggregate_stats VIEW [003: cohort≥25, banded].
- record_crisis_event(uuid,text,text[],text,integer)→uuid [003: service_role only];
  pre_authorize_voucher(uuid,uuid,integer)→uuid [003: service_role only, open-voucher
  guard, advisory lock].
- crisis_get_contact(uuid)→jsonb [FN-07 new]; admin_dashboard_stats()→jsonb
  [FN-07 new].

## RLS highlights (final)

- Every app table has RLS enabled. Owner policies: `user_id = auth.uid()` on
  diary/cbt/chat/notifications/rsvps/media tables.
- Hashed-identity tables (circle_*, whispers_*): policies compare
  `circle_user_hash` from profiles; restrictive `lossless_active_user` policies on
  most user tables (is_active_user()).
- Admin reads: profiles restricted to super_admin (`lossless_profiles_super_admin_select`
  / `losslens_profiles_super_admin_select`); `admin_profiles_safe` view for standard
  admins; `therapists_public` view (003) for active therapists only.
- broadcasts: authenticated select only where sent_at <= now() (003 drops anon).
- event_discussions select requires parent event active (003).
- audit_logs: super-admin select only; no client writes.
- storage.objects: avatars private w/ owner-folder policies (003); mirror-recordings,
  precious-pacts owner-folder policies; therapist-documents owner/super-admin read,
  pdf-only 5MB (003).

## Storage buckets

avatars (private after 003; images ≤5MB), mirror-recordings (private, video),
precious-pacts (private, audio/video per FN-06), therapist-documents (private,
application/pdf ≤5MB per 003).
