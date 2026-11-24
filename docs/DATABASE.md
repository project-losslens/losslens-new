# Database setup and reference

## Fresh installation

The database setup consists of five consolidated scripts in
`supabase/migrations/`. Apply them in filename order to a **fresh** Supabase
project:

1. `20261112000001_core_schema.sql` (core schema + RLS/grants/storage + core RPCs)
2. `20261112000004_portals_claims.sql` (therapist/insurer portals, claims + urge toolkit)
3. `20261112000006_pass2_protection_base.sql` (Protection base + core)
4. `20261112000008_protection_operations.sql` (Protection claims/premiums/actuarial/audit)
5. `20261124000009_workflow_integrity.sql` (workflow repairs + private PGSI)

Existing projects that already applied the original ten scripts should apply
only `20261124000009_workflow_integrity.sql` (it contains the former 09 + 10
forward repairs; skip anything already recorded as applied). See
[workflow repairs and verification](WORKFLOW_FIXES.md) for its changes and
deployment requirements.

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
| 01 | Extensions, enums, core tables, profile bootstrap, and shared helpers |
| 02 | RLS, table grants, default privileges, and storage policies |
| 03 | Core security-definer application RPCs |
| 04 | Therapist/insurer portals, vouchers, provider claims, and related RPCs |
| 05 | Diary urge-level field and urge-toolkit sessions |
| 06 | Subscription cleanup and Protection base schema/workflows |
| 07 | Protection security, access layer, products, policies, and pre-authorisation |
| 08 | Protection claims/evidence, premiums, actuarial reporting, and final safeguards |
| 09 | Verified mutations, support/admin workflow repairs and privileges |
| 10 | Private PGSI assessments, trusted scoring, seven-day due time and optional own-user Oloo context |

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

After applying all eight scripts to a disposable Supabase project, run the
read-only verification queries at the end of script 08 and follow the manual
and the negative-test matrix in `docs/VERIFICATION.md`.
These checks have not been run against the live database. Browser testing is
also separate and is not represented as complete here.
