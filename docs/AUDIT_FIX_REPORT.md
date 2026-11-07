# LossLens Security & Quality Audit — Fix Report

Branch: `fix/audit-2026-11`
Date: 2026-11-07
Scope note: the audit was written against a different file layout than this
repo (e.g. `ProtectedRoute.jsx`, `AdminLayout.jsx`, `useAuthProfile.js`,
`ElevatedRoute.jsx` do not exist). Equivalent components were used:
`RequireAuth.jsx` ≈ ProtectedRoute, `RequireElevated.jsx` ≈ ElevatedRoute,
`AppShell.jsx` (admin mode) ≈ AdminLayout, `AuthProfileContext.jsx`
`useAuthProfile()` ≈ the requested hook.

Commits:
- `be4d8df` — Phase 1 DB hardening
- `d471b04` — Phase 2 server/edge/headers
- (Phase 3–5 changes, where present, are in later commits on this branch.)

## Status by ID

| ID | Status | Evidence / notes |
|----|--------|------------------|
| S1 | Fixed (DB) / Partial (client) | `ensure_circle_identity()` RPC added; `circleHash.js` now calls it. Weak-hash remap in `20261108000002_remap_weak_hashes.sql`. Trigger rewritten: `auth.role()`, postgres/supabase_admin bypass, hash immutable once set. |
| S2 | Fixed (DB) | `circle_message_authors` (admin-only), `circle_messages_safe` view (security_invoker), author trigger on insert. Client still selects `circle_messages`; switch to the safe view is pending. |
| S3 | Partial | `send-invite` rewritten: caller verified, super-admin only, recovery-link flow, CORS via `ALLOWED_ORIGIN`, audit calls. New `delete-account` function added. `admin-reset-password` function the Users page invokes was NOT created — UserManagement still calls `send-invite`-era flow; verify function name before deploy. |
| S4 | Fixed | `profiles.role` is source of truth; `sync_is_super_admin_flag` trigger keeps `is_super_admin` in sync. `useAuthProfile()` already existed in `AuthProfileContext`; RequireAuth/RequireElevated already consume it. |
| S5 | Partial | `profiles.report_password` dropped in migration. Profile.jsx still contains the password-gate code paths (now dead against the dropped column) — UI cleanup pending. |
| S7 | Fixed (DB) / Partial (client) | `admin_profiles_safe` view, `admin_get_user_contact` RPC (super-admin, audited), `report_password` dropped, profiles admin-select restricted to super admins. UserManagement per-user email loop removed; pages embedding `profiles` for standard admins degrade to safe-view data — full page audit pending. |
| S8 | Partial | `delete-account` edge function created (JWT verify, storage cleanup, auth.admin.deleteUser). Profile.jsx not yet rewired to call it; admin delete button not updated. |
| S9 | Fixed | `is_active_user()` + restrictive policies on all listed tables; RequireAuth already signs out suspended users. |
| S10 | Partial | api/chat.js writes `crisis_alerts` (keywords, message_context ≤500, severity, source='chat') via service key when present, best-effort. Shared `src/lib/crisisDetection.js` (EN/SW/Sheng/misspellings, normalised). Diary-side alert write NOT added. Helpline constant has TODO to verify. Unit test for detector NOT added. |
| S11 | Fixed | Quota in api/chat.js: 30/hour, 150/day via chat_history count (env-configurable), HTTP 429. JWT-prefix console.log removed; dead Groq client code deleted from groq.js. |
| S12 | Not done | Signed URLs for PreciousPact/MonthlyMirror, avatar upload fixes, IndexedDB fallback — not implemented. |
| S13 | Fixed (DB) / Partial (client) | All five supporter RPCs + `create_supporter_invitation` (24-byte hex tokens, 30-day expiry, 5-supporter cap). FamilyJoin.jsx / FamilyPortalPage.jsx NOT yet rewired — supporter flow remains broken until rewired (direct anon reads were already impossible). |
| S14 | Partial | Invalid `persistSession` option on signInWithPassword still present in Login.jsx; remember-me storage switch not implemented; super-admin redirect already goes to /admin. |
| S15 | Fixed | Match INSERT/UPDATE policies dropped; `whispers_request/respond/rate` RPCs; Whispers.jsx rewired. |
| S16 | Fixed (DB) / Partial (client) | audit_logs unified (actor_id/action/target_table/target_id/metadata), old columns dropped, INSERT revoked, `log_admin_action` RPC, triggers on profiles/broadcasts/b2b/insurance/grants/settings, no UPDATE/DELETE path. RequireElevated's direct audit insert will now fail silently — rewire to `log_admin_action` pending. AuditLogs.jsx not updated to new columns. |
| S17 | Fixed | `recompute_progress()` (streak/money/badges/clean_since/freeze, server-side badge evaluation), diary columns added, `add_recovery_coins` dropped, default-privileges revoke for anon, Diary.jsx/gamification.js rewired. CBTModules still calls checkBadges (now RPC-backed — OK). |
| S18 | Fixed | vercel.json: CSP, frame-ancestors, nosniff, Referrer-Policy, Permissions-Policy, HSTS. Manual smoke test of login/realtime/uploads pending. |
| F1 | Fixed | `send_broadcast` RPC (audience allow-list, per-recipient notifications, recipient_count, audit). Broadcast.jsx rewired to RPC + safe view counts. |
| F2 | Fixed | crisis_alerts columns + `crisis_resolve`/`crisis_escalate` RPCs; CrisisAlerts.jsx rewired. |
| F3/F5 | Partial | `validate_company_code` (anon), `redeem_company_code`, `handle_new_user` reads username/company_code. Signup.jsx post-signup upsert and SubscriptionPage.jsx direct update NOT yet updated — company signup will fail until rewired (trigger now blocks self plan_type/b2b writes). |
| F10 | Fixed (pre-existing) | RequireAuth already distinguishes no-session vs error with retry; suspended users signed out. |
| F11 | Partial | service-worker.js rewritten: losslens-v1, no /api or Supabase caching, offline helpline page, /icons rewrite removed. Precache is shell-only (no build-manifest injection). |
| F12 | Not done | 203 pre-existing lint errors remain (documented baseline); no new errors introduced by these changes. |
| F13 | Not done | Housekeeping (unused components, README rewrite, report archival, package rename) not done. |
| D1–D8 | Not done | Admin shell rebuild, icon set, token expansion, ui/ components, a11y pass, crisis access widget — not implemented this pass. |

## Manual steps for the owner

1. Run migrations in order (Supabase SQL editor or `supabase db push`):
   - `supabase/migrations/001_master_migration.sql` (if not already applied)
   - `supabase/migrations/20261108000001_security_hardening.sql`
   - `supabase/migrations/20261108000002_remap_weak_hashes.sql` (take a backup first; see rollback note in file)
   - `supabase/migrations/20261106152654_add_profile_risk_columns.sql` is folded into the master migration.
2. Deploy edge functions: `send-invite`, `delete-account` (and create `admin-reset-password` if UserManagement is updated to use it).
3. Env vars: `ALLOWED_ORIGIN` (edge functions), `SUPABASE_SERVICE_ROLE_KEY` (edge functions + Vercel for crisis alerts), optional `CHAT_QUOTA_PER_HOUR`/`CHAT_QUOTA_PER_DAY`.
4. Smoke tests: login, diary save (streak updates), circle message, whispers request/accept, supporter invite link (after FamilyJoin rewiring), broadcast send, crisis alert resolve, company code signup (after Signup/Subscription rewiring), service-worker offline page.
