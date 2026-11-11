# LossLens Protection — model, state machine, access matrix, gaps

Status: Phase 6 in progress. `protection_mode` in `system_settings` gates the
feature: `concept` (default — app behaves exactly as before), `pilot`, `live`.
Pilot/live copy lives in `src/pages/public/protectionContent.js` and is marked
**pending legal review**.

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
| `insurers` | Insurance organisations; `user_id` links the portal login |
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
