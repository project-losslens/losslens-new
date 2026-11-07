# LossLens Build Notes

## Manual deployment requirements

- Apply the new migrations in timestamp order: `20261109000003_supporter_rpcs.sql`, `20261109000004_therapist_portal.sql`, `20261109000005_insurer_portal.sql`, then `20261109000006_claims_protocols.sql`.
- Deploy the updated `send-invite` Edge Function separately.
- No production Supabase connection, SQL execution, or Edge Function deployment was performed.
- Invite insurer users with the super-admin invitation flow, associate the accepted account with an insurer organization, then configure its B2B cohort partnership before crisis vouchers can be attributed to that insurer.
- Super admins set an approved session fee when assigning each crisis voucher; no financial amount is guessed by the system.

## Items not implemented

- A true Markov-state model and trend analysis are unavailable because the current schema has only `profiles.risk_level` bands and no state-transition history. The insurer analytics view therefore exposes grouped risk-band counts and plan mix, with a 10-member minimum cohort; it does not claim to compute Markov trends.
- Automated M-Pesa or ACH disbursement/reconciliation is not connected because no payment-provider integration or credentials were supplied. Super admins record therapist payment references and insurers report invoice settlement references; the float ledger records those confirmations.
- Invoice delivery is not integrated with an email or insurer API. The admin action marks the generated invoice as sent in LossLens so the insurer can access it in its portal.
- Production migrations and Edge Function changes remain unapplied and undeployed by design. They must be reviewed and manually applied by the project owner.

## Verification

- `node --test api/chat.test.js` verifies that the crisis-chat flow records the crisis event and requests voucher pre-authorization before returning the reply.
- `npm run build` is the production build check.
- Repository-wide ESLint contains pre-existing findings documented in `docs/archive/LOSSLENS_FINAL_RELEASE_REPORT.md`; only targeted lint results should be attributed to these changes.
