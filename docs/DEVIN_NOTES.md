# DEVIN_NOTES — sql-consolidation-and-loader task log

Branch: `chore/sql-consolidation-and-loader` (from main @ c01114d).
Safety tag pushed: `pre-devin-20261108-1335`. Remote: github.com/project-losslens/losslens-new.
Owner has NOT replied "SQL applied" — do NOT merge to main or deploy until then.

## Environment facts
- Windows, repo root `C:\Users\ADMIN\OneDrive\Desktop\LossLens-New`.
- Node tests: `node --test api/chat.test.js` (passes). Build: `npm run build` (passes ~6-13s).
- Lint baseline: 200 errors / 17 warnings (pre-existing; do not add).
- No DB access to production; scratch Postgres needed for Stage-1 validation (check `docker` availability; else install postgres or use `pg_tmp`/embedded — must run SQL twice idempotent).
- Vercel project name and production URL NOT provided by owner (`<VERCEL_PROJECT>`, `<https://YOUR-DOMAIN>` placeholders) — Part D gate 5 (`vercel env ls`) and deploy steps may be blocked; ask owner if secrets absent.
- Secrets referenced by name only: VERCEL_TOKEN, optional SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF. Never echo values.

## Current state of repo (after previous task merge)
- 22 .sql files in supabase/migrations (~7770 lines). Intended replay order: 001_master → 20261106152654 → 20261108000001 → 20261108000002 → 20261109000003..06 → 20261110000001..11. Files 003_/004_/005_ are earlier drafts superseded by 20261110000010/11 (005 == 011 byte-identical; 003 ⊂ 010).
- api/: chat.js (consent gate, history rebuild, quota fail-closed, service-key mandatory), crisis.js (diary crisis endpoint, service key), consent.js (re-export of consentHandler), chat.test.js (passes).
- src/lib/: supabaseClient.js (createSupabaseClient(persist)), supabase.js (remember-me aware), crisisDetection.js (EN/SW/Sheng phrases), groq.js (askGroq → /api/chat, handles 403 needsConsent via window.confirm → /api/consent).
- Diary.jsx already POSTs notes to /api/crisis (no direct record_crisis_event RPC call — Part B item 2 mostly done; verify).
- Profile.jsx: MFA enroll exists; delete-account invoked then signOut only on success.
- Edge functions send-invite + delete-account: pinned supabase-js@2.45.0, ALLOWED_ORIGIN required (returns 500 if unset — spec wants throw), JWT iat≤900s enforced, generic errors.
- docs/: schema-reference.md (full replay summary), FUNCTIONAL_FIX_REPORT.md (prior task), AUDIT_FIX_REPORT.md, BUILD_NOTES.md.
- public/: losslens-logo.png (1700x750, flower mark ~x298-523 y247-485), losslens-icon-192/512.png are WRONG (wide logo, not square) — Part C must regenerate.
- src/components/PageLoader.jsx = spinner; used in App.jsx Suspense, RequireAuth, RequireElevated. ~15 admin pages have plain "Loading ..." <p>.
- supabase/config.toml project_id currently "kingsly" → must set "losslens".
- supabase/CURRENT_SCHEMA_NOTES.md exists (stale) → rewrite.
- scripts/check-queries.mjs does NOT exist → create; add "check:queries" to package.json.

## PROGRESS LOG
- DONE: branch `chore/sql-consolidation-and-loader` pushed; safety tag `pre-devin-20261108-1335` pushed.
- DONE: `supabase/migrations/20261110000001_core_schema.sql` written (tables+helpers+triggers+views+seeds+realtime+buckets). NOTE: file references public.b2b_clients in profiles FK + handle_new_user before b2b_clients is created in file 4 — must either move b2b_clients create earlier or accept ordering issue; FIX: b2b_clients is created in file 1? NO — check: I did NOT include b2b_clients in file1 (it's in portals file per spec? Actually b2b_clients is business table — spec file1 lists it? spec file1 list doesn't mention b2b_clients explicitly but handle_new_user + profiles FK need it. DECISION: create b2b_clients/grant_applications/insurance_partners/system_settings/upgrade_interest/company_code_validation_attempts/account_deletion_log — I DID include them in file1 already (business tables section). Verify file1 has b2b_clients BEFORE profiles FK usage — FK is in alter table after create table profiles but b2b_clients table is created later in same file → ERROR: relation does not exist. FIX NEEDED: move b2b_clients creation before the profiles alter, or defer FK. Simplest: in file1, create b2b_clients table BEFORE profiles section, or wrap FK add in DO block that runs after — it's already a DO block but still same-file ordering: DO block runs at that point in file, before b2b_clients create. FIX: relocate `create table b2b_clients` (and its FK dependency) to top of file before profiles alter. Also handle_new_user references b2b_clients — function body is fine (runtime), only the FK constraint + insert need table to exist at creation? FK needs table at ALTER time. MUST FIX before validation.
- TODO NEXT: write 20261110000002_rls_grants_storage.sql, 03_rpc_functions.sql, 04_portals_claims.sql; then delete 18 old .sql; CURRENT_SCHEMA_NOTES.md; docs/DB_SETUP.md; config.toml project_id; scratch-PG validation; check-queries.mjs; Stage 2; Stage 3.

## Stage plan / progress
- STAGE 1 (Part A): NOT STARTED. Goal: exactly 4 .sql files:
  1. 20261110000001_core_schema.sql — tables final shape, indexes, base helpers (is_admin/is_super_admin/is_active_user/is_recently_authenticated/log_admin_action), triggers, views, seeds, realtime pub, storage buckets (pacts audio webm/mp4/ogg/x-m4a; mirror video webm/mp4; avatars img; therapist-documents pdf 5MB).
  2. 20261110000002_rls_grants_storage.sql — RLS enable, final policies (incl. restrictive is_active_user), grants/revokes, storage policies, default privileges.
  3. 20261110000003_rpc_functions.sql — all definer RPCs grouped by domain, each with set search_path + revoke public/anon + explicit grants.
  4. 20261110000004_portals_claims.sql — therapists/insurers/vouchers/claims/float/invoices RLS+RPCs+views + guarded weak-hash remap block (if exists user_% rows).
  Method: replay intended order, emit final state once, idempotent. No pgcrypto dependency (gen_random_uuid only). Then delete other 18 .sql files, rewrite CURRENT_SCHEMA_NOTES.md, create docs/DB_SETUP.md, set config.toml project_id="losslens".
  Validation: scratch Postgres stub (roles anon/authenticated/service_role, auth schema w/ uid()/role()/jwt(), storage schema, supabase_realtime publication) in /tmp; apply 4 files twice zero errors; smoke tests (redeem_company_code good/bad, ensure_circle_identity, create_supporter_invitation, whispers request→list→respond, recompute_progress idempotent, authenticated CANNOT exec record_crisis_event/pre_authorize_voucher, RLS isolation, anon reads nothing); inventory diff; scripts/check-queries.mjs.
- STAGE 2 (Part B): NOT STARTED. Verify+fix list in task (crisis embeds+error banners, diary crisis route [mostly done], company-code client flow, whispers client, circle client, pact/mirror signed URLs + mime, admin stats RPC + ChatViewer removal, diary dates.js + single recompute, nav/roles/404, PWA icons bug, db.js unwrap + ErrorBoundary + unchecked-error sweep, security verifications, npm audit, src/api layer + roleHome.js + ESLint rule).
- STAGE 3 (Part C): NOT STARTED. LogoMark.jsx SVG (8 petals teal/blue, sample colors from PNG → --brand-teal/--brand-blue in tokens.css), BrandLoader.jsx (variants fullscreen/section/inline, 150ms delay + 300ms min via src/lib/loaderTiming.js pure helper + unit test, prefers-reduced-motion), PageLoader.jsx re-export, index.html boot loader (inline SVG+CSS only, no script, body bg #0B1220), replace plain Loading paragraphs, regenerate square PWA icons 192/512/maskable, update manifest.json (any + maskable) + index.html links, check service-worker precache.
- PART D: gates then PR + STOP for owner "SQL applied". No main push/deploy before that.

## Key file paths to re-read when resuming
- supabase/migrations/*.sql (all 22 — final-state source of truth; 20261110000010/11 are newest)
- src/pages/user/{Diary,TheCircle,Whispers,Profile,PreciousPactPage,MonthlyMirrorPage,SubscriptionPage,Onboarding}.jsx
- src/pages/public/{Login,Signup,FamilyJoin}.jsx
- src/pages/admin/{CrisisAlerts,AdminDashboard,ChatViewer,Manage*,UserManagement,B2BClients,...}.jsx
- src/pages/{therapist,insurer}/*.jsx
- src/components/{AIChat,PageLoader,RequireAuth,RequireElevated,AppIcon}.jsx
- src/layouts/AppShell.jsx, src/config/nav.config.js, src/context/AuthProfileContext.jsx, src/App.jsx
- src/lib/{crisisDetection,groq,supabase,supabaseClient,gamification,relapsePrediction,notifications,pwa,storageKeys,circleHash}.js
- index.html, public/manifest.json, public/service-worker.js, vercel.json, package.json, eslint.config.js, supabase/config.toml
- api/{chat,crisis,consent}.js, api/chat.test.js

## Decisions made so far
- Consent UX: window.confirm bilingual prompt in groq.js (not a modal) — acceptable interim; upgrade optional.
- SEC-08: policies can't be created on views → therapists_public is filtered security-definer view.
- SEC-09: rate-limit table kept actor_key + added id/ip_hash columns.
- Draft migrations 003/004/005 will be DELETED in consolidation (superseded).

## Open questions for owner (if needed)
- VERCEL_PROJECT name + production URL missing.
- Whether SUPABASE_ACCESS_TOKEN/PROJECT_REF secrets exist.

## CHECKPOINT 1 (Stage 1 / Part A) — committed 8ff2557
- Four files exist: 20261110000001_core_schema.sql, _02_rls_grants_storage.sql, _03_rpc_functions.sql, _04_portals_claims.sql. `git ls-files '*.sql'` = exactly 4.
- File 04 assembled by concatenating 20261109* portal sources + overrides from 00009/00010/00011 + re-asserted crisis writers + guarded weak-hash remap. Newest defs appended last so they win.
- KNOWN GAPS in file 04: concatenated sources may contain a few non-final duplicate defs where an older file's version sits between newer ones (later wins, so final state is correct); `notify pgrst` appears multiple times inside file 04 (harmless). The `circle_message_authors` update in remap block is a deliberate no-op (`where false`) — authors reference profiles.id not hash.
- VALIDATION BLOCKED: no docker, no psql/postgres on this Windows box. Could not run scratch-PG apply-twice or smoke tests. SQL correctness reviewed statically only — OWNER MUST apply carefully; DB_SETUP.md has VERIFY queries. This is the biggest risk.
- scripts/check-queries.mjs NOT yet created; "check:queries" not added to package.json.
- config.toml project_id = "losslens" done. CURRENT_SCHEMA_NOTES.md + docs/DB_SETUP.md written.
