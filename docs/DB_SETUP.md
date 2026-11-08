# LossLens Database Setup

## Applying the schema

The schema is exactly four idempotent migrations in `supabase/migrations/`:

1. `20261110000001_core_schema.sql` — tables, helpers, triggers, views, seeds, storage buckets
2. `20261110000002_rls_grants_storage.sql` — RLS policies, grants, storage policies
3. `20261110000003_rpc_functions.sql` — user-domain RPCs
4. `20261110000004_portals_claims.sql` — therapist/insurer/claims schema, RLS, RPCs

Apply **in order, once each** (they are also safe to re-run).

### Option A — Supabase CLI (local)

```bash
npx supabase start        # starts local Postgres + auth + storage
npx supabase db reset     # applies supabase/migrations in order
```

### Option B — Remote project

```bash
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push      # pushes pending migrations
```

Or paste each file, in order, into the Supabase Dashboard → SQL Editor and run.

## Required environment variables

| Name | Where | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Vercel + local `.env` | Supabase project URL (client) |
| `VITE_SUPABASE_ANON_KEY` | Vercel + local `.env` | Supabase anon key (client) |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel (serverless) | Required by `api/chat.js` / `api/crisis.js` — **fails closed if missing** |
| `GROQ_API_KEY` | Vercel (serverless) | Groq API key for Oloo chat — never expose to client |
| `ALLOWED_ORIGIN` | Edge functions (`send-invite`, `delete-account`) | Exact app origin; functions fail closed if unset |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` | optional, CLI deploys only | Edge function deployment |

## Post-apply steps

1. **Enable MFA (TOTP)** for admin roles in Supabase Dashboard → Authentication →
   Sign In / Providers. Elevated RPCs require `is_recently_authenticated()`
   (JWT `iat` within 15 minutes) in addition to admin role.
2. **Deploy edge functions**: `supabase functions deploy send-invite delete-account`.
3. **Schedule the circle expiry purge** (optional, needs pg_cron):
   `select cron.schedule('circle-purge-expired', '*/15 * * * *', 'select public.circle_purge_expired()');`

## VERIFY queries (run after applying)

```sql
-- 1. pgcrypto must NOT be required by the schema functions.
select extname, extnamespace::regnamespace
from pg_extension where extname = 'pgcrypto';
-- Expected: at most one row; no function should fail without it.

-- 2. crisis_alerts FK constraint names.
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.crisis_alerts'::regclass and contype = 'f';

-- 3. Key RPCs exist with expected signatures.
select proname, pg_get_function_arguments(oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and proname in (
  'ensure_circle_identity','create_supporter_invitation','whispers_request',
  'whispers_list_open_requests','whispers_respond','whispers_report',
  'redeem_company_code','validate_company_code','recompute_progress',
  'record_crisis_event','pre_authorize_voucher','crisis_resolve',
  'crisis_escalate','crisis_get_contact','send_broadcast',
  'admin_dashboard_stats','admin_confirm_invoice_payment',
  'insurer_generate_bulk_invoice','therapist_accept_voucher',
  'circle_toggle_reaction','circle_room_counts','circle_notify',
  'circle_purge_expired','log_admin_action','is_recently_authenticated'
) order by proname;

-- 4. Policy count per table (sanity: every app table has >= 1 policy
--    except the intentionally service-only ones).
select tablename, count(*) as policies
from pg_policies where schemaname = 'public'
group by tablename order by tablename;

-- 5. Service-role-only crisis functions: authenticated must NOT have EXECUTE.
select proname, proacl
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and proname in ('record_crisis_event','pre_authorize_voucher');

-- 6. Exactly four migration files were applied (supabase_migrations if CLI used).
select version from supabase_migrations.schema_migrations
order by version;
```
