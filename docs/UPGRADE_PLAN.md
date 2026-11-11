# LossLens upgrade — authoritative plan (supersedes earlier copies)

This file mirrors the current upgrade prompt. Where an older copy of this
plan differs, THIS VERSION WINS (especially on SQL). Delete this file and
docs/PROGRESS.md only when every phase is complete.

State: Phase 1 (cleanup) and Phase 2 (auth, roles, redirects, super-admin
separation under /super-admin, no password step-up) are DONE. Phase 3
(BrandLoader everywhere, one toast system, NumberField, avatar cropper,
emoji cleanup) is mostly done. Remaining: Part A (finish Phase 3), then
Phases 4, 5 and 6. One PR per phase.

Resumability: docs/PROGRESS.md tracks every item; update it after every
completed item. If running short of room, finish the current item, commit,
update PROGRESS.md and stop.

## SQL MINIMUM RULE (strict)

- The owner runs SQL manually in the Supabase SQL editor and wants as
  little SQL as possible.
- Exactly ONE SQL file: supabase/migrations/20261111000001_pass2_combined.sql
  (append to it). No files in supabase/scripts or supabase/seed, no
  demo-data scripts, no helper or maintenance scripts, no verification
  query block.
- Before adding any statement ask: can this be done with an existing
  table, column, RPC or RLS policy, or in app code or config instead?
  Prefer columns on existing tables over new tables, one function over
  several, RLS policies over RPCs. No new views unless a security need
  for column whitelisting cannot be met by existing views and RPCs.
- Header comment at the top of each appended section lists every database
  object added and the feature that needs it. Target under ~400 lines for
  everything added in the remaining phases. State the object count in
  each PR.
- Everything idempotent; destructive statements clearly marked. Keep
  docs/MIGRATION_NOTES.md in step: run order and 3–5 manual sanity checks
  as plain text, not SQL files.

## Hard rules

- DO NOT TOUCH THE SITE GATE: middleware.js, lib/gate*.js, gate sections
  of README.md and AGENTS.md, @vercel/functions dependency, gate entries
  in vercel.json, allowlisted public files (/favicon.svg, /favicon.ico,
  /manifest.json, /service-worker.js, /robots.txt, /losslens-icon-*).
  Run `git diff main --stat` at each PR and confirm none changed. If the
  /events 503 comes from the gate, report it and do not fix it.
- No committed test files. Verify in a real browser at 360px and 1280px
  (screenshots in each PR); state whether each item was browser-verified
  or code-read only.
- No new lint errors beyond the existing baseline. No blanket
  search-and-replace; review every changed call site.
- New user-facing strings go in src/i18n/en.js and sw.js with identical
  keys. Crisis numbers only from src/config/helplines.js. Never render the
  contact email or phone as visible text. Do not invent statistics.
- Users are on mid-range Android phones on mobile data. Design for 360px.

## Part A: Finish Phase 3

1. Browser screenshots at 360/768/1280px of user, admin, super-admin,
   therapist and insurer shells. Confirm: menu button does not overlap
   page titles; top right shows username and picture (never email,
   initials fallback); Dashboard and Family Portal have no stray symbols;
   each toast type readable (success teal/dark text, error red/white,
   info dark/white, 4.5:1). Fix what is wrong.
2. Wire UserAvatar into user lists in admin, super-admin, insurer and
   therapist pages with initials fallback. Never real photos in The
   Circle, Whispers or supporter pages.
3. Check every toast call uses the right type.
4. Confirm every numeric field accepts typed numbers (NumberField), no
   dropdown/preset/slider as the only input.

## Phase 4: Feature fixes

### The Circle
- Remove "Family & Friends" and "Slip & Recovery" rooms from UI, i18n,
  community tabs, demo fixtures and docs. In SQL delete their messages
  and room-member rows (marked destructive); update only constraints,
  functions and policies that actually reference those room names.
- Fix duplicate message bug: optimistic temp message and realtime INSERT
  both end up with the real id; 10s poll overwrites the list. One reducer
  de-duplicates by id (match temp to realtime insert by user_hash, text,
  time); poll MERGEs instead of replaces; poll only when realtime is
  disconnected.

### Urge Toolkit
- Wheel: real labelled wheel, 6–8 text segments, pointer, 3–4s eased spin
  decelerating, tick sound or haptic if available, landing highlight.
  On landing choices are "I'll do it" and "Spin again". "I'll do it"
  saves the challenge as in progress, does NOT say done.
- "My challenges" list: In progress, Done, Dropped; "Mark as done"
  celebrates. ONE new table urge_challenges (id, user_id, challenge,
  status doing/done/dropped, chosen_at, completed_at), owner-only RLS,
  offline queue support like other toolkit actions.
- Timer: richer countdown (animated ring, calm pulsing background,
  milestone messages).
- Breathing: replace current element with animated illustration (inline
  SVG or CSS, no heavy library): expanding/contracting shape on 4-4-6
  rhythm, phase text, round counter, reduced-motion fallback.

### Family supporters
- Adding a supporter creates a shareable link instead of emailing.
  Remove email and phone fields from the form (keep columns, stop
  collecting, update create_supporter_invitation accordingly). After
  creation show share sheet: copy link, WhatsApp, SMS, native share with
  ready message. Keep renew, pause, revoke.
- /family-join always shows current data: re-fetch summary on mount,
  every 30s while visible, on tab focus; "Updated <time ago>" label and
  manual refresh. Verify supporter_get_summary reads live data; fix only
  if needed. No account needed. Everything inside the site, no emails.

### Recovery report
- Encrypt in browser (Web Crypto AES-GCM) into one self-contained HTML
  file that decrypts only after passphrase. Random 8-char passphrase per
  report displayed prominently directly ABOVE the Download button with
  Copy button and the line "Share this passphrase in person or by phone,
  not in the same message as the file". Never email or store server-side.
  Add "Generate new passphrase". No SQL.

### Oloo (was a glowing cartoon avatar in AIChat.jsx)
- Warm and alive, not AI-generated: remove glow/halo; simple flat
  hand-drawn-style inline SVG character in brand teal and blue with 4
  expressions (calm, happy, concerned, celebrating) following user
  context (streak milestone, high-risk day, new day); time-aware greeting
  in English or Kiswahili with user's name; "thought for today" line;
  three quick-reply chips ("I have an urge", "Log my day", "Just talk");
  gentle blinking/breathing idle animation (disabled under reduced
  motion); typing indicator; avatar beside each reply. High-risk
  messages always include help button. Keep crisisDetection behaviour
  and replies in the user's language. No SQL.

## Phase 5: Subscriptions, entitlements, payments

Root cause: RLS migration drops the admin update policy on
public.profiles, so old admin update affected 0 rows yet showed success.

1. NO new history table and NO plans table. Each change recorded with
   existing log_admin_action (old/new plan, status, expiry, reason in
   metadata); history in UI reads from audit_logs (existing super-admin
   read access; add nothing unless impossible). Plans live in
   src/config/plans.js. Plan values (free, premium, company,
   protection_member) and statuses (active, trialing, pending, inactive,
   cancelled, expired) validated inside the function, not new constraints.
2. ONE SECURITY DEFINER function admin_set_subscription(p_user_ids
   uuid[], p_plan, p_status, p_expires_at, p_plan_type, p_reason): one
   user or many (up to 100), atomic, requires is_super_admin(), updates
   profiles (confirm it passes the privileged-fields trigger), logs via
   log_admin_action, returns updated rows, raises if zero rows changed.
   Manual payments during pilot use this same function with reason like
   "manual payment: <reference>".
3. User management (under /super-admin/users): replace direct profile
   updates with "Change subscription" modal: plan, status, plan type,
   expiry the admin TYPES (days/months via NumberField, or exact date),
   required reason, history list, bulk change. Update local state only
   after function returns rows; show real error otherwise.
4. Expiry: api/cron/expire-subscriptions on a Vercel cron using service
   role (no SQL, no pg_cron). Client entitlement check also treats
   expired plans as free. Document enabling the cron in
   docs/MIGRATION_NOTES.md.
5. Entitlements code-only: src/config/plans.js, src/lib/entitlements.js
   (single source of truth; expired means free), useEntitlements hook,
   RequiresPlan wrapper with upgrade prompt. Enforce what Pricing.jsx
   promises (analytics detail, AI priority, storage quota), server-side
   where it matters (api/chat.js and existing storage limits). Core
   recovery and crisis help stay free.
6. Payments for Premium only (not insurance): provider adapter in
   api/_lib/payments (sandbox and M-Pesa Daraja STK push),
   PAYMENTS_MODE=off|sandbox|live (default off), endpoints
   api/payments/start, mpesa-callback (idempotent, verifies amount and
   reference), status. ONE new table payments (provider_ref unique for
   idempotency) with RLS (user reads own, super_admin reads all, writes
   by service role only). Successful payment calls same subscription
   function logic server-side. SubscriptionPage gets real flow when
   mode is not off (plan, M-Pesa number, waiting, success, failure,
   retry, receipt); when off keep register-interest. Document every env
   var in .env.example.

## Phase 6: LossLens Protection and insurer/therapist portals

Regulatory stance to preserve in code and copy: LossLens is NOT the
insurer. The insurer sells the policy, collects insurance premiums and
decides claims. LossLens never collects insurance premiums, decides
cover or makes an offer of cover. Diary, chats, recordings and risk data
are never visible to insurers or therapists through any table, view or
RPC; only minimal status data is shared, and only with the member's
separate, revocable consent. A system_settings key protection_mode
(concept default, pilot, live; one insert) controls everything: in
concept mode the app behaves exactly as today (concept page and register
interest only). Pilot and live copy goes in a separate content file
marked "pending legal review".

1. Document in docs/PROTECTION.md the existing model (insurers,
   insurer_partnerships, therapists, provider_vouchers, pre_auth_vouchers,
   provider_claims, provider_payouts, claim_submissions, bulk_invoices,
   claims_float), the state machine from membership verification to paid
   claim, a role by table access matrix and every gap. Define allowed
   state transitions once in src/lib/protectionStates.js.
2. Minimal data model: ONE new table protection_memberships (user_id,
   insurer_id, member_ref, status pending_verification|active|suspended|
   ended|rejected, share_status boolean plus consent_at and revoked_at as
   consent columns, verified_at, timestamps). Insurer plan/benefit terms
   in a jsonb column on an existing insurer table, not a new plans
   table. Member timeline derived from existing voucher/claim rows and
   membership timestamps, no events table. Prefer RLS policies over RPCs
   (members insert/update own row; insurers update rows for own insurer).
   Only new function: insurer_verify_memberships(p_rows jsonb) taking
   parsed roster rows and verifying matching memberships. Insurer and
   therapist facing access returns whitelisted columns only; reuse
   existing views and RPCs, add a view only if a security need cannot
   otherwise be met.
3. Member screens (mode-gated): enrol with insurer and member reference,
   pending state, active state with plain-language benefits and limits
   used, find a verified therapist (county, language, telehealth, fee),
   request pre-authorisation, status timeline, consent toggle, "leave
   Protection".
4. Therapist portal (own shell and nav: Dashboard, Referrals, Sessions,
   Claims, Payouts, Profile and Verification): referral inbox accept/
   decline, session completion, claim submission and payouts via
   existing RPCs; profile with specialties, county, languages, session
   fee, telehealth, licence number and issuing body using existing
   columns; clear verification status. Fix Pending Verification page so
   "profile and license details" link is readable and works.
5. Insurer portal (own shell and nav: Dashboard, Members,
   Pre-authorisations, Claims, Invoices, Analytics, Plans): roster CSV
   upload parsed in browser with validation report before submitting,
   membership list, pre-authorisation inbox with reasons, claims,
   invoices, plan/benefit setup, metrics (enrolled members, claim
   frequency per member per year, average cost per claim, loss ratio,
   retention) from ONE shared definitions file, CSV export and grouped
   data only.
6. Super admin "Protection Ops" page (under /super-admin): pipeline
   counts from existing tables, partner list, therapist verification
   queue, protection_mode switch (confirmation + audit log), partner
   onboarding wizard, therapist invites.
7. Notifications: code-only adapter (api/_lib/notify.js) using existing
   notifications table for in-app messages, pluggable email and SMS
   (default no-op), never containing clinical or diary content.
8. NO SQL demo data. Extend in-app Demo mode fixtures (src/demo) with
   clearly labelled "Sample" Protection data (insurer, plan, therapists,
   members, claims in every state), in memory only, never written to the
   database. Write docs/PROTECTION_TEST_PLAN.md (manual scripts per
   role) and docs/GO_LIVE_CHECKLIST.md.

## Acceptance

- No overlapping titles, readable toasts, username and picture in top
  bar, loader on every page at 360/768/1280px (screenshots).
- The Circle has three rooms and no duplicate messages; wheel, challenge
  list, timer and breathing work as described; supporters get a link and
  see live data; recovery report shows passphrase above download; Oloo
  redesigned.
- Super admin can change any user's subscription from UI with typed
  duration and reason; persists after reload, appears in history.
  Premium and other plans change real behaviour; expired plans downgrade.
- PAYMENTS_MODE=sandbox: user can complete Premium purchase; off:
  nothing breaks.
- protection_mode=concept: app behaves as before; pilot: member,
  therapist, insurer and super admin can complete enrolment-to-paid-claim
  journey via UI-created records. No insurer/therapist session can read
  diary, chat, recording or risk data.
- Exactly one SQL file, runs cleanly twice, header lists every object and
  why.
- git diff shows no gate changes. Each PR lists what was verified and
  how, assumptions, placeholder copy, unfinished items, SQL object
  count, exact manual SQL step.
