# LossLens upgrade — progress tracker

Branch: `main`
Current installation reference: `docs/DATABASE.md` and
`docs/MIGRATION_NOTES.md`. `docs/UPGRADE_PLAN.md` is historical.

## Status legend: [x] done · [~] partial · [ ] not started

> 2026-11-11 session 2: commits 8a105e9, 59bcb29, 192fd31, 3258460 on
> wip/copilot-phase2-3. Build green. Dev server + browser preview left
> running for manual screenshot pass — still owed: browser verification
> of all shells at 360/768/1280, member benefits detail, therapist
> invites in ProtectionOps, formal whitelisted-column audit.

## Phase 1 — cleanup [x]
## Phase 2 — auth/roles/redirects/super-admin [x]

## Part A — finish Phase 3
- [x] i18n en/sw dedupe + parity; BrandLoader everywhere; single toast
      system; emoji/symbol cleanup; NumberField everywhere; AvatarCropper
      → 256px webp avatars bucket + useAvatarUrl; index.html boot loader
- [x] Combined SQL: avatars authenticated read policy
- [ ] Browser screenshots 360/768/1280 all shells (menu overlap, top-right
      username+avatar, stray symbols, toast contrast) — still owed
- [~] UserAvatar wired: UserManagement, B2BClients done; owed:
      TherapistManagement, InsurerManagement, ChatViewer, insurer and
      therapist portal lists
- [ ] Final toast-type audit pass
- [ ] Final numeric-field audit pass

## Phase 4 — feature fixes [x] code-complete; browser verification owed
### The Circle
- [x] family_friends + slip_recovery rooms removed (UI/i18n/tabs);
      destructive deletes in combined SQL
- [x] Duplicate message fix: dedupe by id + temp match (user_hash/text/
      60s), poll merges not replaces, polls only when realtime down
### Urge Toolkit
- [x] ChallengeWheel (8 segments, pointer, 3.5s easeOutQuart, tick+
      vibrate, landing highlight); "I'll do it"→doing, "Spin again"
- [x] urge_challenges table + owner RLS + offline queue; My challenges
      list (doing/done/dropped, mark-done celebrates)
- [x] Timer ring + pulse bg + milestone toasts; BreathingOrb SVG 4-4-6
      with reduced-motion fallback
### Family supporters
- [x] Shareable link flow (copy/WhatsApp/SMS/native); email/phone fields
      removed from form; create_supporter_invitation NULLs them
- [x] /family-join: 30s visible poll + focus refetch + "Updated x ago" +
      Refresh; supporter_get_summary verified live
### Recovery report
- [x] AES-GCM self-contained HTML, 8-char passphrase above Download +
      Copy + share-separately line + Generate new; never emailed/stored
### Oloo
- [x] Flat SVG character, expressions by context, EN/SW greeting,
      thought-for-today, 3 chips, reduced-motion-safe idle anim, typing
      dots, avatar per reply, crisis help link; crisisDetection untouched

## Phase 5 — subscriptions/entitlements/payments [x] code-complete; browser verify owed
- [x] SQL reconciled to prompt: ONE admin_set_subscription(uuid[],...) —
      atomic, super_admin, inline plan/status validation, log_admin_action
      per user, returns jsonb rows, raises on 0 rows. Destructive-marked
      drops for earlier draft objects (plans, subscription_events, bulk/
      history/manual-payment RPCs, expire_subscriptions, validators).
      payments table kept with provider_ref unique (+rename shim).
- [x] UserManagement: single RPC for single+bulk; history reads audit_logs
      (action='subscription_change', target_id=user)
- [x] api/cron/expire-subscriptions.js: inline service-role sweep + audit
      rows; CRON_SECRET bearer or ?secret=; documented in MIGRATION_NOTES
      (no pg_cron, no SQL fn)
- [x] Entitlements enforced: api/chat.js aiPriority → higher rolling quota
      (CHAT_QUOTA_PRIORITY_*); storageQuotaMb enforced client-side in
      MonthlyMirrorPage + PreciousPactPage via src/lib/storageQuota.js
      (per-bucket recursive size sum, fails open). Analytics detail: no
      distinct user analytics surface exists — noted as assumption;
      RequiresPlan ready.
- [x] Payments: provider_ref rename applied in start/status/callback;
      subscription activation + audit via service role; .env.example
      documents all vars incl. CHAT_QUOTA_* and CRON_SECRET
- [x] Historical SQL seed/helper scripts removed; demo records remain in-memory.

## Phase 6 — Protection + portals
- [x] docs/PROTECTION.md, PROTECTION_TEST_PLAN.md, GO_LIVE_CHECKLIST.md
- [x] src/lib/protectionStates.js; protection schema/RLS/RPCs +
      protection_mode seed in script 06
- [x] Member /protection-member page mode-gated (enrol/pending/active/
      consent/timeline/leave); active state now shows plan benefits/limits
      chips from protection_plans + not-the-insurer disclaimer;
      find-therapist + pre-auth + leave RPCs done
- [x] Therapist portal shell+nav DONE: Dashboard/Referrals/Sessions/
      Claims/Payouts/Profile & Verification; new pages
      TherapistReferrals (accept + decline via new
      therapist_decline_voucher RPC — returns voucher to pool),
      TherapistSessions (per-voucher progress + log session),
      TherapistClaims (all claims + new-claim link). Pending-verification
      link on Dashboard already readable (6g).
- [x] Insurer portal: members (CSV roster+verify+CSV export added),
      pre-auths, plans, claims, invoices, analytics (metrics via
      src/lib/metrics.js METRIC_DEFINITIONS + CSV export already present)
- [x] /super-admin/protection: mode switch, pipeline, queues, partner
      onboarding, therapist invites (send-invite edge fn, role=therapist)
- [x] api/_lib/notify.js in-app + pluggable email/SMS no-op
- [x] In-memory "Sample" protection fixtures in src/demo/fixtures.js
      (protection: insurer, plan, 3 therapists, 6 memberships in every
      state, 7 claims across the pipeline) rendered on /demo — never
      written to DB. SQL seed deleted per prompt.
- [x] Whitelisted-column audit: insurer/therapist pages only read
      insurers, insurer_partnerships, insurer_aggregate_stats (view),
      protection_plans/memberships/consents/events, pre_auth_vouchers,
      provider_vouchers/claims/payouts, therapists — no diary, chat,
      recordings or risk tables. RPCs return whitelisted fields.

## Notes / decisions
- Avatar storage: profile stores path `uid/avatar.webp`; useAvatarUrl
  signs+caches (50min TTL). avatars bucket readable by authenticated
  users; writes owner-folder-only.
- Toast types: success=teal/dark, error=red/white, info=dark/white in
  globals.css .ll-toast--*.
- NumberField commits on blur/Enter.
- Boot loader removed via rAF in main.jsx; index.html fallback 10s.
- 2026-11-11: UPGRADE_PLAN.md recorded the then-current single-SQL-file
  constraint; it is now historical and superseded by the eight-script
  fresh-install process in DATABASE.md and MIGRATION_NOTES.md. Deleted
  supabase/scripts/{grant_super_admin,set_subscription,
  remove_demo_data}.sql and supabase/seed/protection_demo.sql. Demo
  Protection data remains
  in-memory in src/demo instead.
- Phase 3/4/5/6 items largely verified by code review only — browser
  screenshots still owed (Part A.1).

## Protection rebuild (20261112000001–08) — implemented, UNVERIFIED on live DB
- 8 new consolidated migrations written (see MIGRATION_NOTES.md). NOT applied anywhere.
- Membership self-write policies removed; consent gains purpose/wording_version; mode enforced in RPCs.
- New: protection_plan_versions (immutable on approval), protection_benefits, protection_policies,
  protection_roster_entries, protection_claims/_events/_evidence, protection_premium_records + claim-evidence bucket.
- New RPCs: insurer/member policy+claims+premium+preauth decision layer; insurer reads whitelisted only.
- insurer_aggregate_stats redefined on policies; risk bands removed. metrics.js lossRatio now null.
- Frontend: ProtectionPage rewritten (policies/benefits/claims/consents/preauth); InsurerMembers
  (policyholders+issue+premium), InsurerPreAuths (decisions), InsurerClaims (+Protection claims),
  InsurerPlans (versions+benefits), InsurerAnalytics (actuarial report), ProtectionOps (version approval).
- api/cron/protection-lifecycle.js added for the lifecycle sweep.
- STILL OWED: live DB apply + verification, browser E2E, insurer invoice/float reconciliation review,
  treatment-claim provider bridge UI, dispute workflow UI, expense-ratio source.

## DB consolidation (final)
- All 15 prior .sql files consolidated into exactly 8 scripts
  (20261112000001–08). Originals deleted; mapping in MIGRATION_NOTES.md.
- Security addendum appended to script 08: protection_claim_event and
  protection_log_access revoked from authenticated (internal definer calls
  only); claim-evidence bucket size/MIME limits; consent/mode policy notes.
- Database execution and browser E2E status are not certified by this tracker;
  validate only against a disposable Supabase project before production.
- Evidence workflow hardening: `user_id/claim_id/filename` is validated in
  the RPCs and private Storage policies; member and insurer evidence UIs handle
  progress, signed-link errors, and storage/database cleanup failures.
- Report build and lint from the actual check results; no live database or
  browser verification is implied.

## Authoritative installation procedure (eight scripts only)

The repository contains EXACTLY eight executable SQL scripts. There is no
separate "baseline + pass2" step — scripts 01-08 ARE the complete database.

1. Create a fresh Supabase project.
2. Apply `supabase/migrations/20261112000001_core_schema.sql` first.
3. Apply `02_rls_storage_grants`, `03_rpc_functions`, `04_portals_claims`,
   `05_urge_toolkit`, `06_pass2_protection_base`, `07_protection_core`,
   `08_protection_operations` in numeric order. Script 06 contains
   destructive cleanup of superseded subscription structures — do not run
   it against a populated production DB without a backup.
4. Run the verification queries at the end of script 08.
5. Run the negative/positive regression matrix (PROTECTION_TEST_PLAN.md).
6. Only then consider migrating the intended project.

Demo data is in-memory only (`src/demo/fixtures.js`); no seed or cleanup
SQL files exist or are required.

## V2 milestone + actuarial implementation
- Script 08 extended (still 8 scripts total): episodes, milestones, milestone
  claims, actuarial runs, extended insurer_upsert_benefit.
- New pages: /therapist/milestones, /super-admin/actuarial; member milestones
  UI on ProtectionPage; insurer claims show milestone context; InsurerPlans
  benefit form gains milestone/effective-date fields.
- src/lib/markov.js + tests/markov.test.mjs (6 tests, node --test, all pass).
- NOT executed against any database; build-verified only.

## SQL hardening pass (pre-migration)
- Script 08: removed out-of-order DO block on protection_milestones (table is
  created later in the same file; inline check already exists).
- Script 08: consolidated negative regression checks into one result set
  (check_name, offending_rows) — all must be 0.
- All 8 scripts: wrapped auth.uid() as (select auth.uid()) in policies/RPCs.
- Script 08: drop superseded 11-arg insurer_upsert_benefit overload; revoke
  EXECUTE on internal protection helpers from public/anon/authenticated;
  revoke TRUNCATE on audit_logs; ALTER DEFAULT PRIVILEGES so future functions
  do not default to PUBLIC/anon execute.
- Code-read only: NOT applied to any database. No disposable Supabase project
  was available, so apply-twice-on-fresh-project remains UNVERIFIED — owner
  must run scripts 01-08 twice in filename order on a scratch project first.
- Still open: delete-account/schema reconciliation, company-code + supporter
  token hardening, handle_new_user race, storage bucket policies, realtime
  publication review, script 06 destructive guards, remaining unguarded
  ADD CONSTRAINT statements (9 listed in commit report).

## SQL hardening pass — continued (commits through 64f607f)
- Script 03: validate_company_code trusts right-most XFF only; per-actor +
  global per-code throttles; redeem_company_code locks b2b_clients FOR UPDATE.
- Script 01: handle_new_user retries username collisions with a suffix;
  supporter_invitations.token has a 24-byte random default; audit_logs kept
  out of supabase_realtime (dropped if present).
- Script 02: event-images bucket (public read, admin write, 5MB images);
  storage_user_quota_ok() 500MB/user enforced in user-bucket insert policies.
- Script 03: supporter_lookup throttled (hashed token key, 30/hr) and returns
  uniform null for unknown/expired/revoked.
- Script 08: grant sweep excludes internal helpers; FK re-target block makes
  payments/protection/provider/pre-auth/bulk-invoice FKs to profiles
  ON DELETE SET NULL with NOT NULL dropped (anonymisation, not cascade).
- delete-account edge function: revokes protection_consents then ends +
  anonymises protection_memberships before auth-user deletion.
- Verified by code-read: insurer_aggregate_stats has cohort_size >= 25 and
  no risk-band output; all SECURITY DEFINER profile writers validate caller.
- Duplicate-function scan: no remaining differing-signature overloads.
- STILL UNVERIFIED: no database available — apply-twice on fresh project,
  deletion flow, realtime subscriber isolation, storage cross-user tests.
- Script 08: final anon lockdown — EXECUTE revoked on all public functions
  from PUBLIC/anon, service_role restored, explicit 6-function anon
  allowlist (5 supporter_* + validate_company_code).
- Supporter tokens now stored as md5 hashes only (token_hash column);
  raw token returned once at create/renew. Both create_supporter_invitation
  definitions updated (scripts 03, 06); legacy column backfilled+dropped.

## Super-admin account management (2026-11-16)

**Verification labels:** Code-read = inspected source only; Applied to
disposable Supabase = executed on a disposable project; Not verified = no
runtime/database execution. This work is code-read only; nothing was applied
to a Supabase project.

- [x] Step 0, code-read: authorization roles come from live `profiles.role`
  and RLS/RPC queries, not role claims in JWT metadata. Therapist rows use
  `pending | active | suspended`; insurer accounts use a required, unique
  `insurers.profile_id` (one user per insurer row and one insurer row per user)
  and `insurers.status`
  (`active | suspended`). Auth email/phone and profile email/phone are stored
  separately; signup copies contact data into `profiles`. `profiles.username`
  has exact-case uniqueness; this change adds case-insensitive uniqueness and
  reserves admin/support/losslens/oloo/system. Supabase Auth email/phone
  uniqueness and production values were not verified.
- [x] Script 01: adds `must_change_password`, auth-to-profile email/phone
  synchronization, case-insensitive username uniqueness and reserved-name
  protection. Existing case-insensitive duplicates or reserved usernames stop
  migration with an explicit remediation error.
- [x] Script 02: gates diary, CBT, chat, mirror, and pact RLS to member role;
  changed-role staff cannot access these own-account recovery tables.
- [x] Script 08: adds `admin_set_role`, `admin_update_profile_fields`,
  step-up authorization, per-actor rate limiting, service-only session
  revocation and active-insurer-role consistency. Protects last active
  super-admin under the existing advisory-lock trigger. Super-admin
  promotions and peer demotions require password step-up; peer role changes
  notify other super-admins. Therapist work (provider/pre-auth vouchers and
  unsettled claims) must be acknowledged and reassigned before role exit.
  Active Protection policies/claims and therapist open work block relevant
  staff role transitions. Legacy reason-free therapist promotion/reversion
  RPC execution is revoked.
- [x] Added `admin-user-update` Edge Function: database role lookup,
  password step-up, typed confirmation, reasons, rate limiting, email
  synchronization/compensation and old/new notices, reset-link flow,
  one-time random temporary passwords, masked audit metadata and session
  revocation. Temporary-password accounts are gated to a forced-change route;
  authenticated chat, Oloo actions, crisis and payment API routes also reject
  suspended or forced-change accounts server-side.
- [x] Added super-admin-only editor in `/super-admin/users`; role, profile,
  credential sections, per-user history, disabled own/last-super-admin role
  controls, accessible responsive dialog, and English/Kiswahili strings.
- [x] Exactly eight SQL scripts remain; SQL changes are inside scripts 01,
  02 and 08. No test files were added.
- [ ] Disposable Supabase integration tests: not verified (Docker unavailable).
  No production SQL was run. No browser test, email delivery, Auth session
  revocation, or live auth/profile consistency test was performed.
- [x] Local checks: production build passed; existing tests passed (23/23);
  English/Kiswahili dictionaries have 583 matching keys; exactly eight SQL
  migration scripts remain. Scoped lint passed for the changed application
  files except `NotificationBell.jsx`, which retains pre-existing hook lint
  findings. Full `npm run lint` remains red at 223 errors and 18 warnings;
  Deno was unavailable for Edge Function type-checking.
- [ ] Owner setup: manually apply all eight scripts in order; deploy
  `supabase/functions/admin-user-update`; configure `ALLOWED_ORIGIN`,
  `RESEND_API_KEY`, and `EMAIL_FROM` with a verified sender; resolve any
  migration preflight username collisions first. Test in a disposable project
  before production.
- [ ] MFA: recommend requiring TOTP for super-admins. Whether MFA/AAL2 can be
  enforced safely in the deployed project is not verified; enforcement can
  lock out an owner without a tested second super-admin and recovery process.
  MFA was not enabled.

### Static negative-test expectations (not executed)

| Caller role | Targets: self, user, admin, therapist, insurer, other super-admin, last super-admin |
|---|---|
| user | Every role/profile/credential action denied by the Edge Function (`Active super-admin access required`) and both RPCs (`Active super-admin access required`). |
| admin | Every role/profile/credential action denied by the Edge Function and both RPCs (`Active super-admin access required`). |
| therapist | Every role/profile/credential action denied by the Edge Function and both RPCs (`Active super-admin access required`). |
| insurer | Every role/profile/credential action denied by the Edge Function and both RPCs (`Active super-admin access required`). |
| super_admin | See action matrix below; all outcomes are code-read expectations, not test results. |

| Super-admin action | Self | User/admin/therapist/insurer | Other super-admin | Last active super-admin |
|---|---|---|---|---|
| Role change | Denied (`cannot change own role`) | Allowed only after role-specific claim/voucher/org checks; insurer requires an active linked organisation; peer promotion requires password step-up | Demotion requires password step-up and sends notices; promotion requires step-up | Demotion denied by `prevent_last_super_admin_removal` under advisory lock |
| Username/name profile update | Allowed with step-up, reason, and valid confirmation | Allowed with step-up, reason, and valid confirmation | Allowed with step-up, reason, and valid confirmation | Allowed; no role/status change |
| Phone update | Denied (`Phone cannot be changed for yourself`) | Allowed with step-up and E.164 validation; Auth/profile updates are transactional | Denied (`Phone cannot be changed for another super-admin`) | Denied (also a super-admin) |
| Set email / temporary password | Denied for self | Allowed with step-up and reason | Denied for another super-admin | Denied (also a super-admin) |
| Send reset link | Allowed with step-up and reason | Allowed with step-up and reason | Allowed with step-up and reason | Allowed with step-up and reason |

Errors, transaction compensation, notification delivery, and actual target
session revocation remain not verified until the owner runs the manual test
matrix against disposable Supabase accounts. A session-only compromise cannot
pass password step-up; a compromise that also obtains the super-admin's
password can still demote another super-admin and then alter that account.
Reset notices, audit history, peer notifications, role gates, and the
last-super-admin lock reduce and expose that risk but do not eliminate it.
