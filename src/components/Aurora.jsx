// Decorative aurora borealis backdrop. Pure CSS — renders a fixed, non
// interactive layer behind page content. Intensity is controlled by the
// variant class (see src/styles/aurora.css).
export default function Aurora({ variant = 'base', className = '' }) {
  return (
    <div
      className={`aurora aurora--${variant}${className ? ` ${className}` : ''}`}
      aria-hidden="true"
    />
  )
}
