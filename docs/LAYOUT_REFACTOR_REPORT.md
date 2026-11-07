# LossLens Layout Refactor Report

Base commit: `8e3739e`. Implementation commit: pending. No commit, push, merge, or deployment was made because the required authenticated desktop/mobile and production smoke checks could not be completed.

## ID status and evidence

| ID | Status | Evidence |
|---|---|---|
| N-S1 | Fixed | `Sidebar` is mounted by the persistent `AppShell`; user pages no longer mount it. |
| N-S2 | Fixed | Removed the page-level 48px sidebar offsets; only `.shell__main` offsets content. |
| N-S3 | Fixed | Desktop collapse state is owned by `AppShell` and persisted as `losslens:sidebar`. |
| N-S4 | Fixed | Menu controls use `AppIcon` and have accessible labels/visually hidden text. |
| N-S5 | Fixed | The mobile scrim renders only while the drawer is open; its z-index is below the sidebar. |
| N-S6 | Fixed | The closed sidebar is inert, removing its links from keyboard navigation. |
| N-S7 | Fixed | Navigation uses a labelled list of real `NavLink` elements; sign-out uses Supabase auth and navigates to login. |
| N-S8 | Partly fixed | `useMediaQuery` drives responsive JS behavior; desktop state persists and Escape closes only the mobile drawer. CSS and JS both retain the matching 768px breakpoint. |
| N-S9 | Fixed | Active, hover, and focus states use CSS; the old imperative hover and sidebar overrides are gone. |
| N-S10 | Fixed | `/subscription` is nested under the user shell. Subscription was the only page with a bottom tab bar; its standalone navigation was removed. |
| N-A1 | Partly fixed | Admin pages now use the shared shell and no longer contain page-level back/exit navigation or sidebar offsets. Some content wrapper divs remain; toolbars retain page actions and subtitles. |
| N-A2 | Fixed | Confirmed unused, then deleted `AdminSidebar`, `SuperAdminSidebar`, and `SiteGate`; no page imports remain. |
| N-A3 | Fixed | Admin routes use the responsive dark shell, active `NavLink` states, and a dark elevated-access screen. Admin tables are horizontally scrollable. |
| N-A4 | Partly fixed | `nav.config.js` is the shared source for navigation items and titles, and legacy super-admin redirects now converge on `/admin`. Route elements remain declared in `App.jsx` so each route can retain its authorization and lazy component. |
| N-A5 | Fixed | `AuthProfileProvider` loads the profile once per user session and exposes role flags, profile status, loading/error state, and retry. A no-session initialization bug was found in browser checking and fixed. |
| N-A6 | Fixed (UX only) | `RequireElevated` retains the 15-minute session-storage unlock and explicitly documents that it is not security. Server-side enforcement remains required. |
| N-C1 | Partly fixed | Shared CSS is imported once from `main.jsx`; duplicate sidebar/layout styling was consolidated, and shell/admin brand colors use tokens. Inline hex colors remain in the user/public/shared files listed below. |
| N-C2 | Fixed | `tokens.css` defines distinct danger, warning, success, and info colors/soft backgrounds; legacy `--ll-*` aliases map to the semantic tokens. |
| N-C3 | Fixed | No text-color declarations remain using `rgba(255,255,255,0.08)`; affected admin subtitles and labels use `--text-muted`. |
| N-C4 | Fixed | Authentication is enforced by layout routes and shared context; no `localStorage.clear()` or page-level `ProtectedRoute` usage remains. |
| N-C5 | Fixed | Route components are lazy-loaded. Baseline entry JS was 1,091.89 kB (252.46 kB gzip); the refactored initial entry plus Supabase chunk is 442.53 kB (129.08 kB gzip), a 59.5% raw / 48.9% gzip reduction. Pages are emitted as lazy route chunks. |
| N-C6 | Fixed | No numeric z-index declarations remain in `src`; stacking uses the shared semantic z-index tokens. |

## Verification

- `npm run build`: passed.
- Targeted ESLint for routing, shell, auth, and shared context files: passed.
- `npm run lint`: reports 208 errors and 18 warnings across the repository. Existing page-level hook/unused-variable issues remain; no errors were reported in the new shell/context/routing files.
- `git diff --check`: passed.
- Browser: public landing/login rendered, and an unauthenticated visit to `/admin` redirected to `/login` after fixing the auth context's initial no-session state.
- Not verified: authenticated dashboard/admin navigation, desktop/mobile drawer interactions, middle-click behavior, Lighthouse contrast/accessibility scores, production smoke tests, CI, and service-worker behavior. No disposable test account or production deployment access was available. No test framework exists in the repository; no test tooling was added.

## Remaining inline hex colors

These are user/public pages and shared components not fully tokenized in this pass:

- Shared: `src/components/AIChat.jsx`, `src/components/NotificationBell.jsx`, `src/lib/relapsePrediction.js`, `src/lib/toast.jsx`
- User pages: `src/pages/user/CBTModules.jsx`, `src/pages/user/Dashboard.jsx`, `src/pages/user/Diary.jsx`, `src/pages/user/Events.jsx`, `src/pages/user/FamilyPortalPage.jsx`, `src/pages/user/MonthlyMirrorPage.jsx`, `src/pages/user/Onboarding.jsx`, `src/pages/user/PreciousPactPage.jsx`, `src/pages/user/Profile.jsx`, `src/pages/user/Resources.jsx`, `src/pages/user/SubscriptionPage.jsx`, `src/pages/user/TheCircle.jsx`, `src/pages/user/UrgeToolkitPage.jsx`, `src/pages/user/Whispers.jsx`
- Public pages: `src/pages/public/FamilyJoin.jsx`, `src/pages/public/ForgotPassword.jsx`, `src/pages/public/Landing.jsx`, `src/pages/public/Login.jsx`, `src/pages/public/Pricing.jsx`, `src/pages/public/ResetPassword.jsx`, `src/pages/public/Signup.jsx`

## Follow-up

The elevated-access password check remains a client-side UX gate. Enforce sensitive actions server-side with RLS or an edge function validating a short-lived claim before treating elevated access as secure. Complete authenticated responsive checks, Lighthouse/production smoke tests, and remaining inline color-token migration before merge/deployment.
