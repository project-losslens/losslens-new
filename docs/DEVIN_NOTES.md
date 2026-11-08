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
