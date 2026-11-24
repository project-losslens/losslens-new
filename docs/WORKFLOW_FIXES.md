# Workflow fixes and verification — 24 November 2026

## Changes

The reported defects are addressed in the source. Deployment and database application are separate from local verification.

- Monthly Mirror local recordings are scoped to the account. Old month-only entries are deliberately not attributed to another account or automatically uploaded.
- Recording success requires both a storage upload and a returned database record. Failed metadata writes attempt to remove the orphan upload. Local fallback saves are awaited, storage errors preserve the recording for retry, and previews release their object URLs.
- The dashboard resets its mounted guard under React Strict Mode, reports load failures with Retry, never creates a missing profile manually, and only reports a refresh after it succeeds. Its weekly labels match the actual recovery dates.
- Diary saves retain the saved record and use an upsert for the first save. Dates use Nairobi's calendar, saved urge scores are restored, and dictation preserves existing notes. Badge evaluation consumes the first recomputation result.
- Urge challenges use stable IDs across offline creation and status changes. Completion feedback follows a confirmed server write or durable local queue write; unavailable local storage shows an error.
- Offline writes share one sync run, filter by account, and use stable IDs for replay. Missing IndexedDB throws instead of claiming a local save.
- Oloo consent failures expose Retry. Failed actions can be retried and are not marked Completed. Late recovery context does not overwrite an active conversation.
- Circle reactions use the actual reaction RPC and returned count. Whispers no longer filters chronological messages using random UUID order.
- Premium renewal uses effective plan status and expiry. Payment polling receives the exact attempt reference, stops after unmount, refreshes the session token, and shows an unresolved outcome as pending instead of encouraging a duplicate payment.
- The M-Pesa callback imports correctly and verifies provider outcomes before success or failure is recorded. Sandbox activation failures return an error. Provider requests have timeouts, URL token authentication was removed, and the expiry sweep does not overwrite concurrent renewals.
- Admin CRUD screens request affected rows and treat zero-row writes as failures. User suspension uses an authorized transactional RPC with an audit record. Deletion, invitation, subscription and account-edit flows validate their response payloads before success.
- B2B forms map to actual `email`, `phone`, `max_users` and `settings` columns. Company redemption allocates a seat under a row lock and activates the company plan. Grant review fields are added in migration 09.
- Insurance partner contacts link to the separate insurer-account workflow. Unconnected System Settings controls were removed; the page reports effective payment configuration and links to working management screens.
- Compatible dependency updates resolved the npm audit findings. The test browser dependency is development-only.

## Mobile and architectural changes

Muted text uses readable design tokens. Bright green gradients behind light text were darkened. Mobile controls have larger touch targets, text inputs avoid iOS focus zoom, forms collapse at narrow widths, and modals fit the dynamic viewport. Help, Oloo and bottom navigation have separate positions. Existing fixed dialogs share focus trapping, Escape dismissal and body-scroll locking. Routed pages use the shell's single h1.

React, Supabase and icons are split into separate build chunks to avoid a single large initial bundle. Shared helpers now handle confirmed mutations, recordings, local recording fallback and the recovery calendar.

## Reproducible checks

- `npm run build` ? passes; the app entry chunk is approximately 98 kB before gzip, with React and Supabase cached separately.
- The former automated checks covered calendar boundaries, roles, redirects, mutation denials, recording failures, sync concurrency and payment races. Those test files were intentionally removed during consolidation.
- For current verification, use `docs/VERIFICATION.md`, `npm run lint` and `npm run build`. Any disposable browser harness and its output belong outside the checkout.
- Browser artifacts are written under ignored `test-results/`. The suite covers 60 routes at 360 and 1280 px, plus populated partner layouts at 320, 360, 390, 414 and 768 px, partner create/edit/delete, zero-row write failures, verified user suspension, mobile navigation and floating-control separation.
- Browser/backend tests use explicit fixtures and intercepted services. They do not contact real payment, email or user accounts and do not establish that deployed RLS is correct.

The lint baseline is pre-existing. The initial run had 219 errors and 17 warnings; the post-fix run had 197 errors and 17 warnings.

## Required database and deployment changes

Apply `supabase/migrations/20261124000009_workflow_integrity.sql` after the consolidated base migrations (it also contains the private-PGSI section). Existing installations that already applied the original ten scripts should apply only this file, not rerun the base installation scripts. No SQL has been applied remotely by this task.

Migration 09 adds grant review fields, replaces token-issuance freshness with AMR authentication-event freshness, rejects missing profiles in the active-account guard, adds a restrictive storage account policy and plan-quota enforcement, adds safe username availability and company summary RPCs, repairs company redemption, adds privacy-preserving event attendance counts, and adds the authorized account-status RPC.

Deploy the updated `delete-account` edge function together with `supabase/functions/_shared/authFreshness.js`. Deploy the Vercel routes and cron configuration with `CRON_SECRET` and the existing service credentials. Jobs are scheduled daily at 00:05 and 00:15 UTC.

Use the privileged migration role for 09; it modifies policies and a trigger on `storage.objects`. The migration is transactional. Verify on a staging project before deploying the matching frontend.

```sql
select column_name from information_schema.columns
where table_schema='public' and table_name='grant_applications'
  and column_name in ('reviewed_at','rejection_reason');
select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and proname in
  ('admin_set_user_status','username_available','member_company_summary','enforce_storage_plan_quota');
select polname from pg_policy
where polrelid='storage.objects'::regclass and polname='losslens_storage_active_account';
select tgname from pg_trigger
where tgrelid='storage.objects'::regclass and tgname='enforce_storage_plan_quota';
```

Still requiring real staging/service verification: migration execution, account/RLS authorization with real tokens, email delivery, Daraja payment processing, cron execution, and camera/microphone behavior on physical iOS and Android devices. The browser suite does not substitute for those checks.
## Recorded local results

Production build: passed. Automated tests: 27 passed. Production browser suite: 125 route/viewport checks passed, including populated layouts and explicit failure paths. npm audit after compatible updates: zero known vulnerabilities. The backend services in these tests are mocked; live database and provider verification remains required as described above.
