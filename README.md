# LossLens

Free, private gambling-recovery companion built for Kenya. React 19 + Vite SPA
on Supabase, deployed on Vercel, installable as a PWA.

## Stack

- **Frontend**: React 19, React Router 7, plain JS + CSS (no TypeScript).
  Self-hosted fonts: Bricolage Grotesque (display) + Instrument Sans (body)
  via `@fontsource-variable/*`.
- **Backend**: Supabase (auth, Postgres + RLS, storage, realtime) and two
  Vercel serverless routes in `api/` (`chat.js`, `crisis.js`) plus
  `api/consent.js`. Edge functions in `supabase/functions/` (Deno).
- **AI**: Oloo, an AI companion powered by Groq via `api/chat.js`. The API
  key is server-side only — never expose it under `src/` or with a `VITE_`
  prefix.

## Repository layout

```
src/
  App.jsx               all routes
  main.jsx              entry; registers the service worker and mounts the app
  api/ (repo root)      Vercel serverless routes — one file per route
  components/           shared UI (Brand, AppIcon, ContactIcons…)
  components/RouteGuards.jsx   RequireAuth + role-aware route map
  config/               site.js (contact + FACTS), helplines.js, nav.config.js
  context/              AuthProfile + CrisisAlertCount providers
  hooks/                index.js (useMediaQuery, useDocumentTitle)
  layouts/              AppShell
  lib/                  supabase.js, storage.js, crisisDetection.js, gate.js…
middleware.js            Vercel Routing Middleware site gate
  pages/{public,user,admin,insurer,therapist}
  styles/               base.css (tokens+reset), globals.css, landing.css
supabase/
  migrations/           six baseline SQL files + Pass 2 combined SQL
  functions/            edge functions (separate deploy units)
docs/                   DATABASE.md, FEATURES.md, HISTORY.md
public/                 manifest, icons, service-worker.js
```

## Environment variables

Client (`.env`, see `.env.example`):

| Name | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |
| `VITE_SHOW_PROTECTION` | `on` (default) shows the Protection concept teaser + `/protection`; `off` hides |

Server (Vercel / `vercel dev`):

| Name | Purpose |
| --- | --- |
| `GROQ_API_KEY` | Groq API key for Oloo — server-side only |
| `SUPABASE_SERVICE_ROLE_KEY` | Required by `api/chat.js` / `api/crisis.js` — fails closed if missing |
| `VITE_SUPABASE_URL` + `SUPABASE_ANON_KEY` or `VITE_SUPABASE_ANON_KEY` | Server-side Supabase access |

Edge functions: `ALLOWED_ORIGIN` (exact app origin; functions fail closed if
unset), `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_REF` for CLI deploys only.

## Commands

```bash
npm run dev        # Vite dev server (frontend only — does NOT serve api/)
npm run build      # production build (primary verification)
npm run lint       # eslint . (baseline has ~200 pre-existing errors)
npm run preview    # preview the production build
npx eslint <file>  # lint a single file
vercel dev         # serves api/ routes locally (Vercel CLI)
```

## Local setup

1. `npm ci`
2. Copy `.env.example` to `.env` and fill in the client variables.
3. Apply the SQL files in the documented order (see `docs/MIGRATION_NOTES.md`)
   and deploy edge
   functions if working on auth flows.
4. `npm run dev` for UI work; `vercel dev` to exercise `/api/chat`.

## Deployment

Order matters:

1. Apply the six baseline SQL files in `supabase/migrations/` in order, then
   apply `20261111000001_pass2_combined.sql` from the Supabase SQL editor.
   See `docs/MIGRATION_NOTES.md` for the manual steps and `docs/DATABASE.md`
   for the schema reference.
2. Deploy edge functions: `supabase functions deploy send-invite delete-account`
   and set `ALLOWED_ORIGIN`.
3. Set the Vercel env vars above for **both Production and Preview**, then
   redeploy. Pushes to `main` trigger a Production deployment.
4. In Supabase Auth URL Configuration, allow the deployed app origins and the
   `/auth/callback` and `/reset-password` redirect paths for Production and
   Preview.
5. Before making the site public, verify the helplines in
   `src/config/helplines.js`, complete legal review for the Privacy and Terms
   drafts.

Production: https://losslens-new.vercel.app

## Temporary site gate

While the site is private, the app is protected by a server-side gate in
`middleware.js` and `lib/gate.js`. Every request is checked before the app
loads, including `/api/*` and static assets. Visitors must enter the password
once; a secure HttpOnly cookie is set for 7 days. Requests without a valid
cookie receive the gate page, and `/api/*` returns a 401 JSON response.

The gate needs no environment variables — its configuration is hardcoded in
`lib/gate.js` as three constants:

- `GATE_ENABLED` — set to `false` and redeploy to open the site.
- `GATE_PASSWORD` — the access password (compared trimmed and
  case-insensitive, in constant time).
- `GATE_SECRET` — random string used only to sign the gate cookie.

`/__gate/lock` logs the visitor out by expiring the cookie.


## Docs

- `docs/DATABASE.md` — migrations, env vars, verify queries, schema reference
- `docs/FEATURES.md` — complete feature documentation
- `docs/HISTORY.md` — condensed project history + open items
- `AGENTS.md` — contributor/agent notes

## LossLens Protection (concept/pilot stage)

An optional gambling-harm recovery protection programme: members enrol via
their insurer, insurers verify rosters, issue versioned policies, confirm
premiums and adjudicate claims. LossLens is NOT the insurer — policies,
premiums and claim decisions belong to the licensed insurer partner. Diary,
chats, crisis data and behavioural scores are never exposed to insurers.
The feature is gated by `protection_mode` (`concept`/`pilot`/`live`) and is
in development — not an offer of insurance. See `docs/PROTECTION.md`.

## Database

Exactly eight SQL migrations in `supabase/migrations/` applied in order on a
fresh Supabase project — see `docs/DATABASE.md` and `docs/MIGRATION_NOTES.md`.
