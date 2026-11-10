// Demo mode flag. Enabled unless VITE_DEMO_MODE=false. The /demo route only
// ever renders fixture data — it never reads or writes the real database.
export function isDemoEnabled() {
  return import.meta.env.VITE_DEMO_MODE !== 'false'
}
