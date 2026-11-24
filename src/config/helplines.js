// Provider-published details checked 2026-11-24. Published hours do not guarantee a response.
export const HELPLINES = [
  {
    id: 'befrienders', name: 'Befrienders Kenya', phone: '+254 722 178177', tel: '+254722178177',
    hours: 'Monday-Friday, 9 a.m.-5 p.m. (Africa/Nairobi)', priority: true, verifiedOn: '2026-11-24',
    url: 'https://lifeline-international.com/member/kenya/',
    source: 'https://lifeline-international.com/member/kenya/',
  },
  {
    id: 'gamhelp', name: 'Gamhelp Kenya', phone: '+254 726 883 960', tel: '+254726883960',
    hours: 'Published 24/7 telephone and online counselling', priority: false, verifiedOn: '2026-11-24',
    url: 'https://gamhelpkenya.com/gambling-addiction-treatment/',
    source: 'https://gamhelpkenya.com/gambling-addiction-treatment/',
  },
  {
    id: 'nacada', name: 'NACADA', phone: '1192', tel: '1192',
    hours: 'Published hours not verified', priority: false, verifiedOn: null,
  },
]
export const primaryHelpline = HELPLINES.find(line => line.priority) || HELPLINES[0]
export const SUPPORT_SERVICES = HELPLINES.filter(line => ['befrienders', 'gamhelp'].includes(line.id))
