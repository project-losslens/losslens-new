# LossLens Schema Notes

The schema is consolidated into exactly four migrations in `supabase/migrations/`,
applied in filename order. They are the final state of the schema — idempotent
(`create table if not exists`, `create or replace function`, `drop policy if
exists` before every `create policy`) and safe to re-run.

| File | Contents |
| --- | --- |
| `20261110000001_core_schema.sql` | All user-domain tables (profiles incl. risk/freeze/AI-consent columns, diary, CBT, chat, resources, events, groups, crisis_alerts, broadcasts, notifications, supporters, circle + reactions, whispers + declines, media metadata, business/admin tables, audit_logs final shape, company-code attempts, account_deletion_log), indexes, base helpers (`current_user_role`, `is_super_admin`, `is_admin`, `is_active_user`, `is_recently_authenticated`, `log_admin_action`), triggers (new-user, privilege protection, identity scrub, audit immutability, updated_at, audit-table triggers), views (`admin_profiles_safe`, `circle_messages_safe`), badge seed data, realtime publication, storage buckets with final MIME types. |
| `20261110000002_rls_grants_storage.sql` | `enable row level security` on every table, the single final policy set (owner policies, admin policies, restrictive `is_active_user` policies, hashed-identity circle/whispers policies), table grants/revokes, audit_logs actor FK, storage.objects policies for avatars/mirror-recordings/precious-pacts/therapist-documents. Portal/claims RLS lives in file 04. |
| `20261110000003_rpc_functions.sql` | All user-domain security-definer RPCs: circle identity/reactions/notify/counts/purge, whispers (request, list open, respond, rate, report), supporter token + owner RPCs, company codes (validate rate-limited, redeem), `recompute_progress` (Nairobi-anchored, idempotent freeze), crisis (`record_crisis_event`/`pre_authorize_voucher` service-role only, resolve/escalate/contact), `send_broadcast`, `admin_get_user_contact`, `admin_dashboard_stats`, `increment_pact_play_count`. |
| `20261110000004_portals_claims.sql` | Therapists, insurers, partnerships, provider_vouchers + pre_auth_vouchers (kept separate), provider_claims/payouts, claim_submissions, bulk invoices + claims, claims float + ledger; their RLS/grants; views `therapists_public` (active only) and `insurer_aggregate_stats` (cohort ≥ 25, banded risk); all portal/claims RPCs with elevated-access (`is_recently_authenticated`) guards on admin functions; insurer reports payment, only super-admin confirmation credits the float; ends with a guarded legacy weak-hash (`user_%`) remap that is a no-op on fresh databases. |

## Notes

- No `pgcrypto` dependency: randomness uses `gen_random_uuid()` only.
- `record_crisis_event` and `pre_authorize_voucher` are executable by
  `service_role` only; the browser reaches them via `api/chat.js` /
  `api/crisis.js`.
- `profiles.ai_data_consent_at` gates Oloo AI chat (enforced in `api/chat.js`).
- MFA must be enabled in the Supabase dashboard for admin roles (elevated RPCs
  require `is_recently_authenticated()`).
- Verification queries live in `docs/DB_SETUP.md`.
