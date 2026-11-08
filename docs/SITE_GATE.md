# Site Gate (temporary)

A simple password screen that blocks the whole site until a visitor enters the
correct password. It is **temporary** — remove it when the site goes public.

## How it works

- `src/components/SiteGate.jsx` wraps the entire app in `src/main.jsx`, outside
  the router, so every route (`/`, `/login`, `/signup`, `/admin`,
  `/reset-password`, ...) is covered.
- Until unlocked it renders only the gate screen; the app never mounts, so no
  Supabase calls or data loads happen behind it.
- The entered password is trimmed, lowercased, SHA-256 hashed via the Web
  Crypto API, and compared against a stored hash. The plaintext password is
  never stored or sent anywhere.
- On success `localStorage['ll_site_unlocked'] = '1'` is set so the device is
  not asked again. On failure the field is cleared and an "Incorrect password"
  message appears in an `aria-live` region; after 3 wrong attempts there is a
  1 second delay before the next attempt.
- The gate never touches `window.location`, so auth links carrying
  `#access_token=...` or `?code=...` keep working after unlock.
- While the gate is on, `index.html` includes
  `<meta name="robots" content="noindex, nofollow">` and the service worker
  cache version is bumped so stale builds are not served.

## Change the password

1. Pick a new password and hash it (lowercase, no surrounding spaces):

   ```sh
   printf 'newpassword' | sha256sum
   ```

2. Replace the hash in `SITE_GATE_EXPECTED_HASH` in
   `src/components/SiteGate.jsx`.
3. Rebuild and redeploy.

## Disable without deleting code

Set `VITE_SITE_GATE=off` in the environment (e.g. Vercel project env vars) and
redeploy. The gate then renders the app immediately.

## Remove the gate completely

1. Delete `src/components/SiteGate.jsx` and `src/components/SiteGate.test.js`.
2. In `src/main.jsx`, remove the `import SiteGate ...` line and the
   `<SiteGate>` / `</SiteGate>` wrapper lines (restore `BrowserRouter` as the
   outermost element inside `StrictMode`).
3. Remove `<meta name="robots" content="noindex, nofollow">` from `index.html`.
4. Remove `VITE_SITE_GATE` from `.env.example` and the Vercel env vars.
5. Optionally bump the service-worker `CACHE_VERSION` again.

## Notes

- `index.html` carries `<meta name="robots" content="noindex, nofollow">` while the gate exists — remove it together with the gate.
- The gate screen is styled by `src/styles/site-gate.css` (imported by `SiteGate.jsx`).
