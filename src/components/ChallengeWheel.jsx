import { useRef, useState, useCallback, useEffect } from 'react'

//  Labelled challenge wheel: 8 text segments, pointer on top, JS-driven
//  eased spin (~3.5s, cubic ease-out deceleration) with tick sound/haptic
//  on each segment crossing and a landing highlight.

const SEGMENT_COUNT = 8
const SPIN_MS = 3500
const TURNS = 6

function polar(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
}

function segmentPath(cx, cy, rOuter, rInner, startDeg, endDeg) {
  const [x1, y1] = polar(cx, cy, rOuter, startDeg)
  const [x2, y2] = polar(cx, cy, rOuter, endDeg)
  const [x3, y3] = polar(cx, cy, rInner, endDeg)
  const [x4, y4] = polar(cx, cy, rInner, startDeg)
  const large = endDeg - startDeg > 180 ? 1 : 0
  return `M ${x1} ${y1} A ${rOuter} ${rOuter} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${rInner} ${rInner} 0 ${large} 0 ${x4} ${y4} Z`
}

let audioCtx = null
function tick() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    if (!audioCtx) audioCtx = new Ctx()
    const ctx = audioCtx
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 1400
    gain.gain.setValueAtTime(0.04, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.05)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.05)
  } catch { /* audio unavailable */ }
  try { navigator.vibrate?.(12) } catch { /* no haptics */ }
}

export default function ChallengeWheel({ labels, landedIndex, spinning, onLanded, spinRef }) {
  const [rotation, setRotation] = useState(0)
  const rotationRef = useRef(0)
  const rafRef = useRef(null)
  const size = 260
  const cx = size / 2
  const cy = size / 2
  const rOuter = 126
  const rInner = 34
  const seg = 360 / SEGMENT_COUNT

  const spin = useCallback(() => {
    if (spinning) return
    const target = Math.floor(Math.random() * SEGMENT_COUNT)
    const from = rotationRef.current
    const segmentCenter = target * seg + seg / 2
    const pointerAngle = 270 // top of circle in SVG coords
    const desired = pointerAngle - segmentCenter
    const currentMod = ((from % 360) + 360) % 360
    const delta = ((desired - currentMod) % 360 + 360) % 360
    const total = from + TURNS * 360 + delta
    const start = performance.now()
    let lastSeg = Math.floor((((from % 360) + 360) % 360) / seg)

    const frame = (now) => {
      const p = Math.min(1, (now - start) / SPIN_MS)
      const e = 1 - Math.pow(1 - p, 4) // easeOutQuart — strong deceleration
      const ang = from + (total - from) * e
      rotationRef.current = ang
      setRotation(ang)
      const segIdx = Math.floor((((ang % 360) + 360) % 360) / seg)
      if (segIdx !== lastSeg) { lastSeg = segIdx; tick() }
      if (p < 1) {
        rafRef.current = requestAnimationFrame(frame)
      } else {
        rotationRef.current = total
        setRotation(total)
        onLanded?.(target)
      }
    }
    rafRef.current = requestAnimationFrame(frame)
  }, [spinning, onLanded, seg])

  useEffect(() => {
    if (spinRef) spinRef.current = spin
    return () => { if (spinRef) spinRef.current = null }
  }, [spin, spinRef])

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }, [])

  return (
    <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }} role="img" aria-label="Challenge wheel">
      {/* pointer */}
      <div style={{ position: 'absolute', top: -6, left: '50%', transform: 'translateX(-50%)', zIndex: 2 }} aria-hidden="true">
        <div style={{ width: 0, height: 0, borderLeft: '9px solid transparent', borderRight: '9px solid transparent', borderTop: '14px solid #F2C879', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.5))' }} />
      </div>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
        <g transform={`rotate(${rotation} ${cx} ${cy})`}>
          {Array.from({ length: SEGMENT_COUNT }, (_, i) => {
            const a0 = i * seg - 90
            const a1 = (i + 1) * seg - 90
            const mid = (a0 + a1) / 2
            const [tx, ty] = polar(cx, cy, (rOuter + rInner) / 2, mid)
            const landed = landedIndex === i && !spinning
            return (
              <g key={i}>
                <path
                  d={segmentPath(cx, cy, rOuter, rInner, a0, a1)}
                  fill={i % 2 === 0 ? '#1E3A5F' : '#14324A'}
                  stroke={landed ? '#2DD4BF' : 'rgba(255,255,255,0.15)'}
                  strokeWidth={landed ? 3 : 1}
                />
                <text
                  x={tx} y={ty}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  transform={`rotate(${mid + 90} ${tx} ${ty})`}
                  fontSize="10"
                  fill={landed ? '#2DD4BF' : 'rgba(255,255,255,0.85)'}
                  fontFamily="var(--font-body)"
                  fontWeight={landed ? 700 : 500}
                >
                  {labels[i]}
                </text>
              </g>
            )
          })}
        </g>
        <circle cx={cx} cy={cy} r={rInner - 4} fill="#0B1220" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
      </svg>
    </div>
  )
}
