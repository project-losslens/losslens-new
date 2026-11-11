# LossLens Complete Feature Documentation

Version: source audit current to this delivery

**Scope note.** This document describes behavior visible in the checked-in frontend, Edge Functions, Supabase migration files, and existing database reports. It does not claim live Supabase runtime behavior has been tested.

## 1. Product overview

LossLens is a Vite/React recovery application built around gambling-recovery diary, CBT, crisis support, AI-assisted chat, community support, events, resources, supporter relationships, media reflections, and administration. The browser application uses Supabase authentication, PostgREST tables, RPC functions, Storage, Realtime, and an Edge Function. Groq is called directly from the browser in the current implementation.

The application separates ordinary users, administrators, and Super Administrators through both frontend route guards and profile roles. Database RLS remains necessary for security because browser route checks are not a security boundary.

## 2. Public website

### Landing page
The landing page is a six-block, mobile-first overview in a dark "secure tech"
system: sticky header (transparent over the hero, solid after scroll), banner
hero with an inline SVG lens visual, a two-column about block, a 3x2 glass
tool-card grid (Diary, Oloo, Urge Toolkit, The Circle, CBT Modules, Family
Portal), numbered how-it-works steps with privacy promises, a closing call to
action, and a crisis helpline strip. It uses landing-scoped design tokens
(`.ll-landing`), a self-hosted geometric sans (Jost 300/500 woff2 in
`public/fonts`), and shared `PublicLayout` header/footer styles. A dismissible
install prompt appears as a bottom toast when the browser supports PWA
installation.

The public routes include Pricing, Protection, Privacy, Terms, About, Partners,
and a branded Not Found page. Privacy and Terms are clearly identified as
drafts pending legal review; their presence does not imply legal approval.

### Authentication entry pages
Login supports email/password and Google OAuth. A protected destination is
restored only when the signed-in role is allowed to access it; otherwise login
uses the role's own home. A single Supabase client stores sessions in
localStorage, while session-only login is cleared on the next app start if its
sessionStorage marker is missing.
Signup collects profile identity and uses the database auth trigger to create
the profile; confirmation and OAuth links return through `/auth/callback`.
Password reset requests a Supabase recovery email and the reset page applies
the returned recovery session. `/admin/*` is limited to admin and Super Admin,
`/super-admin/*` to Super Admin, `/therapist/*` to therapists, and `/insurer/*`
to insurers. Admins and Super Admins can also open the user app; therapists and
insurers cannot. Unauthorized portal URLs redirect to the signed-in role's
home, and the old elevated-page URLs redirect to the new Super Admin paths.
Authenticated users are redirected away from public login/signup pages.

Production and Preview must each have the Vercel `SITE_GATE_PASSWORD` and
`SITE_GATE_SECRET` values configured and redeployed. The matching Supabase Auth
URL allow-list must include the deployed origins and `/auth/callback` and
`/reset-password` paths. Never put the gate password in the repository.

### Pricing and family join
Pricing is implemented as a frontend pricing presentation. Family join accepts supporter invitation context and is documented as partially implemented because the anonymous acceptance path and exact session model require database and migration decisions.

## 3. User accounts and profiles

Profiles support full name, username, phone, goal, avatar, preferences, risk level, streak information, clean-start date, money saved, freeze state, badges and accountability fields. Signup and dashboard creation are implemented. Profile updates include profile-password reporting, contact details, avatar emoji or file upload, preferences, and account deletion.

Ordinary users are client-guarded through `profiles.role`. Assignment and entitlement changes require server-side database authorization. Client-side role checks are duplicated with the migration RLS and privileged-field protections, but live policy enforcement remains unverified.

## 4. Gambling recovery and CBT

### Recovery diary
Diary creates and updates one daily entry, lists recent entries, records mood, triggers, coping, thoughts, notes, amount gambled, gamble state, and updates streak/money-saved profile fields. It uses owner-filtered CRUD on `diary_entries` and profile updates.

### CBT modules
CBT modules retrieve completed progress and upsert module completion, answers, title, and completion time. The source-level contract indicates `(user_id, module_id)` is the logical completion identity, but exact live constraints remain migration-dependent.

### Urge Toolkit
Urge Toolkit provides client-side coping exercises and controls, including timers, breathing, delay, grounding, and crisis access where implemented. This page should be treated as UI and interaction behavior backed by frontend state, rather than a complete server event audit.

### Gamification
Badges, streak days, money saved, freeze days, and recovery coins are implemented in frontend logic. `add_recovery_coins` is disabled in the migration package, so recovery coin calls are unavailable until a secure reward mechanism is established.

### Crisis support
Crisis chat detection writes `crisis_alerts`; admins can review unresolved alerts and update approved resolution/escalation fields subject to database authorization.

## 5. AI companion and chat

The `AIChat` component sends messages through the browser Groq integration. `src/lib/groq.js` retrieves profile and recovery context, injects crisis safeguards, calls a Groq chat-completions endpoint, and persists user/assistant history in `chat_history` using the current canonical `user_id`, `role`, `message`, `created_at` fields where supported by the migration package.

The interface provides loading and error states, suggested prompts, voice recognition, speech synthesis, and text chat. Direct browser `VITE_GROQ_API_KEY` exposure is a security risk. Runtime integration success, provider availability, and exact database history behavior are unverified.

## 6. Community features

### The Circle
Circle supports room selection, membership state, unread counts, recent membership activity, text messages, deletion, Realtime inserts/deletes, and local reaction state. The RPC `increment_reaction` is called but canonical reaction columns and mapping are unresolved; reaction functionality is therefore not fully verifiable.

### Whispers
Whispers implements matching, active private matches, candidate selection, reporting, and message sending/listing. Participant authorization, immutable match identity, report validation, and identity provisioning are subject to migration review and live policy testing.

## 7. Events and support

Events list active public or authenticated event records, user RSVPs, attendance updates, discussion replies, and event messages. Admin pages create/update/cancel or manage events, including event capacity and scheduling fields.

Groups support membership, join/leave, messages, and active-room visibility. Group message flow requires RLS and membership checks. Broadcasts target notifications or broadcast recipient records, with scheduled/publication visibility enforced by planned publication state.

The supporter flow creates invitations, shares public join links or lookup values, stores supporter messages and feedback, and supports crisis-contact designation. Anonymous public lookup and supporter chat acceptance require explicit migration decisions; direct anonymous table access is not treated as confirmed.

## 8. Media and personal commitments

### Monthly Mirror
Monthly Mirror records browser audio/video media, persists metadata, creates signed/download URLs as product work proceeds, updates rating or reflection fields, and deletes recordings. The current source uses public URLs and is not compatible with the private `mirror-recordings` bucket without application changes.

### Precious Pacts
Precious Pacts supports written metadata and voice recording, playback counts, removal, and public URL retrieval. Written pacts use `storage_path = 'written'` as canonical metadata. Private bucket signed URL changes are still required.

## 9. Admin dashboard

Admin pages implement:
- crisis alert monitoring and resolution/escalation;
- event creation and management;
- group creation and membership management;
- resource catalogue management;
- analytics and reporting;
- broadcast creation and recipient delivery.

Admin access to private recovery records is not restored by the migration package. This includes diary entries, CBT progress, chat history, mirror recordings, and Precious Pacts.

## 10. Super Admin dashboard

Super Admin pages implement user and administrator management, email lookup through `get_user_email`, password-reset invocation, role/status and subscription updates, system settings, audit logs, B2B clients, insurance partners, grant applications, and chat history viewing. They live under `/super-admin/*`; therapist promotion is confirmed, changes the account to therapist-only access, and can be reverted to the user role.

The Super Admin chat viewer conflicts with owner-only chat privacy because direct Super Admin table access was removed. Runtime compatibility requires a future privacy-reviewed server function or product decision rather than migration RLS bypass.

## 11. Backend and database architecture

The application has source evidence for at least the following tables:

`profiles`, `diary_entries`, `cbt_progress`, `badges`, `notifications`, `chat_history`, `crisis_alerts`, `resources`, `resource_ratings`, `resource_suggestions`, `events`, `event_rsvps`, `event_messages`, `event_discussions`, `broadcasts`, `broadcast_recipients`, `groups`, `group_members`, `circle_rooms`, `circle_room_members`, `circle_messages`, `whispers_matches`, `whispers_messages`, `whispers_reports`, `mirror_recordings`, `precious_pacts`, `supporter_invitations`, `supporter_messages`, `supporter_feedback`, `audit_logs`, `b2b_clients`, `grant_applications`, `insurance_partners`, `system_settings`

Migration reports also indicate additional tables or views used in administrative workflows. Wildcard queries do not prove every column. Canonical conflicts, exact foreign keys, defaults, nullability and uniqueness must remain based on migration/old-schema evidence; no live schema dump has been obtained.

### RPC functions evidenced by source
- `increment_reaction` — Circle reactions; mapping unresolved.
- `increment_pact_play_count` — pact playback count update.
- `add_recovery_coins` — recovery rewards; disabled/revoked in migration package.
- `get_user_email` — privileged email lookup.
- `supporter_invitation_lookup` — public invite lookup.

Additional Edge Function calls include `admin-reset-password`.

### Storage
- `avatars`: public profile images are intended.
- `mirror-recordings`: owner-private media.
- `precious-pacts`: owner-private media.

### Realtime
Confirmed subscription targets include `circle_messages`, `notifications`, `crisis_alerts`, and `audit_logs`; Realtime publication membership requires migration execution and live verification.

## 12. Security and privacy

Confirmed browser-only controls are insufficient. Authentication depends on Supabase sessions. Route guards check profile roles for ordinary user, admin, and Super Admin views. Privileged profile fields, crisis escalation and resolution, broadcasts, event administrator replies, Circle membership, Whispers identity/reporting, support invitations, Storage objects, and audit writes require database enforcement.

Private recovery records remain owner-only in the migration design. Administrative access has deliberately been excluded for those records. Direct browser Groq access and the hardcoded site password are known security risks requiring changes outside the migration package.

## 13. External integrations

- **Supabase:** authentication, database, Storage, Realtime, RPC, and Edge Functions.
- **Groq:** browser direct AI chat completions using environment configuration.
- **Resend:** server-side invite delivery only if the checked-in Edge Function configuration includes it.
- **Google OAuth:** browser OAuth provider.
- **Email providers:** Supabase authentication and password recovery.

No secret value is reproduced in this document. Configuration names include `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_GROQ_API_KEY`.

## 14. Deployment and configuration

Deployment is expected on Vercel with environment variables supplied at build and runtime. Supabase URL/keys come from Vite environment variables. OAuth redirect allowlists and confirmation URLs must match the deployed host. No live deployment or database execution has been verified by this documentation audit.

## 15. Outstanding work

- Replace browser Groq requests with a server-side or Edge Function proxy.
- Replace private Media public URL calls with signed URL flows and application change/error handling.
- Restore circle reaction functionality only after canonical mappings are established.
- Validate Whispers identity provisioning and anonymous supporter flows against the live database.
- Replace direct Super Admin chat viewing with privacy-reviewed server access or remove the feature.
- Reconsider recovery coin reward security and authorization.
- Remove or protect the hardcoded development site password.
- Replace or validate Kingsly OAuth redirect URLs.
- Verify all migration and RLS behavior in isolated runtime validation before deployment.

## 16. Master feature matrix

See `LOSSLENS_FEATURE_IMPLEMENTATION_MATRIX.xlsx` for route-by-route coverage.

| Feature area | User type | Frontend | Backend evidence | Status |
|---|---|---|---|---|
| Public site and authentication | Public | public pages | Supabase Auth, profiles | Fully implemented |
| Recovery diary | User | Diary.jsx | diary_entries, profiles | Fully implemented |
| CBT progress | User | CBTModules.jsx | cbt_progress | Fully implemented |
| Urge Toolkit | User | UrgeToolkitPage.jsx | primarily frontend | Fully implemented |
| AI companion | User | AIChat.jsx, groq.js | Groq, chat_history | Fully implemented UI; security correction required |
| Circle | User | TheCircle.jsx | circle_* tables, Realtime, RPC | Partially implemented |
| Whispers | User | Whispers.jsx | whispers_* tables | Partially implemented |
| Events | User/Admin | Events.jsx, ManageEvents.jsx | events, event_* | Fully implemented |
| Resources | User/Admin | Resources.jsx, ManageResources.jsx | resources, ratings, suggestions | Fully implemented |
| Supporter portal | User/supporter | FamilyPortalPage.jsx, FamilyJoin.jsx | supporter_* | Partially implemented |
| Mirror | User | MonthlyMirrorPage.jsx | mirror_recordings, Storage | Partially implemented for private bucket |
| Precious Pacts | User | PreciousPactPage.jsx | precious_pacts, Storage | Partially implemented for private bucket |
| Admin operations | Admin | admin pages | broad tables, RPC | Fully implemented |
| Super Admin operations | Super Admin | super-admin pages | privileged tables/functions | Fully implemented except private chat viewer privacy conflict |
