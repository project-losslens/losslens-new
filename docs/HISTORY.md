# LossLens History

Condensed record of the fix/release reports that used to live as separate
files in `docs/` and `docs/archive/`. Facts and decisions are kept; repeated
narrative is not.

## Known open items and owner decisions

Collected from every report. Nothing here is done unless stated.

- **Lint baseline**: ~200 pre-existing ESLint errors / 17 warnings across the
  app (React hooks, unused vars). Not a regression; triage is a separate task.
- **Client rewiring still pending** (DB/RPC side done, page side not):
  FamilyJoin/FamilyPortalPage supporter flow, Signup/SubscriptionPage
  company-code path, Whispers client RPCs, TheCircle client RPCs,
  TherapistManagement/TherapistOnboarding to `therapists_public`,
  signed-URL helpers for PreciousPact/MonthlyMirror, AdminDashboard/
  CrisisAlerts stats RPC + ChatViewer removal, AuditLogs.jsx new columns,
  Profile.jsx delete-account edge-function call, Profile.jsx dead
  report_password code.
- **`admin-reset-password` edge function** referenced by UserManagement was
  never created; verify the function name before deploy.
- **RequireElevated** audit insert should move to `log_admin_action` RPC
  (direct insert now fails under hardened audit_logs).
- **Diary-side crisis alert write** and a unit test for crisisDetection were
  planned, not done.
- **S12**: signed URLs, avatar upload fixes, IndexedDB fallback — not done.
- **D1–D8**: admin shell rebuild, icon set, token expansion, ui/ components,
  a11y pass — not implemented.
- **Payments**: no M-Pesa/ACH integration; float ledger records manual
  references only. Invoice delivery has no email/API integration.
- **Markov model**: insurer analytics expose grouped risk-band counts with a
  cohort minimum (25 in current schema); no state-transition history exists.
- **SQL validation**: the four consolidated migrations were reviewed
  statically only (no scratch Postgres available); owner must apply
  carefully — VERIFY queries are in `docs/DATABASE.md`.
- **`scripts/check-queries.mjs`** referenced in old notes was never created.
- **Helpline numbers** carry `TODO(owner): verify by calling` in
  `src/config/helplines.js`; a Ministry of Health gambling helpline slot is
  reserved but empty.
- **Production checks pending**: authenticated Oloo chat, chat-history
  persistence, user isolation, Groq 429/failure paths, full auth/onboarding
  manual pass.
- **Bundle size**: main JS bundle >500 KB (Vite warning, unchanged).
- **Vercel project name / production URL** were missing from old notes;
  current production is `https://losslens-new.vercel.app`.
- **Legacy `projectkingsly@gmail.com`** references were removed in the
  homepage-redesign work; `supabase/config.toml` project_id may still read
  `kingsly` (check before CLI deploys).

## Timeline

- **Early releases**: Vite template → full app. Groq/Oloo integration moved
  the API key server-side (`api/chat.js`); production `/api/chat` verified to
  reject unauthenticated calls with 401. Five repair fixes landed: opaque Oloo
  surfaces, mojibake corrections, risk-column fallback, single SW
  registration, `api/chat.js` auth error handling (commit `271debd`).
- **Security audit round** (`fix/audit-2026-11`, commits `be4d8df`,
  `d471b04` + later): DB hardening migration set, rewritten `send-invite`,
  new `delete-account`, crisis keyword detector shared client/server,
  chat quota (30/hr, 150/day), service-worker rewrite (`losslens-v1`),
  vercel.json security headers. Status table preserved in git history of
  `docs/AUDIT_FIX_REPORT.md`.
- **Functional fix round** (`fix/functional-2026-11`): security round-2
  migration (service-role-only crisis/voucher writers, insurer payment
  reporting split, elevated-access `is_recently_authenticated` guards,
  whispers/circle RPC rewrites, company-code rate limiting, consent gate +
  `api/consent.js`, remember-me storage switching).
- **SQL consolidation** (`chore/sql-consolidation-and-loader`): 22 migration
  files consolidated into exactly four idempotent migrations
  (`20261110000001`–`04`); `CURRENT_SCHEMA_NOTES.md` and `DB_SETUP.md`
  written (now merged into `docs/DATABASE.md`).
- **Brand/UI rounds**: emoji→`AppIcon` SVG sweep, PWA manifest/icons,
  Landing redesign (homepage-redesign branch: self-hosted fonts, contact
  config, protection concept page, redesigned site gate).
- **Site gate**: temporary SHA-256 password gate shipped (`pre-gate-*` tag,
  PR #2), restyled in the redesign (PR #3). Removal steps live in README.
