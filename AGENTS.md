# AGENTS.md

LossLens is a plain-JS React 19 + Vite 8 SPA backed by Supabase, plus one Vercel serverless function for AI chat. There is no TypeScript and no test suite.

## Commands
- Dev (frontend only): `npm run dev`
- Primary verification: `npm run build`
- Lint a single file: `npx eslint path/to/file.jsx`
- Repo-wide `npm run lint` already fails on pre-existing hook/unused-var issues; don't treat those as regressions you caused (see `LOSSLENS_FINAL_RELEASE_REPORT.md`).
- No test or typecheck command exists. Do not invent one.
- `npm run dev` does NOT serve `api/chat.js`. Use `vercel dev` (Vercel CLI is not a dependency) to exercise the Oloo endpoint locally; otherwise chat fails locally.

## Environment
- Client: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` in `.env` (gitignored; see `.env.example`). `src/lib/supabase.js` throws at import if either is missing.
- Server (`api/chat.js`): `GROQ_API_KEY` (NO `VITE_` prefix) and `VITE_SUPABASE_URL` plus `SUPABASE_ANON_KEY` or `VITE_SUPABASE_ANON_KEY`.
- Never expose `GROQ_API_KEY` under `src/` or with a `VITE_` prefix.
- Supabase project id is `kingsly`, not `losslens` (`supabase/config.toml`).

## Architecture
- Entry: `index.html` -> `src/main.jsx` -> `src/App.jsx`. All routes are declared in `src/App.jsx`; pages live in `src/pages/{public,user,admin,super-admin}`.
- Roles are `user | admin | super_admin` on `profiles.role`. `src/components/ProtectedRoute.jsx` enforces `adminOnly` / `superAdminOnly`.
- Use the singleton client from `src/lib/supabase.js`. No path aliases; relative imports.
- AI flow: `src/lib/groq.js#askGroq` POSTs to `/api/chat` with the Supabase JWT; `api/chat.js` validates the JWT, reads user context, calls Groq, writes `chat_history`. The prompt that actually runs is `BASE_SYSTEM_PROMPT` in `api/chat.js`; the copy in `src/lib/groq.js` is currently unused.
- `supabase/functions/send-invite/index.ts` (Deno) handles admin invite, password reset, and email lookup using the service-role key.
- Deployment is Vercel; `vercel.json` has an SPA catch-all. Put new serverless routes in `api/`.

## Database / migrations
- Migrations live in `supabase/migrations`, timestamp-ordered. The `20261104_0000xx_*` set is headed "DRAFT ONLY"; do not assume it matches the live database without checking.
- RLS is enabled on every application table. Reuse `public.is_admin()`, `public.is_super_admin()`, `public.current_user_role()` (migration `..._000008`).
- Trigger `enforce_profile_privilege_updates` (migration `..._000007`) blocks non-super-admins from changing `role`, `status`, `streak_days`, `money_saved`, subscription, risk, and other privileged profile fields. Client update code for those fields will fail.
- New users get a `profiles` row from the `on_auth_user_created` trigger; don't create it manually.
- CLI is the dev dependency `supabase`: use `npx supabase`.

## UI conventions
- Tailwind is installed but not used as utility classes. Styling is mostly inline style objects plus `src/index.css` (tokens/reset) and `src/styles/globals.css` (`.btn-primary`, `.form-group`, `.card`).
- Brand: bg `#0B1220`, teal `#2DD4BF`, secondary `#7DBDEE`, opaque panel `#171E2B`. Keep Oloo/chat surfaces opaque (`--color-surface-solid`).
- Use `src/components/AppIcon.jsx` for icons. Do not paste emoji/symbol characters; this repo has a recurring mojibake/encoding problem, so keep files UTF-8.
- PWA service worker is registered exactly once via `registerSW()` in `src/main.jsx` (`src/lib/pwa.js`) against `public/service-worker.js`. Do not re-register it in `index.html`.

## Cautions
- `src/lib/groq.js` logs the first 10 chars of the session JWT. Remove debug logging; don't extend it.
- `README.md` is the stock Vite template. Real notes are the root `LOSSLENS_*_REPORT.md` files.
