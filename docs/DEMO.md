# Demo script (3 minutes)

Demo mode is a self-contained walkthrough at `/demo`. It uses fixture data
only — it never reads from or writes to the real database. Every screen is
labelled "Sample".

## Enable

Demo mode is on by default. To disable it for a deployment, set
`VITE_DEMO_MODE=false` at build time. The `/demo` route stays behind the site
gate like every other page.

Entry points:

- Sign-in page → "Try the demo" link (shown when demo mode is enabled)
- Direct URL: `/demo` (after entering the gate password)

## 3-minute path

1. **Gate + landing (0:00–0:15)** — Enter the gate password, open `/demo`.
   Point out the "Sample data" banner and the "Reset demo" button.
2. **Home (0:15–0:45)** — Show the sample member card: 45 days of check-ins,
   a day streak, and money saved. Explain streaks and money saved are computed
   from diary data.
3. **Check-in (0:45–1:15)** — Fill in the quick check-in (mood, urge 0–10,
   gambled yes/no) and save. It persists on the device only. Mention the real
   app syncs this to the user's account and updates streak/money instantly.
4. **Urge Toolkit (1:15–1:45)** — Tap "Start 10-minute delay" to show the
   countdown. In the real app this is followed by breathing, grounding and a
   call-a-supporter option, and works fully offline.
5. **Community + insurer (1:45–2:30)** — Scroll to Community (anonymous peer
   support) then the Insurer dashboard: enrolled members, claim frequency,
   average cost per claim, retention — grouped, de-identified data only, with
   definitions on tap and CSV export.
6. **Admin sample + tour (2:30–3:00)** — Show the Admin analytics sample
   block, then tap "Take the tour" for the guided 5-step overview (or skip it
   if time is short).

## Reset

"Reset demo" clears the demo check-ins and tour state in `localStorage` and
reloads the page. No server-side data exists to reset.

## What is real vs sample

- **Sample:** all numbers, posts, claims, and the demo check-in store.
- **Real:** the layout, components, metric definitions, CSV export logic, and
  the guided tour — the same code paths the production views use.
