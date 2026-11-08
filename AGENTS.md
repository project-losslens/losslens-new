# AGENTS.md

LossLens is a plain-JS React 19 + Vite 8 SPA backed by Supabase, plus Vercel
serverless routes in `api/` and Deno edge functions in `supabase/functions/`.
No TypeScript.

## Commands

- `npm run dev` — Vite dev server (frontend only; does NOT serve `api/`)
- `npm run build` — primary verification; must pass
- `npm test` — `node --test` unit tests (SiteGate, loaderTiming, api/chat)
- `npm run lint` — eslint; ~200 pre-existing errors/17 warnings is the
  baseline, do not treat as regressions
- `vercel dev` — serves `api/` routes locally
- CLI: `npx supabase` (devDependency)

## Architecture

- Entry: `index.html` → `src/main.jsx` → `src/App.jsx` (all routes).
- Roles on `profiles.role`: `user | admin | super_admin | therapist | insurer`.
  Guards: `RequireAuth` / `RequireElevated` in `src/components/RouteGuards.jsx`.
- Supabase singleton: `src/lib/supabase.js` (remember-me aware;
  `createSupabaseClient(persist)` exported for Login's session-only mode).
- AI flow: `src/lib/groq.js#askGroq` → `POST /api/chat` (JWT) → Groq →
  `chat_history`. Real prompt: `BASE_SYSTEM_PROMPT` in `api/chat.js`.
  Consent gate: `profiles.ai_data_consent_at`, enforced server-side.
- Shared configs: `src/config/site.js` (contact + FACTS),
  `src/config/helplines.js` (crisis lines — single source),
  `src/config/nav.config.js` (feature names — do not rename).
- PWA: `registerSW()` once in `main.jsx` via `src/lib/pwa.js`.

## Node-importable files rule

Files reachable from `api/**` or from `node --test` via plain Node must stay
plain JS: no JSX, no `import.meta.env`, no CSS imports, no `import.meta.glob`.
Currently: `src/lib/crisisDetection.js` → `src/config/helplines.js`,
`src/lib/loaderTiming.js`, `api/*.js`. Do not merge them into Vite-only files.

## Database

Exactly four migrations in `supabase/migrations/` (`20261110000001`–`04`),
idempotent, applied in order. Full reference + verify queries:
`docs/DATABASE.md`. RLS on every table; helpers `is_admin()`,
`is_super_admin()`, `is_active_user()`, `is_recently_authenticated()`.
`enforce_profile_privilege_updates` trigger blocks non-super-admin writes to
privileged profile fields. New users get a `profiles` row from trigger —
don't create it manually.

## UI conventions

- Styling: tokens in `src/styles/base.css` (`--*` vars), `globals.css`
  (`.btn-primary`, `.card`, `.form-group`), `landing.css` (`ll-` public pages),
  inline style objects elsewhere. No Tailwind utilities.
- Brand: bg `#0B1220`, teal `#2DD4BF`, blue `#7DBDEE`, warm accent `#F2C879`.
- Fonts: `--font-display` (Bricolage Grotesque), `--font-body` (Instrument
  Sans) — self-hosted via fontsource packages.
- Icons: `src/components/AppIcon.jsx`; never emoji (mojibake history).
  Keep files UTF-8 without BOM.
- One `<h1>` per page; sentence-case headings; no banned marketing words
  (see homepage-redesign brief: no "empower/journey/unlock/seamless/…").

## Cautions

- `src/lib/groq.js` logs the first 10 chars of the session JWT — do not
  extend it.
- Site gate is temporary: `src/components/SiteGate.jsx` + wrapper in
  `main.jsx` + robots meta + `VITE_SITE_GATE`. Removal steps in README.
- `upgrade_interest.interested_plan='protection'` is used by `/protection`.
- Real contact details live ONLY in `src/config/site.js`; render via
  `ContactIcons` (icon-only links) — never as visible text.
