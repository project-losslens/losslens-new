# Protection test plan — manual scripts per role

Prereqs: combined SQL applied twice cleanly; `protection_mode` set to `pilot`
(super-admin → Protection Ops, or SQL: `update system_settings set value='"pilot"' where key='protection_mode'`).
Demo data: run `(removed — demo data is in-memory only)` after creating demo auth
users; clean with `(removed — demo data is in-memory only)`.

## Member (role=user)
1. Log in → `/protection-member`.
2. Concept mode: page shows teaser only. Switch to pilot → enrolment form appears.
3 Enrol: pick "Sample Health Assurance", enter member ref → status `pending_verification`, consent toggles visible (all off).
4. Toggle `status_updates` on → verify `protection_consents.granted=true` and a `consent_changed` event exists.
5. After insurer verifies (below) → status `active`; benefits copy shows.
6. "Leave Protection" → status `ended`, consents revoked.

## Insurer (role=insurer)
1. `/insurer/members` → upload `member_reference,email` CSV → report shows row count.
2. Pending memberships list → enter/confirm member ref → Verify → status `active`.
3. `/insurer/claims`, `/insurer/invoices`, `/insurer/analytics` unchanged.
4. **Privacy check**: attempt to query `diary_entries`, `chat_history`, `recordings`, `daily_risk_score` for a member — must return 0 rows / permission denied.

## Therapist (role=therapist)
1. `/therapist` dashboard, `/therapist/onboarding` (verification), claims, payouts.
2. **Privacy check**: same as insurer — no clinical tables readable.

## Super admin
1. `/super-admin/protection` → switch mode concept→pilot→live with confirmation; check audit log entry.
2. `/super-admin/users` → change a subscription; verify `subscription_events` row + history in modal.
3. `/super-admin/therapists` → verify a pending therapist.

## Regression
- `npm run build`, `npm run lint` (~200 errors/17 warnings baseline).
- Combined SQL run twice; verification SELECTs at file end.
- Screenshots 360/768/1280 for all five shells.

## Update (Protection rebuild)
The seed/remove SQL files referenced below do NOT exist — demo data is
in-memory only (src/demo/fixtures.js). The rebuilt architecture lives in
consolidated migrations 20261112000001–08 applied in order on a fresh project; test against a scratch Supabase project per
docs/MIGRATION_NOTES.md and the script-08 verification queries.
