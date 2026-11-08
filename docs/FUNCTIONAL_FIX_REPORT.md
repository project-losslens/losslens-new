# LossLens Functional Fix Report — 2026-11-10 round

Branch: `fix/functional-2026-11` (merged to `main`)

## Baselines (recorded before changes)

- `npm run build`: PASS
- `npm run lint`: 200 errors, 17 warnings (pre-existing baseline)
- `node --test api/chat.test.js`: PASS (1 test)

## Final verification

- `npm run build`: PASS
- `node --test api/chat.test.js`: PASS (1 test, updated for consent gate)
- `npx eslint` on touched JS files (api/chat.js, api/consent.js, src/lib/groq.js,
  src/components/RequireElevated.jsx): 0 problems
- `npm run lint` repo-wide: unchanged baseline (~200 pre-existing errors; none
  added in touched files)

## Status

| ID | Status | Files / notes |
|----|--------|---------------|
| SEC-01 | Fixed (DB+API) / Partial (Diary wording) | `20261110000010_security_round2.sql` revokes `record_crisis_event`/`pre_authorize_voucher` from authenticated, drops `lossless_crisis_user_insert`, service-role-only voucher mint with open-voucher guard. `api/crisis.js` already existed and is the Diary path; Diary.jsx already POSTs `{message: notes}` to `/api/crisis` (no separate `thoughts` field exists). |
| SEC-02 | Fixed (DB) | Same migration: `insurer_reimburse_bulk` → service_role only; `bulk_invoices` gains `payment_reference`/`payment_reported_at` + `payment_reported` status; `insurer_mark_invoice_paid` now only reports payment; new `admin_confirm_invoice_payment` credits the float (super-admin + `is_recently_authenticated`). UI already calls these RPCs (InsurerInvoices `p_ref`, FloatManagement `admin_confirm_invoice_payment`). InsurerManagement had no separate mark-paid path. |
| SEC-03 | Fixed | `20261108000001_security_hardening.sql` patched in place: audit backfill wrapped in DISABLE/ENABLE TRIGGER; `drop policy if exists losslens_profiles_super_admin_select` added. |
| SEC-04 | Fixed (DB) | `20261110000010`: identity scrub + backfill into `circle_message_authors`, `circle_messages_scrub_identity`/`circle_messages_record_author` triggers, owner-update policy by `user_hash`. Client `TheCircle.jsx` still selects `*` — view `circle_messages_safe` exists; page rewiring deferred (see FN-05 partial). |
| SEC-05 | Partial | `delete-account` edge function already implemented ordered deletion + `account_deletion_log` + JWT verify; added JWT-iat ≤15min check this round. Missing vs spec: a few minor tables (whispers_reports, supporter_feedback, upgrade_interest, resource_suggestions) rely on FK cascades/SET NULL rather than explicit deletes; Profile.jsx already signs out only after success. Edge function redeploy required. |
| SEC-06 | Fixed | `20261110000011_elevated_access.sql` (is_recently_authenticated + all admin_* RPC guards, copied from hardened 005 set which already covered them); RequireElevated comment added; Profile.jsx already has MFA enroll; delete-account/send-invite now enforce iat≤900s. |
| SEC-07 | Fixed (pre-existing) | `src/lib/supabaseClient.js` + `src/lib/supabase.js` + Login.jsx already implement remember-me storage switching via `createSupabaseClient(persist)`. Verified, no change needed. |
| SEC-08 | Partial | Migration: `therapists_public` view (security-definer, active only), revoke on `therapists`, re-grant minimal self-service, license-change→pending trigger. NOTE: Postgres cannot CREATE POLICY on a view — the spec's policy-on-view was replaced by the filtered view + grants; documented deviation. TherapistManagement/TherapistOnboarding page rewiring to the view NOT done. |
| SEC-09 | Fixed (DB) / Partial (client) | Migration: rate-limited `validate_company_code` (>20/hr per actor, pg_sleep 0.15, constant-shape response), `handle_new_user` seat check FOR UPDATE. Signup.jsx/SubscriptionPage.jsx rewiring NOT done — company-code signup still uses old path until client update lands. |
| SEC-10 | Fixed (API) / Partial (UI) | `api/chat.js`: consent gate (`profiles.ai_data_consent_at`, 403 `{needsConsent:true}`), history rebuild + strict body validation + fail-closed quota were already present; added `api/consent.js` endpoint. `src/lib/groq.js` handles 403 with a bilingual (EN/SW) `window.confirm` consent prompt then retries — simpler than a modal component. Crisis keywords already contained the required phrases; 'hopeless'/'siwezi tena' were not present. Helpline TODO(owner) retained. |
| SEC-11 | Fixed (DB) | `20261110000010` + `20261110000003`: supporter renew regenerates token, `supporter_lookup` filters pending/active, `whispers_respond` enforces user2-only accept + declines table + 3-active limit, `admin_assign_voucher_with_fee` auth-first, legacy `admin_assign_voucher`/`supporter_invitation_lookup` dropped (grep: no frontend callers). |
| SEC-12 | Fixed (DB) | Migration drops avatar/broadcasts/event_discussions/profiles-admin-update exposures (both legacy and lossless policy names), therapist-documents bucket → pdf ≤5MB. |
| SEC-13 | Fixed | vercel.json CSP already lacked api.groq.com (verified); edge functions pinned `@supabase/supabase-js@2.45.0`, require `ALLOWED_ORIGIN`, return generic client errors; `insurer_aggregate_stats` recreated with cohort ≥25 and banded risk tiers. |
| FN-01 | Fixed (DB) | `20261110000001`: `ensure_circle_identity` + `create_supporter_invitation` no longer use `gen_random_bytes` (uuid-hex instead). Grep: no remaining unqualified `gen_random_bytes` inside the rewritten definer functions. |
| FN-02 | Not done | CrisisAlerts/AdminDashboard embed fix + error banner + unit test not implemented. `admin_dashboard_stats` RPC exists (000006) for the dashboard rewrite. |
| FN-03 | Partial | Migration `20261110000002` fixes `redeem_company_code` audit path + adds super-admin select policy on upgrade_interest. Signup.jsx/SubscriptionPage.jsx rewiring NOT done. |
| FN-04 | Partial | Migration `20261110000003` adds `whispers_declines`, `whispers_list_open_requests`, `whispers_report`, rewritten `whispers_respond`, active-match insert policy. Whispers.jsx client rewiring NOT done. |
| FN-05 | Partial | Migration `20261110000004` adds `circle_message_reactions`, `circle_toggle_reaction`, `circle_room_counts`, `circle_notify`, expiry-aware select policies, `circle_purge_expired` (+ commented cron). TheCircle.jsx rewiring NOT done. |
| FN-06 | Partial | Migration `20261110000005` sets recorder MIME types. `src/lib/signedUrl.js`, `mimeSelection.js`, page rewiring NOT done. |
| FN-07 | Partial | Migration `20261110000006` adds `admin_dashboard_stats`, admin select policies on resources/events/groups, `crisis_get_contact`, audit_logs actor FK. AdminDashboard/CrisisAlerts rewiring + ChatViewer removal NOT done. |
| FN-08 | Partial | `20261108000001` patched (SEC-03); `20261110000007_drop_legacy.sql` created; `supabase/config.toml` project_id and CURRENT_SCHEMA_NOTES rewrite NOT done; `supabase/tests/` NOT created. |
| FN-09 | Partial | Migration `20261110000008` rewrites `recompute_progress` (Nairobi dates, grace day, idempotent freeze via `streak_freeze_bridged_date`). `src/lib/dates.js` + page date fixes + Diary single-recompute refactor NOT done. |
| FN-10 | Fixed (DB) | `20261110000009` widens invoice candidates to `status IN ('approved','paid') AND insurer_reimbursed_at IS NULL`. |
| AR-02 | Not done | db.js/ErrorBoundary/ErrorState + unchecked-call sweep not implemented. |
| AR-03 | Not done | nav/AppShell/RequireAuth/Login role-home work not implemented. |
| AR-04 | Not done | src/api/ DAL + privileged-tables lint rule not implemented. |
| AR-05 | Partial | crisisDetection.js already covers required EN/SW/Sheng phrases incl. new additions; high/ambiguous severity split, word-boundary matching, webhook, runbook NOT done. |
| AR-06 | Not done | lint cleanup, README rewrite, package rename, doc archival not done. |

## Owner must do

1. Apply migrations in filename order:
   `001_master_migration.sql` (if not applied) →
   `20261106152654_add_profile_risk_columns.sql` →
   `20261108000001_security_hardening.sql` →
   `20261108000002_remap_weak_hashes.sql` (backup first) →
   `20261109000003` … `20261109000006` →
   `20261110000001` … `20261110000011` (all idempotent; each ends with
   `notify pgrst, 'reload schema'`).
   NOTE: `003_*`, `004_*`, `005_*` are earlier drafts superseded by the
   `20261110*` files — do NOT apply them after the new set.
2. Env vars: `SUPABASE_SERVICE_ROLE_KEY` on Vercel (required — chat now fails
   closed without it), `GROQ_API_KEY`, `ALLOWED_ORIGIN` for edge functions.
3. Redeploy edge functions `delete-account` and `send-invite` (both now enforce
   JWT iat ≤ 15 min).
4. New column `profiles.ai_data_consent_at` is added by `20261110000010` —
   required for Oloo chat (users get a one-time consent prompt).
5. Manual tests per `docs/MANUAL_TEST.md` (not created — see Known limitations).

## Owner decisions needed

- Chat Viewer (`/admin/chats`): FN-07 removal NOT done — still routed. Removing
  it requires a consent model + audited RPC; left in place.
- Money model (FN-10 note): `provider_vouchers` and `pre_auth_vouchers` remain
  separate tables; float is credited only via `insurer_reimburse_bulk` /
  `admin_confirm_invoice_payment`. Whether to merge voucher tables or derive
  float balance is a product decision.
- Crisis ambiguity policy: detector currently treats all matches as high
  severity; an ambiguous (medium, no voucher) tier needs a product call.
- SEC-08 deviation: policies cannot be created on views; `therapists_public`
  is a filtered security-definer view instead.
- SEC-09 deviation: rate-limit table keeps `actor_key` (003 shape) plus added
  `id`/`ip_hash` columns for spec compatibility.

## Security TODOs found

- `src/lib/groq.js` consent uses `window.confirm` (functional but not a styled
  modal); upgrade to a proper consent modal when AR work resumes.
- `circle_messages` still stores `user_hash`; anonymity depends on RLS + the
  scrub trigger — verify no client path selects the raw table after FN-05
  client rewiring lands.
- `insurer_aggregate_stats` bands by `daily_risk_score` deciles labelled as
  percentages — confirm the score semantics before insurer-facing release.

## Known limitations

- No live DB access: all SQL is forward-only migration files for the owner to
  apply; nothing was executed against a database.
- Edge functions were edited but NOT deployed (per constraints).
- Client-side page rewiring for FN-02..FN-09 and all AR tasks is outstanding —
  the database layer for them is in place.
- `npm run lint` baseline (~200 errors) untouched; AR-06 not started.
- Service worker unchanged (PWA-Offline helpline page retained).
