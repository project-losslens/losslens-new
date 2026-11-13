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

## Consolidated database deliverable (exactly 8 scripts)

The ENTIRE database setup is consolidated into eight executable scripts in
`supabase/migrations/`, applied in filename order on a fresh Supabase
project. None have been executed — apply manually, then run the verification
queries at the end of script 08.

| # | Final script | Consolidated from | Contents |
|---|---|---|---|
| 1 | `20261112000001_core_schema.sql` | `20261110000001_core_schema.sql` | Extensions, enums, all core tables, profiles trigger, helper functions |
| 2 | `20261112000002_rls_storage_grants.sql` | `20261110000002_rls_grants_storage.sql` | RLS policies, table grants, default privileges, storage.objects policies |
| 3 | `20261112000003_rpc_functions.sql` | `20261110000003_rpc_functions.sql` | Core security-definer RPCs (circle, whispers, supporter, company codes, crisis, broadcast, admin) |
| 4 | `20261112000004_portals_claims.sql` | `20261110000004_portals_claims.sql` | Portal tables (insurers, therapists, vouchers, claims, invoices, float), portal RPCs, therapist/insurer RLS |
| 5 | `20261112000005_urge_toolkit.sql` | `20261110000005_diary_urge_level.sql` + `20261110000006_urge_toolkit_sessions.sql` | Diary urge_level column, urge toolkit sessions |
| 6 | `20261112000006_pass2_protection_base.sql` | `20261111000001_pass2_combined.sql` | Protection base tables (plans/memberships/consents/events), Protection RPCs, subscription cleanup — **destructive drops of superseded structures** |
| 7 | `20261112000007_protection_core.sql` | `20261112000001–04` protection scripts | Security helpers + mode gate, insurer access layer, plan versions/benefits/policies/roster, pre-auth repair |
| 8 | `20261112000008_protection_operations.sql` | `20261112000005–08` protection scripts | Claims/evidence, premium ledger + lifecycle, actuarial views/reports, immutability guards, grants sweep, **security hardening addendum** (internal-only audit/event RPCs, evidence bucket limits) |

Original-to-final mapping: every original `.sql` file is fully incorporated
above; no functionality was dropped. Git history retains the originals.

Key semantics: membership ≠ policy; policies bind to APPROVED immutable
product versions; insurer confirms premiums (never LossLens subscriptions);
fixed-sum amounts computed server-side; insurer claim settlement is recorded
remittance isolated from `claims_float`; `protection_mode` enforced inside
RPCs; insurer reads whitelisted via RPCs only; `protection_claim_event` and
`protection_log_access` are internal-only (revoked from authenticated).

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

## Authoritative installation procedure (eight scripts only)

The repository contains EXACTLY eight executable SQL scripts. There is no
separate "baseline + pass2" step — scripts 01-08 ARE the complete database.

1. Create a fresh Supabase project.
2. Apply `supabase/migrations/20261112000001_core_schema.sql` first.
3. Apply `02_rls_storage_grants`, `03_rpc_functions`, `04_portals_claims`,
   `05_urge_toolkit`, `06_pass2_protection_base`, `07_protection_core`,
   `08_protection_operations` in numeric order. Script 06 contains
   destructive cleanup of superseded subscription structures — do not run
   it against a populated production DB without a backup.
4. Run the verification queries at the end of script 08.
5. Run the negative/positive regression matrix (PROTECTION_TEST_PLAN.md).
6. Only then consider migrating the intended project.

Demo data is in-memory only (`src/demo/fixtures.js`); no seed or cleanup
SQL files exist or are required.
