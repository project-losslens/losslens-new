// LossLens flower/aperture mark — 8 elliptical petals (alternating teal/blue)
// around a ring and center dot. Colors sampled from public/losslens-logo.png.
export default function LogoMark({ size = 72, className = '', petalClass = 'brand-petal' }) {
  const petals = []
  for (let i = 0; i < 8; i++) {
    petals.push(
      <ellipse
        key={i}
        className={petalClass}
        cx="50" cy="26" rx="9" ry="20"
        fill={i % 2 === 0 ? 'var(--brand-teal)' : 'var(--brand-blue)'}
        opacity="0.9"
        transform={`rotate(${i * 45} 50 50)`}
        style={{ animationDelay: `${i * 0.35}s` }}
      />
    )
  }
  return (
    <svg
      className={className}
      width={size} height={size} viewBox="0 0 100 100"
      role="img" aria-label="LossLens logo" fill="none"
    >
      <g className="brand-mark-spin" style={{ transformOrigin: '50px 50px' }}>
        {petals}
        <circle cx="50" cy="50" r="12" stroke="var(--brand-blue)" strokeWidth="3" fill="none" />
        <circle cx="50" cy="50" r="4" fill="var(--brand-teal)" />
      </g>
    </svg>
  )
}
