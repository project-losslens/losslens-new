# PGSI and Oloo changes

Implemented locally on 24 November 2026. No SQL or application deployment has been performed against production.

## Behavior

- Onboarding now uses the nine published PGSI items and the past-12-month timeframe. Every answer is required. The recorded version `pgsi-9-en-2001-always-v1` explicitly identifies the requested Never / Sometimes / Most of the time / Always response wording. No unvalidated translation or conversion of legacy 1-8 screening ratings is used.
- `submit_pgsi` validates and sums answers inside PostgreSQL. Raw totals determine the four bands (0, 1-2, 3-7, 8-27). A member-scoped submission UUID prevents duplicates on retry; reusing it with different answers is rejected. Onboarding completion commits in the same transaction. Timestamp/version/history are retained privately.
- Dashboard percentage is rounded raw/27, with raw points, completion date and a personal explanation. Before the first assessment it offers a self-check, without displaying a fabricated zero. Repeated administrations keep the 12-month timeframe and explain why overlapping scores cannot prove weekly change.
- A confirmed raw result of at least 8 opens a voluntary support chooser, including on onboarding. It creates no crisis event, insurance decision, third-party notification or automatic external navigation. Resources remain available at every score and without cover. Provider URLs contain no member information and suppress the referrer.
- `pgsi_latest` computes due time from the latest successful completion plus 168 hours. The browser records a reminder decision for the authenticated session ID, surviving reloads/restoration/navigation/tabs. A new authenticated session is eligible again. Web Locks serialize cross-tab decisions. Browser storage being unavailable can suppress automatic reminders; the assessment card remains available. Failed saves retain answers and leave the server due state unchanged.
- Oloo personalization defaults off in a separate preference table. Each ordinary message requests `pgsi_oloo_context` using the caller's JWT; no user ID can be supplied. Only band/date are admitted into the provider prompt, even if an upstream payload contains extra fields. Revocation removes this context from subsequent requests. Earlier conversations are not retroactively erased.

## Privacy and architecture

`pgsi_assessments` and `pgsi_preferences` are separate from profiles, legacy screening, insurance, employer and supporter views. RLS permits only an active member to read their own rows. End users cannot insert fabricated scores or change timestamps directly; admins, super-admins, therapists, insurers and anonymous clients have no assessment access. Security-definer RPCs validate the current authenticated member and fix their search path. Infrastructure service-role credentials still have their normal administrative access and must remain server-only.

No PGSI analytics events, console logging, profile risk updates, insurance eligibility hooks or support-alert triggers were added. The local login marker holds only user/session identifiers, never answers or results. Assessment answers are held in component state while the form is open. The optional band/date context goes to the existing AI provider only when enabled and normal AI consent has been granted.

## Crisis regression and fix

The old substring detector missed `thinking about killing myself`, matched `not suicidal`, and did not distinguish a friend at risk. Server detection occurred after consent/history/quota operations, and the widget only inspected assistant replies for a helpline link. This allowed ordinary conversation or a service failure to hide urgent support.

The actual AIChat submission path now uses shared clause-aware English/Kiswahili triage before consent, loading and provider work. Direct current disclosures immediately publish the existing crisis dialog and a deterministic compassionate reply. A new urgent message supersedes an outstanding ordinary response. Third-person statements show guidance for helping that person and never create an alert on the member's behalf; individually negated spans cannot suppress a separate direct disclosure.

`/api/chat` independently routes crisis messages before AI consent, history, quotas and Groq. `/api/crisis` uses the same triage and existing authenticated `record_crisis_event` escalation. Neither depends on PGSI/personalization. The UI says an internal alert was recorded only when the backend returns confirmation; that still does not imply a human has read it. Escalation failure leaves urgent help visible. No external service is contacted automatically.

Crisis help and Oloo now also render before onboarding completes. Urgent help is above assessment dialogs, reachable with keyboard, and uses an opaque brand surface. Fixed controls and dialogs were checked on narrow mobile viewports. The Oloo trigger no longer continuously moves under a pointer.

Triage is a deterministic safety routing aid, not a clinical assessment or a guarantee of detecting every language variant. Keep adding regressions for real missed wording without collecting sensitive examples in ordinary logs.

## Sources and provider configuration

Checked 24 November 2026:

- [Gambling Commission: problem gambling screens](https://www.gamblingcommission.gov.uk/statistics-and-research/publication/problem-gambling-screens) supplies standard item wording and raw bands. It commonly labels response 3 "almost always"; this implementation follows the explicitly requested "Always" variant, also reproduced in the [Victorian Auditor-General report](https://www.audit.vic.gov.au/report/reducing-harm-caused-gambling). The version string records that distinction.
- [LifeLine International: Kenya](https://lifeline-international.com/member/kenya/) lists Befrienders Kenya at +254 722 178177, Monday-Friday 09:00-17:00. Opening status and next opening are evaluated in Africa/Nairobi, independent of device timezone.
- [Gamhelp Kenya counselling](https://gamhelpkenya.com/gambling-addiction-treatment/) lists +254 726 883 960 and advertises 24/7 telephone/online counselling. It becomes the primary choice outside Befrienders' hours. Published hours never promise an immediate response.

`src/config/helplines.js` is the source of truth. The dashboard support dialog, Urge Toolkit and Resources page reuse the same hours-aware chooser; old blanket free/24-hour claims and the duplicate floating call button were removed. The Resources page and production offline service-worker fallback now use it; obsolete Befrienders contact details and the incorrect 24/7 claim were removed. Vite injects only public provider details into the production worker and bumps its cache version.

## Local results

The final production build passed. Final repository lint returned the unchanged baseline of 197 errors and 17 warnings; the new PGSI/safety modules have no lint findings. `git diff --check` passed.

- 72 automated tests passed, including 24 PostgreSQL PGSI tests and 21 Oloo triage/submission/API tests.
- The broad browser suite passed 125 route/viewport checks with zero findings, plus partner create/edit/delete, denied/zero-row mutations, user status persistence and mobile menu navigation.
- Targeted PGSI/Oloo browser checks passed, including the updated dashboard, Resources, Urge Toolkit and Support flows. Provider selection opened only its chosen synthetic destination. A pending ordinary reply did not replace urgent guidance.
- Relevant token contrast ratios are 16.30:1 white text on the dialog surface, 9.12:1 muted text on a raised surface, and greater than 7:1 for the warm and urgent accents on the dialog surface (calculated from the opaque brand tokens). This does not assert a complete WCAG audit of every existing page.

## Verification and deployment

- The retired automated suite covered database scoring, RLS/privacy, idempotency, reminders, hours and actual Oloo routing. Its local PostgreSQL fixtures did not constitute hosted Supabase/PostgREST verification.
- Manually exercise onboarding, dashboard and Oloo with synthetic accounts: incomplete/failed saves, retries, new-login reminders, opt-in/revoke, raw 8 ? 30%, voluntary support only, and urgent chat guidance despite service failure.
- Use `docs/VERIFICATION.md` for route, mobile and privileged mutation checks. Keep temporary browser harnesses and results outside the repository.
- `npm run build` and `npm run lint`: production build must pass; repository lint has a pre-existing error baseline. No lint exceptions were added for the new PGSI implementation.

Apply `20261124000009_workflow_integrity.sql` (which now includes the private-PGSI section formerly in `20261124000010_private_pgsi.sql`) in a disposable/staging Supabase project first, then through the owner's usual manual SQL deployment process. Existing deployments that already applied all ten original scripts need no SQL changes for consolidation; do not rerun consolidated 09, because its private-PGSI table creation is not idempotent. For partially applied projects, reconcile the original history and manually review only missing original sections. The inherited delimiter errors in 09 are corrected in this checkout for fresh installs; existing projects should not replay its private table creation. Do not rerun destructive base installation scripts. Deploy frontend and Vercel `/api/chat` + `/api/crisis` changes together. No new edge function or environment variable is required for PGSI; existing Supabase keys, Groq key for ordinary chat and server-only service key for the authorized escalation path remain in use. Prior workflow repairs still require their documented `delete-account` edge-function deployment.

Before production release, verify with two separate real staging member sessions and insurer/admin sessions: table/RPC restrictions through PostgREST; trigger compatibility on onboarding; session refresh vs fresh login; failed/ambiguous RPC retry; opt-in and revoke across successive messages; crisis behavior with provider outage and the actual authorized alert record. Use synthetic text and do not contact real support services. Check installed PWA clients pick up the new worker. Live provider response speed, real staff response to alerts and full production Supabase integration have not been verified locally.
