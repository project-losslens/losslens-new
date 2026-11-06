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
