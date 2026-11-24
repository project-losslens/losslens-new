# Manual verification checklist

Automated test and QA entry points were intentionally removed. Run `npm run lint` and `npm run build`, then verify the behaviours below with local/disposable accounts. Keep temporary harnesses, screenshots and reports outside the repository.

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

## Consolidated runtime checks

- [ ] Desktop sidebar and mobile header/bottom navigation retain role filtering, active states, keyboard access and sign-out. Community tabs switch between their existing routes.
- [ ] Dashboard notification bell opens, marks notifications read and navigates to the linked destination.
- [ ] The super-admin user editor opens, rejects unauthorized operations, and preserves credential confirmation and audit requirements.
- [ ] Modal focus stays inside the active dialog; Escape/backdrop dismissal restores access. Urgent support remains above the self-check dialog.
- [ ] The shared loader delays initial display, remains visible for its minimum period, and offers the existing slow-load/retry states.
- [ ] Befrienders published opening/closing/weekend boundaries use Africa/Nairobi; outside those hours Gamhelp is primary. Published hours never promise a response.
- [ ] An 8/27 PGSI completion opens only the voluntary support chooser. Direct self-harm text in Oloo opens crisis support even when the AI provider fails. No successful human alert is claimed without backend confirmation.
- [ ] The actuarial workbench calculates from aggregate/synthetic data, rejects invalid inputs and keeps modelling separate from clinical/cover decisions.
