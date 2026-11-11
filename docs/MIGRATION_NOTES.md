# Manual migration notes

The owner applies SQL manually in the Supabase SQL editor. Do not run these
statements from the application or from a local migration command.

## Order

1. The existing migrations `20261110000001_core_schema.sql` through
   `20261110000006_urge_toolkit_sessions.sql` must already be applied in
   numeric order.
2. Apply `supabase/migrations/20261111000001_pass2_combined.sql`.
3. Run the verification `SELECT` at the end of that file while signed in as
   an administrator.

The new file redefines the legacy `is_recently_authenticated()` helper so it
no longer checks JWT age. It returns true only for active administrators;
the role-specific `is_admin()` and `is_super_admin()` checks in each RPC remain
the authorization boundary. It adds the `admin_revert_therapist(uuid)` RPC and
replaces therapist self-access policies so a reverted user cannot continue to
access therapist profile data. The RPC and policy changes are idempotent and do
not delete user or claims data.

There are no manual Supabase dashboard steps for this change.

## Phase 5 additions (same combined file)

The combined file now also contains: `plans` (seeded), `subscription_events`,
`payments`, and RPCs `admin_set_subscription`, `admin_set_subscription_bulk`,
`admin_get_subscription_history`, `admin_record_manual_payment`,
`expire_subscriptions`, plus `subscription_plan_allowed` /
`subscription_status_allowed` validators. Re-apply the file — every statement
is idempotent.

### Subscription expiry job (pick one)

- **pg_cron** (if enabled on the project):
  `select cron.schedule('expire-subscriptions', '15 3 * * *', $$select public.expire_subscriptions()$$);`
- **Vercel Cron / external scheduler**: `GET /api/cron/expire-subscriptions`
  with header `Authorization: Bearer $CRON_SECRET`. Add `CRON_SECRET` to env.

### Payments env vars

Set `PAYMENTS_MODE=off|sandbox|live` (default off), `PREMIUM_PRICE_KES`, and
for live M-Pesa: `MPESA_BASE_URL`, `MPESA_CONSUMER_KEY`,
`MPESA_CONSUMER_SECRET`, `MPESA_BUSINESS_SHORT_CODE`, `MPESA_PASSKEY`,
`MPESA_CALLBACK_URL`. See `.env.example`.

## Phase 6 additions (same combined file)

`protection_plans`, `protection_memberships`, `protection_consents`,
`protection_events` tables + RLS; `member_request_enrolment`,
`member_set_consent`, `member_request_preauth`, `member_leave_protection`,
`insurer_upload_member_roster`, `insurer_verify_membership` RPCs;
`protection_mode` seed (`concept`); insurer select policy on
`pre_auth_vouchers`; insurer write policy on `protection_plans`; therapist
directory columns (`county`, `session_fee`, `telehealth`).

### Protection demo data

1. Create demo auth users (demo-insurer@, demo-therapist1..3@,
   demo-member1..10@example.com) via the app or auth admin.
2. Run `supabase/seed/protection_demo.sql` as postgres.
3. Remove with `supabase/scripts/remove_demo_data.sql`.

### Protection mode switch

Super admin → `/super-admin/protection` → choose concept/pilot/live
(confirmed + audit-logged). Do not set `live` before counsel sign-off — see
`docs/GO_LIVE_CHECKLIST.md`.
