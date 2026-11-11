# Manual migration notes

The owner applies SQL manually in the Supabase SQL editor. Do not run these
statements from the application or from a local migration command.

## Order

1. The existing migrations `20261110000001_core_schema.sql` through
   `20261110000006_urge_toolkit_sessions.sql` must already be applied in
   numeric order.
2. Apply `supabase/migrations/20261111000001_pass2_combined.sql`.
3. Run the verification `SELECT` at the end of that file while signed in as
   an administrator.

The new file redefines the legacy `is_recently_authenticated()` helper so it
no longer checks JWT age. It returns true only for active administrators;
the role-specific `is_admin()` and `is_super_admin()` checks in each RPC remain
the authorization boundary. It adds the `admin_revert_therapist(uuid)` RPC and
replaces therapist self-access policies so a reverted user cannot continue to
access therapist profile data. The RPC and policy changes are idempotent and do
not delete user or claims data.

There are no manual Supabase dashboard steps for this change.
