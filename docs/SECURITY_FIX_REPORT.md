# LossLens Security Audit Remediation Report

## Status by finding

| ID | Status | Remediation |
|---|---|---|
| SEC-01 | Implemented in source; migration not applied | Crisis recording and voucher pre-authorization are restricted to the service role. Diary crisis detection now goes through the authenticated `/api/crisis` endpoint instead of calling the database RPC directly. |
| SEC-02 | Implemented in source; API test/build verification required | `/api/chat` accepts a single message, verifies the caller's Supabase JWT, loads chat history server-side, fails closed when quota data cannot be checked, and counts user messages for quota enforcement. |
| SEC-03 | Implemented in source; consent not legally reviewed | Oloo displays an AI-data consent prompt and persists the user's consent timestamp before enabling chat. |
| SEC-04 | Implemented in source; browser behavior not manually smoke-tested | The login flow selects local or session storage based on the remember-me choice; the shared Supabase client uses that selection on reload. |
| SEC-05 | Partial | Profile provides MFA enrollment. Mandatory MFA assurance for every privileged route/action is not enforced end-to-end; the database's recent-auth helper is not a substitute for an enforced MFA challenge. |
| SEC-06 | Partial | Account deletion removes related storage and records, logs progress, and deletes the auth user last to support retries. The multi-step process cannot roll back records already deleted if a later step fails. |
| SEC-07 | Implemented in source; migration not applied | Circle message author identities are backfilled to a separate table before legacy identity columns are scrubbed; triggers prevent identities from being written back into message rows. |
| SEC-08 | Implemented in source; access policies not live-verified | Therapist data access is narrowed through a public-safe view and role-checked RPCs. Therapist document uploads are restricted by file size and MIME type. |
| SEC-09 | Implemented in source; payment workflow not live-tested | Insurers can report a payment reference, but only a recently authenticated super-admin can confirm settlement and update the claims float. This is a manual confirmation flow, not payment-provider reconciliation. |
| SEC-10 | Partial | Company-code validation has a response-shape uniformity, an attempt limit, a fixed delay, and a row lock around seat assignment. PostgreSQL timing is not constant-time, and the request IP header is not a trustworthy rate-limit identity unless the deployment gateway sanitizes it. |
| SEC-11 | Implemented in source; storage policy not live-verified | Avatar storage is private; the profile flow stores object paths and requests signed URLs. |
| SEC-12 | Partial | Elevated RPCs check administrator role and a 15-minute JWT `iat` window. A refreshed JWT can have a recent issue time without a fresh user challenge, so this does not independently prove recent re-authentication. |
| SEC-13 | Implemented in source; functions not deployed | Edge-function CORS handling and error responses were tightened, and account deletion uses explicit step logging. The updated functions have not been deployed. |

## Verification and deployment limits

- `npm run build` passed.
- `node --test api/chat.test.js` passed (1 test).
- Focused ESLint on changed API, library, and selected page files reported no errors; the two Deno edge-function files were ignored because the ESLint config has no matching TypeScript configuration.
- `npm run lint` failed with 200 errors and 17 warnings. The repo's release notes document a pre-existing lint baseline, but no clean pre-change run was available to attribute every current finding.
- No live Supabase connection was made. Migrations were not executed or validated against a database.
- No Edge Function or Vercel deployment was performed.
- The new migration files retain the requested `003_`, `004_`, and `005_` names. Apply them only after the existing prerequisite migrations have been applied and reviewed; their short numeric prefixes do not match the repository's timestamp-based convention.
- Account-deletion rollback, constant-time company-code validation, mandatory MFA enforcement, and actual payment-provider reconciliation remain incomplete.
