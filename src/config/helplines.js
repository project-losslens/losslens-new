// Single source of truth for crisis helplines shown across the site.
// TODO(owner): verify by calling before the site goes public.
//
// NOTE: an earlier draft also listed "+254 722 178 177" for Befrienders Kenya
// in a few places; the toll-free line below is the canonical one going forward.
// TODO(owner): Ministry of Health gambling helpline — add a slot here if the
// owner supplies a verified number. Do not invent one.

export const HELPLINES = [
  {
    id: 'befrienders',
    name: 'Befrienders Kenya',
    phone: '0800 722 030',
    tel: '0800722030',
    hours: '24/7',
    priority: true,
    verifiedOn: null, // TODO(owner): verify by calling
  },
  {
    id: 'nacada',
    name: 'NACADA',
    phone: '1192',
    tel: '1192',
    hours: '24/7',
    priority: false,
    verifiedOn: null, // TODO(owner): verify by calling
  },
  // TODO(owner): Ministry of Health gambling helpline number goes here when supplied.
]

export const primaryHelpline = HELPLINES.find((h) => h.priority) || HELPLINES[0]
