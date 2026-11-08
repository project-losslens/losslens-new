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
  main.jsx              entry; registers SW once, wraps app in SiteGate
  api/ (repo root)      Vercel serverless routes — one file per route
  components/           shared UI (Brand, AppIcon, ContactIcons, SiteGate…)
  components/RouteGuards.jsx   RequireAuth + RequireElevated
  config/               site.js (contact + FACTS), helplines.js, nav.config.js
  context/              AuthProfile + CrisisAlertCount providers
  hooks/                index.js (useMediaQuery, useDocumentTitle)
  layouts/              AppShell
  lib/                  supabase.js, storage.js, crisisDetection.js, …
  pages/{public,user,admin,insurer,therapist}
  styles/               base.css (tokens+reset), globals.css, landing.css
supabase/
  migrations/           exactly four .sql files — see docs/DATABASE.md
  functions/            edge functions (separate deploy units)
docs/                   DATABASE.md, FEATURES.md, HISTORY.md, SITE_GATE.md
public/                 manifest, icons, service-worker.js
```

## Environment variables

Client (`.env`, see `.env.example`):

| Name | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |
| `VITE_SITE_GATE` | `on` (default) shows the temporary password gate; `off` disables |
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
npm test           # node --test (unit tests)
npm run lint       # eslint . (baseline has ~200 pre-existing errors)
npx eslint <file>  # lint a single file
vercel dev         # serves api/ routes locally (Vercel CLI)
```

## Local setup

1. `npm ci`
2. Copy `.env.example` to `.env` and fill in the client variables.
3. Apply the four migrations (see `docs/DATABASE.md`) and deploy edge
   functions if working on auth flows.
4. `npm run dev` for UI work; `vercel dev` to exercise `/api/chat`.

## Deployment

Order matters:

1. Apply the four SQL files in `supabase/migrations/` **in order, once each**
   (idempotent; also safe to re-run). See `docs/DATABASE.md` for verify queries.
2. Deploy edge functions: `supabase functions deploy send-invite delete-account`
   and set `ALLOWED_ORIGIN`.
3. Set the Vercel env vars above, then deploy (push to `main` auto-deploys).

Production: https://losslens-new.vercel.app

## Temporary site gate

While the site is private, `src/components/SiteGate.jsx` wraps the whole app
outside the router: visitors must enter a password (SHA-256 compared via Web
Crypto) before anything mounts — no Supabase calls happen behind it. Unlock
is remembered per device in `localStorage.ll_site_unlocked`. The gate also
keeps `noindex, nofollow` in `index.html` and a `tel:` crisis link that works
without unlocking.

- **Change the password**: hash the new value and replace
  `SITE_GATE_EXPECTED_HASH` in `SiteGate.jsx`:
  `printf 'newpassword' | sha256sum` (input is trimmed + lowercased before
  hashing, so case does not matter). Never commit the plaintext.
- **Remove the gate** (when the site goes public): delete
  `src/components/SiteGate.jsx`, `src/styles/site-gate.css` rules in
  `globals.css`, the `<SiteGate>` wrapper + import in `src/main.jsx`, the
  `noindex` meta in `index.html`, `VITE_SITE_GATE` from `.env.example`/Vercel,
  and `docs/SITE_GATE.md` if still present.


## Docs

- `docs/DATABASE.md` — migrations, env vars, verify queries, schema reference
- `docs/FEATURES.md` — complete feature documentation
- `docs/HISTORY.md` — condensed project history + open items
- `AGENTS.md` — contributor/agent notes
