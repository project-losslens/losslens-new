# LossLens Protection — model, state machine, access matrix, gaps

Status: **rebuilt architecture implemented** (scripts `20261112000001`–`08`,
see `docs/MIGRATION_NOTES.md`). `protection_mode` in `system_settings` gates
the feature: `concept` (default), `pilot`, `live` — now enforced **inside the
RPCs** (`protection_require_mode`), not only in the UI. Pilot/live copy lives
in `src/pages/public/protectionContent.js` and is marked **pending legal
review**.

## Rebuilt model (20261112000001–08)

Membership ≠ policy. `protection_memberships` is programme participation;
`protection_policies` is the contractual arrangement and binds to an
**approved, immutable** `protection_plan_versions` row (benefit structure:
`fixed_sum` | `treatment_reimbursement` | `hybrid` — configuration only, NOT
legal approval; hybrid requires separate sign-off). Typed benefits live in
`protection_benefits` (fixed_sum / treatment_reimbursement /
provider_direct_payment with per-event, per-policy, annual, waiting-period
and frequency limits).

Lifecycle: membership `pending_verification → active → ended|rejected`
(insurer verifies); policy `issued → (pending_payment) → active → grace →
lapsed | cancelled | expired`, driven by the insurer-confirmed
`protection_premium_records` ledger via `protection_refresh_policy_payment`
/ `protection_lifecycle_sweep` (cron: `api/cron/protection-lifecycle.js`).

Claims: `protection_claims` (fixed_sum amount computed server-side from the
benefit — never from provider fees; treatment claims link to
`provider_claims`) + `protection_claim_events` history +
`protection_claim_evidence` (private `claim-evidence` bucket, structured
evidence only — no free-text clinical notes to insurers).

Pre-auth: `member_request_preauth` now requires an **active policy in
force**, consent, and creates BOTH `pre_auth_vouchers` (with
membership/policy/insurer-decision columns) and the paired
`provider_vouchers` row. `insurer_decide_preauth` records
approve/partial/reject + authorised fee; voucher assign/accept RPCs require
insurer approval for Protection-linked vouchers (crisis/B2B flow unchanged).

Access layer: insurer reads go through whitelisted RPCs
(`insurer_list_policyholders`, `insurer_list_preauths`,
`insurer_list_protection_claims`, `insurer_get_claim`,
`insurer_actuarial_report`) — no `user_id`, `crisis_alert_id`, diary, chat
or risk data. Members identified by member_reference / policy_number.
`insurer_aggregate_stats` was redefined on policies — behavioural risk
bands removed. Actuarial views compute member-months exposure, straight-line
earned premium and incurred-vs-paid claims; loss ratio = incurred ÷ earned
premium, NULL when unavailable; insurer report suppressed below 25 policies.

Sensitive reads are audited via `protection_log_access` → `audit_logs`
(action `protection_access:*`).

## Regulatory stance (preserve in all copy and code)

LossLens is **not** the insurer. The insurer sells the policy, collects
insurance premiums and decides claims. LossLens never collects insurance
premiums, decides cover, or makes an offer of cover.

Diary entries, chats, recordings and risk data are **never** visible to
insurers or therapists through any table, view or RPC. Only whitelisted
status fields are shared, and only with the member's separate, revocable
consent (`protection_consents`).

## Existing model (baseline migrations 01–04)

| Table | Purpose |
|---|---|
| `insurers` | Insurance organisations; `profile_id` links the portal login |
| `insurer_partnerships` | LossLens ↔ insurer commercial relationship |
| `therapists` | Provider profile (license, specialty, languages, status pending/active/suspended) |
| `provider_vouchers` | Pre-allocated therapy sessions for a user (pending→assigned→accepted→completed/expired/void) |
| `pre_auth_vouchers` | Pre-authorisation records before sessions |
| `provider_claims` | Therapist claim per session (submitted→approved→paid/rejected/disputed) |
| `provider_payouts` | Payouts to therapists (M-Pesa ref) |
| `claim_submissions` | Member-side claim submissions to insurer |
| `bulk_invoices` | Insurer invoicing for covered members |
| `claims_float` / `claims_float_transactions` | Float ledger funding claims payouts |
| `system_settings` | `protection_mode` key added in combined SQL |

## New Phase 6 tables (combined SQL `20261111000001_pass2_combined.sql`)

- `protection_plans` — per-insurer plan definitions (benefits/limits jsonb).
- `protection_memberships` — member ↔ insurer link. States:
  `pending_verification → active → suspended → ended | rejected`
  (transitions enforced client-side by `src/lib/protectionStates.js` and by
  the status CHECK; RPCs enforce allowed transitions).
- `protection_consents` — per-membership consent scopes
  (`status_updates`, `session_summaries`, `billing_contact`), revocable.
- `protection_events` — audit timeline for enrolment/verification/consent.

## RPCs added

- `member_request_enrolment(insurer, member_reference, plan)` → pending membership + default consents.
- `member_set_consent(membership, scope, granted)` — member-only.
- `insurer_upload_member_roster(insurer, rows jsonb)` — validation report only.
- `insurer_verify_membership(membership, member_reference)` — pending→active.

## State machine

```
pending_verification ──verify──▶ active ──suspend──▶ suspended ──reinstate──▶ active
        │                            │
        ├──reject──▶ rejected        └──end──▶ ended   (ended/rejected are terminal)
        └──end──▶ ended
```

Claim side (existing): `provider_claims` submitted → approved → paid
(rejected/disputed branches); payouts via `provider_payouts`.

## Role × table access (intended)

| Data | member (user) | therapist | insurer | super_admin |
|---|---|---|---|---|
| diary_entries, chat_history, recordings, risk detail | own (existing RLS) | **never** | **never** | existing admin rules |
| protection_memberships | own row | never | own insurer's rows | all |
| protection_consents | own | never | read via membership join (consented scopes only) | all |
| protection_events | own membership events | never | own insurer events | all |
| provider_vouchers / claims / payouts | own vouchers | own claims/payouts | aggregate/whitelisted | all |
| insurers / partnerships | public teaser only | never | own row | all |

## Gaps found (tracked in PROGRESS.md)

- Whitelisted insurer/therapist-facing views/RPCs still to be created —
  insurer portal currently reads base tables directly.
- `protection_mode` switch UI + audit logging for super admin.
- Member enrol/consent screens not yet built (mode-gated).
- Notifications adapter (`api/_lib/notify.js`) not yet created.
- Demo seed + removal scripts not yet created.
- `insurer_upload_member_roster` currently logs + returns a stub report;
  per-row upsert of roster members still TODO.
