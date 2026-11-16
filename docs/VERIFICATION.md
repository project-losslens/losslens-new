# Manual verification checklist

The automated test suite was removed. Verify changes by hand:

## Accounts and routing
- [ ] Log in as a normal user → lands on `/dashboard`; sidebar shows user nav only.
- [ ] Log in as admin → lands on `/admin`; super-admin → `/super-admin`.
- [ ] Log in as therapist → `/therapist`; insurer → `/insurer`.
- [ ] A user hitting `/admin/*` or `/super-admin/*` is redirected away.

## Protection claim flow
- [ ] `/protection` public page renders plan copy and enrolment CTA.
- [ ] `/protection-member`: member sees membership status, cover, claims, milestones tabs.
- [ ] Submit a claim → appears in claims list with pending status.
- [ ] Upload claim evidence → listed under the claim.

## SQL negative matrix (run in Supabase SQL editor after migrations)
- [ ] `regression_checks` result set at end of script 08: every `offending_rows` = 0.
- [ ] `protection_mode()` returns `concept`/`pilot`/`live`.
- [ ] All `protection_%` tables show `relrowsecurity = true`.
- [ ] Member cannot `update protection_memberships set status='active'` directly (0 rows/error).

## Account deletion
- [ ] Settings → delete account → storage folders emptied, PII rows removed,
      payments/protection rows remain with `user_id` NULL, memberships `ended`.

## Super-admin
- [ ] `/super-admin` pages load; role/credential actions (promote therapist,
      subscription changes, protection mode switch) require super_admin.
