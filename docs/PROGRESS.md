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
- [ ] Remove family_friends + slip_recovery rooms (UI, i18n, tabs, fixtures, docs)
- [ ] Combined SQL: delete their messages/room-member rows (destructive), update check constraints, circle_room_counts, circle_purge_expired, policies
- [ ] Fix duplicate message bug: single reducer dedupe by id, match temp↔realtime by user_hash+text+time, poll merges not replaces, poll only when realtime disconnected
### Urge Toolkit
- [ ] Real labelled wheel: 6–8 text segments, pointer, 3–4s eased decelerating spin, tick/haptic, landing highlight
- [ ] "I'll do it" → saves challenge in-progress (not done); "Spin again"
- [ ] urge_challenges table + owner RLS in combined SQL + offline queue
- [ ] "My challenges" list: In progress / Done / Dropped + "Mark as done" celebrate
- [ ] Timer: animated ring, pulsing bg, milestone messages
- [ ] Breathing: animated SVG/CSS 4-4-6, phase text, round counter, reduced-motion fallback
### Family supporters
- [ ] Remove email/phone fields; create share link; share sheet (copy/WhatsApp/SMS/native) with ready message; keep renew/pause/revoke
- [ ] create_supporter_invitation updated in combined SQL
- [ ] /family-join: refetch on mount + every 30s visible + on focus, "Updated <time ago>", manual refresh; verify supporter_get_summary live data
### Recovery report
- [ ] AES-GCM encrypt in browser → self-contained HTML decrypting after passphrase
- [ ] Random 8-char passphrase per report, shown ABOVE Download + Copy + "Share this passphrase in person or by phone, not in the same message as the file"
- [ ] "Generate new passphrase" action; never emailed/stored server-side
### Oloo
- [ ] Remove glow/halo; flat hand-drawn inline SVG, teal+blue, 4 expressions (calm/happy/concerned/celebrating) context-driven
- [ ] Time-aware greeting EN/SW with name; thought-for-today; 3 quick-reply chips; idle blink/breathe (reduced-motion off); typing indicator; avatar beside replies; high-risk keeps help button; keep crisisDetection + language matching

## Phase 5 — subscriptions/entitlements/payments
- [ ] subscription_events table + RLS; plans check constraint/table
- [ ] admin_set_subscription / _bulk / admin_get_subscription_history RPCs (is_super_admin, validation, events + log_admin_action, pass privileged trigger)
- [ ] UserManagement "Change subscription" modal: plan/status/type/typed expiry/reason/history/bulk; local state only after RPC row
- [ ] Expiry job: pg_cron or api/cron/expire-subscriptions (service role); document
- [ ] supabase/scripts/set_subscription.sql + grant_super_admin.sql with verification selects
- [ ] plans.js + seeded plans table + entitlements.js + useEntitlements + RequiresPlan; enforce Pricing promises server-side where it matters; core recovery/crisis free
- [ ] Payments Premium only: api/_lib/payments adapter (sandbox + M-Pesa Daraja STK), PAYMENTS_MODE=off|sandbox|live, api/payments/start + mpesa-callback (idempotent) + status, payments table RLS, SubscriptionPage flow, admin_record_manual_payment RPC, .env.example docs; off → register-interest

## Phase 6 — Protection + portals
- [ ] docs/PROTECTION.md: existing model, state machine, role×table matrix, gaps
- [ ] src/lib/protectionStates.js single source mirrored by SQL checks
- [ ] protection_plans/memberships/consents/events tables + RLS + indexes; member_request_enrolment, member_set_consent, insurer_upload_member_roster, insurer_verify_membership RPCs; whitelisted views/RPCs
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
