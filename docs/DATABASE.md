# Database setup and reference

## Fresh installation

The database setup consists of five consolidated base scripts and one forward migration in
`supabase/migrations/`. Apply them in filename order to a **fresh** Supabase
project:

1. `20261112000001_core_schema.sql` (core schema + RLS/grants/storage + core RPCs)
2. `20261112000004_portals_claims.sql` (therapist/insurer portals, claims + urge toolkit)
3. `20261112000006_pass2_protection_base.sql` (Protection base + core)
4. `20261112000008_protection_operations.sql` (Protection claims/premiums/actuarial/audit)
5. `20261124000009_workflow_integrity.sql` (workflow repairs + private PGSI)
6. `20261125000011_account_protection_workflows.sql` (password-verified roles, callback consent, referrals and direct-payment tracking)

Existing projects that already applied all ten original scripts need no SQL
changes for consolidation alone. For the coordinated account/Protection update,
apply forward migration 11 once; do not rerun the base set. Do not rerun consolidated 09: its absorbed
private-PGSI section creates tables without `IF NOT EXISTS`. For partially
applied projects, reconcile the original migration history and apply only
the missing original sections through a separately reviewed manual upgrade.
See [workflow repairs and verification](WORKFLOW_FIXES.md).

The inherited single-`$` delimiter errors in 09's `is_active_user()` and
`event_attendance_counts()` are corrected in this checkout for fresh installs.
An already migrated project should not replay 09's private-PGSI table creation.

These are consolidated installation scripts, not a supplement to the earlier
baseline or Pass 2 files. Do not mix the historical source scripts into this
fresh-install sequence. Script 06 contains destructive cleanup for superseded
subscription structures; do not apply this fresh-install set to a populated
database without a separately reviewed migration and backup.

The scripts have **not** been applied to the live Supabase project. Apply and
validate them only in a disposable project before considering production use.
The owner runs SQL manually in the Supabase SQL editor; do not run migrations
from the application or against production as part of local development.
Manual steps are in [`OPERATIONS.md`](./OPERATIONS.md).

## Script responsibilities

| Script | Responsibility |
|---|---|
| 01 (absorbs original 02 and 03) | Core schema/helpers, RLS, grants, storage policies and core RPCs |
| 04 (absorbs original 05) | Therapist/insurer portals, vouchers, provider claims, RPCs and urge toolkit |
| 06 (absorbs original 07) | Subscription cleanup, Protection base, security, access, products, policies and pre-authorisation |
| 08 | Protection claims/evidence, premiums, actuarial reporting, and final safeguards |
| 09 (absorbs original 10) | Workflow repairs/privileges and private PGSI assessments, scoring, due time and optional own-user Oloo context |
| 11 (forward migration) | Endpoint-only role changes and retry ledger; per-user reminder preferences; named-recipient callback consent and fair allocation; network referrals; private insurer-to-therapist payment evidence and acknowledgements |

See [PGSI and Oloo verification](PGSI_AND_OLOO.md) for privacy boundaries, sources and deployment checks.

## Database boundaries

- RLS applies to application tables; security-definer RPCs use explicit
  authorization and scoped results where direct client writes are not allowed.
- Insurer access is restricted to their organization and the intended
  whitelisted servicing or claims data. Recovery diaries, chats, crisis
  records, relapse indicators, and detailed clinical information are not
  insurer-facing data.
- The `claim-evidence` Storage bucket is private. Evidence paths use
  `user_id/claim_id/filename`, and database functions and Storage policies
  validate the owner and claim relationship.
- Protection mode is stored in `system_settings` and enforced server-side by
  transactional Protection RPCs.
- Demo Protection data is held in application memory in `src/demo`; there are
  no SQL seed or cleanup scripts.

## Verification

After applying all six scripts once to a disposable Supabase project, run the
read-only verification queries at the end of script 08 and follow the manual
and the negative-test matrix in `docs/VERIFICATION.md`.
These checks have not been run against the live database. Browser testing is
also separate and is not represented as complete here.

Migration 11 requires the privileged migration role because it changes grants,
triggers and Storage policies. It creates the private
`protection-payment-receipts` bucket (PDF, PNG, JPEG; 10 MB maximum). Do not make
it public or grant direct writes to the new workflow tables. Its service-only
role RPC must never be exposed through browser credentials.
