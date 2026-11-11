# LossLens upgrade — progress tracker

Branch: `wip/copilot-phase2-3` (Phase 2+3 committed as dc4095c)
Plan authority: docs/UPGRADE_PLAN.md (delete only when ALL phases done)

## Status legend: [x] done · [~] partial · [ ] not started

## Phase 1 — cleanup [x]
## Phase 2 — auth/roles/redirects/super-admin [x] (verified by code review)

## Part A — finish Phase 3
- [x] i18n en/sw dedupe + parity (484 keys each)
- [x] BrandLoader on all loading states; spinners/dots removed
- [x] Toast system; info→success/error sweep; leading spaces stripped
- [x] Emoji/symbol cleanup (¢ bullets, flags, ⏰⏳🆘, \u{…}, empty icons)
- [x] Profile avatar: AvatarCropper → 256px webp <100KB → avatars bucket; useAvatarUrl hook; authenticated read policy added to combined SQL
- [x] NumberField everywhere; AvatarCropper ranges → NumberField (numeric grep clean)
- [x] Combined SQL: avatars authenticated read policy appended
- [x] index.html boot loader identical; removed on mount, 10s fallback
- [ ] Browser screenshots 360/768/1280 all shells (menu overlap, top-right username+avatar, stray symbols, toast contrast)
- [~] UserAvatar wired into UserManagement (users+payments tabs) and B2BClients member list; still owed: TherapistManagement, InsurerManagement, ChatViewer, insurer/therapist portal lists
- [ ] Final toast-type audit pass
- [ ] Final numeric-field audit pass

## Phase 4 — feature fixes
### The Circle
- [x] Remove family_friends + slip_recovery rooms (UI; no other refs found in i18n/tabs/fixtures/docs)
- [x] Combined SQL: destructive deletes for both rooms (messages, reactions, authors, members); no check constraints exist, counts/purge fns room-agnostic
- [x] Fix duplicate message bug: upsertCircleMessage dedupe (id + temp match user_hash/text/60s), mergeCirclePoll merge-not-replace, poll gated on realtime SUBSCRIBED status
### Urge Toolkit
- [x] Real labelled wheel: ChallengeWheel.jsx — 8 text segments, pointer, 3.5s easeOutQuart spin, WebAudio tick + vibrate, landing highlight
- [x] "I'll do it" → saves urge_challenges status=doing (not done); "Spin again" re-spins
- [x] urge_challenges table + owner RLS in combined SQL; urge_challenge offline queue kind + syncUrgeChallenge
- [x] "My challenges" list in distraction panel: doing/done states, mark-done celebrates, drop supported (dropped hidden)
- [x] Timer: SVG ring already existed; added pulsing radial bg while running + milestone toasts at 5/2/1 min
- [x] Breathing: BreathingOrb inline SVG (expand/contract, face, leaf), 4-4-6 rhythm, phase text + round counter, static under reduced-motion
### Family supporters
- [x] Removed email/phone fields; create_supporter_invitation redefined NULLs them; share sheet (copy/WhatsApp/SMS/native) after create; renew/pause/revoke kept
- [x] create_supporter_invitation redefined in combined SQL (same signature, NULL email/phone)
- [x] /family-join: 30s visible poll + focus/visibility refetch + "Updated x ago" + Refresh button; supporter_get_summary verified live (queries profiles/diary/cbt at call time)
### Recovery report
- [x] AES-GCM (PBKDF2 100k) encrypt in browser → self-contained HTML decryptor page; opens only after passphrase
- [x] Random 8-char passphrase shown above Download + Copy + required share-separately line + Generate new passphrase; never emailed/stored
- [x] "Generate new passphrase" action; never emailed/stored server-side
### Oloo
- [x] Removed glow/halo; flat hand-drawn inline SVG OlooCharacter (teal blob + blue belly + leaf), 6 expressions (calm/happy/concerned/celebrating/thinking/speaking); context-driven: high risk/low mood → concerned, streak%7 → celebrating, streak>=3 → happy
- [x] Time-aware greeting EN/SW (oloo.greet.*), rotating thought-for-today (oloo.thought.0-4), 3 quick chips (urge/log/talk) on welcome card; CSS breathe+blink idle disabled under reduced-motion; typing dots kept; avatar beside replies; detectCrisis → tel: help link on assistant msgs; crisisDetection untouched; send/volume/mic/close icons added to AppIcon

## Phase 5 — subscriptions/entitlements/payments
- [x] subscription_events + payments + plans tables/RLS in combined SQL
- [x] admin_set_subscription/_bulk/admin_get_subscription_history/admin_record_manual_payment/expire_subscriptions RPCs — super_admin gated, reason required, events+audit, privileged trigger passes via is_super_admin()
- [x] UserManagement "Subscription" modal: plan/status/type/NumberField days-or-date expiry/required reason/history list; bulk button on Payments tab (<=100); state updated only from RPC-returned rows; real errors toasted
- [~] expire_subscriptions() SQL fn added (service_role grant); pg_cron schedule + api/cron route NOT yet created — document in MIGRATION_NOTES
- [x] supabase/scripts/set_subscription.sql + grant_super_admin.sql with verification selects
- [~] plans.js + seeded plans + entitlements.js + useEntitlements + RequiresPlan done; enforcement of analytics/AI/storage NOT yet wired into pages; core stays free
- [x] Payments: api/_lib/payments.js (off|sandbox|live, Daraja STK), api/payments/start+mpesa-callback+status, SubscriptionPage phone/waiting/success/failure/retry/receipt flow, .env.example documented; off → register-interest kept

## Phase 6 — Protection + portals
- [ ] docs/PROTECTION.md: existing model, state machine, role×table matrix, gaps — NOT STARTED
- [x] src/lib/protectionStates.js (MEMBERSHIP_STATES/TRANSITIONS/CONSENT_SCOPES/PROTECTION_MODES); SQL check constraints mirror membership states
- [~] protection_plans/memberships/consents/events tables + RLS + indexes + 4 RPCs + protection_mode seed in combined SQL; whitelisted insurer/therapist views NOT yet created
- [ ] Member screens (mode-gated): enrol, pending, active benefits/limits, find therapist, pre-auth request, timeline, consent toggles, leave Protection
- [ ] Therapist portal shell+nav (Dashboard/Referrals/Sessions/Claims/Payouts/Profile/Verification); fix Pending Verification link
- [ ] Insurer portal shell+nav (Dashboard/Members/Pre-auths/Claims/Invoices/Analytics/Plans); roster CSV validation report; shared metric definitions + CSV export grouped only
- [ ] Super admin Protection Ops page: pipeline counts, partners, verification queue, protection_mode switch+audit, partner wizard, therapist invites
- [ ] api/_lib/notify.js adapter: in-app + pluggable email/SMS no-op default; no clinical/diary content
- [ ] supabase/seed/protection_demo.sql + supabase/scripts/remove_demo_data.sql
- [ ] docs/PROTECTION_TEST_PLAN.md + docs/GO_LIVE_CHECKLIST.md

## Notes / decisions
- Avatar storage: profile stores path `uid/avatar.webp`; useAvatarUrl signs+caches (50min TTL). avatars bucket now readable by any authenticated user (needed for admin/therapist/insurer lists); writes remain owner-folder-only.
- Toast types: success=teal/dark text, error=red/white, info=dark/white in globals.css .ll-toast--*.
- NumberField commits on blur/Enter; used for all numeric entry incl. AvatarCropper zoom/position.
- Boot loader removed via rAF in main.jsx; index.html fallback timeout 10s.
- Phase 3 items verified by code review only so far — browser screenshots still owed (Part A.1).
