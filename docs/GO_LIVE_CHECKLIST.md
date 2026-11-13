# Protection go-live checklist

## From a real insurer
- [ ] Signed partnership agreement (`insurer_partnerships` terms) and cohort definition.
- [ ] Member roster format confirmed (CSV columns) and delivery cadence.
- [ ] Benefit schedule: sessions/year, telehealth allowed, claim limits, excess/copay.
- [ ] Claims SLA and dispute process; invoice period and payment terms.
- [ ] Named operational contact + escalation path.
- [ ] Data-processing agreement covering what LossLens may store (status only — never clinical content).

## From therapists
- [ ] practising licence number + issuing body for every provider.
- [ ] specialties, languages, county, session fee, telehealth capability.
- [ ] signed provider agreement and payout details (M-Pesa/bank).
- [ ] professional-indemnity confirmation.

## Regulatory points to confirm with counsel (BEFORE live mode)
- [ ] Whether LossLens needs insurance-intermediary/broker registration.
- [ ] Data-protection (Kenya DPA 2019) basis for member status sharing; consent wording review.
- [ ] Whether therapist sessions via vouchers constitute clinical service regulation.
- [ ] Tax/VAT treatment of per-member fees and therapist payouts.
- [ ] Marketing claims on /protection and pilot/live copy (`src/pages/public/protectionContent.js` — currently marked pending legal review).

## Technical
- [ ] protection_mode = pilot with demo seed verified end-to-end (see PROTECTION_TEST_PLAN.md).
- [ ] protection_mode = live only after counsel sign-off and insurer contract.
- [ ] Insurer/therapist sessions verified unable to read diary/chat/recordings/risk (RLS + RPC audit).
- [ ] Notifications adapter wired to real email/SMS providers if required.
- [ ] Cron/`expire_subscriptions` scheduled for subscription expiry.

## Protection rebuild additions (20261112000001–08)
- [ ] Fresh scratch Supabase project → apply 20261112000001–08 in order → run script-08 verification queries; run script-08 verification queries.
- [ ] E2E pilot: enrol -> verify -> version approve -> issue policy -> record premium -> preauth -> decide ->
      therapist session -> claim -> adjudicate -> settle; member sees correct statuses only.
- [ ] Negative tests: member self-activation, cross-insurer reads, crisis_alert_id exposure, preauth without
      active policy, fixed-sum amount tampering, duplicate claims, premium over-confirmation.
- [ ] Confirm hybrid benefit_structure stays disabled until counsel confirms fixed-sum vs reimbursement
      may be combined under Kenyan microinsurance rules.
- [ ] Schedule api/cron/protection-lifecycle.js (CRON_SECRET) for policy lapse/expiry sweeps.
- [ ] Verify insurer/therapist sessions cannot read diary/chat/crisis/risk data post-migration.
