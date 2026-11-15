# Database setup and reference

## Fresh installation

The complete database setup is exactly these eight executable SQL scripts in
`supabase/migrations/`. Apply them in filename order to a **fresh** Supabase
project:

1. `20261112000001_core_schema.sql`
2. `20261112000002_rls_storage_grants.sql`
3. `20261112000003_rpc_functions.sql`
4. `20261112000004_portals_claims.sql`
5. `20261112000005_urge_toolkit.sql`
6. `20261112000006_pass2_protection_base.sql`
7. `20261112000007_protection_core.sql`
8. `20261112000008_protection_operations.sql`

These are consolidated installation scripts, not a supplement to the earlier
baseline or Pass 2 files. Do not mix the historical source scripts into this
fresh-install sequence. Script 06 contains destructive cleanup for superseded
subscription structures; do not apply this fresh-install set to a populated
database without a separately reviewed migration and backup.

The scripts have **not** been applied to the live Supabase project. Apply and
validate them only in a disposable project before considering production use.
The owner runs SQL manually in the Supabase SQL editor; do not run migrations
from the application or against production as part of local development.
Detailed consolidation mapping and manual checks are in
[`MIGRATION_NOTES.md`](./MIGRATION_NOTES.md).

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
and negative-test cases in [`PROTECTION_TEST_PLAN.md`](./PROTECTION_TEST_PLAN.md).
These checks have not been run against the live database. Browser testing is
also separate and is not represented as complete here.
