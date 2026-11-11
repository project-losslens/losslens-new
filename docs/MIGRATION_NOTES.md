# Manual migration notes

The owner applies SQL manually in the Supabase SQL editor. Do not run these
statements from the application or from a local migration command.

## Order

1. The existing migrations `20261110000001_core_schema.sql` through
   `20261110000006_urge_toolkit_sessions.sql` must already be applied in
   numeric order.
2. Apply `supabase/migrations/20261111000001_pass2_combined.sql`.
   If an earlier draft of the Phase 5 section was already applied, the file
   now contains clearly marked destructive statements that drop
   `public.plans`, `public.subscription_events` and the superseded
   subscription RPCs before recreating the final shape. Re-running is safe.
3. Sanity checks (run as an administrator, plain reads):
   - `select public.is_super_admin();` returns true.
   - `select proname from pg_proc where proname = 'admin_set_subscription';`
     returns exactly one row.
   - `select tablename from pg_tables where schemaname='public'
     and tablename in ('plans','subscription_events','payments');`
     returns only `payments`.
   - `select column_name from information_schema.columns where
     table_name='payments' and column_name in ('reference','provider_ref');`
     returns only `provider_ref`.
   - Sign in as super admin, change one user's subscription in
     `/super-admin/users` with a reason, reload, and confirm the history
     list shows the change (read from `audit_logs`).

The new file redefines the legacy `is_recently_authenticated()` helper so it
no longer checks JWT age. It returns true only for active administrators;
the role-specific `is_admin()` and `is_super_admin()` checks in each RPC remain
the authorization boundary. It adds the `admin_revert_therapist(uuid)` RPC and
replaces therapist self-access policies so a reverted user cannot continue to
access therapist profile data. The RPC and policy changes are idempotent and do
not delete user or claims data.

There are no manual Supabase dashboard steps for this change.

## Phase 5 additions (same combined file)

Objects added: table `payments` (with unique `provider_ref` for
idempotency) and ONE function `admin_set_subscription(uuid[], text, text,
timestamptz, text, text)`. Plans live in `src/config/plans.js`; plan and
status values are validated inside the function. Change history is read
from `audit_logs` (the function calls the existing `log_admin_action`), so
there is no history table. Manual payments during the pilot call the same
function with a reason like `manual payment: <reference>`.

The destructive block at the top of the Phase 5 section drops the earlier
draft objects (`plans`, `subscription_events`, `admin_set_subscription_bulk`,
`admin_get_subscription_history`, `admin_record_manual_payment`,
`expire_subscriptions`, `subscription_plan_allowed`,
`subscription_status_allowed`) if they were applied. Re-apply the file —
every statement is idempotent.

### Subscription expiry job

`GET /api/cron/expire-subscriptions` with header
`Authorization: Bearer $CRON_SECRET`, run daily by a Vercel Cron (or any
external scheduler). No SQL or pg_cron is involved — the endpoint uses the
service role and writes one `audit_logs` row per expiry. To enable on
Vercel add to `vercel.json`:

```json
{ "crons": [{ "path": "/api/cron/expire-subscriptions", "schedule": "15 3 * * *" }] }
```

Vercel Cron cannot set headers, so the endpoint also accepts
`?secret=$CRON_SECRET` as a query parameter; external schedulers should
prefer `Authorization: Bearer $CRON_SECRET`. Keep `CRON_SECRET` server-side
only.
Even without the cron, the client entitlement check treats expired plans as
free.

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

There is NO SQL demo data. Sample Protection records live only in the
in-app Demo mode fixtures (`src/demo`), held in memory and never written to
the database. Real testing uses the UI onboarding wizard — see
`docs/PROTECTION_TEST_PLAN.md`.

### Protection mode switch

Super admin → `/super-admin/protection` → choose concept/pilot/live
(confirmed + audit-logged). Do not set `live` before counsel sign-off — see
`docs/GO_LIVE_CHECKLIST.md`.
