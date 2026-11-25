# AGENTS.md

LossLens is a plain-JS React 19 + Vite 8 SPA backed by Supabase, plus Vercel
serverless routes in `api/` and Deno edge functions in `supabase/functions/`.
No TypeScript.

## Commands

- `npm run dev` — Vite dev server (frontend only; does NOT serve `api/`)
- `npm run build` — primary verification; must pass
- `npm run lint` — eslint; 150 pre-existing errors/17 warnings is the
  baseline, do not treat as regressions
- `npm run preview` — preview the production build
- `vercel dev` — serves `api/` routes locally
- CLI: `npx supabase` (devDependency)
- Automated test/QA files and their npm commands were intentionally removed.
  Use the manual checklist in `docs/VERIFICATION.md`; keep temporary verification
  harnesses and their output outside the repository.

## Architecture

- Entry: `index.html` → `src/main.jsx` → `src/App.jsx` (all routes).
- Roles on `profiles.role`: `user | admin | super_admin | therapist | insurer`.
  `RequireAuth` and `canAccessPath` enforce the route map. Elevated pages use
  `/super-admin/*`; therapists and insurers cannot enter the user app.
- Supabase singleton: `src/lib/supabase.js` always persists to localStorage.
  Session-only login uses a sessionStorage marker and clears local auth on the
  next app start if that marker is missing.
- AI flow: `src/components/AIChat.jsx#askGroq` → `POST /api/chat` (JWT) → Groq →
  `chat_history`. Real prompt: `BASE_SYSTEM_PROMPT` in `api/chat.js`.
  Consent gate: `profiles.ai_data_consent_at`, enforced server-side.
- Shared configs: `src/config/site.js` (contact + FACTS),
  `src/config/helplines.js` (crisis lines — single source),
  `src/config/nav.config.js` (feature names — do not rename).
- PWA: `registerSW()` once in `main.jsx` via `src/lib/pwa.js`.

## Node-importable files rule

Files reachable from `api/**` or any plain-Node consumer must stay
plain JS: no JSX, no `import.meta.env`, no CSS imports, no `import.meta.glob`.
Currently: `src/lib/crisisDetection.js` → `src/config/helplines.js`,
`api/*.js`. Browser loader timing lives inside `src/components/Brand.jsx`;
its former Node test consumer has been removed. Keep server imports plain JS.

## Database

Six maintained migrations in `supabase/migrations/`
(`20261112000001`, `04`, `06`, `08`, `20261124000009`, `20261125000011`), applied in filename order on a fresh project.
Full reference + verify queries: `docs/DATABASE.md`; mapping:
`docs/OPERATIONS.md`. RLS on every table; helpers `is_admin()`,
`is_super_admin()`, `is_active_user()`, `is_recently_authenticated()`.
`enforce_profile_privilege_updates` trigger blocks non-super-admin writes to
privileged profile fields. New users get a `profiles` row from trigger —
don't create it manually.
Role changes use the password-verifying `admin-user-update` Edge Function and
service-only `service_change_account_role`; browser role writes are blocked.
Protection callback consent, allocation, referrals and direct-payment tracking
live in migration 11. Insurers pay therapists externally; do not restore the
retired bulk-disbursement RPCs. Receipt storage is private and tenant-scoped.

## UI conventions

- Styling: tokens in `src/styles/base.css` (`--*` vars), `globals.css`
  (`.btn-primary`, `.card`, `.form-group`), `landing.css` (`ll-` public pages),
  inline style objects elsewhere. No Tailwind utilities.
- Brand: royal-purple canvas `#7136CC`, dark-plum controls `#291447`, lilac `#EAD9F3`, body text `#F3EAF8`. Operational screens use Instrument Sans throughout.
- Fonts: `--font-display` (Bricolage Grotesque), `--font-body` (Instrument
  Sans) — self-hosted via fontsource packages. Public pages (`.ll-landing`)
  use Jost 300/500 woff2 from `public/fonts` for headings; body is system-ui.
- Icons: `src/components/AppIcon.jsx`; never emoji (mojibake history).
  Keep files UTF-8 without BOM.
- One `<h1>` per page; sentence-case headings; no banned marketing words
  (see homepage-redesign brief: no "empower/journey/unlock/seamless/…").

## Cautions

- Oloo browser request helpers live inside `src/components/AIChat.jsx`.
  Keep Groq credentials server-side; do not log JWTs, chat or assessment data.
- Site gate is server-side in root `middleware.js` and `lib/gate.js`;
  temporary config is hardcoded as `GATE_ENABLED` / `GATE_PASSWORD` /
  `GATE_SECRET` constants in `lib/gate.js` — no env vars.
- `upgrade_interest.interested_plan='protection'` is used by `/protection`.
- Real contact details live ONLY in `src/config/site.js`; render via
  `ContactIcons` (icon-only links) — never as visible text.
