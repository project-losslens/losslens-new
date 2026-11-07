# LossLens Schema Notes

## Source migrations

| File | Summary |
| --- | --- |
| `supabase/migrations/20261104_000001_identity_profiles.sql` | Enables `pgcrypto`, creates `public.profiles`, reconciles profile columns, adds role/status indexes, and constrains `role` to `user`, `admin`, or `super_admin`. |
| `supabase/migrations/20261104_000002_recovery_cbt.sql` | Creates recovery/CBT tables: `diary_entries`, `cbt_progress`, `badges`, and `chat_history`, plus indexes and checks. |
| `supabase/migrations/20261104_000003_resources_events.sql` | Creates resources, ratings, suggestions, events, RSVPs, event messages/discussions, and support groups. |
| `supabase/migrations/20261104_000004_notifications_communications.sql` | Creates `crisis_alerts`, `broadcasts`, and `notifications`. |
| `supabase/migrations/20261104_000005_support_circle_whispers.sql` | Creates supporter invitation/message/feedback tables, Circle room/message tables, and Whispers match/message/report tables. |
| `supabase/migrations/20261104_000006_media_admin_business.sql` | Creates private media metadata tables, B2B clients, grant applications, insurance partners, system settings, audit logs, and upgrade-interest records; adds the `profiles.b2b_client_id` foreign key. |
| `supabase/migrations/20261104_000007_functions_triggers.sql` | Creates auth/profile trigger, RPC functions, privilege-protection triggers, Whispers immutability triggers, and audit-log immutability trigger. |
| `supabase/migrations/20261104_000008_rls_policies.sql` | Creates `current_user_role()`, `is_super_admin()`, and `is_admin()` helpers; enables RLS on application tables; defines owner/admin/public policies; grants table privileges. |
| `supabase/migrations/20261104_000009_storage_realtime.sql` | Upserts Storage buckets, creates Storage object policies, and conditionally adds realtime publications. |
| `supabase/migrations/20261106152654_add_profile_risk_columns.sql` | Adds daily risk score, risk factors, and last risk-check columns to `profiles`. |

## Ordering dependencies

1. `profiles` must exist before tables with `user_id`/profile foreign keys.
2. `b2b_clients` must exist before the `profiles.b2b_client_id` foreign key is added.
3. Functions/triggers must run after all referenced tables exist, especially `audit_logs`, `crisis_alerts`, `whispers_matches`, and `whispers_messages`.
4. RLS policies must run after helper functions and all application tables exist.
5. Storage/realtime configuration runs last because it depends on Supabase `storage` schema objects and public application tables.

## Conflicts and reconciliation notes

- The existing `audit_logs` table uses `entity_type`, `entity_id`, `user_id`, and `details`. The Unified Admin Portal requirement uses `admin_id`, `target_table`, `target_id`, and `metadata`. The master migration preserves the existing columns and adds the new columns so both schemas remain usable.
- The current `src/pages/admin/AuditLogs.jsx` reads `table_name`, `record_id`, `performed_by`, and `metadata`. The master migration adds those nullable compatibility columns in addition to the requested `target_*` fields so the existing frontend query shape does not fail.
- The existing schema represents super admins through `profiles.role = 'super_admin'`; the new portal uses `profiles.is_super_admin = true`. The master migration keeps both mechanisms and updates `public.is_super_admin()` to return true for either representation.
- `insurance_partners`, `b2b_clients`, and `grant_applications` already have `FOR ALL` policies restricted by `is_super_admin()`. The master migration preserves those policies and makes the helper boolean-aware, so a profile with `is_super_admin = true` can use them without requiring `role = 'super_admin'`.
- Public signup/subscription code currently selects from `b2b_clients` for company-code validation. Restricting that table to super admins will prevent non-elevated users from validating B2B codes unless the frontend is changed to use a safe RPC or public lookup.
- `profiles.is_super_admin` must be protected by `enforce_profile_privilege_updates`; otherwise users could update their own profile through the existing self-update policy and escalate privileges.
