# Operations

## Applying the database

Eight consolidated base scripts plus the workflow-repair and private-PGSI migrations in `supabase/migrations/` — apply **in filename
order** on a **fresh, disposable** Supabase project first:

```
20261112000001_core_schema.sql
20261112000002_rls_storage_grants.sql
20261112000003_rpc_functions.sql
20261112000004_portals_claims.sql
20261112000005_urge_toolkit.sql
20261112000006_pass2_protection_base.sql
20261112000007_protection_core.sql
20261112000008_protection_operations.sql
20261124000009_workflow_integrity.sql
20261124000010_private_pgsi.sql
```

For an existing project with 01-08 applied, apply 09 then 10, skipping any migration already recorded as applied. Deploy the updated `delete-account` function and Vercel routes alongside the frontend. See [workflow verification](WORKFLOW_FIXES.md).

- Apply forward migration 10 once through migration tracking; it creates private tables. Assessment submission retries are idempotent. Do not rerun the full installation set on a populated project.
- Script 06 contains guarded destructive cleanup (superseded subscription
  objects and removed circle rooms). It runs only on an empty database or
  when `losslens.allow_destructive_reset = 'on'` is set — **never** set that
  on a populated/production database.
- The owner applies SQL manually in the Supabase SQL editor. Agents never
  run migrations against production.

See [PGSI and Oloo verification](PGSI_AND_OLOO.md) before releasing migration 10 and the updated `/api/chat`, `/api/crisis` and frontend together.

## Verification after applying

Run the queries at the end of script 08:

- `regression_checks` — one result set; every `offending_rows` must be 0.
- RLS enabled on every `protection_%` table.
- `public.protection_mode()` returns the current mode.
- Manual role login checks — see `docs/VERIFICATION.md`.

## Go-live checklist

1. Scratch project: apply scripts twice, run verification queries.
2. Set env vars (see README): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`, `PREMIUM_PRICE_KES`,
   Daraja credentials for live M-Pesa.
3. Deploy Edge Function `delete-account` with `ALLOWED_ORIGIN` set.
4. Verify helpline numbers (owner TODO in `src/config/helplines.js`).
5. Protection copy in `src/pages/public/protectionContent.js` is marked
   pending legal review — do not launch pilot/live without sign-off.

## Backup and restore

Use Supabase's built-in daily backups (Pro plan) or `pg_dump` before any
manual SQL session. Restore = new project + re-apply the eight scripts +
`pg_restore` data, or point-in-time recovery on paid tiers.

## Creating a test account (demo mode removed)

Sign up normally at `/signup` with a real email you control, confirm the
email, then log in. For staff roles, a super-admin promotes the account via
`/super-admin` user management — there is no self-serve staff signup.
