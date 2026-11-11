# LossLens upgrade — progress tracker

Branch: `wip/copilot-phase2-3` (== main at 7191815; Phase 2+3 in dc4095c,
Phases 4–6k committed through 7191815)
Plan authority: docs/UPGRADE_PLAN.md — REWRITTEN to match the latest
prompt (prompt overrides: no plans/history tables beyond what exists,
ONE admin_set_subscription function, no SQL scripts/seed files, in-memory
demo fixtures only). Delete only when ALL phases done.

## Status legend: [x] done · [~] partial · [ ] not started

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

## Phase 5 — subscriptions/entitlements/payments
- [~] SQL: subscription_events/payments/plans tables + admin RPCs +
      expire_subscriptions() exist BUT prompt now says NO plans table and
      NO separate history table — needs reconciliation: history must read
      audit_logs, plans live in src/config/plans.js only, ONE
      admin_set_subscription(uuid[], ...) function. Existing extra objects
      may need removing from combined SQL (destructive-marked) or leaving
      unused — DECIDE and document.
- [x] UserManagement Change subscription modal (RPC-backed, bulk<=100,
      history, typed expiry, required reason)
- [x] api/cron/expire-subscriptions.js exists; verify it uses service
      role; document enabling in MIGRATION_NOTES (check done)
- [~] plans.js + entitlements.js + useEntitlements + RequiresPlan exist;
      enforcement NOT wired into api/chat.js / storage / analytics pages
- [x] Payments: api/_lib/payments.js (off|sandbox|live Daraja STK),
      api/payments/{start,mpesa-callback,status}, SubscriptionPage flow,
      .env.example; off→register-interest kept
- [ ] Delete forbidden SQL helper files — DONE this session
      (supabase/scripts/*.sql, supabase/seed/protection_demo.sql removed)

## Phase 6 — Protection + portals
- [x] docs/PROTECTION.md, PROTECTION_TEST_PLAN.md, GO_LIVE_CHECKLIST.md
- [x] src/lib/protectionStates.js; protection schema/RLS/RPCs +
      protection_mode seed in combined SQL
- [~] Member /protection-member page mode-gated (enrol/pending/active/
      consent/timeline/leave); benefits detail thin; find-therapist +
      pre-auth + leave RPCs done
- [ ] Therapist portal shell+nav (Dashboard/Referrals/Sessions/Claims/
      Payouts/Profile/Verification); Pending Verification link readable
      (6g partially done — verify)
- [~] Insurer portal: members (CSV roster+verify), pre-auths, plans
      pages done; Claims/Invoices/Analytics exist? CSV export owed;
      metrics definitions file owed
- [~] /super-admin/protection: mode switch, pipeline, queues, partner
      onboarding done; therapist invites owed
- [x] api/_lib/notify.js in-app + pluggable email/SMS no-op
- [ ] In-memory "Sample" protection fixtures in src/demo (SQL seed was
      deleted per prompt — must re-create as in-memory demo data)
- [ ] Whitelisted views for insurer/therapist if needed (audit RLS/RPC
      column exposure)

## Notes / decisions
- Avatar storage: profile stores path `uid/avatar.webp`; useAvatarUrl
  signs+caches (50min TTL). avatars bucket readable by authenticated
  users; writes owner-folder-only.
- Toast types: success=teal/dark, error=red/white, info=dark/white in
  globals.css .ll-toast--*.
- NumberField commits on blur/Enter.
- Boot loader removed via rAF in main.jsx; index.html fallback 10s.
- 2026-11-11: UPGRADE_PLAN.md rewritten to match latest prompt; deleted
  supabase/scripts/{grant_super_admin,set_subscription,
  remove_demo_data}.sql and supabase/seed/protection_demo.sql (prompt:
  exactly one SQL file, no scripts/seed). Demo protection data must be
  in-memory in src/demo instead.
- Phase 3/4/5/6 items largely verified by code review only — browser
  screenshots still owed (Part A.1).
