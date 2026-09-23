import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '../../i18n/LanguageContext.jsx'
import { wheelItemLabel } from '../../lib/foodWheelLabel.js'

const COLORS = ['#E8532F', '#2F6F4F', '#E8A33D', '#3D6B8A', '#8A4FE8', '#C94F6F']

function polarToCartesian(cx, cy, r, angleDeg) {
  const a = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
}

function wedgePath(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, endAngle)
  const end = polarToCartesian(cx, cy, r, startAngle)
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`
}

function easeOutQuint(t) {
  return 1 - Math.pow(1 - t, 5)
}

const SIZE = 300
const CX = SIZE / 2
const CY = SIZE / 2
const R = SIZE / 2 - 6
const LABEL_RADIUS = R * 0.66
const SPIN_DURATION_MS = 3200

export default function FoodWheel({ items, onResult, spinLabel, spinningLabel, disabled }) {
  const { lang } = useLanguage()
  const [spinning, setSpinning] = useState(false)
  const svgRef = useRef(null)
  const rotationRef = useRef(0)
  const textRefs = useRef([])
  const n = items.length
  const step = 360 / n
  const maxLabelWidth = 2 * LABEL_RADIUS * Math.sin(((step / 2) * Math.PI) / 180) * 0.86

  useEffect(() => {
    textRefs.current.forEach((el) => {
      if (!el) return
      el.removeAttribute('textLength')
      el.removeAttribute('lengthAdjust')
      const natural = el.getComputedTextLength()
      if (natural > maxLabelWidth) {
        el.setAttribute('textLength', String(maxLabelWidth))
        el.setAttribute('lengthAdjust', 'spacingAndGlyphs')
      }
    })
  }, [lang, items, maxLabelWidth])

  function spin() {
    if (spinning || disabled || n < 2) return
    setSpinning(true)
    const targetIndex = Math.floor(Math.random() * n)
    const segMid = targetIndex * step + step / 2
    const extraSpins = 5 * 360
    const startRotation = rotationRef.current
    const delta = extraSpins + ((360 - segMid) - (startRotation % 360) + 360) % 360
    const endRotation = startRotation + delta
    const startTime = performance.now()
    let rafId = null

    // Driven by rAF + direct style writes (not a CSS transition) so the spin
    // always plays even where a global `prefers-reduced-motion` CSS reset
    // forces transition-duration to ~0 — this animation IS the feature.
    // Completion itself is a plain setTimeout below, not the rAF loop, since
    // rAF is throttled/paused entirely for backgrounded tabs — the result
    // must still land on time even if the visual frames get skipped.
    function frame(now) {
      const t = Math.min(1, (now - startTime) / SPIN_DURATION_MS)
      const current = startRotation + delta * easeOutQuint(t)
      if (svgRef.current) svgRef.current.style.transform = `rotate(${current}deg)`
      if (t < 1) rafId = requestAnimationFrame(frame)
    }
    rafId = requestAnimationFrame(frame)

    window.setTimeout(() => {
      if (rafId) cancelAnimationFrame(rafId)
      rotationRef.current = endRotation
      if (svgRef.current) svgRef.current.style.transform = `rotate(${endRotation}deg)`
      setSpinning(false)
      onResult(items[targetIndex])
    }, SPIN_DURATION_MS)
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative w-[300px] h-[300px] sm:w-[380px] sm:h-[380px] md:w-[460px] md:h-[460px] lg:w-[400px] lg:h-[400px]">
        <div className="absolute left-1/2 -translate-x-1/2 -top-1.5 z-10 w-0 h-0 border-l-[13px] border-r-[13px] border-t-[24px] border-l-transparent border-r-transparent border-t-chili" />
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="w-full h-full"
          style={{ transformOrigin: '50% 50%', transform: `rotate(${rotationRef.current}deg)` }}
        >
          {items.map((item, i) => {
            const startAngle = i * step
            const endAngle = startAngle + step
            const midAngle = startAngle + step / 2
            const labelPos = polarToCartesian(CX, CY, LABEL_RADIUS, midAngle)
            const textRotate = midAngle > 90 && midAngle < 270 ? midAngle + 180 : midAngle
            return (
              <g key={i}>
                <path d={wedgePath(CX, CY, R, startAngle, endAngle)} fill={COLORS[i % COLORS.length]} stroke="#fff" strokeWidth="1.5" />
                <text
                  ref={(el) => (textRefs.current[i] = el)}
                  x={labelPos.x}
                  y={labelPos.y}
                  transform={`rotate(${textRotate}, ${labelPos.x}, ${labelPos.y})`}
                  textAnchor="middle"
                  fontSize="13"
                  fontWeight="700"
                  fill="#fff"
                >
                  {wheelItemLabel(item, lang)}
                </text>
              </g>
            )
          })}
          <circle cx={CX} cy={CY} r={R * 0.13} fill="var(--surface)" stroke="var(--line-strong)" strokeWidth="2" />
        </svg>
      </div>
      <button
        type="button"
        onClick={spin}
        disabled={spinning || disabled || n < 2}
        className="inline-flex items-center gap-2.5 font-utility font-semibold text-md px-7 py-4 rounded-full bg-chili text-chili-ink shadow-soft hover:shadow-lifted transition-shadow disabled:opacity-60"
      >
        {spinning ? spinningLabel : spinLabel}
      </button>
    </div>
  )
}
