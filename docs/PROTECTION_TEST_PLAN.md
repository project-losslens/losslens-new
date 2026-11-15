# Protection test plan

## Database test environment

Use a disposable Supabase project. Apply the eight scripts in
`supabase/migrations/` in filename order, from
`20261112000001_core_schema.sql` through
`20261112000008_protection_operations.sql`. This set is the complete fresh
install; do not prepend legacy baseline or Pass 2 scripts. The scripts have not
been executed against the live database.

Create separate test accounts for two members, two insurers, a therapist, and a
super admin. Use synthetic claim and evidence data only. Keep the environment
in `concept` until the authorized test setup moves it to `pilot`; never use
production member data.

## Member

1. In `concept`, verify Protection transactions are unavailable.
2. In the approved test `pilot` environment, enrol in an eligible insurer and
   verify pending/active membership and consent state.
3. Submit a claim and open its Evidence section.
4. Upload an allowed file; verify progress, successful attachment, and that the
   member can open the short-lived signed file link.
5. Upload a file while forcing the evidence-attachment RPC to fail. Verify the
   UI reports the error and attempts to remove the uploaded object; if cleanup
   also fails, verify the error identifies the remaining private object.
6. Attempt evidence attachment using another claim's ID in the path, a path
   under another member's UUID, a missing filename, and a non-private bucket.
   Each must fail server-side and must not create evidence metadata.
7. Remove evidence while the claim is open; verify metadata and the stored
   object are removed. Verify removal is unavailable after the claim closes.
8. As a second member, attempt to list, add, or remove evidence for the first
   member's claim; each operation must fail.

## Insurer and storage boundaries

1. As insurer A, list and open a claim belonging to insurer A, retrieve its
   evidence, and open the five-minute signed URL.
2. As insurer A, request insurer B's claim evidence and request a signed URL
   for insurer B's object; both must be denied.
3. Attach two claims for the same member to test that a path under claim A
   cannot be associated with claim B.
4. Confirm the bucket remains private and insurer access is limited to evidence
   linked to that insurer's claim.
5. Confirm insurers and therapists cannot retrieve diary entries, Oloo
   conversations, crisis records, relapse indicators, or detailed clinical
   information through tables, views, storage, or RPCs.

## Other Protection workflows

- Verify insurer enrolment eligibility and rejection of inactive or expired
  partnerships.
- Verify draft product versions cannot be approved directly; only
  `pending_approval` versions can be approved, and approved content and policy
  version bindings are immutable.
- Reject milestone service dates before episode start, after today, or outside
  policy coverage. Verify insurer claim detail receives only the milestone
  type, ordinal, service date and verification timestamp.
- Verify every claim amount and limit using the policy's bound product version,
  including per-event, per-policy, annual, frequency and aggregate limits at
  submission and insurer adjudication.
- Exercise the policy, premium, pre-authorisation, claim decision, settlement,
  and lifecycle flows, checking mode restrictions and insurer boundaries.
- Revoke optional consent and verify subsequent optional disclosures stop;
  essential policy servicing and records required for administration remain
  governed by their applicable basis and access rules.

## Application checks

- Run `npm run build`.
- Run targeted lint on modified JavaScript/JSX files.
- Test member and insurer evidence flows in the browser at narrow and desktop
  widths. Browser testing has not been performed as part of this test plan.
- Compare transition probabilities against an analytical CTMC reference and
  test probability conservation, invalid inputs, zero exposure, high rates and
  long horizons. These software tests do not establish actuarial validity.
- Document scenario/data source and verify synthetic and unverified observed
  aggregate inputs remain clearly labelled in saved runs and results.
- Demo fixtures are in-memory only (`src/demo/fixtures.js`); no SQL demo seed
  or cleanup scripts are part of the eight-script database set.
