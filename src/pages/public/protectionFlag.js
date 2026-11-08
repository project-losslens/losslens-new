// Feature flag for the LossLens Protection concept pages.
// Default on; set VITE_SHOW_PROTECTION=off to hide teaser, nav link and page.
export const SHOW_PROTECTION = import.meta.env?.VITE_SHOW_PROTECTION !== 'off'
