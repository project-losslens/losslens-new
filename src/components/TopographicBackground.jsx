// Sitewide topographic-line backdrop. Fixed, non-interactive layer behind
// page content. Intensity is controlled by the variant class
// (see src/styles/topo.css). Replaces the retired Aurora component.
export default function TopographicBackground({ variant = 'app', className = '' }) {
  return (
    <div
      className={`topo topo--${variant}${className ? ` ${className}` : ''}`}
      aria-hidden="true"
    >
      <svg className="topo__lines" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" focusable="false">
        <g fill="none" strokeLinecap="round">
          <path className="topo__line topo__line--1" d="M-40 120 C 240 60, 420 200, 700 150 S 1180 40, 1500 140" />
          <path className="topo__line topo__line--1" d="M-40 210 C 260 150, 460 290, 740 240 S 1200 130, 1500 230" />
          <path className="topo__line topo__line--2" d="M-40 320 C 220 260, 480 400, 760 350 S 1220 240, 1500 340" />
          <path className="topo__line topo__line--2" d="M-40 420 C 260 360, 500 500, 780 450 S 1240 340, 1500 440" />
          <path className="topo__line topo__line--3" d="M-40 540 C 240 480, 520 620, 800 570 S 1260 460, 1500 560" />
          <path className="topo__line topo__line--3" d="M-40 650 C 280 590, 540 730, 820 680 S 1280 570, 1500 670" />
          <path className="topo__line topo__line--1" d="M-40 760 C 300 700, 560 840, 840 790 S 1300 680, 1500 780" />
          <path className="topo__line topo__line--2" d="M-40 860 C 320 800, 580 940, 860 890 S 1320 780, 1500 880" />
          <path className="topo__line topo__line--accent" d="M-40 480 C 300 420, 560 560, 840 510 S 1300 400, 1500 500" />
          <path className="topo__line topo__line--accent" d="M-40 60 C 280 10, 540 140, 820 100 S 1280 0, 1500 90" />
        </g>
      </svg>
    </div>
  )
}
