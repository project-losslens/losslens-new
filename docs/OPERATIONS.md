# Operations

## Applying the database

Six maintained scripts in `supabase/migrations/` — apply **in filename
order** on a **fresh, disposable** Supabase project first:

```
20261112000001_core_schema.sql
20261112000004_portals_claims.sql
20261112000006_pass2_protection_base.sql
20261112000008_protection_operations.sql
20261124000009_workflow_integrity.sql
20261125000011_account_protection_workflows.sql
```

Projects that already applied all ten original scripts need no SQL changes for consolidation alone. For the account/Protection workflow update, apply only forward migration `20261125000011_account_protection_workflows.sql` once. Do not rerun consolidated 09: its private-PGSI tables are not guarded with `IF NOT EXISTS`. For partially applied projects, reconcile the original history and review missing original sections before 11. See [workflow verification](WORKFLOW_FIXES.md).

The inherited function-delimiter errors in 09 are corrected locally for fresh installations; see [database setup](DATABASE.md). Existing projects should not replay the full base file to obtain those corrections.

- Apply the workflow/PGSI section of `20261124000009_workflow_integrity.sql` once through migration tracking; it creates private tables. Assessment submission retries are idempotent. Do not rerun the full installation set on a populated project.
- Script 06 contains guarded destructive cleanup (superseded subscription
  objects and removed circle rooms). It runs only on an empty database or
  when `losslens.allow_destructive_reset = 'on'` is set — **never** set that
  on a populated/production database.
- The owner applies SQL manually in the Supabase SQL editor. Agents never
  run migrations against production.

See [PGSI and Oloo verification](PGSI_AND_OLOO.md) before releasing the private-PGSI section of consolidated 09 and the updated `/api/chat`, `/api/crisis` and frontend together.

## Verification after applying

Run the queries at the end of script 08:

- `regression_checks` — one result set; every `offending_rows` must be 0.
- RLS enabled on every `protection_%` table.
- `public.protection_mode()` returns the current mode.
- Manual role login checks — see `docs/VERIFICATION.md`.

## Go-live checklist

1. Scratch project: apply the six scripts once, then run verification queries. The complete set is not rerunnable without migration-history reconciliation.
2. Set env vars (see README): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`, `PREMIUM_PRICE_KES`,
   Daraja credentials for live M-Pesa.
3. Deploy Edge Function `delete-account` with `ALLOWED_ORIGIN` set.
4. Verify helpline numbers (owner TODO in `src/config/helplines.js`).
5. Protection copy in `src/pages/public/protectionContent.js` is marked
   pending legal review — do not launch pilot/live without sign-off.

## Backup and restore

Use Supabase's built-in daily backups (Pro plan) or `pg_dump` before any
manual SQL session. Restore = new project + apply the six scripts +
`pg_restore` data, or point-in-time recovery on paid tiers.

## Account and Protection release dependencies

- Apply migration 11 in a disposable Supabase project first, then through the
  owner's approved manual production process. Deploy the updated
  `admin-user-update` Edge Function and frontend together. Its existing
  `ALLOWED_ORIGIN` must exactly match the site origin; `SUPABASE_URL`,
  `SUPABASE_ANON_KEY` and server-only `SUPABASE_SERVICE_ROLE_KEY` must belong to
  that project. Keep JWT verification and the function's `getUser()` check.
- The old role RPC is deliberately no longer browser-callable. The endpoint
  verifies the actor's own password for every role request, preserves MFA,
  and calls service-only `service_change_account_role`. Migration 11 also
  repairs the reproduced undefined `v_new_role` reference in the old internal
  role implementation. Do not restore direct profile-role writes as a fallback.
- Until configured, Protection stays proposed/unavailable. Staff must configure
  active insurers/partnerships, approved benefit terms, permitted callback routes
  and verified business contacts in Protection ops. Approve an insurer therapist
  network and its available capacity before expecting referral assignment.
- The existing `/api/cron/protection-lifecycle` schedule at 00:15 UTC now also
  assigns/retries due referrals. It still requires `CRON_SECRET` and the server
  Supabase credentials. Member/insurer refresh also checks due activation.
  Policy issuance/quotes alone never bypass premium or effective-date checks.
- The insurer pays the therapist directly outside LossLens. Migration 11 revokes
  legacy bulk-invoice/disbursement/settlement mutation RPCs. The historical
  ledgers stay read only; platform subscription payments are separate.
  An insurer report or uploaded receipt is not independent M-Pesa verification.
- Local verification uses separate disposable member, insurer, therapist,
  admin and super-admin fixtures with the actual SQL and Edge handler. Auth,
  PostgREST/Storage HTTP and provider responses are locally simulated. Verify
  deployed CORS/JWT, real session/MFA configuration and Storage service behavior
  in staging before release. Real Daraja sandbox/live calls, external notices
  and production migrations/deployment remain separate approvals.

## Creating a disposable account (demo mode removed)

Sign up normally at `/signup` with a real email you control, confirm the
email, then log in. For staff roles, a super-admin promotes the account via
`/super-admin` user management — there is no self-serve staff signup.
