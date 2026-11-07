# LossLens Groq Integration Report

## Architecture reused

- Existing Oloo widget and Oloo response flow in `src/components/AIChat.jsx`
- Existing Supabase authentication client in `src/lib/supabase.js`
- Existing `chat_history` table and owner RLS policies
- Existing Vite/Vercel application structure
- Existing frontend Groq service entry point in `src/lib/groq.js`

## Files modified

- `api/chat.js` - added the server-side Groq/Oloo endpoint
- `src/lib/groq.js` - replaced browser Groq calls with authenticated calls to `/api/chat`
- `.env.example` - documents the required local variables without secrets
- `LOSSLENS_GROQ_INTEGRATION_REPORT.md` - implementation and test record

No Supabase SQL, schema, migration, or RLS policy files were changed.

## Groq configuration

- Verified active chat catalogue access.
- Selected production-compatible model: `openai/gpt-oss-20b`.
- Groq connectivity test completed successfully.

## Backend endpoint

- Endpoint: `POST /api/chat`
- Authentication: Supabase access token in the Authorization header
- User identity: derived server-side from Supabase, not accepted from the browser
- History table: existing `chat_history`
- Persistence fields: `user_id`, `role`, `message`; `created_at` uses the existing table default

## Local environment configuration

Use the project root `.env.local` for local development, containing the variable names documented in `.env.example`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `GROQ_API_KEY`

No API secret is stored in source control. `.env` and `.env.local` are ignored by Git. Add the new Groq key only to the local environment secret file.

Vercel should retain `GROQ_API_KEY` in its server-side project environment variables. It must not be configured with a `VITE_` prefix.

## Implemented safeguards

- Server-side API key storage
- Supabase bearer-token authentication
- Server-derived user identity
- Message and conversation-length limits
- 30-second upstream timeout and 35-second client timeout
- Safe client-visible error responses
- Temporary-failure, timeout, and 429 handling
- Owner-scoped persistence through the existing Supabase RLS setup
- Crisis-message response using LossLens/previously configured support guidance

## Tests performed

- Groq model catalogue lookup: passed
- Groq chat completion against `openai/gpt-oss-20b`: passed
- Missing `GROQ_API_KEY` handler test: passed with a safe 503 response
- Production build: passed
- API handler syntax check: passed
- Browser-source secret scan: passed; no Groq key or `VITE_GROQ_API_KEY` remains in `src`

## Results requiring production verification

The following remain to be validated against a deployed endpoint and real Supabase account:

- Successful authenticated production Oloo response
- Multi-turn context
- `chat_history` persistence
- Authenticated-user isolation
- Groq 429 and temporary upstream failure behavior in production

Production connectivity was not claimed from the local build alone. Deployment and production verification were intentionally not performed under the requested boundaries.

## Outstanding issues

- Local route verification requires running the Vercel server function runtime.
- Existing ESLint errors remain outside this integration and were not changed.
- No database schema or RLS changes are required.

## Release status

- Integration commit: `92e8981`
- GitHub push: completed to `main` on `project-losslens/losslens-new`
- Production deployment: completed and reachable at `https://losslens-mu.vercel.app/`
- Production API routing: verified
- Unauthenticated production chat request: safely rejected with HTTP 401
- Authenticated Oloo completion, chat-history persistence, user isolation, and Groq failure-path checks require a valid signed-in browser session and were not simulated with production credentials.

## Five repair fixes

### Files changed

- `src/components/AIChat.jsx`: opaque Oloo panel, header, button, notification, controls, assistant text, input, responsive sizing, and encoding corrections.
- `src/index.css`: added the `--color-surface-solid` opaque surface token.
- `src/pages/user/Dashboard.jsx`: opaque install-app banner and mojibake correction.
- `src/pages/user/Profile.jsx`: mojibake correction.
- `api/chat.js`: fixed authenticated Supabase header variable use and wrapped authentication lookup failures with a clean 401.
- `src/lib/relapsePrediction.js`: added one-time missing-column warnings and safe low-risk fallbacks; corrected trigger text.
- `index.html`: removed duplicate inline service-worker registration.
- `supabase/migrations/20261106152654_add_profile_risk_columns.sql`: adds the missing profile risk columns.

Risk column references are in `src/lib/relapsePrediction.js` at lines 104-105 and 123, 138, and 146.

### Required Supabase SQL

```sql
alter table public.profiles
  add column if not exists daily_risk_score integer not null default 0,
  add column if not exists risk_factors jsonb not null default '[]'::jsonb,
  add column if not exists last_risk_check date;

notify pgrst, 'reload schema';
```

The SQL was not executed against Supabase.

### Additional findings

- `api/chat.js` authentication fallback is caught inside the exported handler, preventing a thrown authentication lookup from becoming HTTP 500.
- Missing profile risk columns now use a single warning and return `{ score: 0, level: 'low', factors: [] }`.
- The service worker is registered only by `src/main.jsx` through `src/lib/pwa.js`.
- Opaque floating surfaces also include the Dashboard install-app banner; the existing Notification Bell, sidebar and toast surfaces were reviewed and mobile install/chat overlays were kept within the palette.

### Verification

- `npm run build`: passed.
- `node --check api/chat.js`: passed.
- Focused lint for `api/chat.js` and `src/lib/relapsePrediction.js`: passed.
- Full repository lint remains nonzero due to pre-existing React hook and unrelated lint findings, including `src/components/AIChat.jsx`.
- Production `POST /api/chat` without authentication is expected to return HTTP 401 after deployment.

### Final deployment

- Fix commit: `271debd`
- Main branch push: completed
- Production site: returned HTTP 200.
- Production unauthenticated `POST /api/chat`: returned HTTP 401 with an authentication error, not HTTP 500.
- Vercel CLI was unavailable locally, so server-side environment variable presence could not be inspected from this environment.
